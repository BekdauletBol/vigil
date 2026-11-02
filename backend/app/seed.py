"""Seed the database with a day of synthetic history.

Scoring runs in memory here (same rules + ML model as production) so a fresh
database is ready in a couple of seconds.
"""

import asyncio
import logging
import random
import uuid
from collections import defaultdict, deque
from dataclasses import asdict
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.db.models import Account, Alert, AlertNote, AlertStatus, Transaction, TxStatus
from app.ml.anomaly import get_model
from app.services.alerts import STATUS_LABELS
from app.services.generator import diurnal_weight, make_accounts, scenario
from app.services.risk import ALERT_THRESHOLD, TxFeatures, evaluate

log = logging.getLogger(__name__)
ANALYSTS = ["А. Сейткали", "Д. Омарова", "Е. Жаксылыков", "М. Ким"]


async def seed(session: AsyncSession, settings: Settings, *, rng_seed: int = 2026) -> bool:
    if await session.scalar(select(func.count()).select_from(Account)):
        return False

    rng = random.Random(rng_seed)
    now = datetime.now(UTC)
    accounts = make_accounts(rng, settings.seed_accounts, now)
    by_id = {a.id: a for a in accounts}
    await session.execute(insert(Account), [asdict(a) for a in accounts])

    # Spread history over the last 24h following a daily activity curve.
    payloads: list[dict] = []
    while len(payloads) < settings.seed_transactions:
        ts = now - timedelta(seconds=rng.uniform(60, 86_400))
        if rng.random() < diurnal_weight((ts + timedelta(hours=5)).hour):
            payloads.extend(scenario(rng, accounts, settings.reporting_threshold, ts))
    for _ in range(settings.seed_recent_per_minute * 60):
        ts = now - timedelta(seconds=rng.uniform(1, 3600))
        payloads.extend(scenario(rng, accounts, settings.reporting_threshold, ts))
    payloads.sort(key=lambda p: p["ts"])

    threshold = settings.reporting_threshold
    model = get_model()
    window: dict[str, deque] = defaultdict(deque)
    tx_rows, alert_rows = [], []

    features: list[TxFeatures] = []
    for p in payloads:
        sender = by_id[p["sender_id"]]
        recent = window[sender.id]
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
                receiver_country=by_id[p["receiver_id"]].country,
            )
        )
        recent.append((p["ts"], p["amount"]))

    last_case: dict[tuple[str, str], datetime] = {}  # dedup like the live pipeline
    for p, f, anomaly in zip(payloads, features, model.score_many(features), strict=True):
        sender = by_id[p["sender_id"]]
        result = evaluate(f, threshold, anomaly)
        tx_id = uuid.uuid4()
        flags = [fl.as_dict() for fl in result.flags]
        tx_rows.append(
            {
                **p,
                "id": tx_id,
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
            age_h = (now - p["ts"]).total_seconds() / 3600
            # Older cases are more likely to have been triaged already.
            roll = rng.random()
            age_min = age_h * 60
            status = (
                AlertStatus.open
                if age_min < 10 or roll >= 0.75
                else AlertStatus.closed
                if age_min > 30 and roll < 0.3
                else AlertStatus.escalated
                if roll < 0.45
                else AlertStatus.investigating
            )
            alert_rows.append(
                {
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
        ids = await session.execute(
            select(Alert.id, Alert.status, Alert.assignee).where(Alert.status != AlertStatus.open)
        )
        await session.execute(
            insert(AlertNote),
            [
                {
                    "alert_id": i,
                    "author": who or "Система",
                    "kind": "system",
                    "text": f"Статус: Открыт → {STATUS_LABELS[s]}",
                }
                for i, s, who in ids.all()
            ],
        )
    await session.commit()
    log.info(
        "Seeded %d accounts, %d transactions, %d alerts",
        len(accounts),
        len(tx_rows),
        len(alert_rows),
    )
    return True


async def main() -> None:
    from app.db.session import SessionLocal

    logging.basicConfig(level=logging.INFO)
    async with SessionLocal() as session:
        created = await seed(session, get_settings())
        print("seeded" if created else "database already has data — skipped")


if __name__ == "__main__":
    asyncio.run(main())
