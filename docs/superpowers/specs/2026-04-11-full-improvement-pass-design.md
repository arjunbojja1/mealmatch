# MealMatch Full Improvement Pass — Design Spec
**Date:** 2026-04-11  
**Context:** Hackathon final push (10 hours to submission). Goal: demo-ready + resume-quality codebase covering all roles (recipient, restaurant, admin, partner).

---

## Section 1: Backend Security & Correctness

### 1.1 JWT Secret via Environment Variable
- Move `JWT_SECRET` to `os.getenv("JWT_SECRET", "mealmatch-dev-secret-change-before-production")`
- No local setup change required; production can override via env

### 1.2 Server-side User ID in Claims
- Remove `user_id` field from `ClaimCreate` and `BulkClaimCreate` schemas
- Inject authenticated user via `Depends(get_current_user)` in `POST /listings/{id}/claim` and `POST /listings/{id}/bulk-claim`
- Recipients cannot spoof claims on behalf of other users

### 1.3 Restaurant ID from Token
- Remove `restaurant_id` from `ListingCreate` schema
- Inject from authenticated restaurant/admin user's token in `POST /listings`
- Admin users creating listings must explicitly pass `restaurant_id` via a separate optional override field (admins can post on behalf of any restaurant)

### 1.4 Listings Persistence (SQLite)
- Add a `listings` table to the SQLite database using the same repository pattern as users
- Schema mirrors the `Listing` Pydantic model; `pickup_slots` stored as JSON blob
- `claims` table added alongside, replacing the in-memory `_claims` dict
- Seed data is inserted on startup (idempotent — skip if ID already exists), same pattern as `_seed_users()`
- Seed listings include realistic lat/lng coordinates so the map is populated immediately on demo

---

## Section 2: Bug Fixes

### 2.1 RecipientFeed Polling Memoization
- Wrap `fetchListings` in `useCallback` with stable deps
- Pass it as a dep to the `useEffect` that sets up the 15s interval
- Prevents stale closure and interval reset on every render

### 2.2 Claim Spinner Release Timing
- Release `claimingIds` spinner immediately after the API call resolves (success or error)
- Fire `fetchListings()` in the background (no `await`) so the card re-enables instantly
- Prevents the card being stuck in loading state for a full round-trip

### 2.3 MyClaimsPage — Nav Buttons on Past Claims
- Only render "Navigate to pickup" section when `claim.status === 'confirmed'`
- Past/cancelled claims show no nav buttons

### 2.4 SignupPage — Add Partner Role
- Add `partner` role option to the role selector with icon `🤝` and description "Coordinate bulk pickups for your organization"
- Backend already supports the `partner` role

### 2.5 Mobile Login Logo Alignment
- Remove conflicting inline `style={{ alignItems: 'center' }}` from the `mm-show-mobile` logo wrapper in `LoginPage.jsx`
- Let the CSS class handle display/alignment

### 2.6 Admin Dashboard — Eliminate `s.` Style Pattern
- Replace all `s.` inline style object references in `AdminDashboard.jsx` with `mm-*` class names
- Brings the component in line with the rest of the design system

---

## Section 3: UI/UX Polish

### 3.1 Header Role Pill
- Use the existing `ROLE_COLOR` map in `App.jsx` to color the user pill's background/border/text by role
- Admin → red, restaurant → blue, recipient → green, partner → purple

### 3.2 Browse Page Toolbar
- Convert `s.searchInput`, `s.toolbar`, `s.controls` inline styles to `mm-input` / `mm-*` classes
- Ensures visual consistency with form inputs on other pages

### 3.3 Restaurant Dashboard Form
- Add inline field validation feedback (red border + helper text) for required fields on submit attempt
- Group form sections with clear `<h3>` sub-headers: "Basic Info", "Pickup Window", "Location", "Pickup Slots"
- Show slot count badge next to "Pickup Slots" header
- No behavior change — visual and organization improvements only

### 3.4 Admin Dashboard Tab Indicators
- Active tab: green indicator using `--mm-success`
- Expired tab: amber indicator using `--mm-warning`
- Claimed tab: blue indicator using `--mm-info`
- Status badges in listings table made more visually distinct (colored dot + label)

### 3.5 Standardize Empty/Loading/Error States
- RecipientFeed, RestaurantDashboard, AdminDashboard all use `LoadingSkeleton`, `EmptyState`, `ErrorState` from `components/ui/EmptyState.jsx`
- RecipientFeed's loading state is custom inline HTML — replace with `LoadingSkeleton` (update the component to accept a `grid` prop for 3-column card skeletons to match the feed layout)
- Remove any one-off inline skeleton/empty implementations

### 3.6 RecipientFeed `s.` Style Object Elimination
- `RecipientFeed.jsx` has a ~200-line `const s = { ... }` inline style object (same pattern as AdminDashboard)
- Convert to `mm-*` design system classes: stats row uses `mm-stats-card`/`mm-stats-card-value`/`mm-stats-card-label` (already defined in CSS), listing cards use `mm-card`, info blocks use existing utility classes
- Add any missing utility classes to `index.css` as needed

### 3.7 PartnerPage Notification Bug + Polish
- Bug: notification state uses `msg` key but `Notification` component expects `message` — the workaround at line 221 is fragile; fix the state shape to use `message` directly
- Apply same `mm-*` polish pass: ensure error state uses `ErrorState` component, not inline alert
- `mm-label` vs `mm-field-label` inconsistency: PartnerPage and RestaurantDashboard use `mm-label`; Login/Signup use `mm-field-label`. Both classes exist in CSS. Standardize all form labels to `mm-field-label` since it's the more descriptive name and already used on auth pages.

### 3.8 HomePage Pillar Icons
- Replace the three identical `🌱` icons with distinct, relevant icons:
  - "Rescue surplus food" → `🥡`
  - "Match it fast" → `⚡`
  - "Strengthen local care" → `🤝`

---

## Section 4: Component Decomposition

### 4.1 `useNavigation` hook — extracted from `MealMap.jsx`
- **File:** `frontend/src/hooks/useNavigation.js`
- **Note:** `useNavigation` is already defined as a function inside `MealMap.jsx` (line ~203) — this is a file move, not a refactor. Lower risk than initially estimated.
- **Contains:** OSRM route fetching, navigation state machine (idle → navigating → arrived), step tracking, reroute logic, ETA calculation
- **Actual interface (from code):** `useNavigation({ mapRef, mapReady, logMapError, onNavigationStart })` → `{ navState, startNavigation, clearNav, changeMode, handleRecenter, setFollowUser }`
- `MealMap.jsx` calls this hook; map rendering, popups, markers, route layer remain in `MealMap.jsx`

### 4.2 `ListingCard` component — extracted from `RecipientFeed.jsx`
- **File:** `frontend/src/components/ListingCard.jsx`
- **Contains:** per-listing card UI — food visual, title, location, dietary tags, pickup window, quantity, slot selector, claim button
- **Props:** `listing`, `isClaiming`, `justClaimed`, `claimCount`, `slotSelection`, `onClaim`, `onCountChange`, `onSlotChange`, `onShowMap`
- `RecipientFeed.jsx` keeps feed-level state: filters, sorting, polling, map coordination, view mode

### 4.3 `ListingForm` component — extracted from `RestaurantDashboard.jsx`
- **File:** `frontend/src/components/ListingForm.jsx`
- **Contains:** the create-listing form with address autocomplete, dietary tag multi-select, pickup slot builder, all controlled form state
- **Props:** `onSubmit(formData)`, `isSubmitting`, `error`
- `RestaurantDashboard.jsx` keeps listings table, status management, demand predictions

### 4.4 Admin sub-components (co-located)
- Extract `LoginArchiveTable` and `ListingsTable` as named (non-exported) functions at the bottom of `AdminDashboard.jsx`
- No new files — keeps admin-only UI co-located while improving readability

---

## Section 5: Tests

### Frontend Test Setup
Install: `npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom`
Add to `frontend/vite.config.js`: `test: { environment: 'jsdom', setupFiles: ['./src/test/setup.js'] }`
Create `frontend/src/test/setup.js`: imports `@testing-library/jest-dom`

### 5.0 `frontend/src/utils/dietaryTags.test.js`
- `formatDietaryTag('vegan')` returns `'Vegan'`
- `formatDietaryTagWithIcon('halal')` includes the halal icon
- Unknown tag returns the raw string (graceful fallback)
- `normalizeDietaryTag('  Vegan  ')` normalizes to `'vegan'`

### 5.1 `frontend/src/components/ListingCard.test.jsx`
- Renders listing title and location
- Shows "Claimed" state (disabled button + neutral badge) when `justClaimed` is true
- Shows "Urgent" badge when `minutesLeft <= 30`
- Calls `onClaim` when "Reserve pickup" is clicked

### 5.2 `frontend/src/hooks/useNavigation.test.js`
- Unit test pure utility functions extracted alongside the hook: `formatDist`, `formatDuration`, `stepIcon`, `stepText`
- `formatDist(0)` → `'0 ft'`, `formatDist(1609)` → `'1.0 mi'`
- `formatDuration(90)` → `'2 min'`, `formatDuration(3660)` → `'1 hr 1 min'`
- `stepIcon({ type: 'arrive' })` → `'⚑'`

### Backend tests (no new dependencies)

All backend tests use `pytest` + `fastapi.testclient`.

### 5.1 `backend/tests/test_claims.py`
- Claiming a listing decrements quantity correctly
- Claiming more than available returns `OVER_QUANTITY` (409)
- Same user claiming the same listing twice returns `ALREADY_CLAIMED` (409)
- `user_id` comes from token, not request body (schema no longer has the field)
- Cancel claim restores listing quantity

### 5.2 `backend/tests/test_auth.py`
- Wrong password → `INVALID_CREDENTIALS` (401)
- Recipient login without EBT → `EBT_VERIFICATION_REQUIRED` (401)
- Expired token → `TOKEN_EXPIRED` (401)
- Restaurant creating listing → `restaurant_id` matches token, not client-supplied value

### 5.3 `backend/tests/test_listings.py`
- Seeded listings exist after repository reload (idempotent seed)
- `active → claimed` transition succeeds
- `claimed → active` transition is rejected (terminal state)
- Creating a listing as a non-restaurant user returns 403

---

## Files to Create
- `frontend/src/hooks/useNavigation.js` (moved from MealMap.jsx)
- `frontend/src/components/ListingCard.jsx`
- `frontend/src/components/ListingForm.jsx`
- `frontend/src/test/setup.js`
- `frontend/src/utils/dietaryTags.test.js`
- `frontend/src/components/ListingCard.test.jsx`
- `frontend/src/hooks/useNavigation.test.js`
- `backend/tests/test_claims.py`
- `backend/tests/test_auth.py`
- `backend/tests/test_listings.py`

## Files to Modify
- `backend/main.py` — JWT env var, remove user_id/restaurant_id from schemas, listings/claims persistence
- `frontend/src/api/client.js` — remove user_id param from claimListing / bulkClaim call signatures
- `frontend/vite.config.js` — add Vitest test config block
- `frontend/package.json` — add vitest + @testing-library devDependencies
- `backend/db/repository.py` — add ListingRepository + ClaimRepository (SQLite)
- `frontend/src/App.jsx` — role-colored header pill
- `frontend/src/components/MealMap.jsx` — extract useNavigation, keep rendering
- `frontend/src/components/RecipientFeed.jsx` — extract ListingCard, fix polling, fix spinner
- `frontend/src/RestaurantDashboard.jsx` — extract ListingForm, form UX improvements
- `frontend/src/AdminDashboard.jsx` — eliminate s. styles, extract sub-components, tab indicators
- `frontend/src/pages/MyClaimsPage.jsx` — nav buttons only on confirmed claims
- `frontend/src/pages/SignupPage.jsx` — add partner role
- `frontend/src/pages/LoginPage.jsx` — fix mobile logo alignment
- `frontend/src/pages/PartnerPage.jsx` — design system polish pass
- `frontend/src/pages/HomePage.jsx` — distinct pillar icons
- `frontend/src/index.css` — any missing utility classes needed by above changes

## Execution Order
1. Backend security + persistence (highest risk — do first, test immediately)
2. Bug fixes (fast wins)
3. Component decomposition (enables cleaner UI pass)
4. UI/UX polish (visible impact)
5. Tests (last — writes against the final API shape)
