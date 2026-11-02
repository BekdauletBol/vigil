import pytest

from app.db.models import Severity
from app.ml.anomaly import get_model
from app.services.risk import TxFeatures, evaluate, severity_for

T = 7_000_000


def codes(result):
    return {f.code for f in result.flags}


def test_benign_transfer_has_no_flags():
    r = evaluate(TxFeatures(amount=25_000, channel="card", country="KZ", hour=13), T)
    assert r.score == 0
    assert r.typology == "Без признаков"


def test_amount_above_threshold():
    r = evaluate(TxFeatures(amount=T, channel="transfer", country="KZ", hour=12), T)
    assert "THRESHOLD" in codes(r)


def test_structuring_weight_grows_with_repetition():
    single = evaluate(TxFeatures(amount=T * 0.95, channel="cash", country="KZ", hour=12), T)
    burst = evaluate(
        TxFeatures(
            amount=T * 0.95,
            channel="cash",
            country="KZ",
            hour=12,
            sender_recent_count=4,
            sender_recent_near_threshold=3,
        ),
        T,
    )
    assert "STRUCTURING" in codes(single) and "STRUCTURING" in codes(burst)
    assert {"VELOCITY"} <= codes(burst)
    assert burst.score > single.score
    assert burst.score >= 65  # crosses the alert threshold


def test_offshore_via_receiver_country():
    r = evaluate(
        TxFeatures(amount=50_000, channel="swift", country="KZ", hour=12, receiver_country="VG"), T
    )
    assert "OFFSHORE" in codes(r)


def test_score_is_clamped_to_100():
    r = evaluate(
        TxFeatures(
            amount=T * 3,
            channel="crypto",
            country="PA",
            hour=3,
            sender_recent_count=9,
            sender_account_age_days=2,
            sender_is_pep=True,
        ),
        T,
        anomaly=1.0,
    )
    assert r.score == 100
    assert r.severity == Severity.critical


@pytest.mark.parametrize(
    ("score", "severity"),
    [(0, Severity.low), (40, Severity.medium), (65, Severity.high), (85, Severity.critical)],
)
def test_severity_bands(score, severity):
    assert severity_for(score) == severity


def test_ml_model_ranks_outlier_above_typical_payment():
    model = get_model()
    typical = model.score(TxFeatures(amount=40_000, channel="card", country="KZ", hour=14))
    outlier = model.score(
        TxFeatures(
            amount=900_000_000, channel="crypto", country="VG", hour=3, sender_recent_count=10
        )
    )
    assert 0 <= typical < 0.5 < outlier <= 1
