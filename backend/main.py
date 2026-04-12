"""
MealMatch API  —  v0.5.0
FastAPI backend with JWT auth, role-based access control, recipient EBT
verification, SQLite-backed user persistence, smart matching, demand
prediction, and partner bulk-claim flows.

Default demo accounts (seeded at startup):
  admin@mealmatch.dev       / Admin1234!      role: admin
  restaurant@mealmatch.dev  / Restaurant1!    role: restaurant
  recipient@mealmatch.dev   / Recipient1!     role: recipient
  partner@mealmatch.dev     / Partner1234!    role: partner
"""

import sys
import os

# Allow "from db.repository import …" when running from backend dir or tests
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Literal
from uuid import uuid4
import threading
import logging

import bcrypt
import jwt
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, Field

from db.repository import UserRepository, get_user_repository
from matching import score as _match_score
from prediction import predict_demand

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

app = FastAPI(title="MealMatch API", version="0.5.0")

# Comma-separated explicit origins for non-local environments.
# Example:
#   CORS_ALLOW_ORIGINS="https://mealmatch.app,https://staging.mealmatch.app"
_cors_allow_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ALLOW_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_allow_origins,
    # Also allow local dev ports (e.g. Vite fallback from 5173 -> 5174).
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Structured backend logger for client-side map telemetry
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
map_client_logger = logging.getLogger("mealmatch.map_client")

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
    import traceback
    logging.getLogger("mealmatch.api").error(
        "Unhandled exception on %s %s\n%s",
        request.method,
        request.url.path,
        traceback.format_exc(),
    )
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
    logo_url: str = ""


class UserPublic(BaseModel):
    id: str
    name: str
    email: str
    role: UserRole
    location: str = ""
    ebt_verified: bool = False
    ebt_last4: str = ""
    logo_url: str = ""


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=8)
    role: UserRole
    location: str = ""
    ebt_card_number: str | None = None
    ebt_pin: str | None = None
    logo_url: str = ""


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


class MapErrorReport(BaseModel):
    message: str = Field(min_length=1, max_length=500)
    code: str = Field(default="MAP_CLIENT_ERROR", max_length=100)
    level: Literal["error", "warn", "info"] = "error"
    source: str = Field(default="meal-map", max_length=120)
    stack: str = Field(default="", max_length=8000)
    context: dict = Field(default_factory=dict)
    url: str = Field(default="", max_length=500)
    user_agent: str = Field(default="", max_length=500)


class MapErrorLogEntry(BaseModel):
    id: str
    code: str
    level: Literal["error", "warn", "info"]
    source: str
    message: str
    stack: str = ""
    context: dict = Field(default_factory=dict)
    url: str = ""
    user_agent: str = ""
    user_id: str | None = None
    user_email: str | None = None
    created_at: datetime


# ---------------------------------------------------------------------------
# Auth storage + seeding
# ---------------------------------------------------------------------------

# SQLite-backed persistent user store (replaces the former _users dict)
user_repo: UserRepository = get_user_repository()

# In-memory stores (static/ephemeral — no persistence needed)
_ebt_records: dict[str, SimulatedEBTRecord] = {}
_login_archive: list[LoginAuditEntry] = []
_map_error_archive: list[MapErrorLogEntry] = []
_auth_lock = threading.Lock()
_map_error_lock = threading.Lock()


def _hash_pw(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify_pw(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


# Brand-name → logo URL hints (non-blocking restaurant signup suggestion)
_BRAND_LOGOS: dict[str, str] = {
    "wholefoods": "https://logo.clearbit.com/wholefoodsmarket.com",
    "chipotle": "https://logo.clearbit.com/chipotle.com",
    "panera": "https://logo.clearbit.com/panerabread.com",
    "sweetgreen": "https://logo.clearbit.com/sweetgreen.com",
    "freshmarket": "https://logo.clearbit.com/thefreshmarket.com",
}


def _suggest_logo(name: str) -> str:
    """Return a logo URL hint when the restaurant name matches a known brand."""
    slug = name.lower().replace(" ", "").replace("'", "").replace("-", "")
    for brand, url in _BRAND_LOGOS.items():
        if brand in slug or slug in brand:
            return url
    return ""


def _seed_users() -> None:
    """Populate default demo accounts into user_repo (idempotent — skips existing)."""
    defaults = [
        {"id": "admin-001",     "name": "Admin User",      "email": "admin@mealmatch.dev",      "password": "Admin1234!",   "role": "admin",      "ebt_verified": False, "ebt_last4": ""},
        {"id": "rest-001",      "name": "Demo Restaurant", "email": "restaurant@mealmatch.dev", "password": "Restaurant1!", "role": "restaurant", "ebt_verified": False, "ebt_last4": ""},
        {"id": "recipient-001", "name": "Demo Recipient",  "email": "recipient@mealmatch.dev",  "password": "Recipient1!",  "role": "recipient",  "ebt_verified": True,  "ebt_last4": "1201"},
        {"id": "partner-001",   "name": "Demo Partner",    "email": "partner@mealmatch.dev",    "password": "Partner1234!", "role": "partner",    "ebt_verified": False, "ebt_last4": ""},
    ]
    for u in defaults:
        if user_repo.get_by_email(u["email"]) is not None:
            continue
        user = UserInDB(
            id=u["id"],
            name=u["name"],
            email=u["email"],
            role=u["role"],
            hashed_password=_hash_pw(u["password"]),
            ebt_verified=u["ebt_verified"],
            ebt_last4=u["ebt_last4"],
        )
        user_repo.save(user.model_dump())


_seed_users()


def _seed_ebt_records() -> None:
    defaults = [
        {"allowed_email": "recipient@mealmatch.dev",       "card_number": "6001000000001201", "pin": "2468", "label": "Seeded demo recipient"},
        {"allowed_email": "alex.recipient@mealmatch.dev",  "card_number": "6001000000002202", "pin": "1357", "label": "Simulated signup recipient"},
        {"allowed_email": "sam.recipient@mealmatch.dev",   "card_number": "6001000000003303", "pin": "8642", "label": "Simulated signup recipient"},
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
        logo_url=user.logo_url,
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


def _archive_map_error(
    *,
    payload: MapErrorReport,
    user: UserInDB | None,
) -> MapErrorLogEntry:
    entry = MapErrorLogEntry(
        id=str(uuid4()),
        code=payload.code,
        level=payload.level,
        source=payload.source,
        message=payload.message,
        stack=payload.stack,
        context=payload.context,
        url=payload.url,
        user_agent=payload.user_agent,
        user_id=user.id if user else None,
        user_email=user.email if user else None,
        created_at=datetime.now(timezone.utc),
    )
    with _map_error_lock:
        _map_error_archive.append(entry)
        if len(_map_error_archive) > 500:
            del _map_error_archive[:-500]
    return entry


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
    user_dict = user_repo.get_by_id(user_id)
    if user_dict is None:
        raise HTTPException(
            status_code=401,
            detail={"code": "USER_NOT_FOUND", "message": "User account no longer exists"},
        )
    return UserInDB(**user_dict)


def get_optional_user(token: str | None = Depends(oauth2_scheme)) -> UserInDB | None:
    """Best-effort current user resolution for telemetry endpoints."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            return None
    except Exception:
        return None
    user_dict = user_repo.get_by_id(user_id)
    return UserInDB(**user_dict) if user_dict else None


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
    if user_repo.get_by_email(email_key) is not None:
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
        logo_url=payload.logo_url,
    )
    user_repo.save(user.model_dump())

    logo_suggestion = (
        _suggest_logo(payload.name) if payload.role == "restaurant" and not payload.logo_url
        else ""
    )

    response_data: dict = {
        "access_token": _create_token(user),
        "token_type": "bearer",
        "user": _user_public(user),
    }
    if logo_suggestion:
        response_data["logo_suggestion"] = logo_suggestion

    return ok_created(response_data, "Account created successfully")


@app.post("/api/v1/auth/login")
def login(payload: UserLogin):
    user_dict = user_repo.get_by_email(payload.email.lower())
    user = UserInDB(**user_dict) if user_dict else None

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
        user = user.model_copy(
            update={"ebt_verified": True, "ebt_last4": _last4(payload.ebt_card_number)}
        )
        user_repo.save(user.model_dump())

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
MAX_BULK_CLAIM_QUANTITY = 50

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


class PickupSlotCreate(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    pickup_start: datetime
    pickup_end: datetime


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
    pickup_slots: list[dict] = []
    priority_window_end: datetime | None = None


class Claim(BaseModel):
    id: str
    listing_id: str
    user_id: str
    claimed_quantity: int
    claimed_at: datetime
    status: ClaimStatus
    slot_id: str | None = None
    group_name: str = ""
    contact_info: str = ""
    is_bulk: bool = False


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
    pickup_slots: list[PickupSlotCreate] = []
    priority_window_minutes: int = Field(default=0, ge=0)


class ClaimCreate(BaseModel):
    user_id: str
    claimed_quantity: int = Field(gt=0)
    slot_id: str | None = None


class BulkClaimCreate(BaseModel):
    user_id: str
    claimed_quantity: int = Field(gt=0, le=MAX_BULK_CLAIM_QUANTITY)
    slot_id: str | None = None
    group_name: str = Field(default="", max_length=100)
    contact_info: str = Field(default="", max_length=200)


class StatusUpdate(BaseModel):
    status: ListingStatus


class AdminStats(BaseModel):
    active_listings: int
    claimed_listings: int
    expired_listings: int
    total_claims: int
    meals_saved: int


# ---------------------------------------------------------------------------
# In-memory business storage
# ---------------------------------------------------------------------------

_claim_lock = threading.Lock()

_now = datetime.now(timezone.utc)


def _future(hours: float) -> datetime:
    return _now + timedelta(hours=hours)


listings: dict[str, Listing] = {
    "seed-1": Listing(
        id="seed-1", restaurant_id="rest-001",
        title="Leftover Pasta Bolognese",
        description="~20 portions of freshly made pasta bolognese. Pick up before close.",
        quantity=20, dietary_tags=["gluten", "dairy-free"],
        pickup_start=_now.replace(hour=18, minute=0, second=0, microsecond=0),
        pickup_end=_now.replace(hour=21, minute=0, second=0, microsecond=0),
        status=ListingStatus.active, created_at=_now,
    ),
    "seed-2": Listing(
        id="seed-2", restaurant_id="rest-002",
        title="Assorted Sandwiches",
        description="Individually wrapped turkey and veggie sandwiches, about 30 available.",
        quantity=30, dietary_tags=["vegetarian-option", "nut-free"],
        pickup_start=_now.replace(hour=15, minute=0, second=0, microsecond=0),
        pickup_end=_now.replace(hour=17, minute=30, second=0, microsecond=0),
        status=ListingStatus.active, created_at=_now,
    ),
    "seed-3": Listing(
        id="seed-3", restaurant_id="rest-001",
        title="Vegan Buddha Bowls",
        description="Grain bowls with roasted chickpeas, quinoa, and tahini. 12 portions.",
        quantity=12, dietary_tags=["vegan", "gluten-free", "nut-free"],
        pickup_start=_future(1), pickup_end=_future(3),
        status=ListingStatus.active, created_at=_now,
    ),
    "seed-4": Listing(
        id="seed-4", restaurant_id="rest-003",
        title="Halal Chicken Rice Boxes",
        description="Freshly cooked halal chicken over basmati. 8 individual boxes ready.",
        quantity=8, dietary_tags=["halal"],
        pickup_start=_future(0.5), pickup_end=_future(2),
        status=ListingStatus.active, created_at=_now,
    ),
    "seed-5": Listing(
        id="seed-5", restaurant_id="rest-002",
        title="Assorted Bakery Items",
        description="Day-old muffins, croissants, and loaves. About 40 items.",
        quantity=40, dietary_tags=["vegetarian", "contains_dairy"],
        pickup_start=_future(0.25), pickup_end=_future(1.5),
        status=ListingStatus.active, created_at=_now,
    ),
    "seed-6": Listing(
        id="seed-6", restaurant_id="rest-004",
        title="Mixed Salads — Catering Surplus",
        description="Caesar, Greek, and garden salads from a cancelled corporate order. 25 portions.",
        quantity=25, dietary_tags=["vegetarian", "gluten-free"],
        pickup_start=_future(1), pickup_end=_future(2.5),
        status=ListingStatus.active, created_at=_now,
        address="123 Campus Dr, College Park MD",
        location_name="Student Union Catering",
        lat=38.9872, lng=-76.9426,
    ),
    "seed-7": Listing(
        id="seed-7", restaurant_id="rest-001",
        title="Lentil Soup — Vegan",
        description="Large pot of red lentil soup with flatbreads. 15 servings.",
        quantity=15, dietary_tags=["vegan", "halal", "gluten-free"],
        pickup_start=_future(2), pickup_end=_future(4),
        status=ListingStatus.active, created_at=_now,
    ),
    "seed-8": Listing(
        id="seed-8", restaurant_id="rest-005",
        title="Sushi Platters",
        description="Surplus sushi rolls from lunch service — 6 platters, ~48 pieces each.",
        quantity=6, dietary_tags=["gluten-free"],
        pickup_start=_future(0.1), pickup_end=_future(0.75),
        status=ListingStatus.active, created_at=_now,
    ),

    # -----------------------------------------------------------------------
    # College Park, MD listings (seed-cp-1 through seed-cp-10)
    # -----------------------------------------------------------------------
    "seed-cp-1": Listing(
        id="seed-cp-1", restaurant_id="rest-001",
        title="Terp Tacos — Beef & Chicken",
        description="End-of-night surplus from our taco bar: seasoned beef, grilled chicken, salsa, tortillas. ~35 portions.",
        quantity=35, dietary_tags=["halal", "gluten"],
        pickup_start=_future(0.5), pickup_end=_future(2),
        status=ListingStatus.active, created_at=_now,
        address="7777 Baltimore Ave, College Park, MD 20740",
        location_name="Terp Taqueria",
        lat=38.9807, lng=-76.9369,
    ),
    "seed-cp-2": Listing(
        id="seed-cp-2", restaurant_id="rest-002",
        title="UMD Dining Hall Soup & Bread",
        description="Minestrone soup and assorted dinner rolls from South Campus Dining. 40 servings.",
        quantity=40, dietary_tags=["vegetarian", "contains_dairy"],
        pickup_start=_future(1), pickup_end=_future(3),
        status=ListingStatus.active, created_at=_now,
        address="3150 S Campus Dining Hall Dr, College Park, MD 20742",
        location_name="South Campus Dining",
        lat=38.9836, lng=-76.9446,
    ),
    "seed-cp-3": Listing(
        id="seed-cp-3", restaurant_id="rest-003",
        title="Halal Lamb Over Rice",
        description="Street-style halal lamb and white rice with white sauce. 18 portions left.",
        quantity=18, dietary_tags=["halal", "gluten-free"],
        pickup_start=_future(0.25), pickup_end=_future(1.75),
        status=ListingStatus.active, created_at=_now,
        address="8001 Baltimore Ave, College Park, MD 20740",
        location_name="Halal Cart at Route 1",
        lat=38.9815, lng=-76.9372,
    ),
    "seed-cp-4": Listing(
        id="seed-cp-4", restaurant_id="rest-004",
        title="Vegan Wraps & Smoothies",
        description="Leftover veggie wraps and unsold fruit smoothies from the market. 22 items.",
        quantity=22, dietary_tags=["vegan", "gluten-free", "nut-free"],
        pickup_start=_future(0.5), pickup_end=_future(2),
        status=ListingStatus.active, created_at=_now,
        address="7401 Baltimore Ave, College Park, MD 20740",
        location_name="The Greens Market",
        lat=38.9776, lng=-76.9361,
    ),
    "seed-cp-5": Listing(
        id="seed-cp-5", restaurant_id="rest-005",
        title="Korean BBQ Rice Bowls",
        description="Bulgogi and bibimbap bowls from today's lunch special. 14 portions remaining.",
        quantity=14, dietary_tags=["gluten"],
        pickup_start=_future(1.5), pickup_end=_future(3),
        status=ListingStatus.active, created_at=_now,
        address="8051 Baltimore Ave, College Park, MD 20740",
        location_name="Seoul Kitchen CP",
        lat=38.9821, lng=-76.9376,
    ),
    "seed-cp-6": Listing(
        id="seed-cp-6", restaurant_id="rest-001",
        title="Pizza Slices — Cheese & Veggie",
        description="Leftover pizza slices from a study session catering order. ~28 slices.",
        quantity=28, dietary_tags=["vegetarian", "contains_dairy", "gluten"],
        pickup_start=_future(0.1), pickup_end=_future(1),
        status=ListingStatus.active, created_at=_now,
        address="7315 Baltimore Ave, College Park, MD 20740",
        location_name="Campus Pizza Co.",
        lat=38.9763, lng=-76.9356,
    ),
    "seed-cp-7": Listing(
        id="seed-cp-7", restaurant_id="rest-002",
        title="Breakfast Burritos & Fruit Cups",
        description="Scrambled egg burritos with salsa and mixed fruit cups. 20 portions.",
        quantity=20, dietary_tags=["vegetarian", "gluten", "contains_dairy"],
        pickup_start=_future(0), pickup_end=_future(1.25),
        status=ListingStatus.active, created_at=_now,
        address="7516 Baltimore Ave, College Park, MD 20740",
        location_name="Morning Rush Café",
        lat=38.9789, lng=-76.9363,
    ),
    "seed-cp-8": Listing(
        id="seed-cp-8", restaurant_id="rest-003",
        title="Indian Curry — Chana Masala & Naan",
        description="Large tray of chana masala with garlic naan. Serves ~30.",
        quantity=30, dietary_tags=["vegan", "halal"],
        pickup_start=_future(2), pickup_end=_future(4),
        status=ListingStatus.active, created_at=_now,
        address="4519 Knox Rd, College Park, MD 20740",
        location_name="Spice Route Kitchen",
        lat=38.9852, lng=-76.9403,
    ),
    "seed-cp-9": Listing(
        id="seed-cp-9", restaurant_id="rest-004",
        title="Boxed Lunches — Alumni Event",
        description="Catered boxed lunches from UMD alumni luncheon. Turkey, veggie, and gluten-free options.",
        quantity=45, dietary_tags=["vegetarian-option", "gluten-free-option"],
        pickup_start=_future(0.5), pickup_end=_future(2.5),
        status=ListingStatus.active, created_at=_now,
        address="7801 Alumni Dr, College Park, MD 20742",
        location_name="Samuel Riggs IV Alumni Center",
        lat=38.9899, lng=-76.9445,
    ),
    "seed-cp-10": Listing(
        id="seed-cp-10", restaurant_id="rest-005",
        title="Cookies & Pastries — Bakery Closeout",
        description="Chocolate chip cookies, brownies, and croissants from end-of-day. ~50 items.",
        quantity=50, dietary_tags=["vegetarian", "contains_dairy", "gluten"],
        pickup_start=_future(0.25), pickup_end=_future(1.5),
        status=ListingStatus.active, created_at=_now,
        address="7400 Baltimore Ave, College Park, MD 20740",
        location_name="The Baked Terrapin",
        lat=38.9774, lng=-76.9360,
    ),

    # -----------------------------------------------------------------------
    # Greater DC-area listings (seed-dc-1 through seed-dc-30)
    # -----------------------------------------------------------------------
    "seed-dc-1": Listing(
        id="seed-dc-1", restaurant_id="rest-001",
        title="Grilled Salmon & Roasted Vegetables",
        description="Atlantic salmon fillets with seasonal roasted vegetables from tonight's service.",
        quantity=16, dietary_tags=["gluten-free", "dairy-free"],
        pickup_start=_future(1), pickup_end=_future(3),
        status=ListingStatus.active, created_at=_now,
        address="1250 H St NE, Washington, DC 20002",
        location_name="H Street Grille",
        lat=38.8997, lng=-76.9880,
    ),
    "seed-dc-2": Listing(
        id="seed-dc-2", restaurant_id="rest-002",
        title="Ethiopian Combo Platter",
        description="Injera with lentil stew, collard greens, and spiced chickpeas. 20 portions.",
        quantity=20, dietary_tags=["vegan", "gluten-free", "halal"],
        pickup_start=_future(0.5), pickup_end=_future(2),
        status=ListingStatus.active, created_at=_now,
        address="2201 Georgia Ave NW, Washington, DC 20001",
        location_name="Addis Market DC",
        lat=38.9201, lng=-77.0201,
    ),
    "seed-dc-3": Listing(
        id="seed-dc-3", restaurant_id="rest-003",
        title="BBQ Pulled Pork Sandwiches",
        description="Slow-cooked pulled pork on brioche buns. Includes coleslaw and pickles. 24 portions.",
        quantity=24, dietary_tags=["gluten"],
        pickup_start=_future(0.25), pickup_end=_future(1.5),
        status=ListingStatus.active, created_at=_now,
        address="3214 Georgia Ave NW, Washington, DC 20010",
        location_name="Smoke & Ember BBQ",
        lat=38.9356, lng=-77.0211,
    ),
    "seed-dc-4": Listing(
        id="seed-dc-4", restaurant_id="rest-004",
        title="Tomato Bisque & Grilled Cheese",
        description="Creamy tomato bisque and halved grilled cheese sandwiches. 18 meal combos.",
        quantity=18, dietary_tags=["vegetarian", "contains_dairy", "gluten"],
        pickup_start=_future(1), pickup_end=_future(2.5),
        status=ListingStatus.active, created_at=_now,
        address="1400 14th St NW, Washington, DC 20005",
        location_name="The Soup Spot NW",
        lat=38.9087, lng=-77.0317,
    ),
    "seed-dc-5": Listing(
        id="seed-dc-5", restaurant_id="rest-005",
        title="Pho & Spring Rolls",
        description="Beef pho broth with rice noodles and crispy spring rolls. 12 sets.",
        quantity=12, dietary_tags=["gluten-free"],
        pickup_start=_future(2), pickup_end=_future(4),
        status=ListingStatus.active, created_at=_now,
        address="6763 Wilson Blvd, Falls Church, VA 22044",
        location_name="Eden Center Pho House",
        lat=38.8734, lng=-77.1676,
    ),
    "seed-dc-6": Listing(
        id="seed-dc-6", restaurant_id="rest-001",
        title="Dim Sum Assortment",
        description="Leftover dim sum from weekend brunch — dumplings, bao, and turnip cakes. ~60 pieces.",
        quantity=60, dietary_tags=["contains_dairy"],
        pickup_start=_future(0.5), pickup_end=_future(2),
        status=ListingStatus.active, created_at=_now,
        address="418 H St NE, Washington, DC 20002",
        location_name="Lucky Star Dim Sum",
        lat=38.8989, lng=-77.0043,
    ),
    "seed-dc-7": Listing(
        id="seed-dc-7", restaurant_id="rest-002",
        title="Mediterranean Mezze Spread",
        description="Hummus, baba ganoush, falafel, and pita bread. Serves ~25.",
        quantity=25, dietary_tags=["vegan", "nut-free"],
        pickup_start=_future(0.1), pickup_end=_future(1.25),
        status=ListingStatus.active, created_at=_now,
        address="1120 19th St NW, Washington, DC 20036",
        location_name="Zaytinya Catering Overflow",
        lat=38.9034, lng=-77.0418,
    ),
    "seed-dc-8": Listing(
        id="seed-dc-8", restaurant_id="rest-003",
        title="Jerk Chicken & Rice and Peas",
        description="Traditional Jamaican jerk chicken with rice and peas. 22 portions.",
        quantity=22, dietary_tags=["gluten-free", "halal"],
        pickup_start=_future(1), pickup_end=_future(3),
        status=ListingStatus.active, created_at=_now,
        address="2916 Georgia Ave NW, Washington, DC 20001",
        location_name="Island Vibes Kitchen",
        lat=38.9312, lng=-77.0212,
    ),
    "seed-dc-9": Listing(
        id="seed-dc-9", restaurant_id="rest-004",
        title="Catered Conference Lunch",
        description="Assorted wraps, pasta salad, and mini desserts from a think-tank event.",
        quantity=38, dietary_tags=["vegetarian-option", "gluten-free-option"],
        pickup_start=_future(0.5), pickup_end=_future(2),
        status=ListingStatus.active, created_at=_now,
        address="1775 Eye St NW, Washington, DC 20006",
        location_name="Brookings Event Catering",
        lat=38.9006, lng=-77.0427,
    ),
    "seed-dc-10": Listing(
        id="seed-dc-10", restaurant_id="rest-005",
        title="Soba Noodle Bowls",
        description="Cold soba with dashi broth, tofu, scallions, and nori. 10 portions.",
        quantity=10, dietary_tags=["vegan", "gluten-free"],
        pickup_start=_future(1.5), pickup_end=_future(3),
        status=ListingStatus.active, created_at=_now,
        address="1512 Connecticut Ave NW, Washington, DC 20036",
        location_name="Noodle & Miso DC",
        lat=38.9143, lng=-77.0457,
    ),
    "seed-dc-11": Listing(
        id="seed-dc-11", restaurant_id="rest-001",
        title="Roast Turkey Dinner Plates",
        description="Sliced roast turkey with mashed potatoes and gravy, green beans. 15 plates.",
        quantity=15, dietary_tags=["gluten"],
        pickup_start=_future(0.5), pickup_end=_future(2),
        status=ListingStatus.active, created_at=_now,
        address="8711 Georgia Ave, Silver Spring, MD 20910",
        location_name="Silver Spring Bistro",
        lat=38.9967, lng=-77.0271,
    ),
    "seed-dc-12": Listing(
        id="seed-dc-12", restaurant_id="rest-002",
        title="Bagels & Cream Cheese",
        description="Assorted bagels (plain, everything, sesame) with cream cheese and lox spread. ~50 bagels.",
        quantity=50, dietary_tags=["vegetarian", "contains_dairy", "gluten"],
        pickup_start=_future(0), pickup_end=_future(1),
        status=ListingStatus.active, created_at=_now,
        address="930 Bonifant St, Silver Spring, MD 20910",
        location_name="Bagel Place Silver Spring",
        lat=38.9939, lng=-77.0292,
    ),
    "seed-dc-13": Listing(
        id="seed-dc-13", restaurant_id="rest-003",
        title="Pupusas & Curtido",
        description="Cheese and loroco pupusas with fermented cabbage slaw. 32 pupusas.",
        quantity=32, dietary_tags=["vegetarian", "contains_dairy", "gluten"],
        pickup_start=_future(1), pickup_end=_future(3),
        status=ListingStatus.active, created_at=_now,
        address="8149 Fenton St, Silver Spring, MD 20910",
        location_name="La Pupuseria Salvadoreña",
        lat=38.9924, lng=-77.0276,
    ),
    "seed-dc-14": Listing(
        id="seed-dc-14", restaurant_id="rest-004",
        title="Loaded Baked Potato Bar",
        description="Baked potatoes with toppings bar: sour cream, cheddar, broccoli, bacon bits. 20 portions.",
        quantity=20, dietary_tags=["vegetarian-option", "gluten-free", "contains_dairy"],
        pickup_start=_future(0.5), pickup_end=_future(2),
        status=ListingStatus.active, created_at=_now,
        address="12276 Rockville Pike, Rockville, MD 20852",
        location_name="The Spud Shack Rockville",
        lat=39.0570, lng=-77.1236,
    ),
    "seed-dc-15": Listing(
        id="seed-dc-15", restaurant_id="rest-005",
        title="Crepes — Sweet & Savory",
        description="Buckwheat galettes (ham/gruyere) and dessert crepes (Nutella). 30 pieces total.",
        quantity=30, dietary_tags=["vegetarian-option", "contains_dairy", "gluten"],
        pickup_start=_future(0.25), pickup_end=_future(1.5),
        status=ListingStatus.active, created_at=_now,
        address="7711 Woodmont Ave, Bethesda, MD 20814",
        location_name="Le Crêpe Bethesda",
        lat=38.9836, lng=-77.0970,
    ),
    "seed-dc-16": Listing(
        id="seed-dc-16", restaurant_id="rest-001",
        title="Chili & Cornbread",
        description="Hearty beef and bean chili with jalapeño cornbread muffins. 28 portions.",
        quantity=28, dietary_tags=["gluten"],
        pickup_start=_future(1), pickup_end=_future(3),
        status=ListingStatus.active, created_at=_now,
        address="4860 Rugby Ave, Bethesda, MD 20814",
        location_name="Firehouse Chili Co.",
        lat=38.9784, lng=-77.0942,
    ),
    "seed-dc-17": Listing(
        id="seed-dc-17", restaurant_id="rest-002",
        title="Tofu & Vegetable Stir Fry",
        description="Pan-fried tofu with bok choy, snap peas, and ginger soy sauce over brown rice.",
        quantity=18, dietary_tags=["vegan", "gluten-free"],
        pickup_start=_future(2), pickup_end=_future(4),
        status=ListingStatus.active, created_at=_now,
        address="5765 Burke Centre Pkwy, Burke, VA 22015",
        location_name="Green Wok VA",
        lat=38.7887, lng=-77.2750,
    ),
    "seed-dc-18": Listing(
        id="seed-dc-18", restaurant_id="rest-003",
        title="Lobster Bisque & Crab Cakes",
        description="Premium surplus from Saturday dinner service — rich bisque and pan-seared crab cakes.",
        quantity=10, dietary_tags=["gluten", "contains_dairy"],
        pickup_start=_future(0.5), pickup_end=_future(1.5),
        status=ListingStatus.active, created_at=_now,
        address="301 Water St SE, Washington, DC 20003",
        location_name="The Wharf Seafood Co.",
        lat=38.8756, lng=-77.0193,
    ),
    "seed-dc-19": Listing(
        id="seed-dc-19", restaurant_id="rest-004",
        title="Falafel Pita Wraps",
        description="Crispy falafel, tzatziki, tomatoes, and cucumber in warm pita. 26 wraps.",
        quantity=26, dietary_tags=["vegetarian", "nut-free"],
        pickup_start=_future(0.5), pickup_end=_future(2.5),
        status=ListingStatus.active, created_at=_now,
        address="2100 P St NW, Washington, DC 20037",
        location_name="Falafel Kingdom DuPont",
        lat=38.9107, lng=-77.0480,
    ),
    "seed-dc-20": Listing(
        id="seed-dc-20", restaurant_id="rest-005",
        title="Chicken Tikka Masala & Naan",
        description="Rich chicken tikka masala with basmati rice and garlic naan. 20 portions.",
        quantity=20, dietary_tags=["gluten", "contains_dairy", "halal"],
        pickup_start=_future(1), pickup_end=_future(3),
        status=ListingStatus.active, created_at=_now,
        address="327 8th St NE, Washington, DC 20002",
        location_name="Spice Garden NE",
        lat=38.8938, lng=-76.9965,
    ),
    "seed-dc-21": Listing(
        id="seed-dc-21", restaurant_id="rest-001",
        title="Mac & Cheese — Event Surplus",
        description="Creamy baked mac and cheese from a birthday party catering. ~40 portions.",
        quantity=40, dietary_tags=["vegetarian", "contains_dairy", "gluten"],
        pickup_start=_future(0.25), pickup_end=_future(2),
        status=ListingStatus.active, created_at=_now,
        address="4601 Connecticut Ave NW, Washington, DC 20008",
        location_name="Connecticut Ave Events",
        lat=38.9441, lng=-77.0773,
    ),
    "seed-dc-22": Listing(
        id="seed-dc-22", restaurant_id="rest-002",
        title="Gyros & Greek Salad",
        description="Lamb and chicken gyros with tzatziki, plus side Greek salads. 18 portions.",
        quantity=18, dietary_tags=["gluten", "contains_dairy"],
        pickup_start=_future(1), pickup_end=_future(3),
        status=ListingStatus.active, created_at=_now,
        address="8661 Colesville Rd, Silver Spring, MD 20910",
        location_name="Athens Grille Silver Spring",
        lat=38.9954, lng=-77.0245,
    ),
    "seed-dc-23": Listing(
        id="seed-dc-23", restaurant_id="rest-003",
        title="Vegetarian Moussaka",
        description="Eggplant and lentil moussaka with béchamel topping. 14 portions.",
        quantity=14, dietary_tags=["vegetarian", "contains_dairy", "gluten-free"],
        pickup_start=_future(2), pickup_end=_future(4),
        status=ListingStatus.active, created_at=_now,
        address="7929 Wisconsin Ave, Bethesda, MD 20814",
        location_name="Bethesda Greek Taverna",
        lat=38.9855, lng=-77.0963,
    ),
    "seed-dc-24": Listing(
        id="seed-dc-24", restaurant_id="rest-004",
        title="Cuban Sandwiches & Plantains",
        description="Pressed Cuban sandwiches and fried sweet plantains. 22 combos.",
        quantity=22, dietary_tags=["gluten"],
        pickup_start=_future(0.5), pickup_end=_future(2),
        status=ListingStatus.active, created_at=_now,
        address="3176 Bladensburg Rd NE, Washington, DC 20018",
        location_name="Havana Nights Kitchen",
        lat=38.9122, lng=-76.9705,
    ),
    "seed-dc-25": Listing(
        id="seed-dc-25", restaurant_id="rest-005",
        title="Miso Ramen & Karaage Chicken",
        description="Rich miso ramen with soft-boiled egg and Japanese fried chicken. 8 sets.",
        quantity=8, dietary_tags=["gluten"],
        pickup_start=_future(1.5), pickup_end=_future(3),
        status=ListingStatus.active, created_at=_now,
        address="5185 MacArthur Blvd NW, Washington, DC 20016",
        location_name="Sakura Ramen NW",
        lat=38.9392, lng=-77.1068,
    ),
    "seed-dc-26": Listing(
        id="seed-dc-26", restaurant_id="rest-001",
        title="Jambalaya — Catering Surplus",
        description="New Orleans-style jambalaya with andouille sausage, shrimp, and rice. 30 portions.",
        quantity=30, dietary_tags=["gluten-free"],
        pickup_start=_future(0.5), pickup_end=_future(2),
        status=ListingStatus.active, created_at=_now,
        address="1310 U St NW, Washington, DC 20009",
        location_name="Bayou Bites U Street",
        lat=38.9167, lng=-77.0302,
    ),
    "seed-dc-27": Listing(
        id="seed-dc-27", restaurant_id="rest-002",
        title="Veggie Burgers & Sweet Potato Fries",
        description="Plant-based burgers on brioche buns with lettuce, tomato, and aioli. 20 meals.",
        quantity=20, dietary_tags=["vegan", "gluten"],
        pickup_start=_future(0.25), pickup_end=_future(1.5),
        status=ListingStatus.active, created_at=_now,
        address="4910 Wisconsin Ave NW, Washington, DC 20016",
        location_name="The Green Counter NW",
        lat=38.9498, lng=-77.0852,
    ),
    "seed-dc-28": Listing(
        id="seed-dc-28", restaurant_id="rest-003",
        title="Pierogi & Kielbasa Plate",
        description="Potato and cheese pierogi with grilled kielbasa and sautéed onions. 24 plates.",
        quantity=24, dietary_tags=["contains_dairy", "gluten"],
        pickup_start=_future(1), pickup_end=_future(3),
        status=ListingStatus.active, created_at=_now,
        address="7600 Georgia Ave NW, Washington, DC 20012",
        location_name="Polka Dot Kitchen",
        lat=38.9754, lng=-77.0260,
    ),
    "seed-dc-29": Listing(
        id="seed-dc-29", restaurant_id="rest-004",
        title="Moroccan Tagine with Couscous",
        description="Lamb and apricot tagine over fluffy couscous with harissa on the side. 16 portions.",
        quantity=16, dietary_tags=["gluten", "halal"],
        pickup_start=_future(2), pickup_end=_future(4),
        status=ListingStatus.active, created_at=_now,
        address="2134 Columbia Rd NW, Washington, DC 20009",
        location_name="Marrakesh Table",
        lat=38.9247, lng=-77.0417,
    ),
    "seed-dc-30": Listing(
        id="seed-dc-30", restaurant_id="rest-005",
        title="Breakfast Buffet Takeaway",
        description="Scrambled eggs, turkey bacon, hash browns, and fruit salad from a morning meeting.",
        quantity=35, dietary_tags=["gluten-free", "dairy-free"],
        pickup_start=_future(0), pickup_end=_future(0.75),
        status=ListingStatus.active, created_at=_now,
        address="1100 Wilson Blvd, Arlington, VA 22209",
        location_name="Rosslyn Conference Center",
        lat=38.8962, lng=-77.0724,
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
    ms, reasons = _match_score(listing)
    d["match_score"] = ms
    d["match_reasons"] = reasons
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
    slot_dicts = [
        {"id": str(uuid4()), "label": s.label,
         "pickup_start": s.pickup_start.isoformat(), "pickup_end": s.pickup_end.isoformat()}
        for s in payload.pickup_slots
    ]
    priority_window_end = (
        datetime.now(timezone.utc) + timedelta(minutes=payload.priority_window_minutes)
        if payload.priority_window_minutes > 0 else None
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
        pickup_slots=slot_dicts,
        priority_window_end=priority_window_end,
    )
    listings[listing.id] = listing
    return ok_created(_to_response_dict(listing), "Listing created successfully")


@app.post("/api/v1/listings/{listing_id}/claim")
def claim_listing(
    listing_id: str,
    payload: ClaimCreate,
    current_user: UserInDB = Depends(require_roles("recipient", "admin", "partner")),
):
    with _claim_lock:
        listing = listings.get(listing_id)
        if not listing:
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Listing not found"})
        _expire_listings()
        listing = listings[listing_id]

        if listing.status != ListingStatus.active:
            raise HTTPException(
                status_code=409,
                detail={"code": "UNCLAIMABLE_STATUS",
                        "message": f"Listing cannot be claimed — current status: '{listing.status.value}'"},
            )

        # Priority window: only partners/admins can claim before it expires
        now = datetime.now(timezone.utc)
        if (
            listing.priority_window_end is not None
            and now < listing.priority_window_end
            and current_user.role not in ("partner", "admin")
        ):
            mins_left = int((listing.priority_window_end - now).total_seconds() / 60)
            raise HTTPException(
                status_code=403,
                detail={"code": "PRIORITY_WINDOW_ACTIVE",
                        "message": f"This listing is in a partner-only priority window for {mins_left} more minute(s)"},
            )

        already_claimed = any(
            c.user_id == payload.user_id and c.listing_id == listing_id and c.status == "confirmed"
            for c in claims.values()
        )
        if already_claimed:
            raise HTTPException(status_code=409, detail={"code": "ALREADY_CLAIMED", "message": "You have already claimed this listing"})

        if listing.pickup_slots:
            valid_slot_ids = {s["id"] for s in listing.pickup_slots}
            if not payload.slot_id or payload.slot_id not in valid_slot_ids:
                raise HTTPException(
                    status_code=422,
                    detail={"code": "SLOT_REQUIRED", "message": "A valid pickup slot must be selected for this listing"},
                )
        if payload.claimed_quantity > MAX_CLAIM_QUANTITY:
            raise HTTPException(
                status_code=422,
                detail={"code": "OVER_QUANTITY", "message": f"Cannot claim more than {MAX_CLAIM_QUANTITY} items per request"},
            )
        if payload.claimed_quantity > listing.quantity:
            raise HTTPException(
                status_code=422,
                detail={"code": "OVER_QUANTITY", "message": f"Requested quantity exceeds available ({listing.quantity} remaining)"},
            )
        claim = Claim(
            id=str(uuid4()),
            listing_id=listing_id,
            user_id=payload.user_id,
            claimed_quantity=payload.claimed_quantity,
            claimed_at=datetime.now(timezone.utc),
            status="confirmed",
            slot_id=payload.slot_id,
        )
        claims[claim.id] = claim
        new_quantity = listing.quantity - payload.claimed_quantity
        updated = listing.model_copy(update={"quantity": new_quantity, "status": ListingStatus.claimed})
        listings[listing_id] = updated
        return ok(_listing_dict(updated), "Listing claimed successfully")


@app.post("/api/v1/listings/{listing_id}/bulk-claim")
def bulk_claim_listing(
    listing_id: str,
    payload: BulkClaimCreate,
    current_user: UserInDB = Depends(require_roles("partner", "admin")),
):
    """
    Partner/admin bulk claim (up to 50 items). Stores group_name + contact_info
    for coordinated community pickup logistics.
    """
    with _claim_lock:
        listing = listings.get(listing_id)
        if not listing:
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Listing not found"})
        _expire_listings()
        listing = listings[listing_id]

        if listing.status != ListingStatus.active:
            raise HTTPException(
                status_code=409,
                detail={"code": "UNCLAIMABLE_STATUS",
                        "message": f"Listing cannot be claimed — current status: '{listing.status.value}'"},
            )
        already_claimed = any(
            c.user_id == payload.user_id and c.listing_id == listing_id and c.status == "confirmed"
            for c in claims.values()
        )
        if already_claimed:
            raise HTTPException(status_code=409, detail={"code": "ALREADY_CLAIMED", "message": "This partner has already claimed this listing"})

        if listing.pickup_slots:
            valid_slot_ids = {s["id"] for s in listing.pickup_slots}
            if not payload.slot_id or payload.slot_id not in valid_slot_ids:
                raise HTTPException(status_code=422, detail={"code": "SLOT_REQUIRED", "message": "A valid pickup slot must be selected"})

        if payload.claimed_quantity > listing.quantity:
            raise HTTPException(
                status_code=422,
                detail={"code": "OVER_QUANTITY", "message": f"Requested quantity exceeds available ({listing.quantity} remaining)"},
            )
        claim = Claim(
            id=str(uuid4()),
            listing_id=listing_id,
            user_id=payload.user_id,
            claimed_quantity=payload.claimed_quantity,
            claimed_at=datetime.now(timezone.utc),
            status="confirmed",
            slot_id=payload.slot_id,
            group_name=payload.group_name,
            contact_info=payload.contact_info,
            is_bulk=True,
        )
        claims[claim.id] = claim
        updated = listing.model_copy(
            update={"quantity": listing.quantity - payload.claimed_quantity, "status": ListingStatus.claimed}
        )
        listings[listing_id] = updated
        return ok(
            {"claim": claim.model_dump(mode="json"), "listing": _listing_dict(updated)},
            "Bulk claim registered successfully",
        )


@app.patch("/api/v1/listings/{listing_id}/status")
def update_listing_status(
    listing_id: str,
    payload: StatusUpdate,
    current_user: UserInDB = Depends(require_roles("restaurant", "admin")),
):
    listing = listings.get(listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Listing not found"})
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
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Listing not found"})
    return ok(_listing_dict(listing), "Listing deleted successfully")


# ---------------------------------------------------------------------------
# Demand prediction  (restaurant / admin only)
# ---------------------------------------------------------------------------


@app.get("/api/v1/listings/{listing_id}/demand-prediction")
def get_demand_prediction(
    listing_id: str,
    _: UserInDB = Depends(require_roles("restaurant", "admin")),
):
    listing = listings.get(listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Listing not found"})
    prediction = predict_demand(listing)
    return ok(prediction.to_dict(), "Demand prediction generated")


# ---------------------------------------------------------------------------
# Claims
# ---------------------------------------------------------------------------


@app.get("/api/v1/claims")
def get_claims(_: UserInDB = Depends(require_roles("admin"))):
    return ok([c.model_dump(mode="json") for c in claims.values()])


@app.get("/api/v1/my-claims")
def get_my_claims(current_user: UserInDB = Depends(require_roles("recipient", "admin", "partner"))):
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
    current_user: UserInDB = Depends(require_roles("recipient", "admin", "partner")),
):
    """Cancel a confirmed claim. Restores listing quantity; revives 'claimed' listings to 'active'."""
    claim = claims.get(claim_id)
    if not claim:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Claim not found"})
    if current_user.role != "admin" and claim.user_id != current_user.id:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "You can only cancel your own claims"})
    if claim.status != "confirmed":
        raise HTTPException(
            status_code=409,
            detail={"code": "NOT_CANCELLABLE",
                    "message": f"Only confirmed claims can be cancelled (current status: '{claim.status}')"},
        )
    with _claim_lock:
        updated_claim = claim.model_copy(update={"status": "cancelled"})
        claims[claim_id] = updated_claim
        listing = listings.get(claim.listing_id)
        if listing:
            restored_qty = listing.quantity + claim.claimed_quantity
            new_status = (
                ListingStatus.active if listing.status == ListingStatus.claimed else listing.status
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


@app.post("/api/v1/client-errors/map")
def log_map_client_error(
    payload: MapErrorReport,
    current_user: UserInDB | None = Depends(get_optional_user),
):
    """
    Receive map/runtime errors from the frontend so crashes can be diagnosed
    from backend logs even when browser console output is unavailable.
    """
    entry = _archive_map_error(payload=payload, user=current_user)

    # Choose log level to match what the client reported
    _log = {
        "warn": map_client_logger.warning,
        "info": map_client_logger.info,
    }.get(entry.level, map_client_logger.error)

    lines = [
        f"[map-client] {entry.code}  user={entry.user_id or 'anonymous'}",
        f"  source : {entry.source}",
        f"  message: {entry.message}",
    ]
    if entry.url:
        lines.append(f"  url    : {entry.url}")
    if entry.context:
        lines.append(f"  context: {entry.context}")
    if entry.stack:
        lines.append("  stack  :")
        for stack_line in entry.stack.splitlines():
            lines.append(f"    {stack_line}")

    _log("\n".join(lines))
    return ok({"logged": True, "id": entry.id}, "Map error logged")


@app.get("/api/v1/admin/map-errors")
def admin_get_map_errors(_: UserInDB = Depends(require_roles("admin"))):
    archived = [entry.model_dump(mode="json") for entry in reversed(_map_error_archive)]
    return ok(archived)


@app.get("/api/v1/admin/login-archive")
def admin_get_login_archive(_: UserInDB = Depends(require_roles("admin"))):
    archived = [entry.model_dump(mode="json") for entry in reversed(_login_archive)]
    return ok(archived)
