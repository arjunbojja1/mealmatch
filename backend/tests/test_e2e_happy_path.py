"""
MealMatch backend — End-to-end happy path tests.
Auth is bypassed via mock_admin_auth (see conftest.py).
"""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import app, listings, claims
from fastapi.testclient import TestClient

client = TestClient(app)

pytestmark = pytest.mark.usefixtures("mock_admin_auth")


def _now():
    return datetime.now(timezone.utc)


class TestE2EHappyPath:
    def test_full_lifecycle_first_claim_locks(self):
        now = _now()

        # 1. Create
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
        listing_id = create_res.json()["data"]["id"]
        assert create_res.json()["data"]["status"] == "active"
        assert create_res.json()["data"]["dietary_tags"] == ["vegan"]

        # 2. Public feed shows it
        feed = client.get("/api/v1/listings").json()["data"]
        assert any(l["id"] == listing_id for l in feed)
        assert next(l for l in feed if l["id"] == listing_id)["quantity"] == 5

        # 3. User A claims (3 of 5) — first claim locks listing
        r_a = client.post(
            f"/api/v1/listings/{listing_id}/claim",
            json={"user_id": "user-a", "claimed_quantity": 3},
        )
        assert r_a.status_code == 200
        assert r_a.json()["data"]["quantity"] == 2
        assert r_a.json()["data"]["status"] == "claimed"

        # 4. Public feed excludes it (listing is now claimed)
        feed2_ids = [l["id"] for l in client.get("/api/v1/listings").json()["data"]]
        assert listing_id not in feed2_ids

        # 5. User B is blocked — listing already claimed
        r_b = client.post(
            f"/api/v1/listings/{listing_id}/claim",
            json={"user_id": "user-b", "claimed_quantity": 2},
        )
        assert r_b.status_code == 409
        assert r_b.json()["error"]["code"] == "UNCLAIMABLE_STATUS"

        # 6. Admin listings shows it as claimed
        admin = {l["id"]: l for l in client.get("/api/v1/admin/listings").json()["data"]}
        assert admin[listing_id]["status"] == "claimed"
        assert admin[listing_id]["quantity"] == 2  # remaining (not decremented by rejected claim)

        # 7. Stats
        stats = client.get("/api/v1/admin/stats").json()["data"]
        assert stats["active_listings"] == 0
        assert stats["claimed_listings"] == 1
        assert stats["total_claims"] == 1

        # 8. Claims endpoint — only user-a's claim
        claim_records = client.get("/api/v1/claims").json()["data"]
        assert len(claim_records) == 1
        assert claim_records[0]["user_id"] == "user-a"

    def test_create_then_admin_expire_then_verify(self):
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

        assert any(l["id"] == listing_id for l in client.get("/api/v1/listings").json()["data"])

        expire_res = client.patch(f"/api/v1/listings/{listing_id}/status", json={"status": "expired"})
        assert expire_res.status_code == 200
        assert expire_res.json()["data"]["status"] == "expired"

        assert not any(l["id"] == listing_id for l in client.get("/api/v1/listings").json()["data"])

        admin = {l["id"]: l for l in client.get("/api/v1/admin/listings").json()["data"]}
        assert admin[listing_id]["status"] == "expired"

        stats = client.get("/api/v1/admin/stats").json()["data"]
        assert stats["active_listings"] == 0
        assert stats["expired_listings"] == 1

    def test_create_then_delete_then_verify(self):
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

        del_res = client.delete(f"/api/v1/listings/{listing_id}")
        assert del_res.status_code == 200

        assert not any(l["id"] == listing_id for l in client.get("/api/v1/listings").json()["data"])
        assert not any(l["id"] == listing_id for l in client.get("/api/v1/admin/listings").json()["data"])

        assert client.get("/api/v1/admin/stats").json()["data"]["active_listings"] == 0

        del2 = client.delete(f"/api/v1/listings/{listing_id}")
        assert del2.status_code == 404
        assert del2.json()["error"]["code"] == "NOT_FOUND"
