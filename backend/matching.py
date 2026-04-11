"""
Smart matching — deterministic recommendation scoring for recipient listings.

score(listing) → (match_score: float 0-100, match_reasons: list[str])

Weight breakdown (total = 100):
  urgency           30  — minutes until pickup closes
  quantity_fit      25  — sweet-spot portion size for a single recipient
  recency           20  — how fresh the listing is
  dietary_signals   15  — presence of high-demand dietary tags
  slot_ease         10  — no mandatory slot = simpler to claim
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

# High-demand tags based on general food-bank distribution data
_HIGH_DEMAND = frozenset({
    "vegan", "vegetarian", "vegetarian-option", "halal",
    "gluten-free", "nut-free", "dairy-free",
})


def score(
    listing: Any,
    user_dietary_tags: list[str] | None = None,
) -> tuple[float, list[str]]:
    """
    Return (match_score, match_reasons) for a listing in a recipient context.

    listing may be a Pydantic model or a plain dict.
    user_dietary_tags is an optional list of the recipient's known preferences.
    """
    now = datetime.now(timezone.utc)
    reasons: list[str] = []
    total = 0.0

    # ── Urgency (30 pts) ──────────────────────────────────────────────────────
    pickup_end = _dt(listing, "pickup_end")
    minutes_left = (
        max(0.0, (pickup_end - now).total_seconds() / 60) if pickup_end else 120.0
    )
    if minutes_left <= 30:
        urgency = 30.0
        reasons.append("Pickup closes very soon")
    elif minutes_left <= 60:
        urgency = 22.5
        reasons.append("Pickup closes within 1 hour")
    elif minutes_left <= 120:
        urgency = 15.0
    else:
        # Decay: full urgency at 0 min, ~3 pts at 8 h
        urgency = max(3.0, 30.0 * (1 - minutes_left / 480))
    total += urgency

    # ── Quantity fit (25 pts) ─────────────────────────────────────────────────
    qty = _int(listing, "quantity")
    if 3 <= qty <= 15:
        qty_score = 25.0
        reasons.append("Good portion size for pickup")
    elif qty <= 30:
        qty_score = 17.5
    else:
        qty_score = 10.0
    total += qty_score

    # ── Recency (20 pts) ──────────────────────────────────────────────────────
    created_at = _dt(listing, "created_at")
    if created_at:
        age_min = (now - created_at).total_seconds() / 60
        recency = max(0.0, 20.0 * (1 - age_min / 360))
    else:
        recency = 10.0
    total += recency

    # ── Dietary signals (15 pts) ──────────────────────────────────────────────
    tags = set(_list(listing, "dietary_tags"))
    high_demand_match = tags & _HIGH_DEMAND
    if user_dietary_tags:
        user_match = tags & set(user_dietary_tags)
        if user_match:
            dietary = 15.0
            reasons.append("Matches your dietary preferences")
        elif high_demand_match:
            dietary = 9.0
        else:
            dietary = 0.0
    elif high_demand_match:
        dietary = 10.5
        reasons.append("High-demand dietary options available")
    else:
        dietary = 0.0
    total += dietary

    # ── Slot ease (10 pts) ────────────────────────────────────────────────────
    slots = _list(listing, "pickup_slots")
    slot_score = 10.0 if not slots else 6.0
    total += slot_score

    return round(min(100.0, total), 1), reasons


# ── Internal helpers ─────────────────────────────────────────────────────────

def _dt(obj: Any, field: str) -> datetime | None:
    val = obj.get(field) if isinstance(obj, dict) else getattr(obj, field, None)
    if isinstance(val, datetime):
        if val.tzinfo is None:
            val = val.replace(tzinfo=timezone.utc)
        return val
    if isinstance(val, str):
        try:
            dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            return None
    return None


def _int(obj: Any, field: str) -> int:
    val = obj.get(field, 0) if isinstance(obj, dict) else getattr(obj, field, 0)
    try:
        return int(val)
    except (TypeError, ValueError):
        return 0


def _list(obj: Any, field: str) -> list:
    val = obj.get(field, []) if isinstance(obj, dict) else getattr(obj, field, [])
    return val if isinstance(val, list) else []
