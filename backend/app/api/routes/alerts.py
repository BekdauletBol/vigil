from fastapi import APIRouter, Query, status

from app.api.deps import BusDep, SessionDep, WorkspaceDep
from app.db.models import AlertStatus, Severity
from app.schemas import AlertDetail, AlertOut, AlertPage, AlertPatch, NoteIn, NoteOut
from app.services import alerts as svc

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=AlertPage)
async def list_alerts(
    session: SessionDep,
    ws: WorkspaceDep,
    status_: AlertStatus | None = Query(None, alias="status"),
    severity: Severity | None = None,
    q: str | None = Query(None, max_length=100),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    return await svc.list_alerts(
        session, ws.id, status=status_, severity=severity, q=q, limit=limit, offset=offset
    )


@router.get("/{alert_id}", response_model=AlertDetail)
async def get_alert(alert_id: int, session: SessionDep, ws: WorkspaceDep):
    return await svc.get_alert_detail(session, ws.id, alert_id)


@router.patch("/{alert_id}", response_model=AlertOut)
async def update_alert(
    alert_id: int, patch: AlertPatch, session: SessionDep, bus: BusDep, ws: WorkspaceDep
):
    return await svc.update_alert(session, ws.id, alert_id, patch, bus)


@router.post("/{alert_id}/notes", response_model=NoteOut, status_code=status.HTTP_201_CREATED)
async def add_note(alert_id: int, note: NoteIn, session: SessionDep, ws: WorkspaceDep):
    return await svc.add_note(session, ws.id, alert_id, note)
