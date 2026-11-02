import contextlib

from fastapi import APIRouter, Response, status
from sqlalchemy import text

from app.api.deps import BusDep, SessionDep
from app.realtime.bus import RedisEventBus

router = APIRouter(tags=["health"])


@router.get("/health")
async def liveness() -> dict:
    return {"status": "ok"}


@router.get("/health/ready")
async def readiness(session: SessionDep, bus: BusDep, response: Response) -> dict:
    checks = {"database": False, "event_bus": False}
    # Readiness reports failures instead of raising them.
    with contextlib.suppress(Exception):
        await session.execute(text("SELECT 1"))
        checks["database"] = True
    with contextlib.suppress(Exception):
        checks["event_bus"] = await bus.ping() if isinstance(bus, RedisEventBus) else True
    ok = all(checks.values())
    if not ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {"status": "ok" if ok else "degraded", "checks": checks}
