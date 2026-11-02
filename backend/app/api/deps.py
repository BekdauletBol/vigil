from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.providers import LLMProvider
from app.core.config import Settings, get_settings
from app.db.session import get_session
from app.realtime.bus import EventBus


def get_bus(request: Request) -> EventBus:
    return request.app.state.bus


def get_provider(request: Request) -> LLMProvider:
    return request.app.state.llm


SessionDep = Annotated[AsyncSession, Depends(get_session)]
BusDep = Annotated[EventBus, Depends(get_bus)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
ProviderDep = Annotated[LLMProvider, Depends(get_provider)]
