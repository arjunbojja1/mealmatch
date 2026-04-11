"""
MealMatch API  —  v0.4.0
FastAPI backend with JWT auth, role-based access control, recipient EBT
verification, and in-memory storage.

Default demo accounts (seeded at startup):
  admin@mealmatch.dev       / Admin1234!      role: admin
  restaurant@mealmatch.dev  / Restaurant1!    role: restaurant
  recipient@mealmatch.dev   / Recipient1!     role: recipient
"""

from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Literal
from uuid import uuid4
import threading

import bcrypt
import jwt
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, Field

try:
    from jwt import ExpiredSignatureError, InvalidTokenError
except Exception as exc:
    raise RuntimeError(
        "PyJWT is required for auth. Install 'pyjwt' and remove the incompatible 'jwt' package."
    ) from exc

if not hasattr(jwt, "encode") or not hasattr(jwt, "decode"):
    raise RuntimeError(
        "Detected incompatible 'jwt' module. Install 'pyjwt' and remove 'jwt'."
    )

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(title="MealMatch API", version="0.4.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Response helpers
# ---------------------------------------------------------------------------


def ok(data, message: str = "", meta: dict | None = None) -> JSONResponse:
    return JSONResponse({"ok": True, "data": data, "message": message, "meta": meta or {}})


def ok_created(data, message: str = "") -> JSONResponse:
    return JSONResponse({"ok": True, "data": data, "message": message, "meta": {}}, status_code=201)


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
        code = {400: "BAD_REQUEST", 401: "UNAUTHORIZED", 403: "FORBIDDEN",
                404: "NOT_FOUND", 409: "CONFLICT", 422: "UNPROCESSABLE"}.get(exc.status_code, "ERROR")
        message = str(detail) if detail else "An error occurred"
        details = None
    return JSONResponse(_err_body(code, message, details), status_code=exc.status_code)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        _err_body("VALIDATION_ERROR", "Request validation failed", exc.errors()),
        status_code=422,
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(_err_body("INTERNAL_ERROR", "An unexpected error occurred"), status_code=500)


# ---------------------------------------------------------------------------
# Auth constants
# ---------------------------------------------------------------------------

JWT_SECRET = "mealmatch-dev-secret-change-before-production"
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = 60 * 24  # 24 hours

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

# ---------------------------------------------------------------------------
# Auth schemas
# ---------------------------------------------------------------------------

UserRole = Literal["restaurant", "recipient", "admin", "partner"]


class UserInDB(BaseModel):
    id: str
    name: str
    email: str
    role: UserRole
    location: str = ""
    hashed_password: str
    ebt_verified: bool = False
    ebt_last4: str = ""


class UserPublic(BaseModel):
    id: str
    name: str
    email: str
    role: UserRole
    location: str = ""
    ebt_verified: bool = False
    ebt_last4: str = ""


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=8)
    role: UserRole
    location: str = ""
    ebt_card_number: str | None = None
    ebt_pin: str | None = None


class UserLogin(BaseModel):
    email: str
    password: str
    ebt_card_number: str | None = None
    ebt_pin: str | None = None


class SimulatedEBTRecord(BaseModel):
    allowed_email: str
    card_number: str
    pin: str
    label: str = ""


class LoginAuditEntry(BaseModel):
    id: str
    email: str
    role: UserRole | None = None
    success: bool
    code: str
    message: str
    requires_ebt: bool = False
    ebt_last4: str = ""
    created_at: datetime


# ---------------------------------------------------------------------------
# Auth storage + seeding
# ---------------------------------------------------------------------------

_users: dict[str, UserInDB] = {}  # keyed by lowercase email
_ebt_records: dict[str, SimulatedEBTRecord] = {}  # keyed by lowercase email
_login_archive: list[LoginAuditEntry] = []
_auth_lock = threading.Lock()


def _hash_pw(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify_pw(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


def _seed_users() -> None:
    """Populate default demo accounts."""
    defaults = [
        {
            "id": "admin-001",
            "name": "Admin User",
            "email": "admin@mealmatch.dev",
            "password": "Admin1234!",
            "role": "admin",
        },
        {
            "id": "rest-001",  # matches hardcoded restaurant_id in seed listings
            "name": "Demo Restaurant",
            "email": "restaurant@mealmatch.dev",
            "password": "Restaurant1!",
            "role": "restaurant",
        },
        {
            "id": "recipient-001",
            "name": "Demo Recipient",
            "email": "recipient@mealmatch.dev",
            "password": "Recipient1!",
            "role": "recipient",
        },
    ]
    for u in defaults:
        _users[u["email"].lower()] = UserInDB(
            id=u["id"],
            name=u["name"],
            email=u["email"],
            role=u["role"],
            hashed_password=_hash_pw(u["password"]),
            ebt_verified=(u["role"] == "recipient"),
            ebt_last4="1201" if u["role"] == "recipient" else "",
        )


_seed_users()


def _seed_ebt_records() -> None:
    defaults = [
        {
            "allowed_email": "recipient@mealmatch.dev",
            "card_number": "6001000000001201",
            "pin": "2468",
            "label": "Seeded demo recipient",
        },
        {
            "allowed_email": "alex.recipient@mealmatch.dev",
            "card_number": "6001000000002202",
            "pin": "1357",
            "label": "Simulated signup recipient",
        },
        {
            "allowed_email": "sam.recipient@mealmatch.dev",
            "card_number": "6001000000003303",
            "pin": "8642",
            "label": "Simulated signup recipient",
        },
    ]
    for record in defaults:
        _ebt_records[record["allowed_email"].lower()] = SimulatedEBTRecord(**record)


_seed_ebt_records()

# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------


def _create_token(user: UserInDB) -> str:
    payload = {
        "sub": user.id,
        "email": user.email,
        "role": user.role,
        "name": user.name,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _user_public(user: UserInDB) -> dict:
    return UserPublic(
        id=user.id, name=user.name, email=user.email,
        role=user.role, location=user.location,
        ebt_verified=user.ebt_verified, ebt_last4=user.ebt_last4,
    ).model_dump()


def _normalise_card_number(card_number: str | None) -> str:
    return "".join(ch for ch in (card_number or "") if ch.isdigit())


def _last4(card_number: str | None) -> str:
    digits = _normalise_card_number(card_number)
    return digits[-4:] if len(digits) >= 4 else ""


def _verify_ebt_for_email(
    email: str,
    card_number: str | None,
    pin: str | None,
) -> tuple[SimulatedEBTRecord | None, str | None, str | None]:
    record = _ebt_records.get(email.lower())
    if record is None:
        return None, "EBT_NOT_ELIGIBLE", "No simulated EBT record exists for this recipient account"

    normalised = _normalise_card_number(card_number)
    if not normalised or not pin:
        return None, "EBT_VERIFICATION_REQUIRED", "EBT card number and PIN are required for recipient access"

    if normalised != record.card_number or pin != record.pin:
        return None, "INVALID_EBT_PIN", "Invalid EBT card number or PIN"

    return record, None, None


def _archive_login_attempt(
    *,
    email: str,
    role: UserRole | None,
    success: bool,
    code: str,
    message: str,
    requires_ebt: bool = False,
    ebt_last4: str = "",
) -> None:
    with _auth_lock:
        _login_archive.append(
            LoginAuditEntry(
                id=str(uuid4()),
                email=email,
                role=role,
                success=success,
                code=code,
                message=message,
                requires_ebt=requires_ebt,
                ebt_last4=ebt_last4,
                created_at=datetime.now(timezone.utc),
            )
        )
        if len(_login_archive) > 250:
            del _login_archive[:-250]


def get_current_user(token: str | None = Depends(oauth2_scheme)) -> UserInDB:
    """FastAPI dependency — resolves a Bearer token to a UserInDB or raises 401."""
    if not token:
        raise HTTPException(
            status_code=401,
            detail={"code": "UNAUTHORIZED", "message": "Authentication required"},
        )
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id: str | None = payload.get("sub")
        if not user_id:
            raise ValueError("missing sub")
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail={"code": "TOKEN_EXPIRED", "message": "Token has expired"},
        )
    except InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail={"code": "INVALID_TOKEN", "message": "Invalid or malformed token"},
        )
    except Exception:
        raise HTTPException(
            status_code=401,
            detail={"code": "INVALID_TOKEN", "message": "Invalid or malformed token"},
        )
    user = next((u for u in _users.values() if u.id == user_id), None)
    if user is None:
        raise HTTPException(
            status_code=401,
            detail={"code": "USER_NOT_FOUND", "message": "User account no longer exists"},
        )
    return user


def require_roles(*roles: str):
    """Return a FastAPI dependency that enforces role membership."""
    def _check(current_user: UserInDB = Depends(get_current_user)) -> UserInDB:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "FORBIDDEN",
                    "message": f"Role '{current_user.role}' is not authorised for this action",
                },
            )
        return current_user
    return _check


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------


@app.post("/api/v1/auth/signup", status_code=201)
def signup(payload: UserCreate):
    email_key = payload.email.lower()
    if email_key in _users:
        raise HTTPException(
            status_code=409,
            detail={"code": "EMAIL_TAKEN", "message": "Email is already registered"},
        )

    ebt_verified = False
    ebt_last4 = ""
    if payload.role == "recipient":
        _, code, message = _verify_ebt_for_email(
            payload.email,
            payload.ebt_card_number,
            payload.ebt_pin,
        )
        if code:
            raise HTTPException(
                status_code=403 if code == "EBT_NOT_ELIGIBLE" else 401,
                detail={"code": code, "message": message},
            )
        ebt_verified = True
        ebt_last4 = _last4(payload.ebt_card_number)

    user = UserInDB(
        id=str(uuid4()),
        name=payload.name,
        email=payload.email,
        role=payload.role,
        location=payload.location,
        hashed_password=_hash_pw(payload.password),
        ebt_verified=ebt_verified,
        ebt_last4=ebt_last4,
    )
    _users[email_key] = user
    token = _create_token(user)
    return ok_created(
        {"access_token": token, "token_type": "bearer", "user": _user_public(user)},
        "Account created successfully",
    )


@app.post("/api/v1/auth/login")
def login(payload: UserLogin):
    user = _users.get(payload.email.lower())
    if not user or not _verify_pw(payload.password, user.hashed_password):
        _archive_login_attempt(
            email=payload.email,
            role=user.role if user else None,
            success=False,
            code="INVALID_CREDENTIALS",
            message="Invalid email or password",
        )
        raise HTTPException(
            status_code=401,
            detail={"code": "INVALID_CREDENTIALS", "message": "Invalid email or password"},
        )

    if user.role == "recipient":
        _, code, message = _verify_ebt_for_email(
            user.email,
            payload.ebt_card_number,
            payload.ebt_pin,
        )
        if code:
            _archive_login_attempt(
                email=user.email,
                role=user.role,
                success=False,
                code=code,
                message=message,
                requires_ebt=True,
                ebt_last4=_last4(payload.ebt_card_number),
            )
            raise HTTPException(
                status_code=403 if code == "EBT_NOT_ELIGIBLE" else 401,
                detail={"code": code, "message": message},
            )
        refreshed_user = user.model_copy(
            update={"ebt_verified": True, "ebt_last4": _last4(payload.ebt_card_number)}
        )
        _users[user.email.lower()] = refreshed_user
        user = refreshed_user

    token = _create_token(user)
    _archive_login_attempt(
        email=user.email,
        role=user.role,
        success=True,
        code="LOGIN_SUCCESS",
        message="Login successful",
        requires_ebt=(user.role == "recipient"),
        ebt_last4=user.ebt_last4,
    )
    return ok(
        {"access_token": token, "token_type": "bearer", "user": _user_public(user)},
        "Login successful",
    )


@app.get("/api/v1/auth/me")
def get_me(current_user: UserInDB = Depends(get_current_user)):
    return ok(_user_public(current_user))


# ---------------------------------------------------------------------------
# Business constants
# ---------------------------------------------------------------------------

MAX_CLAIM_QUANTITY = 10

# ---------------------------------------------------------------------------
# Business schemas
# ---------------------------------------------------------------------------


class ListingStatus(str, Enum):
    active = "active"
    claimed = "claimed"
    expired = "expired"


# Allowed manual status transitions (PATCH /status). claimed + expired are terminal.
ALLOWED_TRANSITIONS: dict[ListingStatus, set[ListingStatus]] = {
    ListingStatus.active: {ListingStatus.claimed, ListingStatus.expired},
    ListingStatus.claimed: set(),
    ListingStatus.expired: set(),
}

ClaimStatus = Literal["pending", "confirmed", "cancelled"]


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
    address: str = ""
    location_name: str = ""
    lat: float | None = None
    lng: float | None = None


class Claim(BaseModel):
    id: str
    listing_id: str
    user_id: str
    claimed_quantity: int
    claimed_at: datetime
    status: ClaimStatus


class ListingCreate(BaseModel):
    restaurant_id: str
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=1000)
    quantity: int = Field(gt=0)
    dietary_tags: list[str] = []
    pickup_start: datetime
    pickup_end: datetime
    address: str = ""
    location_name: str = ""
    lat: float | None = None
    lng: float | None = None


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
# In-memory storage
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
# Business helpers
# ---------------------------------------------------------------------------


def _expire_listings() -> None:
    now = datetime.now(timezone.utc)
    for listing in list(listings.values()):
        if listing.status == ListingStatus.active and now > listing.pickup_end:
            listings[listing.id] = listing.model_copy(update={"status": ListingStatus.expired})


def _listing_dict(listing: Listing, *, urgent: bool | None = None) -> dict:
    d = listing.model_dump(mode="json")
    if urgent is not None:
        d["is_urgent"] = urgent
    return d


def _to_response_dict(listing: Listing) -> dict:
    now = datetime.now(timezone.utc)
    is_urgent = listing.pickup_end - now <= timedelta(minutes=30)
    d = _listing_dict(listing, urgent=is_urgent)
    if listing.lat is not None and listing.lng is not None:
        d["location"] = {"lat": listing.lat, "lng": listing.lng}
    return d


# ---------------------------------------------------------------------------
# Health / root  (public — no auth)
# ---------------------------------------------------------------------------


@app.get("/health")
def health_check():
    return ok({"status": "ok"})


@app.get("/")
def root():
    return ok({"message": "MealMatch API is running", "docs": "/docs"})


# ---------------------------------------------------------------------------
# Listings — public feed  (any authenticated user)
# ---------------------------------------------------------------------------


@app.get("/api/v1/listings")
def get_listings(_: UserInDB = Depends(get_current_user)):
    _expire_listings()
    active = sorted(
        (l for l in listings.values() if l.status == ListingStatus.active),
        key=lambda l: l.pickup_end,
    )
    return ok([_to_response_dict(l) for l in active])


@app.post("/api/v1/listings", status_code=201)
def create_listing(
    payload: ListingCreate,
    current_user: UserInDB = Depends(require_roles("restaurant", "admin")),
):
    if payload.pickup_end <= payload.pickup_start:
        raise HTTPException(
            status_code=422,
            detail={"code": "INVALID_PICKUP_WINDOW", "message": "pickup_end must be after pickup_start"},
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
        address=payload.address,
        location_name=payload.location_name,
        lat=payload.lat,
        lng=payload.lng,
    )
    listings[listing.id] = listing
    return ok_created(_to_response_dict(listing), "Listing created successfully")


@app.post("/api/v1/listings/{listing_id}/claim")
def claim_listing(
    listing_id: str,
    payload: ClaimCreate,
    current_user: UserInDB = Depends(require_roles("recipient", "admin")),
):
    with _claim_lock:
        listing = listings.get(listing_id)
        if not listing:
            raise HTTPException(
                status_code=404,
                detail={"code": "NOT_FOUND", "message": "Listing not found"},
            )
        _expire_listings()
        listing = listings[listing_id]

        if listing.status != ListingStatus.active:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "UNCLAIMABLE_STATUS",
                    "message": f"Listing cannot be claimed — current status: '{listing.status.value}'",
                },
            )
        already_claimed = any(
            c.user_id == payload.user_id and c.listing_id == listing_id and c.status == "confirmed"
            for c in claims.values()
        )
        if already_claimed:
            raise HTTPException(
                status_code=409,
                detail={"code": "ALREADY_CLAIMED", "message": "You have already claimed this listing"},
            )
        if payload.claimed_quantity > MAX_CLAIM_QUANTITY:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "OVER_QUANTITY",
                    "message": f"Cannot claim more than {MAX_CLAIM_QUANTITY} items per request",
                },
            )
        if payload.claimed_quantity > listing.quantity:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "OVER_QUANTITY",
                    "message": f"Requested quantity exceeds available ({listing.quantity} remaining)",
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
        new_quantity = listing.quantity - payload.claimed_quantity
        new_status = ListingStatus.claimed if new_quantity == 0 else listing.status
        updated = listing.model_copy(update={"quantity": new_quantity, "status": new_status})
        listings[listing_id] = updated
        return ok(_listing_dict(updated), "Listing claimed successfully")


@app.patch("/api/v1/listings/{listing_id}/status")
def update_listing_status(
    listing_id: str,
    payload: StatusUpdate,
    current_user: UserInDB = Depends(require_roles("restaurant", "admin")),
):
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
                "message": f"Cannot transition from '{listing.status.value}' to '{payload.status.value}'",
                "details": {
                    "current_status": listing.status.value,
                    "requested_status": payload.status.value,
                    "allowed_transitions": [s.value for s in allowed],
                },
            },
        )
    updated = listing.model_copy(update={"status": payload.status})
    listings[listing_id] = updated
    return ok(_listing_dict(updated), f"Listing status updated to '{payload.status.value}'")


@app.delete("/api/v1/listings/{listing_id}")
def delete_listing(
    listing_id: str,
    current_user: UserInDB = Depends(require_roles("admin")),
):
    listing = listings.pop(listing_id, None)
    if not listing:
        raise HTTPException(
            status_code=404,
            detail={"code": "NOT_FOUND", "message": "Listing not found"},
        )
    return ok(_listing_dict(listing), "Listing deleted successfully")


# ---------------------------------------------------------------------------
# Claims
# ---------------------------------------------------------------------------


@app.get("/api/v1/claims")
def get_claims(_: UserInDB = Depends(require_roles("admin"))):
    return ok([c.model_dump(mode="json") for c in claims.values()])


@app.get("/api/v1/my-claims")
def get_my_claims(current_user: UserInDB = Depends(require_roles("recipient", "admin"))):
    """Return all claims belonging to the current user, with embedded listing snapshot."""
    user_claims = []
    for c in claims.values():
        if c.user_id == current_user.id:
            claim_dict = c.model_dump(mode="json")
            listing = listings.get(c.listing_id)
            claim_dict["listing"] = _to_response_dict(listing) if listing else None
            user_claims.append(claim_dict)
    user_claims.sort(key=lambda x: x["claimed_at"], reverse=True)
    return ok(user_claims)


@app.delete("/api/v1/claims/{claim_id}")
def cancel_claim(
    claim_id: str,
    current_user: UserInDB = Depends(require_roles("recipient", "admin")),
):
    """Cancel a confirmed claim. Restores listing quantity; revives 'claimed' listings to 'active'."""
    claim = claims.get(claim_id)
    if not claim:
        raise HTTPException(
            status_code=404,
            detail={"code": "NOT_FOUND", "message": "Claim not found"},
        )
    if current_user.role != "admin" and claim.user_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail={"code": "FORBIDDEN", "message": "You can only cancel your own claims"},
        )
    if claim.status != "confirmed":
        raise HTTPException(
            status_code=409,
            detail={
                "code": "NOT_CANCELLABLE",
                "message": f"Only confirmed claims can be cancelled (current status: '{claim.status}')",
            },
        )
    with _claim_lock:
        updated_claim = claim.model_copy(update={"status": "cancelled"})
        claims[claim_id] = updated_claim
        listing = listings.get(claim.listing_id)
        if listing:
            restored_qty = listing.quantity + claim.claimed_quantity
            # Only revive to active if it was fully-claimed (not time-expired)
            new_status = (
                ListingStatus.active
                if listing.status == ListingStatus.claimed
                else listing.status
            )
            listings[claim.listing_id] = listing.model_copy(
                update={"quantity": restored_qty, "status": new_status}
            )
    return ok(updated_claim.model_dump(mode="json"), "Claim cancelled successfully")


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------


@app.get("/api/v1/admin/listings")
def admin_get_all_listings(
    _: UserInDB = Depends(require_roles("restaurant", "admin")),
):
    _expire_listings()
    return ok([_listing_dict(l) for l in listings.values()])


@app.get("/api/v1/admin/stats")
def admin_get_stats(_: UserInDB = Depends(require_roles("admin"))):
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


@app.get("/api/v1/admin/login-archive")
def admin_get_login_archive(_: UserInDB = Depends(require_roles("admin"))):
    archived = [entry.model_dump(mode="json") for entry in reversed(_login_archive)]
    return ok(archived)
