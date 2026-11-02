import uuid
from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Account, AccountKind
from app.schemas import AccountIn
from app.services.errors import ConflictError
from app.services.generator import risk_level_for
from app.services.transactions import as_utc


def guess_kind(name: str) -> AccountKind:
    legal_markers = ("ТОО", "АО", "ИП", "LLP", "LLC", "LTD", "JSC", "INC", "GMBH", "«")
    upper = name.upper()
    return (
        AccountKind.legal
        if any(m.upper() in upper for m in legal_markers)
        else AccountKind.individual
    )


async def next_code(session: AsyncSession, workspace_id: int) -> str:
    count = await session.scalar(
        select(func.count()).select_from(Account).where(Account.workspace_id == workspace_id)
    )
    return f"CL-{(count or 0) + 1:05d}"


def build_account(workspace_id: int, data: AccountIn, code: str) -> Account:
    opened = as_utc(data.opened_at) if data.opened_at else datetime.now(UTC)
    age_days = max(0, (datetime.now(UTC) - opened).days)
    return Account(
        id=f"W{workspace_id}-{uuid.uuid4().hex[:10]}",
        workspace_id=workspace_id,
        code=code,
        name=data.name.strip(),
        kind=data.kind,
        tax_id=data.tax_id or "000000000000",
        bank=data.bank or "—",
        country=data.country,
        city=data.city or "—",
        risk_level=risk_level_for(data.country, data.is_pep, age_days),
        is_pep=data.is_pep,
        opened_at=opened,
    )


async def create_account(session: AsyncSession, workspace_id: int, data: AccountIn) -> Account:
    code = data.code or await next_code(session, workspace_id)
    account = build_account(workspace_id, data, code)
    session.add(account)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise ConflictError(f"Клиент с кодом {code} уже существует") from exc
    return account


async def list_accounts(
    session: AsyncSession, workspace_id: int, *, q: str | None = None, limit: int = 100
) -> list[Account]:
    query = select(Account).where(Account.workspace_id == workspace_id)
    if q:
        term = f"%{q.strip()}%"
        query = query.where(or_(Account.name.ilike(term), Account.code.ilike(term)))
    return list(await session.scalars(query.order_by(Account.code).limit(limit)))
