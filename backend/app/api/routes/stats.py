from fastapi import APIRouter, Query

from app.api.deps import SessionDep, WorkspaceDep
from app.schemas import Stats
from app.services.stats import compute_stats

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("", response_model=Stats)
async def get_stats(session: SessionDep, ws: WorkspaceDep, minutes: int = Query(60, ge=5, le=360)):
    return await compute_stats(session, ws.id, minutes)
