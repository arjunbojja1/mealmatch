# Live Navigation — Design Spec
**Date:** 2026-04-11  
**Status:** Approved

---

## Overview

Implement Google-Maps-style live navigation in MealMap, including continuous GPS tracking, speed-based ETA, dynamic step advancement, auto-reroute, and transport-mode switching. My Claims can deep-link directly into navigation for a chosen mode.

---

## Architecture

### `useNavigation` hook (co-located in `MealMap.jsx`)

All navigation state and side-effects move out of the `MealMap` component body into a `useNavigation` hook. The hook is **not** in a separate file — it is tightly coupled to OSRM constants and map-internal helpers that live in the same module.

**Signature:**
```js
useNavigation({ mapRef, mapReady, logMapError })
  → { navState, startNavigation, clearNav, changeMode }
```

**`navState` shape:**
```js
{
  target:        listing | null,
  mode:          'driving' | 'walking' | 'bicycling' | 'transit',
  steps:         OsrmStep[],
  stepIdx:       number,
  routeCoords:   [lng, lat][],      // GeoJSON order
  summary:       { distance: number, duration: number } | null,
  userLoc:       { lat: number, lng: number } | null,
  distRemaining: number,            // metres, live from GPS
  etaSecs:       number | null,     // speed-based; null when stopped
  loading:       boolean,
  error:         string | null,
  rerouting:     boolean,           // true while auto-reroute is in flight
  arrived:       boolean,
  followUser:    boolean,
}
```

`MealMap` becomes a pure rendering shell: it reads `navState`, renders the direction panel and map layers, and exposes `startNavigation` via `useImperativeHandle`. No nav logic lives in the component body.

---

## Speed-Based ETA

A `speedSamplesRef` inside `useNavigation` holds a **ring buffer of the last 5** `{ distMetres, dtMs }` intervals, populated on each `watchPosition` callback.

```
rollingSpeed (m/s) = Σ(distMetres) / Σ(dtMs) * 1000
etaSecs = distRemaining / rollingSpeed
```

**Fallback:** if `rollingSpeed < 0.5 m/s` (user stopped or < 2 samples), fall back to the proportional OSRM estimate:

```
etaSecs = summary.duration * (distRemaining / summary.distance)
```

This prevents ∞ ETA when the user is stationary.

`distRemaining` is computed live: sum of step distances from `stepIdx` onward. When the user is mid-step, the partial distance walked in the current step is subtracted using `haversine(userLoc, nextStepManeuverLoc)`.

---

## Transport Mode Switching

`changeMode(newMode)` in the hook:

1. Immediately sets `loading = true`, clears `steps`, `stepIdx`, `summary`, `routeCoords` — direction panel shows "Calculating route…" with no stale data.
2. Updates `navMode` and `navModeRef` (for the reroute watcher).
3. Calls `fetchRoute(target, userLoc, newMode)`.
4. Resets `fitDoneRef` so the map re-fits bounds to the new route.

The mode button row in the UI reflects the active mode and is disabled while `loading`.

### Transit fallback
`transit` is selectable in the UI. OSRM maps it to `walking`. A notice banner — "🚌 Live transit data is unavailable — showing a walking route as a guide." — renders when `mode === 'transit'`. No error is thrown.

---

## My Claims → Auto-Start Navigation

### MyClaimsPage (no change needed)
`handleNavigate(listing, mode)` already navigates to `/browse` with:
```js
{ focusListingId: listing.id, autoNav: true, navMode: mode, source: 'my-claims' }
```

### RecipientFeed — pendingNav state machine

```
idle
  ↓  (route state has autoNav=true)
navIntentActive=true, pendingNavFiredRef=false
  ↓  (listings loaded, focusedListingId set)
pendingNavFiredRef=true, setTimeout(400ms)
  ↓  (timeout fires, mapRef.current verified)
startNavigation(listing, mode)  ← imperative call into MealMap
  ↓  (startNavigation resolves)
navIntentActive=false
```

**Safety net:** if `mapRef.current` is null when the timeout fires, retry up to 3 × 150ms before giving up silently (logs a `MAP_NAV_REF_MISSING` telemetry event).

**One-shot guarantee:** `pendingNavFiredRef.current = true` is set before the timeout, so re-renders from the 15s listing poll never re-fire.

**`navIntentActive`** is set to `false` only after `startNavigation` resolves (inside an `async` wrapper), not at the timeout callsite. This closes the window where `focusedId` could be briefly un-suppressed before nav state is established in MealMap.

---

## Bug Fixes Included

| Bug | Fix |
|-----|-----|
| Popup reopens after nav starts | `if (navTarget) return` guard in focusedId effect (already present; verified correct) |
| Popup flashes before auto-nav fires | `navIntentActive` withholds `focusedId` from MealMap until `startNavigation` resolves |
| Stale steps shown during mode switch | `changeMode` clears steps/summary before fetch |
| Double-map in `handleModeChange` | `changeMode` passes original `newMode` to `fetchRoute` (which does its own OSRM mapping) |
| Re-center crashes | Guards: `!mapReady`, `!mapRef.current`, `!validCoord` all checked before `flyTo` (already present; verified) |
| Auto-nav silent no-op if mapRef unset | Retry loop (3 × 150ms) with telemetry on failure |

---

## Navigation State Machine

```
idle
  → starting    (startNavigation called)
  → active      (route loaded, watchPosition running)
  → rerouting   (user deviated > 200m; new route fetched; returns to active)
  → arrived     (haversine(userLoc, dest) < 50m; banner shown)
  → ended       (user taps ✕; clearNav called)
```

Navigation **only ends** via explicit user action (✕ button). Arrival shows a banner but keeps the route visible.

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/components/MealMap.jsx` | Extract `useNavigation` hook; add speed-based ETA; fix `changeMode`; add rerouting state |
| `frontend/src/components/RecipientFeed.jsx` | Fix `navIntentActive` timing; add mapRef retry loop |
| `frontend/src/pages/MyClaimsPage.jsx` | No changes required |

---

## Testing

- `cd frontend && npm run lint`
- `cd frontend && npm run build`
- Manual checklist per spec (Drive/Walk/Bike/Transit from My Claims, mode switch mid-route, popup suppression, arrival banner, End nav)

---

## Known Limitations

- **Transit:** OSRM does not support transit routing. Transit mode shows a walking route with a clear notice. No third-party transit API is integrated.
- **Speed ETA:** requires ≥ 2 GPS samples to produce a speed estimate. First ETA shown uses the proportional OSRM fallback.
- **Geolocation accuracy:** browser GPS can drift ±20–50m indoors, which may trigger false reroutes. The 200m threshold and 50m moved-guard mitigate this but do not eliminate it.
- **No offline support:** route tiles and OSRM require network access.
