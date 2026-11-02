"""Unsupervised anomaly detection with IsolationForest.

The model is trained on a synthetic baseline of "normal" behaviour and returns a
0..1 anomaly score that the rules engine blends into the final risk score.
"""

import math
from functools import lru_cache

import numpy as np
from sklearn.ensemble import IsolationForest

from app.services.risk import CHANNELS, HIGH_RISK_COUNTRIES, TxFeatures


def vectorize(f: TxFeatures) -> list[float]:
    angle = 2 * math.pi * f.hour / 24
    return [
        math.log10(max(f.amount, 1.0)),
        math.sin(angle),
        math.cos(angle),
        float(CHANNELS.index(f.channel)) if f.channel in CHANNELS else 0.0,
        1.0 if f.country in HIGH_RISK_COUNTRIES else 0.0,
        min(f.sender_recent_count, 10) / 10,
    ]


def _baseline(n: int = 4000, seed: int = 7) -> np.ndarray:
    rng = np.random.default_rng(seed)
    amount = 10 ** rng.normal(4.6, 0.55, n)  # ~40k KZT median, long tail
    hour = rng.choice(24, n, p=_hour_profile())
    channel = rng.choice(len(CHANNELS), n, p=[0.36, 0.34, 0.08, 0.06, 0.15, 0.01])
    offshore = (rng.random(n) < 0.01).astype(float)
    velocity = np.clip(rng.poisson(0.6, n), 0, 10) / 10
    angle = 2 * np.pi * hour / 24
    return np.column_stack(
        [np.log10(amount), np.sin(angle), np.cos(angle), channel, offshore, velocity]
    )


def _hour_profile() -> list[float]:
    w = np.array(
        [
            1,
            0.6,
            0.4,
            0.3,
            0.3,
            0.5,
            1.2,
            2.5,
            4,
            5,
            5.5,
            5.5,
            5,
            5.5,
            5.5,
            5,
            5,
            5.2,
            5,
            4.5,
            4,
            3,
            2,
            1.4,
        ]
    )
    return list(w / w.sum())


class AnomalyModel:
    def __init__(self) -> None:
        self._model = IsolationForest(n_estimators=150, contamination=0.02, random_state=42)
        self._model.fit(_baseline())

    def score(self, f: TxFeatures) -> float:
        return self.score_many([f])[0]

    def score_many(self, features: list[TxFeatures]) -> list[float]:
        if not features:
            return []
        # decision_function: positive = normal, negative = anomalous. Squash to 0..1.
        raw = self._model.decision_function(np.array([vectorize(f) for f in features]))
        return [round(float(v), 3) for v in 1 / (1 + np.exp(raw * 18))]


@lru_cache
def get_model() -> AnomalyModel:
    return AnomalyModel()
