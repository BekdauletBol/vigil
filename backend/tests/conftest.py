import os
import tempfile
from pathlib import Path

# Configure before the app (and its engine) is imported.
_DB = Path(tempfile.gettempdir()) / f"vigil-test-{os.getpid()}.db"
os.environ.update(
    ENVIRONMENT="test",
    # CI sets TEST_DATABASE_URL to a real PostgreSQL service; locally SQLite is enough.
    DATABASE_URL=os.environ.get("TEST_DATABASE_URL", f"sqlite+aiosqlite:///{_DB}"),
    EVENT_BUS="memory",
    SCORING_MODE="inline",
    LLM_PROVIDER="mock",
    SEED_ON_STARTUP="true",
    SEED_ACCOUNTS="40",
    SEED_TRANSACTIONS="400",
    SEED_RECENT_PER_MINUTE="2",
)

import httpx  # noqa: E402
import pytest  # noqa: E402

from app.db.models import Base  # noqa: E402
from app.db.session import engine  # noqa: E402
from app.main import create_app  # noqa: E402


@pytest.fixture
async def app():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    application = create_app(create_tables=True)
    async with application.router.lifespan_context(application):
        yield application


@pytest.fixture
async def client(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
