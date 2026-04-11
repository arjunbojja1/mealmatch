from datetime import datetime, timezone
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

ListingStatus = Literal["active", "claimed", "expired"]
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
        status="active",
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
        status="active",
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
        if listing.status == "active" and now > listing.pickup_end:
            listings[listing.id] = listing.model_copy(update={"status": "expired"})


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


@app.get("/api/v1/listings", response_model=list[Listing])
def get_listings() -> list[Listing]:
    """Return all active listings (auto-expires stale ones first)."""
    _expire_listings()
    return [l for l in listings.values() if l.status == "active"]


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
        status="active",
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

    if listing.status != "active":
        raise HTTPException(
            status_code=409,
            detail=f"Listing cannot be claimed (status: {listing.status})",
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

    updated = listing.model_copy(update={"status": "claimed"})
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
# Claims (read-only for now)
# ---------------------------------------------------------------------------


@app.get("/api/v1/claims", response_model=list[Claim])
def get_claims() -> list[Claim]:
    """Return all claims."""
    return list(claims.values())
