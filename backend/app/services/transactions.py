import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.db.models import Account, Alert, AlertNote, AlertStatus, Transaction, TxStatus
from app.ml.anomaly import get_model
from app.realtime.bus import CHANNEL_ALERTS, CHANNEL_TRANSACTIONS, EventBus
from app.schemas import AlertOut, TransactionIn, TransactionOut
from app.services.errors import NotFoundError
from app.services.risk import ALERT_THRESHOLD, TxFeatures, evaluate

VELOCITY_WINDOW = timedelta(minutes=10)
DEDUP_WINDOW = timedelta(hours=1)


def as_utc(dt: datetime) -> datetime:
    """SQLite drops tzinfo; PostgreSQL keeps it. Normalise before comparing."""
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt.astimezone(UTC)


async def ingest(session: AsyncSession, data: TransactionIn) -> Transaction:
    if data.external_id:
        existing = await session.scalar(
            select(Transaction).where(Transaction.external_id == data.external_id)
        )
        if existing:  # idempotent re-delivery from the external system
            return existing

    for account_id in (data.sender_id, data.receiver_id):
        if await session.get(Account, account_id) is None:
            raise NotFoundError(f"Account {account_id} not found")

    tx = Transaction(
        id=uuid.uuid4(),
        external_id=data.external_id,
        ts=data.ts or datetime.now(UTC),
        sender_id=data.sender_id,
        receiver_id=data.receiver_id,
        amount=data.amount,
        currency=data.currency,
        channel=data.channel,
        country=data.country,
        purpose=data.purpose,
        status=TxStatus.pending,
        flags=[],
    )
    session.add(tx)
    await session.commit()
    return tx


async def build_features(session: AsyncSession, tx: Transaction, threshold: int) -> TxFeatures:
    ts = as_utc(tx.ts)
    recent = (
        select(func.count())
        .select_from(Transaction)
        .where(
            Transaction.sender_id == tx.sender_id,
            Transaction.ts >= ts - VELOCITY_WINDOW,
            Transaction.ts <= ts,
            Transaction.id != tx.id,
        )
    )
    near = recent.where(Transaction.amount >= threshold * 0.85, Transaction.amount < threshold)
    sender: Account = tx.sender
    return TxFeatures(
        amount=float(tx.amount),
        channel=tx.channel,
        country=tx.country,
        hour=(ts + timedelta(hours=5)).hour,  # Asia/Almaty, UTC+5
        sender_recent_count=await session.scalar(recent) or 0,
        sender_recent_near_threshold=await session.scalar(near) or 0,
        sender_account_age_days=max(0, (ts - as_utc(sender.opened_at)).days),
        sender_is_pep=sender.is_pep,
        receiver_country=tx.receiver.country,
    )


async def score(
    session: AsyncSession, tx_id: uuid.UUID, bus: EventBus, settings: Settings
) -> tuple[Transaction, Alert | None]:
    # populate_existing: the instance may come from ingest() without its relationships loaded.
    tx = await session.get(Transaction, tx_id, populate_existing=True)
    if tx is None:
        raise NotFoundError(f"Transaction {tx_id} not found")
    if tx.status == TxStatus.scored:
        return tx, None

    features = await build_features(session, tx, settings.reporting_threshold)
    anomaly = get_model().score(features)
    result = evaluate(features, settings.reporting_threshold, anomaly)

    tx.risk_score = result.score
    tx.anomaly_score = anomaly
    tx.flags = [f.as_dict() for f in result.flags]
    tx.status = TxStatus.scored

    alert: Alert | None = None
    merged: Alert | None = None
    if result.score >= ALERT_THRESHOLD:
        merged = await _active_case(session, tx.sender_id, result.typology, as_utc(tx.ts))
        if merged:
            # Same client, same typology, case still active: extend it instead of spamming new ones.
            session.add(
                AlertNote(
                    alert_id=merged.id,
                    author="Система",
                    kind="system",
                    text=f"Связанная операция: {float(tx.amount):,.0f} ₸, риск {result.score}".replace(
                        ",", " "
                    ),
                )
            )
            if result.score > merged.score:
                merged.score, merged.severity = result.score, result.severity
            merged.updated_at = datetime.now(UTC)
        else:
            alert = Alert(
                transaction_id=tx.id,
                account_id=tx.sender_id,
                severity=result.severity,
                score=result.score,
                typology=result.typology,
                flags=tx.flags,
            )
            session.add(alert)
    await session.commit()

    await bus.publish(
        CHANNEL_TRANSACTIONS,
        {"type": "transaction", "data": TransactionOut.model_validate(tx).model_dump(mode="json")},
    )
    if alert is not None:
        alert = await session.scalar(select(Alert).where(Alert.id == alert.id))
        assert alert is not None
        await bus.publish(
            CHANNEL_ALERTS,
            {
                "type": "alert.created",
                "data": AlertOut.model_validate(alert).model_dump(mode="json"),
            },
        )
    if merged is not None:
        await session.refresh(merged)
        await bus.publish(
            CHANNEL_ALERTS,
            {
                "type": "alert.updated",
                "data": AlertOut.model_validate(merged).model_dump(mode="json"),
            },
        )
    return tx, alert


async def _active_case(
    session: AsyncSession, account_id: str, typology: str, ts: datetime
) -> Alert | None:
    """An open case for the same client and typology within the dedup window, if any."""
    return await session.scalar(
        select(Alert)
        .where(
            Alert.account_id == account_id,
            Alert.typology == typology,
            Alert.status.in_([AlertStatus.open, AlertStatus.investigating]),
            Alert.created_at >= ts - DEDUP_WINDOW,
        )
        .order_by(Alert.created_at.desc())
        .limit(1)
    )


async def recent_transactions(
    session: AsyncSession, limit: int = 50, min_score: int = 0
) -> list[Transaction]:
    rows = await session.scalars(
        select(Transaction)
        .where(Transaction.status == TxStatus.scored, Transaction.risk_score >= min_score)
        .order_by(Transaction.ts.desc())
        .limit(limit)
    )
    return list(rows)


async def submit(
    session: AsyncSession, data: TransactionIn, bus: EventBus, settings: Settings
) -> Transaction:
    """Persist a transaction, then score it inline or hand it to a Celery worker."""
    tx = await ingest(session, data)
    if tx.status == TxStatus.pending:
        if settings.scoring_mode == "inline":
            tx, _ = await score(session, tx.id, bus, settings)
        else:
            from app.worker.tasks import score_transaction

            score_transaction.delay(str(tx.id))
    return tx
