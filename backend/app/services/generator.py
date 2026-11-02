"""Synthetic data generator shared by the seed script and the live simulator."""

import math
import random
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.db.models import AccountKind, RiskLevel
from app.services import reference as ref
from app.services.risk import HIGH_RISK_COUNTRIES

CHANNEL_WEIGHTS = {"transfer": 36, "card": 34, "cash": 8, "swift": 6, "p2p": 15, "crypto": 1}


@dataclass
class AccountSeed:
    id: str
    workspace_id: int
    code: str
    name: str
    kind: AccountKind
    tax_id: str
    bank: str
    country: str
    city: str
    risk_level: RiskLevel
    is_pep: bool
    opened_at: datetime


def risk_level_for(country: str, is_pep: bool, account_age_days: int) -> RiskLevel:
    """Initial client risk profile (KYC-style), used for seeded and user-created clients."""
    if country in HIGH_RISK_COUNTRIES or is_pep:
        return RiskLevel.high
    if country != "KZ" or account_age_days < 30:
        return RiskLevel.medium
    return RiskLevel.low


def make_accounts(
    rng: random.Random,
    n: int,
    now: datetime,
    *,
    workspace_id: int = 1,
    start: int = 0,
    id_prefix: str = "ACC-",
    code_prefix: str = "ACC-",
) -> list[AccountSeed]:
    foreign = list(ref.FOREIGN.items())
    out: list[AccountSeed] = []
    for i in range(start, start + n):
        is_foreign = i % 8 == 7
        country, city = rng.choice(foreign) if is_foreign else ("KZ", rng.choice(ref.CITIES))
        kind = AccountKind.legal if rng.random() < 0.45 or is_foreign else AccountKind.individual
        name = ref.company_name(rng) if kind == AccountKind.legal else ref.person_name(rng)
        is_pep = kind == AccountKind.individual and rng.random() < 0.06
        new = rng.random() < 0.08
        age_days = rng.randint(3, 20) if new else rng.randint(60, 3000)
        out.append(
            AccountSeed(
                id=f"{id_prefix}{i + 1:05d}",
                workspace_id=workspace_id,
                code=f"{code_prefix}{i + 1:05d}",
                name=name,
                kind=kind,
                tax_id=ref.tax_id(rng),
                bank=rng.choice(ref.BANKS) if country == "KZ" else f"Foreign Bank ({country})",
                country=country,
                city=city,
                risk_level=risk_level_for(country, is_pep, age_days),
                is_pep=is_pep,
                opened_at=now - timedelta(days=age_days),
            )
        )
    return out


def _amount(rng: random.Random) -> float:
    return round(10 ** rng.gauss(4.6, 0.55), -2) or 500.0


def _channel(rng: random.Random) -> str:
    return rng.choices(list(CHANNEL_WEIGHTS), weights=list(CHANNEL_WEIGHTS.values()))[0]


def scenario(
    rng: random.Random, accounts: list[AccountSeed], threshold: int, ts: datetime
) -> list[dict]:
    """Return one or more transaction payloads. Most are benign; some follow ML/TF typologies."""
    domestic = [a for a in accounts if a.country == "KZ"]
    offshore = [a for a in accounts if a.country in HIGH_RISK_COUNTRIES]
    roll = rng.random()

    def tx(sender, receiver, amount, channel, offset_s=0, purpose=None) -> dict:
        return {
            "sender_id": sender.code,
            "receiver_id": receiver.code,
            "amount": float(amount),
            "channel": channel,
            "country": receiver.country,
            "purpose": purpose or rng.choice(ref.PURPOSES),
            "ts": ts + timedelta(seconds=offset_s),
        }

    if roll < 0.004:  # structuring: a burst of transfers just below the threshold
        sender = rng.choice(domestic)
        n = rng.randint(3, 5)
        return [
            tx(
                sender,
                rng.choice(domestic),
                round(threshold * rng.uniform(0.86, 0.985), -3),
                rng.choice(["cash", "transfer"]),
                offset_s=i * rng.randint(20, 90),
                purpose="Финансовая помощь",
            )
            for i in range(n)
        ]
    if roll < 0.008 and offshore:  # large wire to an offshore company
        return [
            tx(
                rng.choice(domestic),
                rng.choice(offshore),
                round(threshold * rng.uniform(0.6, 4), -5),
                "swift",
                purpose="Оплата консультационных услуг",
            )
        ]
    if roll < 0.012:  # crypto exchange cash-out
        return [
            tx(
                rng.choice(domestic),
                rng.choice(accounts),
                round(10 ** rng.uniform(5.5, 7), -3),
                "crypto",
                purpose="Пополнение счёта",
            )
        ]
    if roll < 0.016:  # large round cash
        return [
            tx(rng.choice(domestic), rng.choice(domestic), rng.randint(2, 12) * 1_000_000, "cash")
        ]

    sender, receiver = rng.sample(domestic, 2)
    return [tx(sender, receiver, _amount(rng), _channel(rng))]


def diurnal_weight(hour: int) -> float:
    """Relative activity by local hour, peaking mid-day."""
    return 0.25 + math.exp(-((hour - 14) ** 2) / 30)
