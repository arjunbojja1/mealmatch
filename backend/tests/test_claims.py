"""
Tests for the claim endpoints.

Auth strategy: all requests use mock_admin_auth (admin-001 as the current user),
which simulates a logged-in recipient/partner for claim operations.
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient

import main as app_module
from main import app, listings, claims, Listing, ListingStatus

pytestmark = pytest.mark.usefixtures("mock_admin_auth")

client = TestClient(app)


def _make_listing(lid="cl-test", quantity=10):
    now = datetime.now(timezone.utc)
    l = Listing(
        id=lid,
        restaurant_id="rest-001",
        title="Claim Test Listing",
        description="For testing claims",
        quantity=quantity,
        dietary_tags=[],
        pickup_start=now + timedelta(hours=1),
        pickup_end=now + timedelta(hours=3),
        status=ListingStatus.active,
        created_at=now,
    )
    listings[lid] = l
    return l


def _claim(listing_id, quantity=1, slot_id=None):
    body = {"claimed_quantity": quantity}
    if slot_id:
        body["slot_id"] = slot_id
    return client.post(f"/api/v1/listings/{listing_id}/claim", json=body)


class TestClaimQuantity:
    def test_claiming_decrements_quantity(self):
        _make_listing("q-1", quantity=10)
        res = _claim("q-1", quantity=3)
        assert res.status_code == 200
        assert listings["q-1"].quantity == 7

    def test_claiming_over_quantity_returns_error(self):
        _make_listing("q-2", quantity=5)
        res = _claim("q-2", quantity=6)
        assert res.status_code == 422
        assert res.json()["error"]["code"] == "OVER_QUANTITY"

    def test_claim_sets_status_to_claimed(self):
        _make_listing("q-3", quantity=10)
        _claim("q-3", quantity=1)
        assert listings["q-3"].status == ListingStatus.claimed


class TestClaimDedup:
    def test_same_user_cannot_claim_same_listing_twice(self):
        _make_listing("dd-1", quantity=10)
        # First claim
        res1 = _claim("dd-1", quantity=1)
        assert res1.status_code == 200
        # Listing is now "claimed"; second attempt hits UNCLAIMABLE_STATUS
        res2 = _claim("dd-1", quantity=1)
        assert res2.status_code == 409


class TestClaimUserFromToken:
    def test_claim_user_id_comes_from_token_not_body(self):
        _make_listing("tok-1", quantity=10)
        # Send a body with no user_id — should succeed with user from token
        res = client.post(
            "/api/v1/listings/tok-1/claim",
            json={"claimed_quantity": 1},
        )
        assert res.status_code == 200
        claim = list(claims.values())[0]
        assert claim.user_id == "admin-001"

    def test_extra_user_id_in_body_is_ignored(self):
        _make_listing("tok-2", quantity=10)
        res = client.post(
            "/api/v1/listings/tok-2/claim",
            json={"user_id": "spoofed-user", "claimed_quantity": 1},
        )
        assert res.status_code == 200
        claim = list(claims.values())[0]
        # user_id must come from the token, not the spoofed body field
        assert claim.user_id == "admin-001"
        assert claim.user_id != "spoofed-user"


class TestCancelClaim:
    def test_cancel_restores_listing_quantity(self):
        _make_listing("cc-1", quantity=10)
        _claim("cc-1", quantity=3)
        claim_id = list(claims.keys())[0]
        res = client.delete(f"/api/v1/claims/{claim_id}")
        assert res.status_code == 200
        assert listings["cc-1"].quantity == 10

    def test_cancel_revives_claimed_listing_to_active(self):
        _make_listing("cc-2", quantity=10)
        _claim("cc-2", quantity=1)
        claim_id = list(claims.keys())[0]
        client.delete(f"/api/v1/claims/{claim_id}")
        assert listings["cc-2"].status == ListingStatus.active

    def test_cannot_cancel_nonexistent_claim(self):
        res = client.delete("/api/v1/claims/does-not-exist")
        assert res.status_code == 404
        assert res.json()["error"]["code"] == "NOT_FOUND"
