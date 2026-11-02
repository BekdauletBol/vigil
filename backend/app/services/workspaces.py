from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Account, Transaction, User, Workspace, WorkspaceKind
from app.schemas import WorkspaceOut


async def to_out(session: AsyncSession, ws: Workspace) -> WorkspaceOut:
    out = WorkspaceOut.model_validate(ws)
    out.accounts = (
        await session.scalar(
            select(func.count()).select_from(Account).where(Account.workspace_id == ws.id)
        )
        or 0
    )
    out.transactions = (
        await session.scalar(
            select(func.count()).select_from(Transaction).where(Transaction.workspace_id == ws.id)
        )
        or 0
    )
    if ws.simulator_until and ws.simulator_until.replace(tzinfo=UTC) < datetime.now(UTC):
        out.simulator_until = None
    return out


async def list_for_user(session: AsyncSession, user: User | None) -> list[WorkspaceOut]:
    cond = Workspace.kind == WorkspaceKind.demo
    if user is not None:
        cond = or_(cond, Workspace.owner_id == user.id)
    rows = await session.scalars(select(Workspace).where(cond).order_by(Workspace.id))
    return [await to_out(session, ws) for ws in rows]
