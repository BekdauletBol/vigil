from fastapi import APIRouter, File, Query, UploadFile, status
from fastapi.responses import PlainTextResponse

from app.api.deps import BusDep, SessionDep, SettingsDep, WorkspaceDep
from app.schemas import ImportResult, IngestAccepted, TransactionIn, TransactionOut
from app.services import importer
from app.services import transactions as svc
from app.services.errors import DomainError

router = APIRouter(prefix="/transactions", tags=["transactions"])

MAX_UPLOAD = 2 * 1024 * 1024


@router.post("", response_model=IngestAccepted, status_code=status.HTTP_202_ACCEPTED)
async def ingest_transaction(
    data: TransactionIn,
    session: SessionDep,
    bus: BusDep,
    settings: SettingsDep,
    ws: WorkspaceDep,
    wait: bool = Query(False, description="Score synchronously and return the result"),
):
    """Integration endpoint for external systems (X-API-Key). Idempotent by `external_id`."""
    tx = await svc.submit(session, ws.id, data, bus, settings, inline=wait)
    return IngestAccepted(
        id=tx.id, status=tx.status.value, risk_score=tx.risk_score if wait else None
    )


@router.get("", response_model=list[TransactionOut])
async def list_transactions(
    session: SessionDep,
    ws: WorkspaceDep,
    limit: int = Query(50, ge=1, le=500),
    min_score: int = Query(0, ge=0, le=100),
):
    return await svc.recent_transactions(session, ws.id, limit, min_score)


@router.post("/import", response_model=ImportResult)
async def import_transactions(
    session: SessionDep,
    bus: BusDep,
    settings: SettingsDep,
    ws: WorkspaceDep,
    file: UploadFile = File(...),
):
    raw = await file.read(MAX_UPLOAD + 1)
    if len(raw) > MAX_UPLOAD:
        raise DomainError("Файл больше 2 МБ")
    return await importer.import_csv(session, ws.id, raw, bus, settings)


@router.get("/import/template", response_class=PlainTextResponse)
async def import_template():
    return PlainTextResponse(
        importer.TEMPLATE,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="vigil-import-template.csv"'},
    )
