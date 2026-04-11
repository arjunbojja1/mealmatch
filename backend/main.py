from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Literal
from uuid import uuid4
import threading

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(title="MealMatch API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Response helpers
# ---------------------------------------------------------------------------


def ok(data, message: str = "", meta: dict | None = None) -> JSONResponse:
    """Wrap a successful payload in the standard envelope."""
    return JSONResponse(
        {"ok": True, "data": data, "message": message, "meta": meta or {}}
    )


def ok_created(data, message: str = "") -> JSONResponse:
    """201 Created variant of ok()."""
    return JSONResponse(
        {"ok": True, "data": data, "message": message, "meta": {}},
        status_code=201,
    )


def _err_body(code: str, message: str, details=None) -> dict:
    return {"ok": False, "error": {"code": code, "message": message, "details": details}}


# ---------------------------------------------------------------------------
# Global exception handlers
# ---------------------------------------------------------------------------


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    detail = exc.detail
    if isinstance(detail, dict):
        code = detail.get("code", "ERROR")
        message = detail.get("message", str(detail))
        details = detail.get("details")
    else:
        code = {
            400: "BAD_REQUEST",
            404: "NOT_FOUND",
            409: "CONFLICT",
            422: "UNPROCESSABLE",
        }.get(exc.status_code, "ERROR")
        message = str(detail) if detail else "An error occurred"
        details = None
    return JSONResponse(_err_body(code, message, details), status_code=exc.status_code)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        _err_body("VALIDATION_ERROR", "Request validation failed", exc.errors()),
        status_code=422,
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        _err_body("INTERNAL_ERROR", "An unexpected error occurred"),
        status_code=500,
    )


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_CLAIM_QUANTITY = 10  # hard cap per single claim request

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class ListingStatus(str, Enum):
    active = "active"
    claimed = "claimed"
    expired = "expired"


# Allowed manual status transitions (PATCH /status).
# Both claimed and expired are terminal states.
ALLOWED_TRANSITIONS: dict[ListingStatus, set[ListingStatus]] = {
    ListingStatus.active: {ListingStatus.claimed, ListingStatus.expired},
    ListingStatus.claimed: set(),
    ListingStatus.expired: set(),
}

ClaimStatus = Literal["pending", "confirmed", "cancelled"]
UserRole = Literal["restaurant", "recipient", "admin", "partner"]


class User(BaseModel):
    id: str
    name: str
    email: str
    role: UserRole
    location: str


class Listing(BaseModel):
    id: str
    restaurant_id: str
    title: str
    description: str
    quantity: int
    dietary_tags: list[str]
    pickup_start: datetime
    pickup_end: datetime
    status: ListingStatus
    created_at: datetime


class Claim(BaseModel):
    id: str
    listing_id: str
    user_id: str
    claimed_quantity: int
    claimed_at: datetime
    status: ClaimStatus


# Request bodies

class ListingCreate(BaseModel):
    restaurant_id: str
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=1000)
    quantity: int = Field(gt=0)
    dietary_tags: list[str] = []
    pickup_start: datetime
    pickup_end: datetime


class ClaimCreate(BaseModel):
    user_id: str
    claimed_quantity: int = Field(gt=0)


class StatusUpdate(BaseModel):
    status: ListingStatus


class AdminStats(BaseModel):
    active_listings: int
    claimed_listings: int
    expired_listings: int
    total_claims: int
    meals_saved: int


# ---------------------------------------------------------------------------
# In-memory storage + concurrency lock
# ---------------------------------------------------------------------------

_claim_lock = threading.Lock()

_now = datetime.now(timezone.utc)

listings: dict[str, Listing] = {
    "seed-1": Listing(
        id="seed-1",
        restaurant_id="rest-001",
        title="Leftover Pasta Bolognese",
        description="~20 portions of freshly made pasta bolognese. Pick up before close.",
        quantity=20,
        dietary_tags=["gluten", "dairy-free"],
        pickup_start=_now.replace(hour=18, minute=0, second=0, microsecond=0),
        pickup_end=_now.replace(hour=21, minute=0, second=0, microsecond=0),
        status=ListingStatus.active,
        created_at=_now,
    ),
    "seed-2": Listing(
        id="seed-2",
        restaurant_id="rest-002",
        title="Assorted Sandwiches",
        description="Individually wrapped turkey and veggie sandwiches, about 30 available.",
        quantity=30,
        dietary_tags=["vegetarian-option", "nut-free"],
        pickup_start=_now.replace(hour=15, minute=0, second=0, microsecond=0),
        pickup_end=_now.replace(hour=17, minute=30, second=0, microsecond=0),
        status=ListingStatus.active,
        created_at=_now,
    ),
}

claims: dict[str, Claim] = {}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _expire_listings() -> None:
    """Mark listings whose pickup window has passed as expired."""
    now = datetime.now(timezone.utc)
    for listing in list(listings.values()):
        if listing.status == ListingStatus.active and now > listing.pickup_end:
            listings[listing.id] = listing.model_copy(
                update={"status": ListingStatus.expired}
            )


def _listing_dict(listing: Listing, *, urgent: bool | None = None) -> dict:
    """Serialise a Listing to a plain dict, optionally adding is_urgent."""
    d = listing.model_dump(mode="json")
    if urgent is not None:
        d["is_urgent"] = urgent
    return d


def _to_response_dict(listing: Listing) -> dict:
    """Add is_urgent computed field for public feed responses."""
    now = datetime.now(timezone.utc)
    is_urgent = listing.pickup_end - now <= timedelta(minutes=30)
    return _listing_dict(listing, urgent=is_urgent)


# ---------------------------------------------------------------------------
# Health / root
# ---------------------------------------------------------------------------


@app.get("/health")
def health_check():
    return ok({"status": "ok"})


@app.get("/")
def root():
    return ok({"message": "MealMatch API is running", "docs": "/docs"})


# ---------------------------------------------------------------------------
# Listings — public feed
# ---------------------------------------------------------------------------


@app.get("/api/v1/listings")
def get_listings():
    """Return active listings sorted by pickup_end (soonest first), with is_urgent flag."""
    _expire_listings()
    active = sorted(
        (l for l in listings.values() if l.status == ListingStatus.active),
        key=lambda l: l.pickup_end,
    )
    return ok([_to_response_dict(l) for l in active])


@app.post("/api/v1/listings", status_code=201)
def create_listing(payload: ListingCreate):
    """Create a new food listing."""
    if payload.pickup_end <= payload.pickup_start:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "INVALID_PICKUP_WINDOW",
                "message": "pickup_end must be after pickup_start",
            },
        )

    listing = Listing(
        id=str(uuid4()),
        restaurant_id=payload.restaurant_id,
        title=payload.title,
        description=payload.description,
        quantity=payload.quantity,
        dietary_tags=payload.dietary_tags,
        pickup_start=payload.pickup_start,
        pickup_end=payload.pickup_end,
        status=ListingStatus.active,
        created_at=datetime.now(timezone.utc),
    )
    listings[listing.id] = listing
    return ok_created(_listing_dict(listing), "Listing created successfully")


@app.post("/api/v1/listings/{listing_id}/claim")
def claim_listing(listing_id: str, payload: ClaimCreate):
    """Claim an active listing (atomic under _claim_lock)."""
    with _claim_lock:
        listing = listings.get(listing_id)
        if not listing:
            raise HTTPException(
                status_code=404,
                detail={"code": "NOT_FOUND", "message": "Listing not found"},
            )

        _expire_listings()
        listing = listings[listing_id]  # re-fetch after expiry check

        if listing.status != ListingStatus.active:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "UNCLAIMABLE_STATUS",
                    "message": (
                        f"Listing cannot be claimed — "
                        f"current status: '{listing.status.value}'"
                    ),
                },
            )

        # Duplicate claim guard — one claim per user per listing
        already_claimed = any(
            c.user_id == payload.user_id and c.listing_id == listing_id
            for c in claims.values()
        )
        if already_claimed:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "ALREADY_CLAIMED",
                    "message": "You have already claimed this listing",
                },
            )

        # Quantity guardrails
        if payload.claimed_quantity > MAX_CLAIM_QUANTITY:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "OVER_QUANTITY",
                    "message": (
                        f"Cannot claim more than {MAX_CLAIM_QUANTITY} "
                        "items in a single request"
                    ),
                },
            )
        if payload.claimed_quantity > listing.quantity:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "OVER_QUANTITY",
                    "message": (
                        f"Requested quantity exceeds available "
                        f"({listing.quantity} remaining)"
                    ),
                },
            )

        claim = Claim(
            id=str(uuid4()),
            listing_id=listing_id,
            user_id=payload.user_id,
            claimed_quantity=payload.claimed_quantity,
            claimed_at=datetime.now(timezone.utc),
            status="confirmed",
        )
        claims[claim.id] = claim

        # Partial claim → reduce quantity, keep active
        # Full claim → quantity 0, flip to claimed
        new_quantity = listing.quantity - payload.claimed_quantity
        new_status = ListingStatus.claimed if new_quantity == 0 else listing.status
        updated = listing.model_copy(
            update={"quantity": new_quantity, "status": new_status}
        )
        listings[listing_id] = updated
        return ok(_listing_dict(updated), "Listing claimed successfully")


@app.patch("/api/v1/listings/{listing_id}/status")
def update_listing_status(listing_id: str, payload: StatusUpdate):
    """Manually update a listing's status; enforces allowed transition rules."""
    listing = listings.get(listing_id)
    if not listing:
        raise HTTPException(
            status_code=404,
            detail={"code": "NOT_FOUND", "message": "Listing not found"},
        )

    allowed = ALLOWED_TRANSITIONS.get(listing.status, set())
    if payload.status not in allowed:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "INVALID_STATUS_TRANSITION",
                "message": (
                    f"Cannot transition from '{listing.status.value}' "
                    f"to '{payload.status.value}'"
                ),
                "details": {
                    "current_status": listing.status.value,
                    "requested_status": payload.status.value,
                    "allowed_transitions": [s.value for s in allowed],
                },
            },
        )

    updated = listing.model_copy(update={"status": payload.status})
    listings[listing_id] = updated
    return ok(
        _listing_dict(updated),
        f"Listing status updated to '{payload.status.value}'",
    )


@app.delete("/api/v1/listings/{listing_id}")
def delete_listing(listing_id: str):
    """Permanently remove a listing."""
    listing = listings.pop(listing_id, None)
    if not listing:
        raise HTTPException(
            status_code=404,
            detail={"code": "NOT_FOUND", "message": "Listing not found"},
        )
    return ok(_listing_dict(listing), "Listing deleted successfully")


# ---------------------------------------------------------------------------
# Claims (read-only)
# ---------------------------------------------------------------------------


@app.get("/api/v1/claims")
def get_claims():
    return ok([c.model_dump(mode="json") for c in claims.values()])


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------


@app.get("/api/v1/admin/listings")
def admin_get_all_listings():
    """Return every listing regardless of status (runs expiry check first)."""
    _expire_listings()
    return ok([_listing_dict(l) for l in listings.values()])


@app.get("/api/v1/admin/stats")
def admin_get_stats():
    """Aggregate stats across all listings and claims."""
    _expire_listings()

    status_counts: dict[str, int] = {"active": 0, "claimed": 0, "expired": 0}
    meals_saved = 0

    for listing in listings.values():
        status_counts[listing.status] += 1
        if listing.status == ListingStatus.claimed:
            meals_saved += listing.quantity

    stats = AdminStats(
        active_listings=status_counts["active"],
        claimed_listings=status_counts["claimed"],
        expired_listings=status_counts["expired"],
        total_claims=len(claims),
        meals_saved=meals_saved,
    )
    return ok(stats.model_dump())
