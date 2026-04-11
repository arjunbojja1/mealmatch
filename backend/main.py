from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Literal
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(title="MealMatch API", version="0.1.0")

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
# Schemas
# ---------------------------------------------------------------------------

class ListingStatus(str, Enum):
    active = "active"
    claimed = "claimed"
    expired = "expired"


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


class ListingResponse(Listing):
    """Listing with computed fields added at response time."""
    is_urgent: bool


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


# ---------------------------------------------------------------------------
# In-memory storage
# ---------------------------------------------------------------------------

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
    for listing in listings.values():
        if listing.status == ListingStatus.active and now > listing.pickup_end:
            listings[listing.id] = listing.model_copy(update={"status": ListingStatus.expired})


def _to_response(listing: Listing) -> ListingResponse:
    """Attach computed fields (is_urgent) to a listing for API responses."""
    now = datetime.now(timezone.utc)
    is_urgent = listing.pickup_end - now <= timedelta(minutes=30)
    return ListingResponse(**listing.model_dump(), is_urgent=is_urgent)


# ---------------------------------------------------------------------------
# Health / root
# ---------------------------------------------------------------------------


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "MealMatch API is running", "docs": "/docs"}


# ---------------------------------------------------------------------------
# Listings
# ---------------------------------------------------------------------------


@app.get("/api/v1/listings", response_model=list[ListingResponse])
def get_listings() -> list[ListingResponse]:
    """Return active listings sorted by pickup_end (soonest first), with is_urgent flag."""
    _expire_listings()
    active = sorted(
        (l for l in listings.values() if l.status == ListingStatus.active),
        key=lambda l: l.pickup_end,
    )
    return [_to_response(l) for l in active]


@app.post("/api/v1/listings", response_model=Listing, status_code=201)
def create_listing(payload: ListingCreate) -> Listing:
    """Create a new food listing."""
    if payload.pickup_end <= payload.pickup_start:
        raise HTTPException(status_code=422, detail="pickup_end must be after pickup_start")

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
    return listing


@app.post("/api/v1/listings/{listing_id}/claim", response_model=Listing)
def claim_listing(listing_id: str, payload: ClaimCreate) -> Listing:
    """Claim an active listing."""
    listing = listings.get(listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    _expire_listings()
    listing = listings[listing_id]  # re-fetch after expiry check

    if listing.status != ListingStatus.active:
        raise HTTPException(
            status_code=409,
            detail=f"Listing cannot be claimed — current status: '{listing.status.value}'",
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

    updated = listing.model_copy(update={"status": ListingStatus.claimed})
    listings[listing_id] = updated
    return updated


@app.patch("/api/v1/listings/{listing_id}/status", response_model=Listing)
def update_listing_status(listing_id: str, payload: StatusUpdate) -> Listing:
    """Manually update a listing's status (admin use)."""
    listing = listings.get(listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    updated = listing.model_copy(update={"status": payload.status})
    listings[listing_id] = updated
    return updated


# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Claims (read-only for now)
# ---------------------------------------------------------------------------


@app.get("/api/v1/claims", response_model=list[Claim])
def get_claims() -> list[Claim]:
    """Return all claims."""
    return list(claims.values())


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------


class AdminStats(BaseModel):
    active_listings: int
    claimed_listings: int
    expired_listings: int
    total_claims: int
    meals_saved: int


@app.get("/api/v1/admin/listings", response_model=list[Listing])
def admin_get_all_listings() -> list[Listing]:
    """Return every listing regardless of status (runs expiry check first)."""
    _expire_listings()
    return list(listings.values())


@app.delete("/api/v1/listings/{listing_id}", response_model=Listing)
def delete_listing(listing_id: str) -> Listing:
    """Permanently remove a listing from in-memory storage."""
    listing = listings.pop(listing_id, None)
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    return listing


@app.get("/api/v1/admin/stats", response_model=AdminStats)
def admin_get_stats() -> AdminStats:
    """Aggregate stats across all listings and claims."""
    _expire_listings()

    status_counts: dict[ListingStatus, int] = {s: 0 for s in ListingStatus}
    meals_saved = 0

    for listing in listings.values():
        status_counts[listing.status] += 1
        if listing.status == ListingStatus.claimed:
            meals_saved += listing.quantity

    return AdminStats(
        active_listings=status_counts[ListingStatus.active],
        claimed_listings=status_counts[ListingStatus.claimed],
        expired_listings=status_counts[ListingStatus.expired],
        total_claims=len(claims),
        meals_saved=meals_saved,
    )
