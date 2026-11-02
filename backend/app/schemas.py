import uuid
from datetime import UTC, datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.db.models import AccountKind, AlertStatus, RiskLevel, Severity
from app.services.risk import CHANNELS


def _as_utc(dt: datetime) -> datetime:
    # SQLite returns naive datetimes; without an offset browsers would read them as local time.
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt


UTCDateTime = Annotated[datetime, AfterValidator(_as_utc)]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class FlagOut(BaseModel):
    code: str
    title: str
    weight: int


class AccountBrief(ORM):
    id: str
    code: str
    name: str
    kind: AccountKind
    bank: str
    country: str


class AccountOut(AccountBrief):
    tax_id: str
    city: str
    risk_level: RiskLevel
    is_pep: bool
    opened_at: UTCDateTime

    @field_validator("tax_id")
    @classmethod
    def mask(cls, v: str) -> str:
        return v[:4] + "••••" + v[-2:]


class TransactionIn(BaseModel):
    """Payload accepted from external systems (banks, payment processors)."""

    external_id: str | None = Field(default=None, max_length=64)
    sender_id: str = Field(description="Sender's client code in this workspace")
    receiver_id: str = Field(description="Receiver's client code in this workspace")
    amount: float = Field(gt=0, le=10_000_000_000)
    currency: Literal["KZT"] = "KZT"
    channel: str
    country: str = Field(min_length=2, max_length=2)
    purpose: str = Field(default="", max_length=200)
    ts: datetime | None = None

    @field_validator("channel")
    @classmethod
    def known_channel(cls, v: str) -> str:
        if v not in CHANNELS:
            raise ValueError(f"channel must be one of {', '.join(CHANNELS)}")
        return v

    @field_validator("country")
    @classmethod
    def upper(cls, v: str) -> str:
        return v.upper()


class TransactionOut(ORM):
    id: uuid.UUID
    ts: UTCDateTime
    sender: AccountBrief
    receiver: AccountBrief
    amount: float
    currency: str
    channel: str
    country: str
    purpose: str
    status: str
    risk_score: int
    anomaly_score: float
    flags: list[FlagOut]


class IngestAccepted(BaseModel):
    id: uuid.UUID
    status: str
    risk_score: int | None = None


class NoteIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    author: str = Field(default="Аналитик", max_length=80)


class NoteOut(ORM):
    id: int
    author: str
    kind: str
    text: str
    created_at: UTCDateTime


class AlertOut(ORM):
    id: int
    severity: Severity
    status: AlertStatus
    score: int
    typology: str
    flags: list[FlagOut]
    assignee: str | None
    created_at: UTCDateTime
    updated_at: UTCDateTime
    account: AccountBrief
    transaction: TransactionOut


class AlertPage(BaseModel):
    items: list[AlertOut]
    total: int
    counts: dict[str, int]


class GraphNode(BaseModel):
    id: str
    label: str
    kind: str
    country: str
    role: Literal["subject", "counterparty"]
    volume: float


class GraphEdge(BaseModel):
    source: str
    target: str
    amount: float
    count: int
    max_score: int


class AlertDetail(AlertOut):
    account: AccountOut  # type: ignore[assignment]
    notes: list[NoteOut]
    related: list[TransactionOut]
    graph_nodes: list[GraphNode]
    graph_edges: list[GraphEdge]


class AlertPatch(BaseModel):
    status: AlertStatus | None = None
    assignee: str | None = None
    author: str = Field(default="Аналитик", max_length=80)


class SeriesPoint(BaseModel):
    t: UTCDateTime
    count: int
    volume: float
    flagged: int


class Stats(BaseModel):
    tx_count_24h: int
    volume_24h: float
    flagged_24h: int
    avg_risk_24h: float
    open_alerts: int
    critical_alerts: int
    alerts_by_severity: dict[str, int]
    alerts_by_status: dict[str, int]
    by_channel: list[dict]
    top_typologies: list[dict]
    series: list[SeriesPoint]


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=20_000)


class ChatRequest(BaseModel):
    alert_id: int | None = None
    messages: list[ChatMessage] = Field(min_length=1, max_length=40)


class AccountIn(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=64, pattern=r"^[\w\-.]+$")
    name: str = Field(min_length=2, max_length=200)
    kind: AccountKind = AccountKind.individual
    tax_id: str = Field(default="", max_length=12, pattern=r"^\d{0,12}$")
    bank: str = Field(default="", max_length=100)
    country: str = Field(default="KZ", min_length=2, max_length=2)
    city: str = Field(default="", max_length=80)
    is_pep: bool = False
    opened_at: datetime | None = None

    @field_validator("country")
    @classmethod
    def upper(cls, v: str) -> str:
        return v.upper()


class UserOut(ORM):
    id: int
    email: str
    name: str


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=80)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)


class WorkspaceOut(ORM):
    id: int
    name: str
    kind: str
    api_key_prefix: str | None
    simulator_until: UTCDateTime | None
    created_at: UTCDateTime
    accounts: int = 0
    transactions: int = 0


class AuthOut(BaseModel):
    token: str
    user: UserOut
    workspaces: list[WorkspaceOut]


class WorkspaceIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class WorkspacePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    simulator: bool | None = None


class ApiKeyOut(BaseModel):
    api_key: str
    prefix: str


class ImportRowError(BaseModel):
    row: int
    message: str


class ImportResult(BaseModel):
    imported: int
    duplicates: int
    created_clients: int
    alerts: int
    errors: list[ImportRowError]
