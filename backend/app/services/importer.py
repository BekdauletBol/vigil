"""CSV import of transactions, the way banks hand over periodic exports.

Each row is validated on its own: good rows are imported and scored, bad rows are
reported back with their line number instead of failing the whole file.
"""

import csv
import io
from datetime import UTC, datetime

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.db.models import Account, TxStatus
from app.realtime.bus import EventBus
from app.schemas import AccountIn, ImportResult, ImportRowError, TransactionIn
from app.services.accounts import build_account, guess_kind
from app.services.errors import DomainError
from app.services.transactions import account_by_code, ingest, score

COLUMNS = [
    "ts",
    "external_id",
    "sender_code",
    "sender_name",
    "receiver_code",
    "receiver_name",
    "receiver_country",
    "amount",
    "channel",
    "purpose",
]
MAX_ROWS = 2000

TEMPLATE = (
    ",".join(COLUMNS)
    + "\n"
    + "2026-11-01T10:15:00+05:00,BANK-0001,CL-001,ТОО «Альфа Трейд»,CL-002,Иванов Пётр,KZ,250000,transfer,Оплата по договору\n"
    + "2026-11-01T10:20:00+05:00,BANK-0002,CL-001,ТОО «Альфа Трейд»,CL-777,Offshore Holding Ltd,VG,9500000,swift,Консультационные услуги\n"
)


def _localize_error(exc: ValidationError) -> str:
    parts = []
    for err in exc.errors():
        field = ".".join(str(p) for p in err["loc"])
        parts.append(f"{_FIELD_RU.get(field, field)}: {err['msg']}")
    return "; ".join(parts)


def _amount(raw: str) -> float:
    try:
        return float(raw.replace(" ", "").replace("\u00a0", "").replace(",", "."))
    except ValueError as exc:
        raise DomainError(f"amount: «{raw}» — не число") from exc


def _timestamp(raw: str) -> datetime:
    if not raw:
        return datetime.now(UTC)
    try:
        ts = datetime.fromisoformat(raw)
    except ValueError as exc:
        raise DomainError(
            f"ts: «{raw}» — ожидается дата ISO 8601, например 2026-11-01T10:15:00+05:00"
        ) from exc
    return ts if ts.tzinfo else ts.replace(tzinfo=UTC)


_FIELD_RU = {
    "amount": "сумма",
    "channel": "канал",
    "country": "страна",
    "sender_id": "sender_code",
    "receiver_id": "receiver_code",
}


async def _ensure_account(
    session: AsyncSession, workspace_id: int, code: str, name: str, country: str
) -> tuple[Account, bool]:
    account = await account_by_code(session, workspace_id, code)
    if account:
        return account, False
    data = AccountIn(
        code=code, name=name or f"Клиент {code}", kind=guess_kind(name), country=country or "KZ"
    )
    account = build_account(workspace_id, data, code)
    session.add(account)
    await session.flush()
    return account, True


async def import_csv(
    session: AsyncSession,
    workspace_id: int,
    raw: bytes,
    bus: EventBus,
    settings: Settings,
) -> ImportResult:
    text = raw.decode("utf-8-sig", errors="replace")
    sample = text[:2048]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    missing = {"sender_code", "receiver_code", "amount", "channel"} - set(reader.fieldnames or [])
    if missing:
        raise DomainError(f"В файле нет обязательных колонок: {', '.join(sorted(missing))}")

    result = ImportResult(imported=0, duplicates=0, created_clients=0, alerts=0, errors=[])
    for line, row in enumerate(reader, start=2):
        if line - 1 > MAX_ROWS:
            result.errors.append(ImportRowError(row=line, message=f"Лимит {MAX_ROWS} строк"))
            break
        row = {k.strip(): (v or "").strip() for k, v in row.items() if k}
        try:
            for side in ("sender", "receiver"):
                country = row.get("receiver_country", "KZ") if side == "receiver" else "KZ"
                _, created = await _ensure_account(
                    session, workspace_id, row[f"{side}_code"], row.get(f"{side}_name", ""), country
                )
                result.created_clients += created
            data = TransactionIn(
                external_id=row.get("external_id") or None,
                sender_id=row["sender_code"],
                receiver_id=row["receiver_code"],
                amount=_amount(row["amount"]),
                channel=row["channel"].lower(),
                country=(row.get("receiver_country") or "KZ")[:2],
                purpose=row.get("purpose", "")[:200],
                ts=_timestamp(row.get("ts", "")),
            )
            tx = await ingest(session, workspace_id, data)
            if tx.status == TxStatus.scored:
                result.duplicates += 1
                continue
            _, alert = await score(session, tx.id, bus, settings)
            result.imported += 1
            result.alerts += alert is not None
        except ValidationError as exc:
            await session.rollback()
            result.errors.append(ImportRowError(row=line, message=_localize_error(exc)))
        except (ValueError, KeyError, DomainError) as exc:
            await session.rollback()
            result.errors.append(ImportRowError(row=line, message=str(exc)))
    await session.commit()
    return result
