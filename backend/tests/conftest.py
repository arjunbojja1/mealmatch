"""
Shared pytest fixtures for MealMatch backend tests.

auth override strategy
─────────────────────
Non-auth test modules (test_api_contract.py, test_e2e_happy_path.py) mark themselves
with  pytestmark = pytest.mark.usefixtures("mock_admin_auth")  which injects a
FastAPI dependency override that bypasses JWT validation and returns a seeded admin
user for every request.

test_auth.py deliberately omits that mark so it tests the real auth flow.
"""

import sys
import os

# Redirect the listings DB to a temp file so tests never pollute the
# production mealmatch_listings.db file.
import tempfile as _tempfile
_TEST_DB = _tempfile.mktemp(suffix="_mealmatch_test.db")
os.environ["LISTINGS_DB_PATH"] = _TEST_DB

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient

from main import (
    app,
    user_repo,
    _seed_users,
    _ebt_records,
    _seed_ebt_records,
    _login_archive,
    listings,
    claims,
    get_current_user,
    UserInDB,
)


# ---------------------------------------------------------------------------
# State-reset fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def reset_all_state():
    """Clear and re-seed every store before each test."""
    listings.clear()
    claims.clear()
    user_repo.clear()
    _ebt_records.clear()
    _login_archive.clear()
    _seed_users()
    _seed_ebt_records()
    yield
    listings.clear()
    claims.clear()
    user_repo.clear()
    _ebt_records.clear()
    _login_archive.clear()
    _seed_users()
    _seed_ebt_records()


# ---------------------------------------------------------------------------
# Auth override fixture  (opt-in — not autouse)
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_admin_auth():
    """Override get_current_user to return the seeded admin without a real token."""

    def _admin() -> UserInDB:
        return UserInDB(
            id="admin-001",
            name="Admin User",
            email="admin@mealmatch.dev",
            role="admin",
            hashed_password="",
        )

    app.dependency_overrides[get_current_user] = _admin
    yield
    app.dependency_overrides.pop(get_current_user, None)
