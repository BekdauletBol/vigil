from collections import defaultdict
from datetime import timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Account, Alert, AlertNote, AlertStatus, Severity, Transaction
from app.realtime.bus import EventBus, alerts_channel
from app.schemas import (
    AlertDetail,
    AlertOut,
    AlertPage,
    AlertPatch,
    GraphEdge,
    GraphNode,
    NoteIn,
    TransactionOut,
)
from app.services.errors import ConflictError, NotFoundError
from app.services.transactions import as_utc

STATUS_LABELS = {
    AlertStatus.open: "Открыт",
    AlertStatus.investigating: "В работе",
    AlertStatus.escalated: "Эскалирован",
    AlertStatus.closed: "Закрыт",
}

# Allowed case-workflow transitions.
TRANSITIONS: dict[AlertStatus, set[AlertStatus]] = {
    AlertStatus.open: {AlertStatus.investigating, AlertStatus.closed},
    AlertStatus.investigating: {AlertStatus.escalated, AlertStatus.closed, AlertStatus.open},
    AlertStatus.escalated: {AlertStatus.closed, AlertStatus.investigating},
    AlertStatus.closed: {AlertStatus.investigating},
}


async def list_alerts(
    session: AsyncSession,
    workspace_id: int,
    *,
    status: AlertStatus | None = None,
    severity: Severity | None = None,
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> AlertPage:
    filters = [Alert.workspace_id == workspace_id]
    if status:
        filters.append(Alert.status == status)
    if severity:
        filters.append(Alert.severity == severity)
    if q:
        term = q.strip().lstrip("#")
        conds = [Account.name.ilike(f"%{term}%"), Alert.typology.ilike(f"%{term}%")]
        if term.isdigit():
            conds.append(Alert.id == int(term))
        filters.append(or_(*conds))

    base = select(Alert).join(Account, Alert.account_id == Account.id).where(*filters)
    total = await session.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = await session.scalars(
        base.order_by(Alert.created_at.desc(), Alert.id.desc()).limit(limit).offset(offset)
    )

    count_rows = await session.execute(
        select(Alert.status, func.count())
        .where(Alert.workspace_id == workspace_id)
        .group_by(Alert.status)
    )
    counts = {s.value: 0 for s in AlertStatus} | {s.value: n for s, n in count_rows.all()}

    return AlertPage(
        items=[AlertOut.model_validate(a) for a in rows.unique()],
        total=total,
        counts=counts,
    )


async def _get(session: AsyncSession, workspace_id: int, alert_id: int) -> Alert:
    alert = await session.scalar(
        select(Alert).where(Alert.id == alert_id, Alert.workspace_id == workspace_id)
    )
    if alert is None:
        raise NotFoundError(f"Alert {alert_id} not found")
    return alert


async def get_alert_detail(session: AsyncSession, workspace_id: int, alert_id: int) -> AlertDetail:
    alert = await _get(session, workspace_id, alert_id)
    subject = alert.account_id
    since = as_utc(alert.transaction.ts) - timedelta(days=7)

    related = list(
        (
            await session.scalars(
                select(Transaction)
                .where(
                    or_(Transaction.sender_id == subject, Transaction.receiver_id == subject),
                    Transaction.ts >= since,
                )
                .order_by(Transaction.ts.desc())
                .limit(200)
            )
        ).unique()
    )

    nodes, edges = build_graph(subject, related)
    base = AlertOut.model_validate(alert).model_dump()
    base["account"] = alert.account
    return AlertDetail.model_validate(
        {
            **base,
            "notes": alert.notes,
            "related": [TransactionOut.model_validate(t) for t in related[:40]],
            "graph_nodes": nodes,
            "graph_edges": edges,
        }
    )


def build_graph(
    subject: str, txs: list[Transaction], max_counterparties: int = 12
) -> tuple[list[GraphNode], list[GraphEdge]]:
    """Aggregate a subject's transactions into a counterparty graph."""
    volume: dict[str, float] = defaultdict(float)
    accounts: dict[str, Account] = {}
    edge_acc: dict[tuple[str, str], list] = {}

    for t in txs:
        accounts[t.sender_id] = t.sender
        accounts[t.receiver_id] = t.receiver
        other = t.receiver_id if t.sender_id == subject else t.sender_id
        if other == subject:
            continue
        amount = float(t.amount)
        volume[other] += amount
        e = edge_acc.setdefault((t.sender_id, t.receiver_id), [0.0, 0, 0])
        e[0] += amount
        e[1] += 1
        e[2] = max(e[2], t.risk_score)

    top = sorted(volume, key=volume.get, reverse=True)[:max_counterparties]  # type: ignore[arg-type]
    keep = set(top) | {subject}

    nodes = []
    for acc_id in [subject, *top]:
        acc = accounts.get(acc_id)
        if acc is None:
            continue
        nodes.append(
            GraphNode(
                id=acc_id,
                label=acc.name,
                kind=acc.kind.value,
                country=acc.country,
                role="subject" if acc_id == subject else "counterparty",
                volume=round(sum(volume.values()) if acc_id == subject else volume[acc_id], 2),
            )
        )
    edges = [
        GraphEdge(source=s, target=t, amount=round(v[0], 2), count=v[1], max_score=v[2])
        for (s, t), v in edge_acc.items()
        if s in keep and t in keep
    ]
    return nodes, edges


async def update_alert(
    session: AsyncSession, workspace_id: int, alert_id: int, patch: AlertPatch, bus: EventBus
) -> AlertOut:
    alert = await _get(session, workspace_id, alert_id)
    changes: list[str] = []

    if patch.status and patch.status != alert.status:
        if patch.status not in TRANSITIONS[alert.status]:
            raise ConflictError(
                f"Переход «{STATUS_LABELS[alert.status]}» → «{STATUS_LABELS[patch.status]}» запрещён"
            )
        changes.append(f"Статус: {STATUS_LABELS[alert.status]} → {STATUS_LABELS[patch.status]}")
        alert.status = patch.status

    if "assignee" in patch.model_fields_set and patch.assignee != alert.assignee:
        changes.append(f"Исполнитель: {patch.assignee or 'не назначен'}")
        alert.assignee = patch.assignee

    if changes:
        session.add(
            AlertNote(
                alert_id=alert.id, author=patch.author, kind="system", text="; ".join(changes)
            )
        )
        await session.commit()
        await session.refresh(alert)

    out = AlertOut.model_validate(alert)
    if changes:
        await bus.publish(
            alerts_channel(workspace_id),
            {"type": "alert.updated", "data": out.model_dump(mode="json")},
        )
    return out


async def add_note(
    session: AsyncSession, workspace_id: int, alert_id: int, note: NoteIn
) -> AlertNote:
    await _get(session, workspace_id, alert_id)
    row = AlertNote(alert_id=alert_id, author=note.author, kind="comment", text=note.text)
    session.add(row)
    await session.commit()
    return row
