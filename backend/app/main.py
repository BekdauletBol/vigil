import asyncio
import contextlib
import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.ai.providers import make_provider
from app.ai.retriever import get_retriever
from app.api.routes import accounts, alerts, analyst, health, realtime, stats, transactions
from app.core.config import Settings, get_settings
from app.db.models import Base
from app.db.session import SessionLocal, engine
from app.ml.anomaly import get_model
from app.realtime.bus import make_bus
from app.seed import seed
from app.services.errors import DomainError

log = logging.getLogger("vigil")


def create_app(settings: Settings | None = None, *, create_tables: bool = False) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.bus = make_bus(settings.event_bus, settings.redis_url)
        app.state.llm = make_provider(settings)
        # Warm up CPU-bound singletons off the event loop.
        await asyncio.gather(asyncio.to_thread(get_model), asyncio.to_thread(get_retriever))

        if create_tables:  # dev/test shortcut; production schema is managed by Alembic
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
        if settings.seed_on_startup:
            async with SessionLocal() as session:
                await seed(session, settings)

        sim = None
        if settings.embedded_simulator:
            from app.simulator import run_embedded

            sim = asyncio.create_task(run_embedded(settings, app.state.bus))
        log.info(
            "Vigil API ready (bus=%s, scoring=%s, llm=%s)",
            settings.event_bus,
            settings.scoring_mode,
            app.state.llm.name,
        )
        yield
        if sim:
            sim.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await sim
        await app.state.bus.close()

    app = FastAPI(
        title=settings.app_name,
        version="1.0.0",
        description="Мониторинг транзакций, кейс-менеджмент и AI-аналитик (демо).",
        lifespan=lifespan,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
        start = time.perf_counter()
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        response.headers["Server-Timing"] = f"app;dur={(time.perf_counter() - start) * 1000:.1f}"
        return response

    @app.exception_handler(DomainError)
    async def domain_error(_: Request, exc: DomainError):
        return JSONResponse({"detail": str(exc)}, status_code=exc.status_code)

    for module in (health, accounts, transactions, alerts, stats, analyst, realtime):
        app.include_router(module.router, prefix="/api/v1")
    return app


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
app = create_app(
    create_tables=get_settings().environment == "development"
    and get_settings().database_url.startswith("sqlite")
)
