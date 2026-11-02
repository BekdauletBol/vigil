from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app.core.config import get_settings


def make_engine(url: str | None = None, *, pooled: bool = True) -> AsyncEngine:
    settings = get_settings()
    url = url or settings.database_url
    # Tests open a fresh event loop per test; pooled connections would outlive it.
    pooled = pooled and settings.environment != "test"
    kwargs: dict = {"pool_pre_ping": True} if pooled and not url.startswith("sqlite") else {}
    if not pooled:
        # Celery tasks run each job in a fresh event loop; pooled asyncpg
        # connections are bound to the loop that created them.
        kwargs["poolclass"] = NullPool
    return create_async_engine(url, **kwargs)


engine = make_engine()
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
