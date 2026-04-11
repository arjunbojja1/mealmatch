"""
MealMatch backend — End-to-end happy path tests.

Each test runs a realistic multi-step flow through the HTTP layer,
asserting envelopes and business state at every transition.
"""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import app, listings, claims

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_state():
    listings.clear()
    claims.clear()
    yield
    listings.clear()
    claims.clear()


def _now():
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Happy path: create → fetch → partial claim → full claim → admin verify
# ---------------------------------------------------------------------------


class TestE2EHappyPath:
    def test_full_lifecycle_partial_then_full_claim(self):
        """
        Realistic flow:
          1. Restaurant creates a listing (5 items).
          2. Public feed shows the listing.
          3. User A claims 3 → listing still active, quantity 2.
          4. User B claims 2 → listing flips to claimed, quantity 0.
          5. Public feed no longer shows the listing.
          6. Admin listings shows the listing as claimed.
          7. Admin stats reflect 2 claims, 0 active, 1 claimed.
          8. Claims endpoint records both claim records.
        """
        now = _now()

        # ── Step 1: create ────────────────────────────────────────────────────
        create_res = client.post(
            "/api/v1/listings",
            json={
                "restaurant_id": "rest-e2e",
                "title": "E2E Pasta",
                "description": "End-to-end test food",
                "quantity": 5,
                "dietary_tags": ["vegan"],
                "pickup_start": (now + timedelta(hours=1)).isoformat(),
                "pickup_end": (now + timedelta(hours=3)).isoformat(),
            },
        )
        assert create_res.status_code == 201
        create_body = create_res.json()
        assert create_body["ok"] is True
        listing_id = create_body["data"]["id"]
        assert create_body["data"]["status"] == "active"
        assert create_body["data"]["quantity"] == 5
        assert create_body["data"]["dietary_tags"] == ["vegan"]

        # ── Step 2: public feed shows the listing ─────────────────────────────
        feed_res = client.get("/api/v1/listings")
        assert feed_res.status_code == 200
        feed_body = feed_res.json()
        assert feed_body["ok"] is True
        feed_ids = [l["id"] for l in feed_body["data"]]
        assert listing_id in feed_ids

        feed_listing = next(l for l in feed_body["data"] if l["id"] == listing_id)
        assert feed_listing["quantity"] == 5
        assert feed_listing["status"] == "active"
        assert "is_urgent" in feed_listing

        # ── Step 3: user A partial claim (3 of 5) ────────────────────────────
        claim_a_res = client.post(
            f"/api/v1/listings/{listing_id}/claim",
            json={"user_id": "user-a", "claimed_quantity": 3},
        )
        assert claim_a_res.status_code == 200
        claim_a_body = claim_a_res.json()
        assert claim_a_body["ok"] is True
        assert claim_a_body["data"]["quantity"] == 2
        assert claim_a_body["data"]["status"] == "active"  # still active

        # Public feed still shows listing with reduced quantity
        feed2_res = client.get("/api/v1/listings")
        feed2_listing = next(
            (l for l in feed2_res.json()["data"] if l["id"] == listing_id), None
        )
        assert feed2_listing is not None
        assert feed2_listing["quantity"] == 2

        # ── Step 4: user B full claim (remaining 2) ───────────────────────────
        claim_b_res = client.post(
            f"/api/v1/listings/{listing_id}/claim",
            json={"user_id": "user-b", "claimed_quantity": 2},
        )
        assert claim_b_res.status_code == 200
        claim_b_body = claim_b_res.json()
        assert claim_b_body["ok"] is True
        assert claim_b_body["data"]["quantity"] == 0
        assert claim_b_body["data"]["status"] == "claimed"  # fully claimed

        # ── Step 5: public feed no longer shows it ────────────────────────────
        feed3_res = client.get("/api/v1/listings")
        feed3_ids = [l["id"] for l in feed3_res.json()["data"]]
        assert listing_id not in feed3_ids

        # ── Step 6: admin listings shows it as claimed ────────────────────────
        admin_res = client.get("/api/v1/admin/listings")
        assert admin_res.status_code == 200
        admin_by_id = {l["id"]: l for l in admin_res.json()["data"]}
        assert listing_id in admin_by_id
        assert admin_by_id[listing_id]["status"] == "claimed"
        assert admin_by_id[listing_id]["quantity"] == 0

        # ── Step 7: admin stats ───────────────────────────────────────────────
        stats_res = client.get("/api/v1/admin/stats")
        assert stats_res.status_code == 200
        stats = stats_res.json()["data"]
        assert stats["active_listings"] == 0
        assert stats["claimed_listings"] == 1
        assert stats["expired_listings"] == 0
        assert stats["total_claims"] == 2

        # ── Step 8: claims endpoint records both claims ───────────────────────
        claims_res = client.get("/api/v1/claims")
        assert claims_res.status_code == 200
        claim_records = claims_res.json()["data"]
        assert len(claim_records) == 2
        user_ids = {c["user_id"] for c in claim_records}
        assert user_ids == {"user-a", "user-b"}

    def test_create_then_admin_expire_then_verify(self):
        """
        Restaurant creates a listing, admin manually expires it,
        public feed excludes it, admin listing shows expired.
        """
        now = _now()

        create_res = client.post(
            "/api/v1/listings",
            json={
                "restaurant_id": "rest-e2e",
                "title": "E2E Sandwich",
                "description": "For admin expiry test",
                "quantity": 10,
                "dietary_tags": [],
                "pickup_start": (now + timedelta(hours=1)).isoformat(),
                "pickup_end": (now + timedelta(hours=2)).isoformat(),
            },
        )
        assert create_res.status_code == 201
        listing_id = create_res.json()["data"]["id"]

        # Listing is live
        feed = client.get("/api/v1/listings").json()["data"]
        assert any(l["id"] == listing_id for l in feed)

        # Admin manually expires
        expire_res = client.patch(
            f"/api/v1/listings/{listing_id}/status",
            json={"status": "expired"},
        )
        assert expire_res.status_code == 200
        assert expire_res.json()["data"]["status"] == "expired"

        # No longer in public feed
        feed2 = client.get("/api/v1/listings").json()["data"]
        assert not any(l["id"] == listing_id for l in feed2)

        # Still in admin listings
        admin = client.get("/api/v1/admin/listings").json()["data"]
        by_id = {l["id"]: l for l in admin}
        assert listing_id in by_id
        assert by_id[listing_id]["status"] == "expired"

        # Stats reflect expiry
        stats = client.get("/api/v1/admin/stats").json()["data"]
        assert stats["active_listings"] == 0
        assert stats["expired_listings"] == 1

    def test_create_then_delete_then_verify(self):
        """
        Restaurant creates a listing, admin deletes it,
        neither feed nor admin listing shows it afterward.
        """
        now = _now()

        create_res = client.post(
            "/api/v1/listings",
            json={
                "restaurant_id": "rest-e2e",
                "title": "E2E Delete Me",
                "description": "For delete test",
                "quantity": 3,
                "dietary_tags": [],
                "pickup_start": (now + timedelta(hours=1)).isoformat(),
                "pickup_end": (now + timedelta(hours=2)).isoformat(),
            },
        )
        assert create_res.status_code == 201
        listing_id = create_res.json()["data"]["id"]

        # Confirm it exists
        admin_before = {l["id"] for l in client.get("/api/v1/admin/listings").json()["data"]}
        assert listing_id in admin_before

        # Delete
        del_res = client.delete(f"/api/v1/listings/{listing_id}")
        assert del_res.status_code == 200
        assert del_res.json()["ok"] is True

        # Gone from public feed
        feed = client.get("/api/v1/listings").json()["data"]
        assert not any(l["id"] == listing_id for l in feed)

        # Gone from admin listings
        admin_after = {l["id"] for l in client.get("/api/v1/admin/listings").json()["data"]}
        assert listing_id not in admin_after

        # Stats show zero
        stats = client.get("/api/v1/admin/stats").json()["data"]
        assert stats["active_listings"] == 0

        # Second delete returns 404
        del2_res = client.delete(f"/api/v1/listings/{listing_id}")
        assert del2_res.status_code == 404
        assert del2_res.json()["error"]["code"] == "NOT_FOUND"
