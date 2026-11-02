from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from app.api.deps import SessionDep
from app.db.models import Account
from app.schemas import AccountOut

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("", response_model=list[AccountOut])
async def list_accounts(session: SessionDep, limit: int = Query(100, le=1000)):
    return list(await session.scalars(select(Account).order_by(Account.id).limit(limit)))


@router.get("/{account_id}", response_model=AccountOut)
async def get_account(account_id: str, session: SessionDep):
    account = await session.get(Account, account_id)
    if account is None:
        raise HTTPException(404, "Account not found")
    return account
