import asyncio
import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.config import get_settings
from app.db.models import Alert, AlertNote, AlertStatus, Severity
from app.db.session import make_engine
from app.realtime.bus import RedisEventBus
from app.services.transactions import score
from app.worker.celery_app import celery_app

log = logging.getLogger(__name__)


async def _score(tx_id: str) -> None:
    settings = get_settings()
    engine = make_engine(pooled=False)
    bus = RedisEventBus(settings.redis_url)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            _, alert = await score(session, uuid.UUID(tx_id), bus, settings)
            if alert:
                log.info("alert #%s created (%s, score %s)", alert.id, alert.severity, alert.score)
    finally:
        await bus.close()
        await engine.dispose()


@celery_app.task(
    name="vigil.score_transaction",
    autoretry_for=(ConnectionError, OSError),
    retry_backoff=True,
    max_retries=5,
)
def score_transaction(tx_id: str) -> None:
    asyncio.run(_score(tx_id))


async def _close_stale(hours: int) -> int:
    engine = make_engine(pooled=False)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            cutoff = datetime.now(UTC) - timedelta(hours=hours)
            stale = list(
                await session.scalars(
                    select(Alert).where(
                        Alert.status == AlertStatus.open,
                        Alert.severity == Severity.medium,
                        Alert.created_at < cutoff,
                    )
                )
            )
            for alert in stale:
                alert.status = AlertStatus.closed
                session.add(
                    AlertNote(
                        alert_id=alert.id,
                        author="Система",
                        kind="system",
                        text=f"Автозакрытие: средний риск без активности более {hours} ч",
                    )
                )
            await session.commit()
            return len(stale)
    finally:
        await engine.dispose()


@celery_app.task(name="vigil.close_stale_alerts")
def close_stale_alerts(hours: int = 48) -> int:
    return asyncio.run(_close_stale(hours))
