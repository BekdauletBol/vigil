from collections import Counter
from datetime import UTC, datetime, timedelta

from sqlalchemy import case, func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Alert, AlertStatus, Severity, Transaction, TxStatus
from app.schemas import SeriesPoint, Stats
from app.services.risk import ALERT_THRESHOLD
from app.services.transactions import as_utc


def _minute_bucket(session: AsyncSession):
    """Truncate a timestamp to the minute in the dialect's own SQL."""
    if session.bind.dialect.name == "postgresql":
        return func.date_trunc(literal_column("'minute'"), Transaction.ts)
    return func.strftime("%Y-%m-%d %H:%M:00", Transaction.ts)


async def compute_stats(session: AsyncSession, minutes: int = 60) -> Stats:
    now = datetime.now(UTC)
    day_ago = now - timedelta(hours=24)
    scored = Transaction.status == TxStatus.scored

    totals = (
        await session.execute(
            select(
                func.count(),
                func.coalesce(func.sum(Transaction.amount), 0),
                func.coalesce(func.avg(Transaction.risk_score), 0),
                func.count().filter(Transaction.risk_score >= ALERT_THRESHOLD),
            ).where(scored, Transaction.ts >= day_ago)
        )
    ).one()

    by_channel_rows = await session.execute(
        select(Transaction.channel, func.count(), func.sum(Transaction.amount))
        .where(scored, Transaction.ts >= day_ago)
        .group_by(Transaction.channel)
        .order_by(func.sum(Transaction.amount).desc())
    )

    bucket = _minute_bucket(session).label("bucket")
    series_rows = await session.execute(
        select(
            bucket,
            func.count(),
            func.sum(Transaction.amount),
            func.sum(case((Transaction.risk_score >= ALERT_THRESHOLD, 1), else_=0)),
        )
        .where(scored, Transaction.ts >= now - timedelta(minutes=minutes))
        .group_by(bucket)
        .order_by(bucket)
    )
    by_minute = {}
    for b, count, volume, flagged in series_rows.all():
        t = b if isinstance(b, datetime) else datetime.fromisoformat(b)
        by_minute[as_utc(t).replace(second=0, microsecond=0)] = (count, float(volume or 0), flagged)

    start = (now - timedelta(minutes=minutes - 1)).replace(second=0, microsecond=0)
    series = []
    for i in range(minutes):
        t = start + timedelta(minutes=i)
        c, v, f = by_minute.get(t, (0, 0.0, 0))
        series.append(SeriesPoint(t=t, count=c, volume=v, flagged=f))

    sev_rows = await session.execute(
        select(Alert.severity, func.count())
        .where(Alert.status != AlertStatus.closed)
        .group_by(Alert.severity)
    )
    by_severity = {s.value: 0 for s in Severity} | {s.value: n for s, n in sev_rows.all()}
    status_rows = await session.execute(select(Alert.status, func.count()).group_by(Alert.status))
    by_status = {s.value: 0 for s in AlertStatus} | {s.value: n for s, n in status_rows.all()}

    # Flags live in a JSON column; counting them in Python keeps the query portable.
    flag_lists = await session.scalars(
        select(Alert.flags).where(Alert.created_at >= now - timedelta(days=7))
    )
    # ML anomaly is a model signal, not a typology — keep it out of this breakdown.
    typologies = Counter(
        f["title"] for flags in flag_lists for f in flags if f["code"] != "ML_ANOMALY"
    )

    return Stats(
        tx_count_24h=totals[0],
        volume_24h=float(totals[1]),
        avg_risk_24h=round(float(totals[2]), 1),
        flagged_24h=totals[3],
        open_alerts=sum(n for s, n in by_status.items() if s != AlertStatus.closed.value),
        critical_alerts=by_severity[Severity.critical.value],
        alerts_by_severity=by_severity,
        alerts_by_status=by_status,
        by_channel=[
            {"channel": ch, "count": n, "volume": float(v or 0)}
            for ch, n, v in by_channel_rows.all()
        ],
        top_typologies=[{"title": t, "count": n} for t, n in typologies.most_common(6)],
        series=series,
    )
