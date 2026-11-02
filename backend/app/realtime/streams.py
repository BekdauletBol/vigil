import asyncio
import contextlib
from collections.abc import AsyncIterator

from app.realtime.bus import EventBus


async def subscribe_with_heartbeat(
    bus: EventBus, channel: str, interval: float = 15.0
) -> AsyncIterator[dict | None]:
    """Yield bus events, or None every `interval` seconds of silence (for keep-alives).

    A pump task feeds a queue so a timeout never cancels the subscription itself.
    """
    queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=500)

    async def pump() -> None:
        async for event in bus.subscribe(channel):
            if queue.full():
                queue.get_nowait()  # drop the oldest for slow consumers
            queue.put_nowait(event)

    task = asyncio.create_task(pump())
    try:
        while True:
            try:
                yield await asyncio.wait_for(queue.get(), interval)
            except TimeoutError:
                yield None
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
