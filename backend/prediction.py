"""
Demand prediction — lightweight heuristic model for restaurant listings.

predict_demand(listing) → DemandPrediction(
    claim_probability,      # 0.0 – 1.0
    estimated_minutes_to_claim,
    confidence,             # "high" | "medium" | "low"
    factors,                # list[str] — human-readable drivers
)

Architecture
────────────
DemandPredictor (ABC)
  └── HeuristicDemandPredictor   ← active (rule-based, zero deps)
  └── MLDemandPredictor          ← stub (swap in when claim history exists)

To activate the ML predictor: set DEMAND_PREDICTOR=ml env var and
implement MLDemandPredictor per its docstring.
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


# ---------------------------------------------------------------------------
# Output model
# ---------------------------------------------------------------------------

@dataclass
class DemandPrediction:
    claim_probability: float          # 0.0 – 1.0
    estimated_minutes_to_claim: int
    confidence: str                   # "high" | "medium" | "low"
    factors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "claim_probability": self.claim_probability,
            "estimated_minutes_to_claim": self.estimated_minutes_to_claim,
            "confidence": self.confidence,
            "factors": self.factors,
        }


# ---------------------------------------------------------------------------
# Abstract interface
# ---------------------------------------------------------------------------

class DemandPredictor(ABC):
    @abstractmethod
    def predict(self, listing: Any) -> DemandPrediction: ...


# ---------------------------------------------------------------------------
# Heuristic implementation
# ---------------------------------------------------------------------------

class HeuristicDemandPredictor(DemandPredictor):
    """
    Rule-based predictor: fast, deterministic, interpretable.
    Replace with MLDemandPredictor once ≥ 500 claim records are available.

    Probability baseline: 0.55
    Adjustments applied additively; clamped to [0.10, 0.97].
    """

    _POPULAR_TAGS = frozenset({"vegan", "vegetarian", "halal", "gluten-free"})
    # (inclusive_start, exclusive_end) in UTC hours
    _RUSH_WINDOWS = [(11, 13), (17, 20)]

    def predict(self, listing: Any) -> DemandPrediction:
        now = datetime.now(timezone.utc)
        factors: list[str] = []
        p = 0.55  # baseline

        # Rush hour
        h = now.hour
        if any(s <= h < e for s, e in self._RUSH_WINDOWS):
            p += 0.20
            factors.append("Posted during peak meal hours")

        # Popular dietary tags
        tags = set(self._tags(listing))
        popular = tags & self._POPULAR_TAGS
        if popular:
            p += 0.15
            factors.append(f"High-demand tags: {', '.join(sorted(popular))}")

        # Short pickup window → urgency → faster claim
        pickup_start = self._dt(listing, "pickup_start")
        pickup_end = self._dt(listing, "pickup_end")
        if pickup_start and pickup_end:
            window_min = (pickup_end - pickup_start).total_seconds() / 60
            if window_min <= 60:
                p += 0.10
                factors.append("Short pickup window creates urgency")

        # Large quantity → harder to fully claim
        qty = self._int(listing, "quantity")
        if qty > 30:
            p -= 0.10
            factors.append("Large quantity may take longer to fully claim")

        p = round(min(0.97, max(0.10, p)), 2)

        # ETA
        if p >= 0.80:
            eta = 10
        elif p >= 0.65:
            eta = 25
        else:
            eta = 45

        confidence = "high" if len(factors) >= 2 else ("medium" if factors else "low")

        return DemandPrediction(
            claim_probability=p,
            estimated_minutes_to_claim=eta,
            confidence=confidence,
            factors=factors,
        )

    @staticmethod
    def _tags(listing: Any) -> list:
        val = listing.get("dietary_tags", []) if isinstance(listing, dict) else getattr(listing, "dietary_tags", [])
        return val if isinstance(val, list) else []

    @staticmethod
    def _dt(listing: Any, field: str) -> datetime | None:
        val = listing.get(field) if isinstance(listing, dict) else getattr(listing, field, None)
        if isinstance(val, datetime):
            if val.tzinfo is None:
                val = val.replace(tzinfo=timezone.utc)
            return val
        if isinstance(val, str):
            try:
                dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
                return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
            except ValueError:
                return None
        return None

    @staticmethod
    def _int(listing: Any, field: str) -> int:
        val = listing.get(field, 0) if isinstance(listing, dict) else getattr(listing, field, 0)
        try:
            return int(val)
        except (TypeError, ValueError):
            return 0


# ---------------------------------------------------------------------------
# ML stub
# ---------------------------------------------------------------------------

class MLDemandPredictor(DemandPredictor):
    """
    Stub for future ML-based predictor. Set DEMAND_PREDICTOR=ml to activate.

    Suggested model: gradient-boosted classifier (XGBoost / sklearn)
    Training target : claimed_within_30min (binary)

    Feature vector sketch:
        [hour_of_day, day_of_week, quantity, window_minutes,
         has_vegan, has_halal, has_vegetarian, listing_age_minutes]

    Integration sketch:
        import joblib
        self._model = joblib.load(os.getenv("DEMAND_MODEL_PATH", "models/demand.pkl"))

        def predict(self, listing):
            feats = _extract_features(listing)
            prob  = float(self._model.predict_proba([feats])[0][1])
            ...
    """

    def __init__(self):
        raise NotImplementedError(
            "MLDemandPredictor not yet implemented. "
            "See class docstring, train a model, then remove this __init__."
        )

    def predict(self, listing: Any) -> DemandPrediction:
        raise NotImplementedError


# ---------------------------------------------------------------------------
# Factory + module-level singleton
# ---------------------------------------------------------------------------

def get_predictor() -> DemandPredictor:
    backend = os.getenv("DEMAND_PREDICTOR", "heuristic").lower()
    if backend == "ml":
        return MLDemandPredictor()
    return HeuristicDemandPredictor()


_predictor: DemandPredictor = HeuristicDemandPredictor()


def predict_demand(listing: Any) -> DemandPrediction:
    """Module-level convenience function."""
    return _predictor.predict(listing)
