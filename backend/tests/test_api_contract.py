"""
MealMatch backend — API contract tests (Phase 2 hardening).

Covers:
  - Unified success/error envelope format
  - Claim guardrails: duplicate, over-quantity, partial vs full
  - Status transition validation (INVALID_STATUS_TRANSITION)
  - Admin routes after deduplication
  - Concurrency: atomic claim under simultaneous requests
"""

import threading
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

# Import the app fresh; each test module gets a clean in-memory state via the
# fixture that resets listings/claims before each test.
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import main as app_module
from main import app, listings, claims, ListingStatus, Listing

client = TestClient(app)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

FUTURE = datetime.now(timezone.utc) + timedelta(hours=2)
FAR_FUTURE = datetime.now(timezone.utc) + timedelta(hours=3)


def make_listing(
    listing_id: str = "test-1",
    quantity: int = 10,
    status: ListingStatus = ListingStatus.active,
    pickup_end_offset_hours: float = 2,
) -> Listing:
    now = datetime.now(timezone.utc)
    return Listing(
        id=listing_id,
        restaurant_id="rest-test",
        title="Test Listing",
        description="A test listing",
        quantity=quantity,
        dietary_tags=[],
        pickup_start=now,
        pickup_end=now + timedelta(hours=pickup_end_offset_hours),
        status=status,
        created_at=now,
    )


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
        """FastAPI 422 (missing field) should also use the unified envelope."""
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
        base = {
            "restaurant_id": "rest-1",
            "title": "Test Food",
            "description": "Some food",
            "quantity": 5,
            "dietary_tags": [],
            "pickup_start": FUTURE.isoformat(),
            "pickup_end": FAR_FUTURE.isoformat(),
        }
        base.update(overrides)
        return base

    def test_create_returns_201(self):
        res = client.post("/api/v1/listings", json=self._payload())
        assert res.status_code == 201
        body = res.json()
        assert body["ok"] is True
        assert body["data"]["title"] == "Test Food"
        assert body["data"]["status"] == "active"

    def test_invalid_window_returns_422(self):
        res = client.post(
            "/api/v1/listings",
            json=self._payload(
                pickup_start=FAR_FUTURE.isoformat(),
                pickup_end=FUTURE.isoformat(),
            ),
        )
        assert res.status_code == 422
        body = res.json()
        assert body["ok"] is False
        assert body["error"]["code"] == "INVALID_PICKUP_WINDOW"


# ---------------------------------------------------------------------------
# Claim guardrails
# ---------------------------------------------------------------------------


class TestClaimGuardrails:
    def test_claim_not_found(self):
        res = client.post(
            "/api/v1/listings/no-such-id/claim",
            json={"user_id": "u1", "claimed_quantity": 1},
        )
        assert res.status_code == 404
        assert res.json()["error"]["code"] == "NOT_FOUND"

    def test_claim_success(self):
        listings["t1"] = make_listing("t1", quantity=5)
        res = client.post(
            "/api/v1/listings/t1/claim",
            json={"user_id": "u1", "claimed_quantity": 2},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["ok"] is True
        assert body["data"]["quantity"] == 3  # 5 - 2
        assert body["data"]["status"] == "active"  # partial claim

    def test_partial_claim_keeps_active(self):
        listings["t1"] = make_listing("t1", quantity=10)
        res = client.post(
            "/api/v1/listings/t1/claim",
            json={"user_id": "u1", "claimed_quantity": 5},
        )
        assert res.json()["data"]["status"] == "active"
        assert res.json()["data"]["quantity"] == 5

    def test_full_claim_sets_claimed(self):
        listings["t1"] = make_listing("t1", quantity=3)
        res = client.post(
            "/api/v1/listings/t1/claim",
            json={"user_id": "u1", "claimed_quantity": 3},
        )
        data = res.json()["data"]
        assert data["status"] == "claimed"
        assert data["quantity"] == 0

    def test_duplicate_claim_rejected(self):
        listings["t1"] = make_listing("t1", quantity=10)
        client.post(
            "/api/v1/listings/t1/claim",
            json={"user_id": "u1", "claimed_quantity": 1},
        )
        res = client.post(
            "/api/v1/listings/t1/claim",
            json={"user_id": "u1", "claimed_quantity": 1},
        )
        assert res.status_code == 409
        assert res.json()["error"]["code"] == "ALREADY_CLAIMED"

    def test_over_quantity_rejected(self):
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

    def test_claim_inactive_listing_rejected(self):
        listings["t1"] = make_listing("t1", status=ListingStatus.expired)
        res = client.post(
            "/api/v1/listings/t1/claim",
            json={"user_id": "u1", "claimed_quantity": 1},
        )
        assert res.status_code == 409
        assert res.json()["error"]["code"] == "UNCLAIMABLE_STATUS"

    def test_different_users_can_claim_same_listing(self):
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
# Status transition validation
# ---------------------------------------------------------------------------


class TestStatusTransitions:
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
        """Same-status transition is not in the allowed set."""
        listings["t1"] = make_listing("t1", status=ListingStatus.active)
        res = client.patch("/api/v1/listings/t1/status", json={"status": "active"})
        assert res.status_code == 409
        err = res.json()["error"]
        assert err["code"] == "INVALID_STATUS_TRANSITION"
        assert "allowed_transitions" in err["details"]

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

    def test_transition_404(self):
        res = client.patch("/api/v1/listings/ghost/status", json={"status": "claimed"})
        assert res.status_code == 404
        assert res.json()["error"]["code"] == "NOT_FOUND"


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

    def test_admin_stats_shape(self):
        listings["a"] = make_listing("a", status=ListingStatus.active, quantity=5)
        listings["b"] = make_listing("b", status=ListingStatus.claimed, quantity=3)
        res = client.get("/api/v1/admin/stats")
        assert res.status_code == 200
        data = res.json()["data"]
        assert data["active_listings"] == 1
        assert data["claimed_listings"] == 1
        assert data["expired_listings"] == 0
        assert data["total_claims"] == 0
        assert "meals_saved" in data

    def test_delete_listing(self):
        listings["t1"] = make_listing("t1")
        res = client.delete("/api/v1/listings/t1")
        assert res.status_code == 200
        assert res.json()["ok"] is True
        assert "t1" not in listings

    def test_delete_listing_404(self):
        res = client.delete("/api/v1/listings/ghost")
        assert res.status_code == 404
        assert res.json()["error"]["code"] == "NOT_FOUND"


# ---------------------------------------------------------------------------
# Concurrency: atomic claim
# ---------------------------------------------------------------------------


class TestAtomicClaim:
    def test_concurrent_claims_for_last_item(self):
        """
        Two threads race to claim the last available item.
        Exactly one should succeed; the other gets OVER_QUANTITY or ALREADY_CLAIMED.
        """
        listings["t1"] = make_listing("t1", quantity=1)
        results = []

        def do_claim(user_id: str):
            res = client.post(
                "/api/v1/listings/t1/claim",
                json={"user_id": user_id, "claimed_quantity": 1},
            )
            results.append(res.status_code)

        threads = [
            threading.Thread(target=do_claim, args=(f"user-{i}",))
            for i in range(2)
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        success_count = results.count(200)
        failure_count = len(results) - success_count
        assert success_count == 1, f"Expected 1 success, got {success_count}; results={results}"
        assert failure_count == 1

    def test_concurrent_partial_claims_are_atomic(self):
        """
        Ten threads each claim 1 item from a listing with 5 available.
        Exactly 5 should succeed.
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

        threads = [
            threading.Thread(target=do_claim, args=(f"user-{i}",))
            for i in range(10)
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        success_count = results.count(200)
        # Exactly 5 users should have claimed; the rest hit OVER_QUANTITY
        assert success_count == 5, (
            f"Expected exactly 5 successes, got {success_count}; results={results}"
        )
        # Final listing quantity must be 0
        assert listings["t1"].quantity == 0
        assert listings["t1"].status == ListingStatus.claimed
