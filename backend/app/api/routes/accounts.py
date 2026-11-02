from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import SessionDep, WorkspaceDep
from app.schemas import AccountIn, AccountOut
from app.services import accounts as svc
from app.services.transactions import account_by_code

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("", response_model=list[AccountOut])
async def list_accounts(
    session: SessionDep,
    ws: WorkspaceDep,
    q: str | None = Query(None, max_length=100),
    limit: int = Query(100, ge=1, le=1000),
):
    return await svc.list_accounts(session, ws.id, q=q, limit=limit)


@router.post("", response_model=AccountOut, status_code=status.HTTP_201_CREATED)
async def create_account(data: AccountIn, session: SessionDep, ws: WorkspaceDep):
    return await svc.create_account(session, ws.id, data)


@router.get("/{code}", response_model=AccountOut)
async def get_account(code: str, session: SessionDep, ws: WorkspaceDep):
    account = await account_by_code(session, ws.id, code)
    if account is None:
        raise HTTPException(404, "Client not found")
    return account
