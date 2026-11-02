import enum
import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class AccountKind(enum.StrEnum):
    individual = "individual"
    legal = "legal"


class RiskLevel(enum.StrEnum):
    low = "low"
    medium = "medium"
    high = "high"


class Severity(enum.StrEnum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class AlertStatus(enum.StrEnum):
    open = "open"
    investigating = "investigating"
    escalated = "escalated"
    closed = "closed"


class TxStatus(enum.StrEnum):
    pending = "pending"
    scored = "scored"


class WorkspaceKind(enum.StrEnum):
    demo = "demo"  # shared, public, fed by the simulator
    private = "private"  # owned by a registered user


def _enum(e: type[enum.Enum], name: str) -> Enum:
    return Enum(e, name=name, values_callable=lambda x: [m.value for m in x])


DEMO_WORKSPACE_ID = 1


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    password_hash: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Workspace(Base):
    """Tenant boundary: every account, transaction and case belongs to exactly one workspace."""

    __tablename__ = "workspaces"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(80))
    kind: Mapped[WorkspaceKind] = mapped_column(_enum(WorkspaceKind, "workspace_kind"))
    owner_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # Integration key for external systems; only a hash is stored, the key is shown once.
    api_key_hash: Mapped[str | None] = mapped_column(String(64), unique=True)
    api_key_prefix: Mapped[str | None] = mapped_column(String(16))
    simulator_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Account(Base):
    __tablename__ = "accounts"
    __table_args__ = (UniqueConstraint("workspace_id", "code", name="uq_accounts_workspace_code"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    workspace_id: Mapped[int] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"))
    # The client's identifier in the source system; integrations reference accounts by it.
    code: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[AccountKind] = mapped_column(_enum(AccountKind, "account_kind"))
    tax_id: Mapped[str] = mapped_column(String(12))  # ИИН / БИН (synthetic)
    bank: Mapped[str] = mapped_column(String(100))
    country: Mapped[str] = mapped_column(String(2))
    city: Mapped[str] = mapped_column(String(80))
    risk_level: Mapped[RiskLevel] = mapped_column(_enum(RiskLevel, "risk_level"))
    is_pep: Mapped[bool] = mapped_column(Boolean, default=False)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        Index("ix_transactions_sender_ts", "sender_id", "ts"),
        Index("ix_transactions_workspace_ts", "workspace_id", "ts"),
        UniqueConstraint("workspace_id", "external_id", name="uq_transactions_workspace_external"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[int] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"))
    external_id: Mapped[str | None] = mapped_column(String(64))
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    sender_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"))
    receiver_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"))
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    currency: Mapped[str] = mapped_column(String(3), default="KZT")
    channel: Mapped[str] = mapped_column(String(20))
    country: Mapped[str] = mapped_column(String(2))
    purpose: Mapped[str] = mapped_column(String(200), default="")
    status: Mapped[TxStatus] = mapped_column(_enum(TxStatus, "tx_status"), default=TxStatus.pending)
    risk_score: Mapped[int] = mapped_column(Integer, default=0)
    anomaly_score: Mapped[float] = mapped_column(Float, default=0.0)
    flags: Mapped[list[dict]] = mapped_column(JSON, default=list)

    sender: Mapped[Account] = relationship(foreign_keys=[sender_id], lazy="joined")
    receiver: Mapped[Account] = relationship(foreign_keys=[receiver_id], lazy="joined")


class Alert(Base):
    __tablename__ = "alerts"
    __table_args__ = (
        Index("ix_alerts_workspace_status_created", "workspace_id", "status", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    workspace_id: Mapped[int] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"))
    transaction_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("transactions.id", ondelete="CASCADE"), unique=True
    )
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"))
    severity: Mapped[Severity] = mapped_column(_enum(Severity, "severity"))
    status: Mapped[AlertStatus] = mapped_column(
        _enum(AlertStatus, "alert_status"), default=AlertStatus.open
    )
    score: Mapped[int] = mapped_column(Integer)
    typology: Mapped[str] = mapped_column(String(120))
    flags: Mapped[list[dict]] = mapped_column(JSON, default=list)
    assignee: Mapped[str | None] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    transaction: Mapped[Transaction] = relationship(lazy="joined")
    account: Mapped[Account] = relationship(lazy="joined")
    notes: Mapped[list["AlertNote"]] = relationship(
        back_populates="alert", order_by="AlertNote.created_at", lazy="selectin"
    )


class AlertNote(Base):
    """Audit trail: every status change and analyst comment is kept."""

    __tablename__ = "alert_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    alert_id: Mapped[int] = mapped_column(ForeignKey("alerts.id", ondelete="CASCADE"), index=True)
    author: Mapped[str] = mapped_column(String(80))
    kind: Mapped[str] = mapped_column(String(20), default="comment")  # comment | system
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    alert: Mapped[Alert] = relationship(back_populates="notes")
