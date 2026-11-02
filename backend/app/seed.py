"""Synthetic history for the demo workspace and for "sample data" in private workspaces.

Scoring runs in memory here (same rules + ML model as production) so thousands of
transactions are ready in a couple of seconds.
"""

import asyncio
import logging
import random
import uuid
from collections import defaultdict, deque
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, insert, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.db.models import (
    DEMO_WORKSPACE_ID,
    Account,
    Alert,
    AlertNote,
    AlertStatus,
    Transaction,
    TxStatus,
    Workspace,
    WorkspaceKind,
)
from app.ml.anomaly import get_model
from app.services.alerts import STATUS_LABELS
from app.services.generator import diurnal_weight, make_accounts, scenario
from app.services.risk import ALERT_THRESHOLD, TxFeatures, evaluate

log = logging.getLogger(__name__)
ANALYSTS = ["А. Сейткали", "Д. Омарова", "Е. Жаксылыков", "М. Ким"]


@dataclass
class GeneratedHistory:
    accounts: int
    transactions: int
    alerts: int


async def ensure_demo_workspace(session: AsyncSession) -> Workspace:
    ws = await session.get(Workspace, DEMO_WORKSPACE_ID)
    if ws is None:
        ws = Workspace(id=DEMO_WORKSPACE_ID, name="Демо-банк", kind=WorkspaceKind.demo)
        session.add(ws)
        await session.flush()
        if session.bind.dialect.name == "postgresql":
            # An explicit id does not advance the serial sequence; do it so user workspaces don't clash.
            await session.execute(
                text(
                    "SELECT setval(pg_get_serial_sequence('workspaces', 'id'), "
                    "(SELECT MAX(id) FROM workspaces))"
                )
            )
        await session.commit()
    return ws


async def seed(session: AsyncSession, settings: Settings, *, rng_seed: int = 2026) -> bool:
    """Fill the demo workspace once."""
    await ensure_demo_workspace(session)
    has_data = await session.scalar(
        select(func.count()).select_from(Account).where(Account.workspace_id == DEMO_WORKSPACE_ID)
    )
    if has_data:
        return False
    result = await generate_history(
        session,
        settings,
        DEMO_WORKSPACE_ID,
        accounts=settings.seed_accounts,
        transactions=settings.seed_transactions,
        recent_per_minute=settings.seed_recent_per_minute,
        rng=random.Random(rng_seed),
        triage=True,
    )
    log.info("Seeded demo: %s", result)
    return True


async def generate_history(
    session: AsyncSession,
    settings: Settings,
    workspace_id: int,
    *,
    accounts: int,
    transactions: int,
    recent_per_minute: int = 0,
    rng: random.Random | None = None,
    triage: bool = False,
) -> GeneratedHistory:
    """Create clients plus a day of scored history. `triage` pre-assigns case statuses."""
    rng = rng or random.Random()
    now = datetime.now(UTC)
    start = await session.scalar(
        select(func.count()).select_from(Account).where(Account.workspace_id == workspace_id)
    )
    demo = workspace_id == DEMO_WORKSPACE_ID
    seeds = make_accounts(
        rng,
        accounts,
        now,
        workspace_id=workspace_id,
        start=start or 0,
        # Account ids are global primary keys; codes only need to be unique per workspace.
        id_prefix="ACC-" if demo else f"W{workspace_id}-{uuid.uuid4().hex[:4]}-",
        code_prefix="ACC-" if demo else "CL-",
    )
    by_code = {a.code: a for a in seeds}
    await session.execute(insert(Account), [asdict(a) for a in seeds])

    # Spread history over the last 24h following a daily activity curve.
    payloads: list[dict] = []
    while len(payloads) < transactions:
        ts = now - timedelta(seconds=rng.uniform(60, 86_400))
        if rng.random() < diurnal_weight((ts + timedelta(hours=5)).hour):
            payloads.extend(scenario(rng, seeds, settings.reporting_threshold, ts))
    for _ in range(recent_per_minute * 60):
        ts = now - timedelta(seconds=rng.uniform(1, 3600))
        payloads.extend(scenario(rng, seeds, settings.reporting_threshold, ts))
    payloads.sort(key=lambda p: p["ts"])

    threshold = settings.reporting_threshold
    window: dict[str, deque] = defaultdict(deque)
    features: list[TxFeatures] = []
    for p in payloads:
        sender = by_code[p["sender_id"]]
        recent = window[sender.code]
        while recent and recent[0][0] < p["ts"] - timedelta(minutes=10):
            recent.popleft()
        features.append(
            TxFeatures(
                amount=p["amount"],
                channel=p["channel"],
                country=p["country"],
                hour=(p["ts"] + timedelta(hours=5)).hour,
                sender_recent_count=len(recent),
                sender_recent_near_threshold=sum(
                    1 for _, amt in recent if threshold * 0.85 <= amt < threshold
                ),
                sender_account_age_days=(p["ts"] - sender.opened_at).days,
                sender_is_pep=sender.is_pep,
                receiver_country=by_code[p["receiver_id"]].country,
            )
        )
        recent.append((p["ts"], p["amount"]))

    tx_rows, alert_rows = [], []
    last_case: dict[tuple[str, str], datetime] = {}  # dedup like the live pipeline
    for p, f, anomaly in zip(payloads, features, get_model().score_many(features), strict=True):
        sender, receiver = by_code[p["sender_id"]], by_code[p["receiver_id"]]
        result = evaluate(f, threshold, anomaly)
        tx_id = uuid.uuid4()
        flags = [fl.as_dict() for fl in result.flags]
        tx_rows.append(
            {
                **p,
                "id": tx_id,
                "workspace_id": workspace_id,
                "sender_id": sender.id,
                "receiver_id": receiver.id,
                "currency": "KZT",
                "status": TxStatus.scored,
                "risk_score": result.score,
                "anomaly_score": anomaly,
                "flags": flags,
            }
        )
        case_key = (sender.id, result.typology)
        is_repeat = case_key in last_case and p["ts"] - last_case[case_key] < timedelta(hours=1)
        if result.score >= ALERT_THRESHOLD and not is_repeat:
            last_case[case_key] = p["ts"]
            status = _triaged_status(rng, now - p["ts"]) if triage else AlertStatus.open
            alert_rows.append(
                {
                    "workspace_id": workspace_id,
                    "transaction_id": tx_id,
                    "account_id": sender.id,
                    "severity": result.severity,
                    "status": status,
                    "score": result.score,
                    "typology": result.typology,
                    "flags": flags,
                    "created_at": p["ts"],
                    "updated_at": p["ts"],
                    "assignee": None if status == AlertStatus.open else rng.choice(ANALYSTS),
                }
            )

    for chunk in range(0, len(tx_rows), 500):
        await session.execute(insert(Transaction), tx_rows[chunk : chunk + 500])
    if alert_rows:
        await session.execute(insert(Alert), alert_rows)
        triaged = await session.execute(
            select(Alert.id, Alert.status, Alert.assignee).where(
                Alert.workspace_id == workspace_id,
                Alert.transaction_id.in_([r["transaction_id"] for r in alert_rows]),
                Alert.status != AlertStatus.open,
            )
        )
        notes = [
            {
                "alert_id": i,
                "author": who or "Система",
                "kind": "system",
                "text": f"Статус: Открыт → {STATUS_LABELS[s]}",
            }
            for i, s, who in triaged.all()
        ]
        if notes:
            await session.execute(insert(AlertNote), notes)
    await session.commit()
    return GeneratedHistory(len(seeds), len(tx_rows), len(alert_rows))


def _triaged_status(rng: random.Random, age: timedelta) -> AlertStatus:
    # Older cases are more likely to have been triaged already.
    age_min = age.total_seconds() / 60
    roll = rng.random()
    if age_min < 10 or roll >= 0.75:
        return AlertStatus.open
    if age_min > 30 and roll < 0.3:
        return AlertStatus.closed
    return AlertStatus.escalated if roll < 0.45 else AlertStatus.investigating


async def main() -> None:
    from app.db.session import SessionLocal

    logging.basicConfig(level=logging.INFO)
    async with SessionLocal() as session:
        created = await seed(session, get_settings())
        print("seeded" if created else "demo workspace already has data — skipped")


if __name__ == "__main__":
    asyncio.run(main())
