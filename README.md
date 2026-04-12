# MealMatch – Bitcamp 2026

A full-stack web platform that connects restaurants with surplus food to nearby communities, reducing food waste and improving same-day food access.

---

## Overview

MealMatch has four distinct user roles, each with a tailored interface:

| Role | What they do |
|------|-------------|
| **Restaurant** | Post surplus food listings with pickup windows, dietary tags, and geocoded addresses |
| **Recipient** | Browse active listings, claim food, track pickups on a live map |
| **Partner** | Bulk-claim up to 50 items per listing for shelters, pantries, or community orgs |
| **Admin** | Moderate all listings, view platform stats, inspect login audit logs |

---

## Features

### Authentication
- JWT-based auth (24-hour tokens, bcrypt password hashing)
- Role-aware signup: recipients must verify an EBT card number + PIN at registration
- EBT verification is re-checked on every login for recipient accounts
- Login audit log visible to admins (last 250 attempts)

### Food Listings (Restaurant)
- Post food with title, description, quantity, dietary tags, address, and pickup window
- Address autocomplete with lat/lng geocoding; previously used addresses are saved per session
- Optional pickup slots (labeled 10–15 minute windows with per-slot capacity)
- Optional partner-priority window: locks a listing to partners/admins for N minutes before general availability
- View own active, claimed, and expired listings with live status
- Demand prediction endpoint per listing (restaurant + admin)

### Browse Feed (Recipient)
- Live feed of active listings sorted by pickup deadline
- Smart match score: listings are ranked by proximity, dietary preferences, and urgency
- Filter by dietary tag (vegetarian, vegan, halal, gluten-free, etc.)
- Countdown timers with urgent warnings (< 30 minutes remaining)
- Claim 1–10 items; slot selection required when a listing has pickup slots
- Cancel claims from the My Claims page — restores quantity and revives the listing to active

### Interactive Map
- Leaflet-based map pinning all active listings by geocoordinates
- Turn-by-turn navigation with driving / walking / cycling / transit modes
- Real-time distance and ETA tracking using Haversine fallback when GPS is unavailable
- Map errors reported back to backend for remote diagnostics

### Partner Portal
- Bulk-claim up to 50 items in one request
- Group name and contact info fields for coordinated community pickup logistics
- First-claim lock: each partner can claim each listing once

### Admin Dashboard
- Platform stats: active / claimed / expired listing counts, total claims, meals saved
- Full listings table across all statuses with status override and delete controls
- Login archive: last 250 login attempts with success/failure, role, EBT info
- Map error log: client-side map crashes forwarded to backend for inspection

---

## Tech Stack

### Frontend
- React 19 + Vite
- React Router v6 (role-gated routes)
- Leaflet / react-leaflet for maps
- Custom `mm-*` CSS design system (CSS variables, dark theme, mobile-responsive)
- Vitest + Testing Library for unit tests
- ESLint with react-hooks and react-refresh rules

### Backend
- Python 3.13 + FastAPI
- PyJWT + bcrypt for auth
- SQLite for user persistence (`mealmatch_users.db`) and listing/claim persistence (`mealmatch_listings.db`)
- In-memory dicts as the hot-path store; SQLite as the write-through side-channel
- pytest + FastAPI TestClient for integration tests (isolated temp DB per test run)
- Uvicorn server

---

## Demo Accounts

These accounts are seeded at startup and always available:

| Email | Password | Role |
|-------|----------|------|
| `admin@mealmatch.dev` | `Admin1234!` | Admin |
| `restaurant@mealmatch.dev` | `Restaurant1!` | Restaurant |
| `recipient@mealmatch.dev` | `Recipient1!` | Recipient (EBT pre-verified) |
| `partner@mealmatch.dev` | `Partner1234!` | Partner |

Eight demo listings are seeded across College Park, MD and Washington, DC and refreshed on every server restart so pickup windows are never stale.

---

## Quick Start

### Prerequisites
- Node.js 20+ and npm 10+
- Python 3.13
- Pipenv (`pip install pipenv`)

### Backend

```bash
cd backend
pipenv install
pipenv run uvicorn main:app --reload
# API available at http://127.0.0.1:8000
# Swagger UI at  http://127.0.0.1:8000/docs
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# App available at http://localhost:5173
```

---

## API Reference

All business endpoints require a `Bearer` token obtained from `/api/v1/auth/login`.

```
POST /api/v1/auth/signup          Create account (EBT required for recipient role)
POST /api/v1/auth/login           Login, returns JWT
GET  /api/v1/auth/me              Current user profile

GET  /api/v1/listings             Active listings (smart-matched, sorted by deadline)
POST /api/v1/listings             Create listing (restaurant / admin)
POST /api/v1/listings/:id/claim   Claim a listing (recipient / admin / partner)
POST /api/v1/listings/:id/bulk-claim  Bulk claim up to 50 items (partner / admin)
PATCH /api/v1/listings/:id/status Update listing status (restaurant / admin)
DELETE /api/v1/listings/:id       Delete listing (admin)
GET  /api/v1/listings/:id/demand-prediction  Demand forecast (restaurant / admin)

GET  /api/v1/my-claims            Claims for the current user
DELETE /api/v1/claims/:id         Cancel a claim (own claims, or any for admin)

GET  /api/v1/admin/listings       All listings across all statuses (admin)
GET  /api/v1/admin/stats          Platform metrics (admin)
GET  /api/v1/admin/login-archive  Login audit log (admin)
GET  /api/v1/admin/map-errors     Frontend map error log (admin)

POST /api/v1/client-errors/map    Report a frontend map error to backend logs
GET  /health                      Health check
```

---

## Repository Structure

```
backend/
  main.py          FastAPI app, all routes, auth, business logic
  matching.py      Smart match scoring (proximity, dietary, urgency)
  prediction.py    Demand prediction model
  db/
    repository.py  SQLite-backed user store
  tests/
    conftest.py
    test_auth.py
    test_api_contract.py
    test_e2e_happy_path.py

frontend/
  src/
    App.jsx                  Router + role-aware shell + nav
    RestaurantDashboard.jsx  Listing management for restaurants
    AdminDashboard.jsx       Admin stats, listings table, audit logs
    pages/
      HomePage.jsx           Public landing page
      LoginPage.jsx
      SignupPage.jsx
      MyClaimsPage.jsx       Claim history + cancel for recipients
      PartnerPage.jsx        Bulk-claim interface for partners
    components/
      RecipientFeed.jsx      Live listing feed with map integration
      ListingCard.jsx        Individual listing card (claim UI)
      ListingForm.jsx        Create-listing form with address autocomplete
      MealMap.jsx            Leaflet map with navigation
      ui/                    Shared components (EmptyState, Notification, PageLayout, etc.)
    hooks/
      useNavigation.js       Map navigation logic (routing, distance, ETA)
    utils/
      dietaryTags.js         Tag formatting and icons
      listingUtils.js        Time/visual utilities for listing cards
    api/
      client.js              Typed API wrappers
    auth/
      AuthContext.jsx        JWT context provider
      useAuth.js
```

---

## Common Commands

```bash
# Frontend
npm run dev        # Start dev server
npm run build      # Production build
npm run lint       # ESLint
npm run test       # Vitest unit tests

# Backend
pipenv run uvicorn main:app --reload   # Dev server
pipenv run pytest tests/               # Integration tests
```
