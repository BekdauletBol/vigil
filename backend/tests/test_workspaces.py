import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect


async def _register(client, email="analyst@example.com", name="Аналитик"):
    r = await client.post(
        "/api/v1/auth/register", json={"email": email, "password": "s3cret-pass", "name": name}
    )
    assert r.status_code == 201, r.text
    body = r.json()
    private = next(w for w in body["workspaces"] if w["kind"] == "private")
    return {"Authorization": f"Bearer {body['token']}", "X-Workspace-Id": str(private["id"])}


async def _client(client, headers, code, name, country="KZ"):
    r = await client.post(
        "/api/v1/accounts", headers=headers, json={"code": code, "name": name, "country": country}
    )
    assert r.status_code == 201, r.text
    return r.json()


async def test_register_login_and_me(client):
    await _register(client)
    dup = await client.post(
        "/api/v1/auth/register",
        json={"email": "ANALYST@example.com", "password": "another-pass", "name": "X"},
    )
    assert dup.status_code == 409  # emails are case-insensitive

    bad = await client.post(
        "/api/v1/auth/login", json={"email": "analyst@example.com", "password": "wrong-pass"}
    )
    assert bad.status_code == 401

    ok = await client.post(
        "/api/v1/auth/login", json={"email": "analyst@example.com", "password": "s3cret-pass"}
    )
    assert ok.status_code == 200
    me = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {ok.json()['token']}"}
    )
    kinds = sorted(w["kind"] for w in me.json()["workspaces"])
    assert kinds == ["demo", "private"]


async def test_private_workspace_is_isolated(client):
    alice = await _register(client, "alice@example.com", "Alice")
    bob = await _register(client, "bob@example.com", "Bob")
    await _client(client, alice, "A-1", "ТОО «Альфа»")

    assert len((await client.get("/api/v1/accounts", headers=alice)).json()) == 1
    # Anonymous → 401; another user → 404 (existence is not revealed)
    anon = {"X-Workspace-Id": alice["X-Workspace-Id"]}
    assert (await client.get("/api/v1/accounts", headers=anon)).status_code == 401
    foreign = {**bob, "X-Workspace-Id": alice["X-Workspace-Id"]}
    assert (await client.get("/api/v1/accounts", headers=foreign)).status_code == 404
    # Bob's own workspace is empty, the demo is untouched
    assert (await client.get("/api/v1/accounts", headers=bob)).json() == []
    demo = (await client.get("/api/v1/accounts")).json()
    assert all(a["code"] != "A-1" for a in demo)


async def test_manual_transaction_scores_and_creates_alert(client):
    h = await _register(client)
    await _client(client, h, "C-1", "Иванов Пётр")
    await _client(client, h, "C-2", "Offshore Holding Ltd", country="VG")
    r = await client.post(
        "/api/v1/transactions?wait=true",
        headers=h,
        json={
            "sender_id": "C-1",
            "receiver_id": "C-2",
            "amount": 25_000_000,
            "channel": "swift",
            "country": "VG",
            "purpose": "Консультации",
        },
    )
    assert r.status_code == 202
    assert r.json()["risk_score"] >= 65
    alerts = (await client.get("/api/v1/alerts", headers=h)).json()
    assert alerts["total"] == 1
    stats = (await client.get("/api/v1/stats", headers=h)).json()
    assert stats["tx_count_24h"] == 1 and stats["open_alerts"] == 1


async def test_same_client_cannot_pay_itself(client):
    h = await _register(client)
    await _client(client, h, "C-1", "Иванов Пётр")
    r = await client.post(
        "/api/v1/transactions",
        headers=h,
        json={
            "sender_id": "C-1",
            "receiver_id": "C-1",
            "amount": 10,
            "channel": "card",
            "country": "KZ",
        },
    )
    assert r.status_code == 409


async def test_duplicate_client_code_conflicts(client):
    h = await _register(client)
    await _client(client, h, "C-1", "Иванов Пётр")
    r = await client.post("/api/v1/accounts", headers=h, json={"code": "C-1", "name": "Другой"})
    assert r.status_code == 409


async def test_api_key_integration(client):
    h = await _register(client)
    await _client(client, h, "C-1", "Иванов Пётр")
    await _client(client, h, "C-2", "Петров Иван")
    key = (await client.post(f"/api/v1/workspaces/{h['X-Workspace-Id']}/api-key", headers=h)).json()
    assert key["api_key"].startswith("vk_")

    payload = {
        "sender_id": "C-1",
        "receiver_id": "C-2",
        "amount": 1000,
        "channel": "card",
        "country": "KZ",
        "external_id": "BANK-1",
    }
    r = await client.post(
        "/api/v1/transactions", headers={"X-API-Key": key["api_key"]}, json=payload
    )
    assert r.status_code == 202
    assert (
        await client.post("/api/v1/transactions", headers={"X-API-Key": "vk_wrong"}, json=payload)
    ).status_code == 401

    # Rotating invalidates the old key
    await client.post(f"/api/v1/workspaces/{h['X-Workspace-Id']}/api-key", headers=h)
    assert (
        await client.post(
            "/api/v1/transactions", headers={"X-API-Key": key["api_key"]}, json=payload
        )
    ).status_code == 401


async def test_csv_import_reports_bad_rows(client):
    h = await _register(client)
    csv = (
        "ts,external_id,sender_code,sender_name,receiver_code,receiver_name,receiver_country,amount,channel,purpose\n"
        "2026-11-01T10:00:00+05:00,B-1,CL-1,ТОО «Альфа»,CL-2,Иванов Пётр,KZ,250000,transfer,Оплата\n"
        "2026-11-01T10:05:00+05:00,B-2,CL-1,ТОО «Альфа»,CL-9,Offshore Ltd,VG,30000000,swift,Услуги\n"
        "2026-11-01T10:06:00+05:00,B-3,CL-1,ТОО «Альфа»,CL-2,Иванов Пётр,KZ,-5,transfer,Ошибка\n"
        "not-a-date,B-4,CL-1,ТОО «Альфа»,CL-2,Иванов Пётр,KZ,100,transfer,Ошибка\n"
        "2026-11-01T10:00:00+05:00,B-1,CL-1,ТОО «Альфа»,CL-2,Иванов Пётр,KZ,250000,transfer,Дубль\n"
    )
    r = await client.post(
        "/api/v1/transactions/import",
        headers=h,
        files={"file": ("ops.csv", csv.encode(), "text/csv")},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["imported"] == 2
    assert body["duplicates"] == 1
    assert body["created_clients"] == 3
    assert body["alerts"] == 1
    assert [e["row"] for e in body["errors"]] == [4, 5]
    assert body["errors"][0]["message"].startswith("сумма")
    clients = (await client.get("/api/v1/accounts", headers=h)).json()
    assert {c["code"] for c in clients} == {"CL-1", "CL-2", "CL-9"}
    assert next(c for c in clients if c["code"] == "CL-1")["kind"] == "legal"


async def test_csv_without_required_columns_is_rejected(client):
    h = await _register(client)
    r = await client.post(
        "/api/v1/transactions/import",
        headers=h,
        files={"file": ("x.csv", b"a,b\n1,2\n", "text/csv")},
    )
    assert r.status_code == 400


async def test_sample_data_and_reset(client):
    h = await _register(client)
    wid = h["X-Workspace-Id"]
    ws = (await client.post(f"/api/v1/workspaces/{wid}/sample-data", headers=h)).json()
    assert ws["accounts"] == 25 and ws["transactions"] >= 400
    ws = (await client.post(f"/api/v1/workspaces/{wid}/sample-data", headers=h)).json()
    assert ws["accounts"] == 50  # codes keep growing, no collisions
    ws = (await client.delete(f"/api/v1/workspaces/{wid}/data", headers=h)).json()
    assert ws["accounts"] == 0 and ws["transactions"] == 0


async def test_simulator_toggle(client):
    h = await _register(client)
    wid = h["X-Workspace-Id"]
    on = (
        await client.patch(f"/api/v1/workspaces/{wid}", headers=h, json={"simulator": True})
    ).json()
    assert on["simulator_until"] is not None
    off = (
        await client.patch(f"/api/v1/workspaces/{wid}", headers=h, json={"simulator": False})
    ).json()
    assert off["simulator_until"] is None


@pytest.mark.parametrize(
    "path", ["/api/v1/workspaces/1/api-key", "/api/v1/workspaces/1/sample-data"]
)
async def test_demo_workspace_cannot_be_managed(client, path):
    h = await _register(client)
    assert (await client.post(path, headers=h)).status_code == 404


def test_websocket_requires_owner_token(app):
    with TestClient(app) as tc:
        r = tc.post(
            "/api/v1/auth/register",
            json={"email": "ws@example.com", "password": "s3cret-pass", "name": "WS"},
        )
        token = r.json()["token"]
        wid = next(w["id"] for w in r.json()["workspaces"] if w["kind"] == "private")

        with tc.websocket_connect(f"/api/v1/ws/transactions?workspace={wid}&token={token}") as ws:
            assert ws.receive_json() == {"type": "snapshot", "data": []}

        with (
            pytest.raises(WebSocketDisconnect),
            tc.websocket_connect(f"/api/v1/ws/transactions?workspace={wid}") as ws,
        ):
            ws.receive_json()


async def test_csv_errors_are_human_readable(client):
    h = await _register(client)
    csv = "sender_code,receiver_code,amount,channel,ts\nA,B,abc,card,\nA,B,100,card,yesterday\n"
    r = await client.post(
        "/api/v1/transactions/import",
        headers=h,
        files={"file": ("x.csv", csv.encode(), "text/csv")},
    )
    messages = [e["message"] for e in r.json()["errors"]]
    assert messages[0] == "amount: «abc» — не число"
    assert messages[1].startswith("ts: «yesterday»")
