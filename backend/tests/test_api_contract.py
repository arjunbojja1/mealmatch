"""
MealMatch backend — API contract tests (Phase 2 hardening).

Covers:
  - Unified success/error envelope format
  - Create listing: shape, persistence, payload validation, dietary tags
  - Claim flow: partial/full, records, stats consistency
  - Expired listings: auto-expiry, public vs admin visibility, claimability
  - Invalid claims: all guardrails including zero/negative quantity
  - Admin: all statuses, status transitions, stats correctness after mutations, delete
  - Concurrency: atomic claim under simultaneous requests
"""

import threading
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import main as app_module
from main import app, listings, claims, ListingStatus, Listing

client = TestClient(app)

# ---------------------------------------------------------------------------
# Helpers / factories
# ---------------------------------------------------------------------------

FUTURE = datetime.now(timezone.utc) + timedelta(hours=2)
FAR_FUTURE = datetime.now(timezone.utc) + timedelta(hours=3)


def make_listing(
    listing_id: str = "test-1",
    quantity: int = 10,
    status: ListingStatus = ListingStatus.active,
    pickup_start_offset_hours: float = 1,
    pickup_end_offset_hours: float = 2,
    restaurant_id: str = "rest-test",
    title: str = "Test Listing",
    description: str = "A test listing",
    dietary_tags: list[str] | None = None,
) -> Listing:
    now = datetime.now(timezone.utc)
    return Listing(
        id=listing_id,
        restaurant_id=restaurant_id,
        title=title,
        description=description,
        quantity=quantity,
        dietary_tags=dietary_tags or [],
        pickup_start=now + timedelta(hours=pickup_start_offset_hours),
        pickup_end=now + timedelta(hours=pickup_end_offset_hours),
        status=status,
        created_at=now,
    )


def make_past_listing(listing_id: str = "test-past", quantity: int = 10) -> Listing:
    """Create a listing whose pickup window has already ended.

    Its status is still 'active' in storage — the expiry logic runs lazily
    on the next GET, which is what these tests exercise.
    """
    now = datetime.now(timezone.utc)
    return Listing(
        id=listing_id,
        restaurant_id="rest-test",
        title="Past Listing",
        description="Already closed",
        quantity=quantity,
        dietary_tags=[],
        pickup_start=now - timedelta(hours=3),
        pickup_end=now - timedelta(hours=1),  # pickup ended an hour ago
        status=ListingStatus.active,           # not yet expired in storage
        created_at=now - timedelta(hours=4),
    )


def create_listing_via_api(**overrides) -> dict:
    """POST /api/v1/listings and return the created listing dict."""
    now = datetime.now(timezone.utc)
    payload = {
        "restaurant_id": "rest-api",
        "title": "API Created Listing",
        "description": "Created through the API",
        "quantity": 5,
        "dietary_tags": [],
        "pickup_start": (now + timedelta(hours=1)).isoformat(),
        "pickup_end": (now + timedelta(hours=3)).isoformat(),
    }
    payload.update(overrides)
    res = client.post("/api/v1/listings", json=payload)
    assert res.status_code == 201, f"create failed: {res.json()}"
    return res.json()["data"]


def claim_via_api(listing_id: str, user_id: str = "u1", quantity: int = 1) -> dict:
    """POST claim and return the updated listing dict."""
    res = client.post(
        f"/api/v1/listings/{listing_id}/claim",
        json={"user_id": user_id, "claimed_quantity": quantity},
    )
    assert res.status_code == 200, f"claim failed: {res.json()}"
    return res.json()["data"]


@pytest.fixture(autouse=True)
def reset_state():
    """Reset in-memory storage before each test."""
    listings.clear()
    claims.clear()
    yield
    listings.clear()
    claims.clear()


# ---------------------------------------------------------------------------
# Envelope format
# ---------------------------------------------------------------------------


class TestEnvelopeFormat:
    def test_success_envelope_shape(self):
        listings["t1"] = make_listing("t1")
        res = client.get("/api/v1/listings")
        assert res.status_code == 200
        body = res.json()
        assert body["ok"] is True
        assert "data" in body
        assert "message" in body
        assert "meta" in body

    def test_health_success_envelope(self):
        res = client.get("/health")
        assert res.status_code == 200
        body = res.json()
        assert body["ok"] is True
        assert body["data"]["status"] == "ok"

    def test_error_envelope_shape_404(self):
        res = client.post(
            "/api/v1/listings/nonexistent/claim",
            json={"user_id": "u1", "claimed_quantity": 1},
        )
        assert res.status_code == 404
        body = res.json()
        assert body["ok"] is False
        assert "error" in body
        err = body["error"]
        assert "code" in err
        assert "message" in err
        assert err["code"] == "NOT_FOUND"

    def test_error_envelope_shape_409(self):
        listings["t1"] = make_listing("t1", status=ListingStatus.claimed)
        res = client.post(
            "/api/v1/listings/t1/claim",
            json={"user_id": "u1", "claimed_quantity": 1},
        )
        assert res.status_code == 409
        body = res.json()
        assert body["ok"] is False
        assert body["error"]["code"] == "UNCLAIMABLE_STATUS"

    def test_validation_error_envelope(self):
        """FastAPI 422 (missing field) should use the unified envelope."""
        res = client.post("/api/v1/listings/x/claim", json={"user_id": "u1"})
        assert res.status_code == 422
        body = res.json()
        assert body["ok"] is False
        assert body["error"]["code"] == "VALIDATION_ERROR"
        assert body["error"]["details"] is not None


# ---------------------------------------------------------------------------
# Create listing
# ---------------------------------------------------------------------------


class TestCreateListing:
    def _payload(self, **overrides):
        now = datetime.now(timezone.utc)
        base = {
            "restaurant_id": "rest-1",
            "title": "Test Food",
            "description": "Some food",
            "quantity": 5,
            "dietary_tags": [],
            "pickup_start": (now + timedelta(hours=1)).isoformat(),
            "pickup_end": (now + timedelta(hours=3)).isoformat(),
        }
        base.update(overrides)
        return base

    def test_create_returns_201_with_envelope(self):
        res = client.post("/api/v1/listings", json=self._payload())
        assert res.status_code == 201
        body = res.json()
        assert body["ok"] is True
        assert body["data"]["title"] == "Test Food"
        assert body["data"]["status"] == "active"
        assert body["data"]["quantity"] == 5

    def test_create_assigns_unique_id(self):
        r1 = client.post("/api/v1/listings", json=self._payload(title="Meal A"))
        r2 = client.post("/api/v1/listings", json=self._payload(title="Meal B"))
        assert r1.status_code == 201
        assert r2.status_code == 201
        assert r1.json()["data"]["id"] != r2.json()["data"]["id"]

    def test_create_preserves_dietary_tags(self):
        tags = ["vegan", "nut-free", "gluten-free"]
        res = client.post("/api/v1/listings", json=self._payload(dietary_tags=tags))
        assert res.status_code == 201
        assert res.json()["data"]["dietary_tags"] == tags

    def test_create_persists_to_public_feed(self):
        created = create_listing_via_api(title="Feed Check")
        res = client.get("/api/v1/listings")
        assert res.status_code == 200
        ids = [l["id"] for l in res.json()["data"]]
        assert created["id"] in ids

    def test_create_persists_to_admin_listings(self):
        created = create_listing_via_api(title="Admin Check")
        res = client.get("/api/v1/admin/listings")
        assert res.status_code == 200
        ids = [l["id"] for l in res.json()["data"]]
        assert created["id"] in ids

    def test_create_public_listing_has_is_urgent_field(self):
        create_listing_via_api()
        res = client.get("/api/v1/listings")
        listing = res.json()["data"][0]
        assert "is_urgent" in listing

    def test_invalid_window_returns_422(self):
        now = datetime.now(timezone.utc)
        res = client.post(
            "/api/v1/listings",
            json=self._payload(
                pickup_start=(now + timedelta(hours=3)).isoformat(),
                pickup_end=(now + timedelta(hours=1)).isoformat(),
            ),
        )
        assert res.status_code == 422
        assert res.json()["error"]["code"] == "INVALID_PICKUP_WINDOW"

    def test_equal_pickup_times_rejected(self):
        """pickup_end == pickup_start is also an invalid window."""
        now = datetime.now(timezone.utc)
        t = (now + timedelta(hours=2)).isoformat()
        res = client.post("/api/v1/listings", json=self._payload(pickup_start=t, pickup_end=t))
        assert res.status_code == 422
        assert res.json()["error"]["code"] == "INVALID_PICKUP_WINDOW"

    def test_zero_quantity_rejected(self):
        res = client.post("/api/v1/listings", json=self._payload(quantity=0))
        assert res.status_code == 422
        assert res.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_negative_quantity_rejected(self):
        res = client.post("/api/v1/listings", json=self._payload(quantity=-1))
        assert res.status_code == 422
        assert res.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_missing_title_rejected(self):
        payload = self._payload()
        del payload["title"]
        res = client.post("/api/v1/listings", json=payload)
        assert res.status_code == 422
        assert res.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_missing_restaurant_id_rejected(self):
        payload = self._payload()
        del payload["restaurant_id"]
        res = client.post("/api/v1/listings", json=payload)
        assert res.status_code == 422
        assert res.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_empty_title_rejected(self):
        """Pydantic min_length=1 on title."""
        res = client.post("/api/v1/listings", json=self._payload(title=""))
        assert res.status_code == 422
        assert res.json()["error"]["code"] == "VALIDATION_ERROR"


# ---------------------------------------------------------------------------
# Claim flow
# ---------------------------------------------------------------------------


class TestClaimFlow:
    def test_partial_claim_reduces_quantity(self):
        listings["t1"] = make_listing("t1", quantity=10)
        data = claim_via_api("t1", "u1", 4)
        assert data["quantity"] == 6
        assert data["status"] == "active"

    def test_partial_claim_reflected_in_public_feed(self):
        listings["t1"] = make_listing("t1", quantity=10)
        claim_via_api("t1", "u1", 4)
        res = client.get("/api/v1/listings")
        feed = {l["id"]: l for l in res.json()["data"]}
        assert "t1" in feed
        assert feed["t1"]["quantity"] == 6

    def test_full_claim_sets_quantity_zero_and_status_claimed(self):
        listings["t1"] = make_listing("t1", quantity=3)
        data = claim_via_api("t1", "u1", 3)
        assert data["quantity"] == 0
        assert data["status"] == "claimed"

    def test_full_claim_disappears_from_public_feed(self):
        listings["t1"] = make_listing("t1", quantity=2)
        claim_via_api("t1", "u1", 2)
        res = client.get("/api/v1/listings")
        ids = [l["id"] for l in res.json()["data"]]
        assert "t1" not in ids  # claimed items are excluded from active feed

    def test_full_claim_visible_in_admin_listings(self):
        listings["t1"] = make_listing("t1", quantity=2)
        claim_via_api("t1", "u1", 2)
        res = client.get("/api/v1/admin/listings")
        ids = [l["id"] for l in res.json()["data"]]
        assert "t1" in ids  # admin sees all statuses

    def test_claim_record_created_in_claims_store(self):
        listings["t1"] = make_listing("t1", quantity=5)
        claim_via_api("t1", "u1", 2)
        assert len(claims) == 1
        claim = list(claims.values())[0]
        assert claim.listing_id == "t1"
        assert claim.user_id == "u1"
        assert claim.claimed_quantity == 2
        assert claim.status == "confirmed"

    def test_claim_record_returned_by_claims_endpoint(self):
        listings["t1"] = make_listing("t1", quantity=5)
        claim_via_api("t1", "u1", 2)
        res = client.get("/api/v1/claims")
        assert res.status_code == 200
        claim_list = res.json()["data"]
        assert len(claim_list) == 1
        assert claim_list[0]["listing_id"] == "t1"
        assert claim_list[0]["user_id"] == "u1"
        assert claim_list[0]["claimed_quantity"] == 2

    def test_multiple_partial_claims_accumulate(self):
        listings["t1"] = make_listing("t1", quantity=9)
        claim_via_api("t1", "u1", 3)
        claim_via_api("t1", "u2", 3)
        claim_via_api("t1", "u3", 3)
        assert listings["t1"].quantity == 0
        assert listings["t1"].status == ListingStatus.claimed
        assert len(claims) == 3

    def test_admin_stats_total_claims_increments(self):
        listings["t1"] = make_listing("t1", quantity=10)
        res_before = client.get("/api/v1/admin/stats")
        assert res_before.json()["data"]["total_claims"] == 0

        claim_via_api("t1", "u1", 1)
        claim_via_api("t1", "u2", 1)

        res_after = client.get("/api/v1/admin/stats")
        assert res_after.json()["data"]["total_claims"] == 2


# ---------------------------------------------------------------------------
# Expired listing behavior
# ---------------------------------------------------------------------------


class TestExpiredListings:
    def test_past_listing_auto_expires_on_public_get(self):
        """Listings stored as active with pickup_end in the past become expired on next GET."""
        listings["past"] = make_past_listing("past", quantity=5)
        assert listings["past"].status == ListingStatus.active  # still active in store

        client.get("/api/v1/listings")  # triggers _expire_listings()

        assert listings["past"].status == ListingStatus.expired

    def test_past_listing_absent_from_public_feed(self):
        listings["past"] = make_past_listing("past")
        res = client.get("/api/v1/listings")
        ids = [l["id"] for l in res.json()["data"]]
        assert "past" not in ids

    def test_past_listing_visible_in_admin_with_expired_status(self):
        listings["past"] = make_past_listing("past")
        res = client.get("/api/v1/admin/listings")
        assert res.status_code == 200
        by_id = {l["id"]: l for l in res.json()["data"]}
        assert "past" in by_id
        assert by_id["past"]["status"] == "expired"

    def test_expired_listing_not_claimable(self):
        listings["past"] = make_past_listing("past")
        # Trigger expiry via a GET first so the status is updated
        client.get("/api/v1/listings")
        res = client.post(
            "/api/v1/listings/past/claim",
            json={"user_id": "u1", "claimed_quantity": 1},
        )
        assert res.status_code == 409
        assert res.json()["error"]["code"] == "UNCLAIMABLE_STATUS"

    def test_expired_listing_not_claimable_even_without_prior_get(self):
        """Claim endpoint itself triggers expiry check, so it catches past listings."""
        listings["past"] = make_past_listing("past")
        res = client.post(
            "/api/v1/listings/past/claim",
            json={"user_id": "u1", "claimed_quantity": 1},
        )
        assert res.status_code == 409
        assert res.json()["error"]["code"] == "UNCLAIMABLE_STATUS"

    def test_only_active_listings_in_public_feed(self):
        listings["active"] = make_listing("active", status=ListingStatus.active)
        listings["claimed"] = make_listing("claimed", status=ListingStatus.claimed)
        listings["expired"] = make_listing("expired", status=ListingStatus.expired)
        res = client.get("/api/v1/listings")
        data = res.json()["data"]
        assert len(data) == 1
        assert data[0]["id"] == "active"

    def test_public_feed_sorted_by_pickup_end(self):
        """Active listings returned soonest-first."""
        now = datetime.now(timezone.utc)
        listings["a"] = make_listing("a", pickup_end_offset_hours=3)
        listings["b"] = make_listing("b", pickup_end_offset_hours=1)
        listings["c"] = make_listing("c", pickup_end_offset_hours=2)
        res = client.get("/api/v1/listings")
        ids = [l["id"] for l in res.json()["data"]]
        assert ids == ["b", "c", "a"]


# ---------------------------------------------------------------------------
# Invalid claims
# ---------------------------------------------------------------------------


class TestInvalidClaims:
    def test_claim_not_found(self):
        res = client.post(
            "/api/v1/listings/no-such-id/claim",
            json={"user_id": "u1", "claimed_quantity": 1},
        )
        assert res.status_code == 404
        assert res.json()["error"]["code"] == "NOT_FOUND"

    def test_duplicate_claim_rejected(self):
        listings["t1"] = make_listing("t1", quantity=10)
        claim_via_api("t1", "u1", 1)
        res = client.post(
            "/api/v1/listings/t1/claim",
            json={"user_id": "u1", "claimed_quantity": 1},
        )
        assert res.status_code == 409
        assert res.json()["error"]["code"] == "ALREADY_CLAIMED"

    def test_over_available_quantity_rejected(self):
        listings["t1"] = make_listing("t1", quantity=5)
        res = client.post(
            "/api/v1/listings/t1/claim",
            json={"user_id": "u1", "claimed_quantity": 6},
        )
        assert res.status_code == 422
        assert res.json()["error"]["code"] == "OVER_QUANTITY"

    def test_over_max_cap_rejected(self):
        listings["t1"] = make_listing("t1", quantity=100)
        res = client.post(
            "/api/v1/listings/t1/claim",
            json={"user_id": "u1", "claimed_quantity": app_module.MAX_CLAIM_QUANTITY + 1},
        )
        assert res.status_code == 422
        assert res.json()["error"]["code"] == "OVER_QUANTITY"

    def test_zero_quantity_rejected_by_validation(self):
        """claimed_quantity has gt=0 in Pydantic — zero must fail validation."""
        listings["t1"] = make_listing("t1", quantity=5)
        res = client.post(
            "/api/v1/listings/t1/claim",
            json={"user_id": "u1", "claimed_quantity": 0},
        )
        assert res.status_code == 422
        assert res.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_negative_quantity_rejected_by_validation(self):
        listings["t1"] = make_listing("t1", quantity=5)
        res = client.post(
            "/api/v1/listings/t1/claim",
            json={"user_id": "u1", "claimed_quantity": -3},
        )
        assert res.status_code == 422
        assert res.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_claim_against_expired_status_rejected(self):
        listings["t1"] = make_listing("t1", status=ListingStatus.expired)
        res = client.post(
            "/api/v1/listings/t1/claim",
            json={"user_id": "u1", "claimed_quantity": 1},
        )
        assert res.status_code == 409
        assert res.json()["error"]["code"] == "UNCLAIMABLE_STATUS"

    def test_claim_against_claimed_status_rejected(self):
        listings["t1"] = make_listing("t1", status=ListingStatus.claimed)
        res = client.post(
            "/api/v1/listings/t1/claim",
            json={"user_id": "u1", "claimed_quantity": 1},
        )
        assert res.status_code == 409
        assert res.json()["error"]["code"] == "UNCLAIMABLE_STATUS"

    def test_different_users_can_partial_claim_same_listing(self):
        listings["t1"] = make_listing("t1", quantity=10)
        r1 = client.post(
            "/api/v1/listings/t1/claim",
            json={"user_id": "u1", "claimed_quantity": 3},
        )
        r2 = client.post(
            "/api/v1/listings/t1/claim",
            json={"user_id": "u2", "claimed_quantity": 3},
        )
        assert r1.status_code == 200
        assert r2.status_code == 200
        assert r2.json()["data"]["quantity"] == 4  # 10 - 3 - 3


# ---------------------------------------------------------------------------
# Admin routes
# ---------------------------------------------------------------------------


class TestAdminRoutes:
    def test_admin_listings_returns_all_statuses(self):
        listings["a"] = make_listing("a", status=ListingStatus.active)
        listings["b"] = make_listing("b", status=ListingStatus.claimed)
        listings["c"] = make_listing("c", status=ListingStatus.expired)
        res = client.get("/api/v1/admin/listings")
        assert res.status_code == 200
        body = res.json()
        assert body["ok"] is True
        assert len(body["data"]) == 3

    def test_admin_listings_envelope(self):
        listings["a"] = make_listing("a")
        res = client.get("/api/v1/admin/listings")
        body = res.json()
        assert body["ok"] is True
        assert isinstance(body["data"], list)

    def test_admin_listings_empty_when_none(self):
        res = client.get("/api/v1/admin/listings")
        assert res.status_code == 200
        assert res.json()["data"] == []

    # ── Status transitions ────────────────────────────────────────────────────

    def test_active_to_claimed_allowed(self):
        listings["t1"] = make_listing("t1", status=ListingStatus.active)
        res = client.patch("/api/v1/listings/t1/status", json={"status": "claimed"})
        assert res.status_code == 200
        assert res.json()["data"]["status"] == "claimed"

    def test_active_to_expired_allowed(self):
        listings["t1"] = make_listing("t1", status=ListingStatus.active)
        res = client.patch("/api/v1/listings/t1/status", json={"status": "expired"})
        assert res.status_code == 200
        assert res.json()["data"]["status"] == "expired"

    def test_active_to_active_rejected(self):
        listings["t1"] = make_listing("t1", status=ListingStatus.active)
        res = client.patch("/api/v1/listings/t1/status", json={"status": "active"})
        assert res.status_code == 409
        err = res.json()["error"]
        assert err["code"] == "INVALID_STATUS_TRANSITION"
        assert "allowed_transitions" in err["details"]
        assert err["details"]["current_status"] == "active"
        assert err["details"]["requested_status"] == "active"

    def test_claimed_is_terminal(self):
        listings["t1"] = make_listing("t1", status=ListingStatus.claimed)
        for target in ("active", "expired"):
            res = client.patch("/api/v1/listings/t1/status", json={"status": target})
            assert res.status_code == 409
            assert res.json()["error"]["code"] == "INVALID_STATUS_TRANSITION"

    def test_expired_is_terminal(self):
        listings["t1"] = make_listing("t1", status=ListingStatus.expired)
        for target in ("active", "claimed"):
            res = client.patch("/api/v1/listings/t1/status", json={"status": target})
            assert res.status_code == 409
            assert res.json()["error"]["code"] == "INVALID_STATUS_TRANSITION"

    def test_transition_details_include_allowed_list(self):
        listings["t1"] = make_listing("t1", status=ListingStatus.claimed)
        res = client.patch("/api/v1/listings/t1/status", json={"status": "active"})
        details = res.json()["error"]["details"]
        assert isinstance(details["allowed_transitions"], list)
        assert details["allowed_transitions"] == []  # terminal state

    def test_transition_404(self):
        res = client.patch("/api/v1/listings/ghost/status", json={"status": "claimed"})
        assert res.status_code == 404
        assert res.json()["error"]["code"] == "NOT_FOUND"

    # ── Delete ────────────────────────────────────────────────────────────────

    def test_delete_listing_success(self):
        listings["t1"] = make_listing("t1")
        res = client.delete("/api/v1/listings/t1")
        assert res.status_code == 200
        assert res.json()["ok"] is True
        assert "t1" not in listings

    def test_delete_listing_returned_in_envelope(self):
        listings["t1"] = make_listing("t1", title="Deleted Listing")
        res = client.delete("/api/v1/listings/t1")
        assert res.json()["data"]["id"] == "t1"
        assert res.json()["data"]["title"] == "Deleted Listing"

    def test_delete_listing_404(self):
        res = client.delete("/api/v1/listings/ghost")
        assert res.status_code == 404
        assert res.json()["error"]["code"] == "NOT_FOUND"

    def test_delete_removes_from_admin_listings(self):
        listings["t1"] = make_listing("t1")
        client.delete("/api/v1/listings/t1")
        res = client.get("/api/v1/admin/listings")
        ids = [l["id"] for l in res.json()["data"]]
        assert "t1" not in ids

    # ── Admin stats correctness ───────────────────────────────────────────────

    def test_stats_empty_state(self):
        res = client.get("/api/v1/admin/stats")
        assert res.status_code == 200
        data = res.json()["data"]
        assert data["active_listings"] == 0
        assert data["claimed_listings"] == 0
        assert data["expired_listings"] == 0
        assert data["total_claims"] == 0
        assert data["meals_saved"] == 0

    def test_stats_after_create(self):
        create_listing_via_api()
        create_listing_via_api()
        data = client.get("/api/v1/admin/stats").json()["data"]
        assert data["active_listings"] == 2
        assert data["claimed_listings"] == 0
        assert data["total_claims"] == 0

    def test_stats_after_full_claim(self):
        listings["t1"] = make_listing("t1", quantity=5, status=ListingStatus.active)
        claim_via_api("t1", "u1", 5)  # full claim
        data = client.get("/api/v1/admin/stats").json()["data"]
        assert data["active_listings"] == 0
        assert data["claimed_listings"] == 1
        assert data["total_claims"] == 1
        # meals_saved counts quantity of claimed listings
        assert data["meals_saved"] == 0  # quantity is 0 after full claim

    def test_stats_after_partial_claim(self):
        listings["t1"] = make_listing("t1", quantity=10, status=ListingStatus.active)
        claim_via_api("t1", "u1", 4)  # partial — listing stays active
        data = client.get("/api/v1/admin/stats").json()["data"]
        assert data["active_listings"] == 1
        assert data["claimed_listings"] == 0
        assert data["total_claims"] == 1

    def test_stats_after_status_update(self):
        listings["t1"] = make_listing("t1", status=ListingStatus.active)
        client.patch("/api/v1/listings/t1/status", json={"status": "expired"})
        data = client.get("/api/v1/admin/stats").json()["data"]
        assert data["active_listings"] == 0
        assert data["expired_listings"] == 1

    def test_stats_after_delete(self):
        listings["t1"] = make_listing("t1", status=ListingStatus.active)
        listings["t2"] = make_listing("t2", status=ListingStatus.active)
        client.delete("/api/v1/listings/t1")
        data = client.get("/api/v1/admin/stats").json()["data"]
        assert data["active_listings"] == 1

    def test_stats_mixed_state(self):
        listings["a"] = make_listing("a", status=ListingStatus.active, quantity=5)
        listings["b"] = make_listing("b", status=ListingStatus.claimed, quantity=3)
        listings["c"] = make_listing("c", status=ListingStatus.expired, quantity=8)
        data = client.get("/api/v1/admin/stats").json()["data"]
        assert data["active_listings"] == 1
        assert data["claimed_listings"] == 1
        assert data["expired_listings"] == 1
        assert data["total_claims"] == 0

    def test_stats_shape(self):
        res = client.get("/api/v1/admin/stats")
        assert res.status_code == 200
        data = res.json()["data"]
        for key in ("active_listings", "claimed_listings", "expired_listings",
                    "total_claims", "meals_saved"):
            assert key in data, f"Missing key: {key}"


# ---------------------------------------------------------------------------
# Concurrency: atomic claim
# ---------------------------------------------------------------------------


class TestAtomicClaim:
    def test_concurrent_claims_for_last_item(self):
        """
        Two threads race to claim the last available item.
        Exactly one should succeed; the other gets OVER_QUANTITY.
        """
        listings["t1"] = make_listing("t1", quantity=1)
        results = []

        def do_claim(user_id: str):
            res = client.post(
                "/api/v1/listings/t1/claim",
                json={"user_id": user_id, "claimed_quantity": 1},
            )
            results.append(res.status_code)

        threads = [threading.Thread(target=do_claim, args=(f"user-{i}",)) for i in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        success_count = results.count(200)
        assert success_count == 1, f"Expected 1 success, got {success_count}; results={results}"
        assert len(results) - success_count == 1

    def test_concurrent_partial_claims_are_atomic(self):
        """
        Ten threads each claim 1 item from a listing with 5 available.
        Exactly 5 should succeed; final quantity must be 0.
        """
        listings["t1"] = make_listing("t1", quantity=5)
        results = []
        lock = threading.Lock()

        def do_claim(user_id: str):
            res = client.post(
                "/api/v1/listings/t1/claim",
                json={"user_id": user_id, "claimed_quantity": 1},
            )
            with lock:
                results.append(res.status_code)

        threads = [threading.Thread(target=do_claim, args=(f"user-{i}",)) for i in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        success_count = results.count(200)
        assert success_count == 5, (
            f"Expected exactly 5 successes, got {success_count}; results={results}"
        )
        assert listings["t1"].quantity == 0
        assert listings["t1"].status == ListingStatus.claimed
