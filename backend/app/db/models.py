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


def _enum(e: type[enum.Enum], name: str) -> Enum:
    return Enum(e, name=name, values_callable=lambda x: [m.value for m in x])


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
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
        Index("ix_transactions_ts", "ts"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    external_id: Mapped[str | None] = mapped_column(String(64), unique=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    sender_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"))
    receiver_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"))
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
    __table_args__ = (Index("ix_alerts_status_created", "status", "created_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    transaction_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("transactions.id"), unique=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"))
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
