from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.providers import LLMProvider
from app.core.config import Settings, get_settings
from app.core.security import decode_access_token, hash_api_key
from app.db.models import DEMO_WORKSPACE_ID, User, Workspace, WorkspaceKind
from app.db.session import get_session
from app.realtime.bus import EventBus


def get_bus(request: Request) -> EventBus:
    return request.app.state.bus


def get_provider(request: Request) -> LLMProvider:
    return request.app.state.llm


SessionDep = Annotated[AsyncSession, Depends(get_session)]
BusDep = Annotated[EventBus, Depends(get_bus)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
ProviderDep = Annotated[LLMProvider, Depends(get_provider)]


def _bearer(header: str | None) -> str | None:
    if header and header.lower().startswith("bearer "):
        return header[7:].strip()
    return None


async def resolve_workspace(
    session: AsyncSession,
    settings: Settings,
    *,
    workspace_id: int | None,
    token: str | None,
    api_key: str | None,
) -> Workspace:
    """Find the workspace a request targets and check the caller may use it.

    - An API key (integrations) identifies its workspace by itself.
    - The demo workspace is public.
    - A private workspace requires the owner's JWT. Foreign workspaces return 404,
      so their existence is not leaked.
    """
    if api_key:
        ws = await session.scalar(
            select(Workspace).where(Workspace.api_key_hash == hash_api_key(api_key))
        )
        if ws is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid API key")
        if workspace_id is not None and workspace_id != ws.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "API key belongs to another workspace")
        return ws

    ws = await session.get(Workspace, workspace_id or DEMO_WORKSPACE_ID)
    if ws is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workspace not found")
    if ws.kind == WorkspaceKind.demo:
        return ws

    user_id = decode_access_token(token, settings.jwt_secret) if token else None
    if user_id is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in to access this workspace")
    if ws.owner_id != user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workspace not found")
    return ws


def _int_or_none(value: str | None) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid workspace id") from exc


async def get_workspace(request: Request, session: SessionDep, settings: SettingsDep) -> Workspace:
    # Headers for fetch(); query parameters for EventSource, which cannot send headers.
    q = request.query_params
    return await resolve_workspace(
        session,
        settings,
        workspace_id=_int_or_none(request.headers.get("x-workspace-id") or q.get("workspace")),
        token=_bearer(request.headers.get("authorization")) or q.get("token"),
        api_key=request.headers.get("x-api-key"),
    )


async def get_current_user(request: Request, session: SessionDep, settings: SettingsDep) -> User:
    token = _bearer(request.headers.get("authorization"))
    user_id = decode_access_token(token, settings.jwt_secret) if token else None
    user = await session.get(User, user_id) if user_id else None
    if user is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


async def get_optional_user(
    request: Request, session: SessionDep, settings: SettingsDep
) -> User | None:
    try:
        return await get_current_user(request, session, settings)
    except HTTPException:
        return None


WorkspaceDep = Annotated[Workspace, Depends(get_workspace)]
UserDep = Annotated[User, Depends(get_current_user)]
OptionalUserDep = Annotated[User | None, Depends(get_optional_user)]
