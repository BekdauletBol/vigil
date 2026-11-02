import random
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import delete

from app.api.deps import OptionalUserDep, SessionDep, SettingsDep, UserDep
from app.core.security import new_api_key
from app.db.models import Account, Alert, Transaction, Workspace, WorkspaceKind
from app.schemas import ApiKeyOut, WorkspaceIn, WorkspaceOut, WorkspacePatch
from app.seed import generate_history
from app.services.workspaces import list_for_user, to_out

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


async def _owned(session, user, workspace_id: int) -> Workspace:
    ws = await session.get(Workspace, workspace_id)
    if ws is None or ws.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workspace not found")
    return ws


@router.get("", response_model=list[WorkspaceOut])
async def list_workspaces(session: SessionDep, user: OptionalUserDep):
    """The public demo plus, when signed in, the caller's own workspaces."""
    return await list_for_user(session, user)


@router.post("", response_model=WorkspaceOut, status_code=status.HTTP_201_CREATED)
async def create_workspace(data: WorkspaceIn, session: SessionDep, user: UserDep):
    ws = Workspace(name=data.name.strip(), kind=WorkspaceKind.private, owner_id=user.id)
    session.add(ws)
    await session.commit()
    return await to_out(session, ws)


@router.patch("/{workspace_id}", response_model=WorkspaceOut)
async def update_workspace(
    workspace_id: int,
    patch: WorkspacePatch,
    session: SessionDep,
    user: UserDep,
    settings: SettingsDep,
):
    ws = await _owned(session, user, workspace_id)
    if patch.name is not None:
        ws.name = patch.name.strip()
    if patch.simulator is not None:
        minutes = settings.workspace_simulator_minutes
        ws.simulator_until = (
            datetime.now(UTC) + timedelta(minutes=minutes) if patch.simulator else None
        )
    await session.commit()
    return await to_out(session, ws)


@router.post("/{workspace_id}/api-key", response_model=ApiKeyOut)
async def rotate_api_key(workspace_id: int, session: SessionDep, user: UserDep):
    """Issue a new integration key. The plaintext is returned once; only its hash is stored."""
    ws = await _owned(session, user, workspace_id)
    key, digest, prefix = new_api_key()
    ws.api_key_hash, ws.api_key_prefix = digest, prefix
    await session.commit()
    return ApiKeyOut(api_key=key, prefix=prefix)


@router.post("/{workspace_id}/sample-data", response_model=WorkspaceOut)
async def sample_data(workspace_id: int, session: SessionDep, user: UserDep, settings: SettingsDep):
    ws = await _owned(session, user, workspace_id)
    await generate_history(
        session, settings, ws.id, accounts=25, transactions=400, rng=random.Random()
    )
    return await to_out(session, ws)


@router.delete("/{workspace_id}/data", response_model=WorkspaceOut)
async def reset_data(workspace_id: int, session: SessionDep, user: UserDep):
    ws = await _owned(session, user, workspace_id)
    for model in (Alert, Transaction, Account):  # children first
        await session.execute(delete(model).where(model.workspace_id == ws.id))
    ws.simulator_until = None
    await session.commit()
    return await to_out(session, ws)
