import asyncio
import contextlib
import logging
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.ai.providers import make_provider
from app.ai.retriever import get_retriever
from app.api.routes import (
    accounts,
    alerts,
    analyst,
    auth,
    health,
    realtime,
    stats,
    transactions,
    workspaces,
)
from app.core.config import Settings, get_settings
from app.db.models import Base
from app.db.session import SessionLocal, engine
from app.ml.anomaly import get_model
from app.realtime.bus import make_bus
from app.seed import ensure_demo_workspace, seed
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
        async with SessionLocal() as session:
            if settings.seed_on_startup:
                await seed(session, settings)
            else:
                await ensure_demo_workspace(session)

        from app.simulator import prune_demo_history, run_embedded, run_workspace_simulators

        background = [
            asyncio.create_task(run_workspace_simulators(settings, app.state.bus)),
            asyncio.create_task(prune_demo_history(settings)),
        ]
        if settings.embedded_simulator:
            background.append(asyncio.create_task(run_embedded(settings, app.state.bus)))
        log.info(
            "Vigil API ready (bus=%s, scoring=%s, llm=%s)",
            settings.event_bus,
            settings.scoring_mode,
            app.state.llm.name,
        )
        yield
        for task in background:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
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

    for module in (
        health,
        auth,
        workspaces,
        accounts,
        transactions,
        alerts,
        stats,
        analyst,
        realtime,
    ):
        app.include_router(module.router, prefix="/api/v1")

    if settings.static_dir:  # demo image: the API also serves the React build
        mount_spa(app, Path(settings.static_dir))
    return app


def mount_spa(app: FastAPI, root: Path) -> None:
    root = root.resolve()
    app.mount("/assets", StaticFiles(directory=root / "assets"), name="assets")

    # Plain `def`: FastAPI runs it in a thread pool, so the filesystem checks don't block the loop.
    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404)
        file = (root / path).resolve()
        if path and file.is_file() and file.is_relative_to(root):
            return FileResponse(file)
        return FileResponse(root / "index.html")  # client-side routing


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
_settings = get_settings()
app = create_app(
    create_tables=_settings.create_tables
    or (_settings.environment == "development" and _settings.database_url.startswith("sqlite"))
)
