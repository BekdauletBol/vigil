"""Rule-based risk scoring.

Pure functions with no I/O, so the rules are trivially unit-testable and can run
in the API, in a Celery worker or inside the seeding script.
"""

from dataclasses import dataclass, field

from app.db.models import Severity

# Demo list of offshore / elevated-risk jurisdictions used by the rules engine.
HIGH_RISK_COUNTRIES = frozenset({"VG", "KY", "PA", "SC", "BZ"})
CHANNELS = ("transfer", "card", "cash", "swift", "p2p", "crypto")


@dataclass(frozen=True)
class TxFeatures:
    amount: float
    channel: str
    country: str
    hour: int
    sender_recent_count: int = 0  # sender's transactions in the last 10 minutes
    sender_recent_near_threshold: int = 0  # of those, how many were just below threshold
    sender_account_age_days: int = 365
    sender_is_pep: bool = False
    receiver_country: str = "KZ"


@dataclass(frozen=True)
class Flag:
    code: str
    title: str
    weight: int

    def as_dict(self) -> dict:
        return {"code": self.code, "title": self.title, "weight": self.weight}


@dataclass
class RiskResult:
    score: int
    flags: list[Flag] = field(default_factory=list)

    @property
    def severity(self) -> Severity:
        return severity_for(self.score)

    @property
    def typology(self) -> str:
        """The heaviest flag names the case."""
        if not self.flags:
            return "Без признаков"
        return max(self.flags, key=lambda f: f.weight).title


def severity_for(score: int) -> Severity:
    if score >= 85:
        return Severity.critical
    if score >= 65:
        return Severity.high
    if score >= 40:
        return Severity.medium
    return Severity.low


ALERT_THRESHOLD = 65


def evaluate(f: TxFeatures, threshold: int, anomaly: float = 0.0) -> RiskResult:
    flags: list[Flag] = []

    if f.amount >= threshold:
        flags.append(Flag("THRESHOLD", "Операция выше порогового значения", 35))
    elif f.amount >= threshold * 0.85:
        # Each earlier near-threshold payment in the window makes structuring more likely.
        weight = 15 + 20 * min(f.sender_recent_near_threshold, 2)
        flags.append(Flag("STRUCTURING", "Дробление: суммы чуть ниже порога", weight))

    if f.country in HIGH_RISK_COUNTRIES or f.receiver_country in HIGH_RISK_COUNTRIES:
        flags.append(Flag("OFFSHORE", "Офшорная юрисдикция", 25))

    if f.channel == "crypto":
        flags.append(Flag("VASP", "Операция через криптообменник", 20))
    elif f.channel == "cash" and f.amount >= threshold * 0.3:
        flags.append(Flag("CASH", "Крупная операция наличными", 12))

    if f.sender_recent_count >= 4:
        flags.append(Flag("VELOCITY", "Высокая частота операций", 20))

    if f.amount >= 1_000_000 and f.amount % 1_000_000 == 0:
        flags.append(Flag("ROUND", "Круглая сумма", 8))

    if f.sender_account_age_days < 30 and f.amount >= threshold * 0.2:
        flags.append(Flag("NEW_ACCOUNT", "Новый счёт, крупная сумма", 12))

    if f.sender_is_pep:
        flags.append(Flag("PEP", "Публичное должностное лицо", 15))

    if f.hour < 6 and f.amount >= threshold * 0.2:
        flags.append(Flag("NIGHT", "Ночная операция", 6))

    if anomaly >= 0.6:
        flags.append(Flag("ML_ANOMALY", "Аномалия по ML-модели", round(anomaly * 20)))

    score = min(100, sum(fl.weight for fl in flags))
    return RiskResult(score=score, flags=flags)
