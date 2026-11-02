from fastapi import APIRouter, Query, status

from app.api.deps import BusDep, SessionDep, SettingsDep
from app.schemas import IngestAccepted, TransactionIn, TransactionOut
from app.services import transactions as svc

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.post("", response_model=IngestAccepted, status_code=status.HTTP_202_ACCEPTED)
async def ingest_transaction(
    data: TransactionIn, session: SessionDep, bus: BusDep, settings: SettingsDep
):
    """Integration endpoint for external systems. Idempotent by `external_id`."""
    tx = await svc.submit(session, data, bus, settings)
    return IngestAccepted(id=tx.id, status=tx.status.value)


@router.get("", response_model=list[TransactionOut])
async def list_transactions(
    session: SessionDep,
    limit: int = Query(50, ge=1, le=500),
    min_score: int = Query(0, ge=0, le=100),
):
    return await svc.recent_transactions(session, limit, min_score)
