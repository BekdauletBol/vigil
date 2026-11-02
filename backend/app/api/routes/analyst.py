import json

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from app.ai.analyst import prepare_context, run_analyst
from app.ai.retriever import get_retriever
from app.api.deps import ProviderDep, SessionDep, WorkspaceDep
from app.schemas import ChatRequest

router = APIRouter(tags=["analyst"])


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/analyst/chat")
async def chat(req: ChatRequest, session: SessionDep, provider: ProviderDep, ws: WorkspaceDep):
    """Stream the analyst's answer as Server-Sent Events: `meta`, `delta`…, `done` | `error`."""
    context = await prepare_context(session, ws.id, req)

    async def events():
        try:
            async for event, data in run_analyst(req, context, provider):
                yield sse(event, data)
        except Exception as exc:  # noqa: BLE001 - surface provider errors to the client
            yield sse("error", {"message": f"{exc.__class__.__name__}: {exc}"[:300]})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/knowledge/search")
async def search_knowledge(q: str = Query(..., min_length=2, max_length=300), k: int = 3):
    return [h.as_dict() for h in get_retriever().search(q, k=min(k, 10))]
