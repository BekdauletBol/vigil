import json
from datetime import UTC, datetime

from fastapi.testclient import TestClient


async def test_health(client):
    assert (await client.get("/api/v1/health")).json() == {"status": "ok"}
    ready = await client.get("/api/v1/health/ready")
    assert ready.status_code == 200
    assert ready.json()["checks"]["database"] is True


async def test_stats_shape(client):
    r = await client.get("/api/v1/stats", params={"minutes": 30})
    assert r.status_code == 200
    body = r.json()
    assert body["tx_count_24h"] > 0
    assert len(body["series"]) == 30
    assert set(body["alerts_by_severity"]) == {"low", "medium", "high", "critical"}


async def test_list_alerts_filters_by_status(client):
    r = await client.get("/api/v1/alerts", params={"status": "open", "limit": 5})
    body = r.json()
    assert r.status_code == 200
    assert body["total"] >= len(body["items"])
    assert all(a["status"] == "open" for a in body["items"])
    assert set(body["counts"]) == {"open", "investigating", "escalated", "closed"}


async def test_ingest_validates_payload(client):
    r = await client.post(
        "/api/v1/transactions",
        json={
            "sender_id": "ACC-00001",
            "receiver_id": "ACC-00002",
            "amount": -5,
            "channel": "teleport",
            "country": "KZ",
        },
    )
    assert r.status_code == 422


async def test_ingest_unknown_account_is_404(client):
    r = await client.post(
        "/api/v1/transactions",
        json={
            "sender_id": "NOPE",
            "receiver_id": "ACC-00002",
            "amount": 100,
            "channel": "card",
            "country": "KZ",
        },
    )
    assert r.status_code == 404


async def test_structuring_burst_creates_alert_and_is_idempotent(client):
    before = (await client.get("/api/v1/alerts")).json()["total"]
    payload = {
        "sender_id": "ACC-00001",
        "receiver_id": "ACC-00002",
        "amount": 6_800_000,
        "channel": "cash",
        "country": "KZ",
    }
    ids = []
    for i in range(5):
        r = await client.post(
            "/api/v1/transactions",
            json={**payload, "external_id": f"T-{i}", "ts": datetime.now(UTC).isoformat()},
        )
        assert r.status_code == 202
        assert r.json()["status"] == "scored"
        ids.append(r.json()["id"])

    replay = await client.post("/api/v1/transactions", json={**payload, "external_id": "T-0"})
    assert replay.json()["id"] == ids[0]  # same external_id → same transaction

    alerts = (await client.get("/api/v1/alerts", params={"q": "Дробление"})).json()
    burst_cases = [a for a in alerts["items"] if a["transaction"]["id"] in ids]
    # The whole burst lands in ONE case; later operations are attached to its journal.
    assert len(burst_cases) == 1
    assert (await client.get("/api/v1/alerts")).json()["total"] == before + 1
    detail = (await client.get(f"/api/v1/alerts/{burst_cases[0]['id']}")).json()
    assert any("Связанная операция" in n["text"] for n in detail["notes"])


async def _fresh_alert(client, sender: str) -> dict:
    """Create a guaranteed alert via a structuring burst instead of relying on seed data."""
    for i in range(4):
        await client.post(
            "/api/v1/transactions",
            json={
                "sender_id": sender,
                "receiver_id": "ACC-00002",
                "amount": 6_900_000,
                "channel": "cash",
                "country": "KZ",
                "external_id": f"{sender}-{i}",
            },
        )
    page = (await client.get("/api/v1/alerts", params={"status": "open", "limit": 200})).json()
    return next(a for a in page["items"] if a["account"]["id"] == sender)


async def test_alert_workflow_and_audit_trail(client):
    alert = await _fresh_alert(client, "ACC-00010")
    aid = alert["id"]

    bad = await client.patch(f"/api/v1/alerts/{aid}", json={"status": "escalated"})
    assert bad.status_code == 409  # open → escalated skips investigation

    ok = await client.patch(
        f"/api/v1/alerts/{aid}",
        json={"status": "investigating", "assignee": "Тест", "author": "QA"},
    )
    assert ok.status_code == 200
    assert ok.json()["status"] == "investigating"

    note = await client.post(f"/api/v1/alerts/{aid}/notes", json={"text": "Запрошены документы"})
    assert note.status_code == 201

    detail = (await client.get(f"/api/v1/alerts/{aid}")).json()
    texts = [n["text"] for n in detail["notes"]]
    assert any("В работе" in t for t in texts)
    assert "Запрошены документы" in texts
    assert detail["account"]["tax_id"].count("•") == 4  # masked
    subject = [n for n in detail["graph_nodes"] if n["role"] == "subject"]
    assert len(subject) == 1 and subject[0]["id"] == alert["account"]["id"]


async def test_missing_alert_is_404(client):
    assert (await client.get("/api/v1/alerts/999999")).status_code == 404


async def test_analyst_streams_sse(client):
    aid = (await client.get("/api/v1/alerts", params={"limit": 1})).json()["items"][0]["id"]
    events = []
    async with client.stream(
        "POST",
        "/api/v1/analyst/chat",
        json={
            "alert_id": aid,
            "messages": [{"role": "user", "content": "Сформируй заключение по кейсу"}],
        },
    ) as r:
        assert r.headers["content-type"].startswith("text/event-stream")
        event = None
        async for line in r.aiter_lines():
            if line.startswith("event: "):
                event = line[7:]
            elif line.startswith("data: "):
                events.append((event, json.loads(line[6:])))

    kinds = [e for e, _ in events]
    assert kinds[0] == "meta" and kinds[-1] == "done"
    meta = events[0][1]
    assert meta["provider"] == "mock" and meta["sources"]
    text = "".join(d["text"] for e, d in events if e == "delta")
    assert f"#{aid}" in text
    assert "<case>" not in text  # the RAG preamble never leaks into the answer


async def test_knowledge_search(client):
    r = await client.get("/api/v1/knowledge/search", params={"q": "офшор"})
    assert r.status_code == 200 and r.json()


def test_websocket_snapshot_then_live_transaction(app):
    with TestClient(app) as tc, tc.websocket_connect("/api/v1/ws/transactions") as ws:
        first = ws.receive_json()
        assert first["type"] == "snapshot" and first["data"]

        ws.send_json({"type": "ping", "t": 1})
        assert ws.receive_json() == {"type": "pong", "t": 1}

        r = tc.post(
            "/api/v1/transactions",
            json={
                "sender_id": "ACC-00003",
                "receiver_id": "ACC-00004",
                "amount": 12_345,
                "channel": "card",
                "country": "KZ",
            },
        )
        assert r.status_code == 202
        msg = ws.receive_json()
        assert msg["type"] == "transaction"
        assert msg["data"]["id"] == r.json()["id"]


async def test_datetimes_are_serialized_with_utc_offset(client):
    tx = (await client.get("/api/v1/transactions", params={"limit": 1})).json()[0]
    assert tx["ts"].endswith(("Z", "+00:00"))
