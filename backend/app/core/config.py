from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, read from environment variables (and `.env` in development)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Vigil AML API"
    environment: Literal["development", "test", "production"] = "development"

    database_url: str = "postgresql+asyncpg://vigil:vigil@localhost:5432/vigil"
    redis_url: str = "redis://localhost:6379/0"

    # "redis" fans events out across API replicas and the Celery worker;
    # "memory" is a single-process bus for tests and quick local runs.
    event_bus: Literal["redis", "memory"] = "redis"
    # "celery" scores transactions in a worker; "inline" scores inside the request.
    scoring_mode: Literal["celery", "inline"] = "celery"

    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:8080"]

    # Demo reporting threshold in KZT. Not a legal value — configurable per deployment.
    reporting_threshold: int = 7_000_000

    seed_on_startup: bool = True
    seed_accounts: int = 80
    seed_transactions: int = 1500
    # Extra history for the last hour at the simulator's pace, so charts have no cliff at startup.
    seed_recent_per_minute: int = 45
    # Runs the transaction simulator inside the API process (handy without Docker).
    embedded_simulator: bool = False
    simulator_rate: float = 1.5  # transactions per second

    # LLM analyst. "auto" picks Anthropic when a key is set, otherwise the offline mock.
    llm_provider: Literal["auto", "anthropic", "ollama", "mock"] = "auto"
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-opus-5-5"
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:7b"


@lru_cache
def get_settings() -> Settings:
    return Settings()
