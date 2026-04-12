"""
Tests for listing creation, status transitions, and persistence behavior.
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient

from main import app, listings, claims, Listing, ListingStatus

pytestmark = pytest.mark.usefixtures("mock_admin_auth")

client = TestClient(app)


def _listing_payload(**overrides):
    now = datetime.now(timezone.utc)
    base = {
        "title": "Test Listing",
        "description": "A test listing for pytest",
        "quantity": 10,
        "dietary_tags": [],
        "pickup_start": (now + timedelta(hours=1)).isoformat(),
        "pickup_end": (now + timedelta(hours=3)).isoformat(),
    }
    base.update(overrides)
    return base


class TestCreateListing:
    def test_restaurant_id_comes_from_token(self):
        res = client.post("/api/v1/listings", json=_listing_payload())
        assert res.status_code == 201
        data = res.json()["data"]
        # The mock auth returns admin-001; admin users get their own id as restaurant_id
        # unless restaurant_id_override is provided
        assert data["restaurant_id"] == "admin-001"

    def test_admin_override_restaurant_id(self):
        payload = _listing_payload()
        payload["restaurant_id_override"] = "rest-999"
        res = client.post("/api/v1/listings", json=payload)
        assert res.status_code == 201
        assert res.json()["data"]["restaurant_id"] == "rest-999"

    def test_create_returns_201_with_envelope(self):
        res = client.post("/api/v1/listings", json=_listing_payload())
        assert res.status_code == 201
        body = res.json()
        assert body["ok"] is True
        assert "data" in body

    def test_listing_appears_in_admin_feed(self):
        client.post("/api/v1/listings", json=_listing_payload(title="Unique Feed Test"))
        res = client.get("/api/v1/admin/listings")
        assert res.status_code == 200
        titles = [l["title"] for l in res.json()["data"]]
        assert "Unique Feed Test" in titles

    def test_non_restaurant_cannot_create_listing(self):
        """Creating a listing without restaurant/admin role should be rejected."""
        from main import get_current_user, UserInDB
        from fastapi.testclient import TestClient

        def _recipient():
            return UserInDB(
                id="recip-001",
                name="Test Recipient",
                email="recip@test.com",
                role="recipient",
                hashed_password="",
            )

        app.dependency_overrides[get_current_user] = _recipient
        try:
            res = client.post("/api/v1/listings", json=_listing_payload())
            assert res.status_code == 403
        finally:
            app.dependency_overrides.pop(get_current_user, None)


class TestStatusTransitions:
    def _make_active(self, lid="st-1"):
        now = datetime.now(timezone.utc)
        l = Listing(
            id=lid,
            restaurant_id="rest-001",
            title="Status Test",
            description="For status tests",
            quantity=5,
            dietary_tags=[],
            pickup_start=now + timedelta(hours=1),
            pickup_end=now + timedelta(hours=3),
            status=ListingStatus.active,
            created_at=now,
        )
        listings[lid] = l
        return l

    def test_active_to_claimed_succeeds(self):
        self._make_active("st-2")
        res = client.patch("/api/v1/listings/st-2/status", json={"status": "claimed"})
        assert res.status_code == 200
        assert listings["st-2"].status == ListingStatus.claimed

    def test_claimed_to_active_is_rejected(self):
        self._make_active("st-3")
        listings["st-3"] = listings["st-3"].model_copy(update={"status": ListingStatus.claimed})
        res = client.patch("/api/v1/listings/st-3/status", json={"status": "active"})
        assert res.status_code == 409
        assert res.json()["error"]["code"] == "INVALID_STATUS_TRANSITION"

    def test_active_to_expired_succeeds(self):
        self._make_active("st-4")
        res = client.patch("/api/v1/listings/st-4/status", json={"status": "expired"})
        assert res.status_code == 200


class TestSeedListings:
    def test_seed_listings_are_idempotent(self):
        from main import _seed_listings
        _seed_listings()
        count_after_first = len(listings)
        _seed_listings()
        assert len(listings) == count_after_first  # second call adds no duplicates
