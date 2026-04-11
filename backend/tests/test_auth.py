"""
MealMatch backend — Auth endpoint + role-gating tests.

Does NOT use mock_admin_auth — exercises real JWT flow.
"""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import app, listings, Listing, ListingStatus
from fastapi.testclient import TestClient

client = TestClient(app)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _signup(
    email="new@test.com",
    password="NewPass123",
    role="recipient",
    name="New User",
    ebt_card_number=None,
    ebt_pin=None,
):
    return client.post(
        "/api/v1/auth/signup",
        json={
            "name": name,
            "email": email,
            "password": password,
            "role": role,
            "ebt_card_number": ebt_card_number,
            "ebt_pin": ebt_pin,
        },
    )


def _login(email, password, ebt_card_number=None, ebt_pin=None):
    return client.post(
        "/api/v1/auth/login",
        json={
            "email": email,
            "password": password,
            "ebt_card_number": ebt_card_number,
            "ebt_pin": ebt_pin,
        },
    )


def _headers(email, password):
    res = _login(email, password)
    assert res.status_code == 200, f"Login failed: {res.json()}"
    return {"Authorization": f"Bearer {res.json()['data']['access_token']}"}


def _admin_headers():
    return _headers("admin@mealmatch.dev", "Admin1234!")


def _restaurant_headers():
    return _headers("restaurant@mealmatch.dev", "Restaurant1!")


def _recipient_headers():
    res = _login(
        "recipient@mealmatch.dev",
        "Recipient1!",
        ebt_card_number="6001000000001201",
        ebt_pin="2468",
    )
    assert res.status_code == 200, f"Login failed: {res.json()}"
    return {"Authorization": f"Bearer {res.json()['data']['access_token']}"}


def _future_listing_payload():
    now = datetime.now(timezone.utc)
    return {
        "restaurant_id": "rest-001",
        "title": "Auth Test Meal",
        "description": "Testing auth on create",
        "quantity": 5,
        "dietary_tags": [],
        "pickup_start": (now + timedelta(hours=1)).isoformat(),
        "pickup_end": (now + timedelta(hours=3)).isoformat(),
    }


# ---------------------------------------------------------------------------
# Signup
# ---------------------------------------------------------------------------


class TestSignup:
    def test_signup_recipient_success(self):
        res = _signup(
            email="alex.recipient@mealmatch.dev",
            role="recipient",
            ebt_card_number="6001000000002202",
            ebt_pin="1357",
        )
        assert res.status_code == 201
        body = res.json()
        assert body["ok"] is True
        assert "access_token" in body["data"]
        assert body["data"]["token_type"] == "bearer"
        user = body["data"]["user"]
        assert user["role"] == "recipient"
        assert user["email"] == "alex.recipient@mealmatch.dev"
        assert "hashed_password" not in user
        assert user["ebt_verified"] is True

    def test_signup_restaurant_success(self):
        res = _signup(email="r@test.com", role="restaurant")
        assert res.status_code == 201
        assert res.json()["data"]["user"]["role"] == "restaurant"

    def test_signup_duplicate_email_rejected(self):
        _signup(
            email="alex.recipient@mealmatch.dev",
            ebt_card_number="6001000000002202",
            ebt_pin="1357",
        )
        res = _signup(
            email="alex.recipient@mealmatch.dev",
            name="Different Name",
            ebt_card_number="6001000000002202",
            ebt_pin="1357",
        )
        assert res.status_code == 409
        assert res.json()["error"]["code"] == "EMAIL_TAKEN"

    def test_signup_email_case_insensitive(self):
        _signup(email="r@test.com", role="restaurant")
        res = _signup(email="R@test.com", role="restaurant")
        assert res.status_code == 409
        assert res.json()["error"]["code"] == "EMAIL_TAKEN"

    def test_signup_short_password_rejected(self):
        res = _signup(password="short")
        assert res.status_code == 422
        assert res.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_signup_empty_name_rejected(self):
        res = _signup(name="")
        assert res.status_code == 422
        assert res.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_signup_invalid_role_rejected(self):
        res = client.post(
            "/api/v1/auth/signup",
            json={"name": "X", "email": "x@x.com", "password": "Password1", "role": "superuser"},
        )
        assert res.status_code == 422
        assert res.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_signup_token_is_usable(self):
        res = _signup(
            email="sam.recipient@mealmatch.dev",
            ebt_card_number="6001000000003303",
            ebt_pin="8642",
        )
        token = res.json()["data"]["access_token"]
        me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200
        assert me.json()["data"]["email"] == "sam.recipient@mealmatch.dev"

    def test_signup_recipient_requires_ebt(self):
        res = _signup(email="alex.recipient@mealmatch.dev", role="recipient")
        assert res.status_code == 401
        assert res.json()["error"]["code"] == "EBT_VERIFICATION_REQUIRED"

    def test_signup_recipient_rejects_wrong_ebt_pin(self):
        res = _signup(
            email="alex.recipient@mealmatch.dev",
            role="recipient",
            ebt_card_number="6001000000002202",
            ebt_pin="0000",
        )
        assert res.status_code == 401
        assert res.json()["error"]["code"] == "INVALID_EBT_PIN"


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------


class TestLogin:
    def test_login_admin_success(self):
        res = _login("admin@mealmatch.dev", "Admin1234!")
        assert res.status_code == 200
        body = res.json()
        assert body["ok"] is True
        assert "access_token" in body["data"]
        assert body["data"]["user"]["role"] == "admin"

    def test_login_restaurant_success(self):
        res = _login("restaurant@mealmatch.dev", "Restaurant1!")
        assert res.status_code == 200
        assert res.json()["data"]["user"]["role"] == "restaurant"

    def test_login_recipient_success(self):
        res = _login(
            "recipient@mealmatch.dev",
            "Recipient1!",
            ebt_card_number="6001000000001201",
            ebt_pin="2468",
        )
        assert res.status_code == 200
        assert res.json()["data"]["user"]["role"] == "recipient"
        assert res.json()["data"]["user"]["ebt_verified"] is True

    def test_login_recipient_requires_ebt(self):
        res = _login("recipient@mealmatch.dev", "Recipient1!")
        assert res.status_code == 401
        assert res.json()["error"]["code"] == "EBT_VERIFICATION_REQUIRED"

    def test_login_recipient_wrong_ebt_pin(self):
        res = _login(
            "recipient@mealmatch.dev",
            "Recipient1!",
            ebt_card_number="6001000000001201",
            ebt_pin="9999",
        )
        assert res.status_code == 401
        assert res.json()["error"]["code"] == "INVALID_EBT_PIN"

    def test_login_wrong_password(self):
        res = _login("admin@mealmatch.dev", "WrongPass!")
        assert res.status_code == 401
        assert res.json()["error"]["code"] == "INVALID_CREDENTIALS"

    def test_login_unknown_email(self):
        res = _login("nobody@test.com", "Password1!")
        assert res.status_code == 401
        assert res.json()["error"]["code"] == "INVALID_CREDENTIALS"

    def test_login_wrong_password_does_not_reveal_existence(self):
        """Both unknown email and wrong password return the same code."""
        r1 = _login("nobody@test.com", "x")
        r2 = _login("admin@mealmatch.dev", "x")
        assert r1.json()["error"]["code"] == r2.json()["error"]["code"] == "INVALID_CREDENTIALS"

    def test_login_returns_user_object(self):
        res = _login("admin@mealmatch.dev", "Admin1234!")
        user = res.json()["data"]["user"]
        assert "id" in user
        assert "name" in user
        assert "email" in user
        assert "role" in user
        assert "hashed_password" not in user


# ---------------------------------------------------------------------------
# /me  —  token validation
# ---------------------------------------------------------------------------


class TestMe:
    def test_me_with_valid_token(self):
        token = _login("admin@mealmatch.dev", "Admin1234!").json()["data"]["access_token"]
        res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        assert res.json()["data"]["email"] == "admin@mealmatch.dev"
        assert "hashed_password" not in res.json()["data"]

    def test_me_without_token_returns_401(self):
        res = client.get("/api/v1/auth/me")
        assert res.status_code == 401
        assert res.json()["error"]["code"] == "UNAUTHORIZED"

    def test_me_with_malformed_token_returns_401(self):
        res = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer notavalidtoken"})
        assert res.status_code == 401
        assert res.json()["error"]["code"] == "INVALID_TOKEN"

    def test_me_with_tampered_token_returns_401(self):
        token = _login("admin@mealmatch.dev", "Admin1234!").json()["data"]["access_token"]
        tampered = token[:-4] + "XXXX"
        res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {tampered}"})
        assert res.status_code == 401

    def test_signup_then_me_returns_correct_role(self):
        signup_res = _signup(role="restaurant", email="r2@test.com")
        token = signup_res.json()["data"]["access_token"]
        me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.json()["data"]["role"] == "restaurant"


# ---------------------------------------------------------------------------
# Protected endpoints — unauthenticated access
# ---------------------------------------------------------------------------


class TestUnauthenticated:
    def test_listings_requires_auth(self):
        res = client.get("/api/v1/listings")
        assert res.status_code == 401
        assert res.json()["error"]["code"] == "UNAUTHORIZED"

    def test_create_listing_requires_auth(self):
        res = client.post("/api/v1/listings", json=_future_listing_payload())
        assert res.status_code == 401

    def test_claim_requires_auth(self):
        listings["t1"] = Listing(
            id="t1", restaurant_id="r", title="T", description="D",
            quantity=5, dietary_tags=[], status=ListingStatus.active,
            pickup_start=datetime.now(timezone.utc) + timedelta(hours=1),
            pickup_end=datetime.now(timezone.utc) + timedelta(hours=2),
            created_at=datetime.now(timezone.utc),
        )
        res = client.post("/api/v1/listings/t1/claim", json={"user_id": "u1", "claimed_quantity": 1})
        assert res.status_code == 401

    def test_admin_stats_requires_auth(self):
        res = client.get("/api/v1/admin/stats")
        assert res.status_code == 401

    def test_admin_listings_requires_auth(self):
        res = client.get("/api/v1/admin/listings")
        assert res.status_code == 401

    def test_login_archive_requires_auth(self):
        res = client.get("/api/v1/admin/login-archive")
        assert res.status_code == 401

    def test_health_is_public(self):
        """Health check must stay reachable without auth."""
        res = client.get("/health")
        assert res.status_code == 200


# ---------------------------------------------------------------------------
# Role-based access control
# ---------------------------------------------------------------------------


class TestRoleGating:
    # ── Create listing  (restaurant + admin only) ─────────────────────────────

    def test_restaurant_can_create_listing(self):
        res = client.post("/api/v1/listings", json=_future_listing_payload(),
                          headers=_restaurant_headers())
        assert res.status_code == 201

    def test_admin_can_create_listing(self):
        res = client.post("/api/v1/listings", json=_future_listing_payload(),
                          headers=_admin_headers())
        assert res.status_code == 201

    def test_recipient_cannot_create_listing(self):
        res = client.post("/api/v1/listings", json=_future_listing_payload(),
                          headers=_recipient_headers())
        assert res.status_code == 403
        assert res.json()["error"]["code"] == "FORBIDDEN"

    # ── Claim listing  (recipient + admin only) ───────────────────────────────

    def test_recipient_can_claim_listing(self):
        listing_id = client.post(
            "/api/v1/listings", json=_future_listing_payload(), headers=_admin_headers()
        ).json()["data"]["id"]
        res = client.post(
            f"/api/v1/listings/{listing_id}/claim",
            json={"user_id": "recipient-001", "claimed_quantity": 1},
            headers=_recipient_headers(),
        )
        assert res.status_code == 200

    def test_admin_can_claim_listing(self):
        listing_id = client.post(
            "/api/v1/listings", json=_future_listing_payload(), headers=_admin_headers()
        ).json()["data"]["id"]
        res = client.post(
            f"/api/v1/listings/{listing_id}/claim",
            json={"user_id": "admin-001", "claimed_quantity": 1},
            headers=_admin_headers(),
        )
        assert res.status_code == 200

    def test_restaurant_cannot_claim_listing(self):
        listing_id = client.post(
            "/api/v1/listings", json=_future_listing_payload(), headers=_admin_headers()
        ).json()["data"]["id"]
        res = client.post(
            f"/api/v1/listings/{listing_id}/claim",
            json={"user_id": "rest-001", "claimed_quantity": 1},
            headers=_restaurant_headers(),
        )
        assert res.status_code == 403
        assert res.json()["error"]["code"] == "FORBIDDEN"

    # ── Status update  (restaurant + admin only) ──────────────────────────────

    def test_restaurant_can_update_status(self):
        listing_id = client.post(
            "/api/v1/listings", json=_future_listing_payload(), headers=_restaurant_headers()
        ).json()["data"]["id"]
        res = client.patch(
            f"/api/v1/listings/{listing_id}/status",
            json={"status": "expired"},
            headers=_restaurant_headers(),
        )
        assert res.status_code == 200

    def test_recipient_cannot_update_status(self):
        listing_id = client.post(
            "/api/v1/listings", json=_future_listing_payload(), headers=_admin_headers()
        ).json()["data"]["id"]
        res = client.patch(
            f"/api/v1/listings/{listing_id}/status",
            json={"status": "expired"},
            headers=_recipient_headers(),
        )
        assert res.status_code == 403
        assert res.json()["error"]["code"] == "FORBIDDEN"

    # ── Delete listing  (admin only) ──────────────────────────────────────────

    def test_admin_can_delete_listing(self):
        listing_id = client.post(
            "/api/v1/listings", json=_future_listing_payload(), headers=_admin_headers()
        ).json()["data"]["id"]
        res = client.delete(f"/api/v1/listings/{listing_id}", headers=_admin_headers())
        assert res.status_code == 200

    def test_restaurant_cannot_delete_listing(self):
        listing_id = client.post(
            "/api/v1/listings", json=_future_listing_payload(), headers=_admin_headers()
        ).json()["data"]["id"]
        res = client.delete(f"/api/v1/listings/{listing_id}", headers=_restaurant_headers())
        assert res.status_code == 403
        assert res.json()["error"]["code"] == "FORBIDDEN"

    def test_recipient_cannot_delete_listing(self):
        listing_id = client.post(
            "/api/v1/listings", json=_future_listing_payload(), headers=_admin_headers()
        ).json()["data"]["id"]
        res = client.delete(f"/api/v1/listings/{listing_id}", headers=_recipient_headers())
        assert res.status_code == 403

    # ── Admin stats  (admin only) ─────────────────────────────────────────────

    def test_admin_can_access_stats(self):
        res = client.get("/api/v1/admin/stats", headers=_admin_headers())
        assert res.status_code == 200

    def test_recipient_cannot_access_stats(self):
        res = client.get("/api/v1/admin/stats", headers=_recipient_headers())
        assert res.status_code == 403
        assert res.json()["error"]["code"] == "FORBIDDEN"

    def test_restaurant_cannot_access_stats(self):
        res = client.get("/api/v1/admin/stats", headers=_restaurant_headers())
        assert res.status_code == 403

    # ── Admin listings  (restaurant + admin) ──────────────────────────────────

    def test_admin_can_access_admin_listings(self):
        res = client.get("/api/v1/admin/listings", headers=_admin_headers())
        assert res.status_code == 200

    def test_restaurant_can_access_admin_listings(self):
        res = client.get("/api/v1/admin/listings", headers=_restaurant_headers())
        assert res.status_code == 200

    def test_recipient_cannot_access_admin_listings(self):
        res = client.get("/api/v1/admin/listings", headers=_recipient_headers())
        assert res.status_code == 403
        assert res.json()["error"]["code"] == "FORBIDDEN"

    # ── Claims list  (admin only) ─────────────────────────────────────────────

    def test_admin_can_list_claims(self):
        res = client.get("/api/v1/claims", headers=_admin_headers())
        assert res.status_code == 200

    def test_recipient_cannot_list_claims(self):
        res = client.get("/api/v1/claims", headers=_recipient_headers())
        assert res.status_code == 403

    def test_admin_can_access_login_archive(self):
        _login("admin@mealmatch.dev", "Admin1234!")
        res = client.get("/api/v1/admin/login-archive", headers=_admin_headers())
        assert res.status_code == 200
        assert isinstance(res.json()["data"], list)
        assert res.json()["data"][0]["code"] == "LOGIN_SUCCESS"

    def test_recipient_cannot_access_login_archive(self):
        res = client.get("/api/v1/admin/login-archive", headers=_recipient_headers())
        assert res.status_code == 403
        assert res.json()["error"]["code"] == "FORBIDDEN"

    def test_failed_recipient_ebt_login_is_archived(self):
        _login(
            "recipient@mealmatch.dev",
            "Recipient1!",
            ebt_card_number="6001000000001201",
            ebt_pin="0000",
        )
        res = client.get("/api/v1/admin/login-archive", headers=_admin_headers())
        latest = res.json()["data"][0]
        assert latest["email"] == "recipient@mealmatch.dev"
        assert latest["success"] is False
        assert latest["code"] == "INVALID_EBT_PIN"
