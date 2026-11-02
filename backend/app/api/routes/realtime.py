import asyncio
import contextlib
import json

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse

from app.api.deps import BusDep, WorkspaceDep, _int_or_none, resolve_workspace
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.realtime.bus import alerts_channel, transactions_channel
from app.realtime.streams import subscribe_with_heartbeat
from app.schemas import TransactionOut
from app.services.transactions import recent_transactions

router = APIRouter(tags=["realtime"])


@router.websocket("/ws/transactions")
async def transactions_ws(ws: WebSocket) -> None:
    """Live transaction feed of one workspace: a snapshot first, then every scored transaction.

    Browsers cannot set headers on WebSockets, so the workspace and token come as query params.
    """
    async with SessionLocal() as session:
        try:
            workspace = await resolve_workspace(
                session,
                get_settings(),
                workspace_id=_int_or_none(ws.query_params.get("workspace")),
                token=ws.query_params.get("token"),
                api_key=None,
            )
        except HTTPException:
            await ws.close(code=4401)
            return
        snapshot = await recent_transactions(session, workspace.id, limit=40)

    await ws.accept()
    bus = ws.app.state.bus
    await ws.send_json(
        {
            "type": "snapshot",
            "data": [TransactionOut.model_validate(t).model_dump(mode="json") for t in snapshot],
        }
    )

    async def relay() -> None:
        async for event in subscribe_with_heartbeat(bus, transactions_channel(workspace.id), 20):
            await ws.send_json(event or {"type": "heartbeat"})

    async def receive() -> None:
        while True:
            msg = await ws.receive_json()
            if msg.get("type") == "ping":
                await ws.send_json({"type": "pong", "t": msg.get("t")})

    tasks = [asyncio.create_task(relay()), asyncio.create_task(receive())]
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    except WebSocketDisconnect:
        pass
    finally:
        for t in tasks:
            t.cancel()
        for t in tasks:
            with contextlib.suppress(asyncio.CancelledError, WebSocketDisconnect, RuntimeError):
                await t
        with contextlib.suppress(RuntimeError):
            await ws.close()


@router.get("/events")
async def alert_events(request: Request, bus: BusDep, ws: WorkspaceDep):
    """Server-Sent Events stream of case updates (`alert.created`, `alert.updated`)."""
    channel = alerts_channel(ws.id)

    async def stream():
        yield "retry: 3000\n\n"
        async for event in subscribe_with_heartbeat(bus, channel, 15):
            if await request.is_disconnected():
                break
            if event is None:
                yield ": keep-alive\n\n"
            else:
                data = json.dumps(event["data"], ensure_ascii=False)
                yield f"event: {event['type']}\ndata: {data}\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
