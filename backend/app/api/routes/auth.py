from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.deps import SessionDep, SettingsDep, UserDep
from app.core.security import create_access_token, hash_password, verify_password
from app.db.models import User, Workspace, WorkspaceKind
from app.schemas import AuthOut, LoginIn, RegisterIn, UserOut
from app.services.workspaces import list_for_user

router = APIRouter(prefix="/auth", tags=["auth"])


async def _auth_response(session, settings, user: User) -> AuthOut:
    return AuthOut(
        token=create_access_token(user.id, settings.jwt_secret, settings.jwt_ttl_hours),
        user=UserOut.model_validate(user),
        workspaces=await list_for_user(session, user),
    )


@router.post("/register", response_model=AuthOut, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterIn, session: SessionDep, settings: SettingsDep):
    """Create an account together with its first private workspace."""
    user = User(
        email=data.email.lower(), name=data.name.strip(), password_hash=hash_password(data.password)
    )
    session.add(user)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Пользователь с таким email уже есть"
        ) from exc
    session.add(
        Workspace(name=f"Пространство {user.name}", kind=WorkspaceKind.private, owner_id=user.id)
    )
    await session.commit()
    return await _auth_response(session, settings, user)


@router.post("/login", response_model=AuthOut)
async def login(data: LoginIn, session: SessionDep, settings: SettingsDep):
    user = await session.scalar(select(User).where(User.email == data.email.lower()))
    # Same message for unknown email and wrong password: no account enumeration.
    if user is None or not verify_password(data.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Неверный email или пароль")
    return await _auth_response(session, settings, user)


@router.get("/me", response_model=AuthOut)
async def me(user: UserDep, session: SessionDep, settings: SettingsDep):
    return await _auth_response(session, settings, user)
