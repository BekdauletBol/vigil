"""Publish/subscribe event bus.

The API, the Celery worker and every WebSocket/SSE connection talk through this
interface. In production it is Redis Pub/Sub, so events produced by the worker
reach clients connected to any API replica.
"""

import asyncio
import contextlib
import json
from abc import ABC, abstractmethod
from collections import defaultdict
from collections.abc import AsyncIterator

import redis.asyncio as redis

CHANNEL_TRANSACTIONS = "vigil:transactions"
CHANNEL_ALERTS = "vigil:alerts"


class EventBus(ABC):
    @abstractmethod
    async def publish(self, channel: str, event: dict) -> None: ...

    @abstractmethod
    def subscribe(self, channel: str) -> AsyncIterator[dict]: ...

    async def close(self) -> None:  # noqa: B027 - optional hook
        pass


class InMemoryEventBus(EventBus):
    def __init__(self) -> None:
        self._subscribers: dict[str, set[asyncio.Queue[dict]]] = defaultdict(set)

    async def publish(self, channel: str, event: dict) -> None:
        for queue in list(self._subscribers[channel]):
            with contextlib.suppress(asyncio.QueueFull):
                queue.put_nowait(event)

    async def subscribe(self, channel: str) -> AsyncIterator[dict]:
        queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=1000)
        self._subscribers[channel].add(queue)
        try:
            while True:
                yield await queue.get()
        finally:
            self._subscribers[channel].discard(queue)


class RedisEventBus(EventBus):
    def __init__(self, url: str) -> None:
        self._redis = redis.from_url(url, decode_responses=True)

    async def publish(self, channel: str, event: dict) -> None:
        await self._redis.publish(channel, json.dumps(event, ensure_ascii=False, default=str))

    async def subscribe(self, channel: str) -> AsyncIterator[dict]:
        pubsub = self._redis.pubsub()
        await pubsub.subscribe(channel)
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    yield json.loads(message["data"])
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.aclose()

    async def ping(self) -> bool:
        return bool(await self._redis.ping())

    async def close(self) -> None:
        await self._redis.aclose()


def make_bus(kind: str, redis_url: str) -> EventBus:
    return RedisEventBus(redis_url) if kind == "redis" else InMemoryEventBus()
