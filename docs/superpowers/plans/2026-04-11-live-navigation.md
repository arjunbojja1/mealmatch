# Live Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor MealMap navigation logic into a `useNavigation` hook, add speed-based ETA, fix mode-switching stale state, and harden the My Claims → auto-start navigation flow.

**Architecture:** Extract all navigation state/refs/effects/callbacks from `MealMap` into a co-located `useNavigation` hook. MealMap becomes a rendering shell. RecipientFeed's `pendingNav` effect is fixed to set `navIntentActive=false` only after `startNavigation` resolves and gains a mapRef retry guard.

**Tech Stack:** React 18, react-map-gl, maplibre-gl, OSRM routing API, Browser Geolocation API.

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/components/MealMap.jsx` | Add `useNavigation` hook (co-located); add speed ETA + rerouting state; fix `changeMode`; simplify component body |
| `frontend/src/components/RecipientFeed.jsx` | Fix `navIntentActive` timing; add mapRef retry loop |
| `docs/superpowers/specs/2026-04-11-live-navigation-design.md` | Delete after implementation complete |

---

## Task 1: Add `useNavigation` hook to MealMap.jsx

**Files:**
- Modify: `frontend/src/components/MealMap.jsx`

Add the `useNavigation` hook between the `MarkerPin` component and the `MealMap` component. This hook takes over all navigation state, refs, and logic. The **constants, utility functions, and `MarkerPin`** at the top of the file stay exactly as they are — do not touch them.

- [ ] **Step 1.1: Insert the `useNavigation` hook above the `MealMap` forwardRef declaration**

Replace everything from `const MealMap = forwardRef(` onward with the new hook + updated component. The complete new code for the hook and component is below. Everything above `const MealMap = forwardRef(` (imports, constants, helpers, `MarkerPin`) **stays unchanged**.

```jsx
// ─── useNavigation hook ──────────────────────────────────────────────────────

function useNavigation({ mapRef, mapReady, logMapError, onNavigationStart }) {
  const mountedRef         = useRef(true)
  const watchIdRef         = useRef(null)
  const navTargetRef       = useRef(null)
  const navModeRef         = useRef('driving')
  const navStepsRef        = useRef([])
  const stepIdxRef         = useRef(0)
  const routeCoordsRef     = useRef(null)
  const isRecalcRef        = useRef(false)
  const lastRecalcLocRef   = useRef(null)
  const fitDoneRef         = useRef(false)
  const recenteringRef     = useRef(false)
  const speedSamplesRef    = useRef([])   // ring buffer [{ distMetres, dtMs }], max 5
  const lastLocRef         = useRef(null) // previous GPS { lat, lng }
  const lastLocTimeRef     = useRef(null) // ms timestamp of lastLocRef

  const [navTarget,    setNavTarget]    = useState(null)
  const [userLoc,      setUserLoc]      = useState(null)
  const [routeCoords,  setRouteCoords]  = useState([])
  const [navSteps,     setNavSteps]     = useState([])
  const [navSummary,   setNavSummary]   = useState(null)
  const [stepIdx,      setStepIdx]      = useState(0)
  const [navLoading,   setNavLoading]   = useState(false)
  const [navError,     setNavError]     = useState(null)
  const [followUser,   setFollowUser]   = useState(false)
  const [navMode,      setNavMode]      = useState('driving')
  const [rerouting,    setRerouting]    = useState(false)
  const [rollingSpeed, setRollingSpeed] = useState(null) // m/s; null when stopped

  // Mount / unmount — clear geolocation watch
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (watchIdRef.current != null) {
        navigator.geolocation?.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [])

  // Sync refs used inside async callbacks
  useEffect(() => { navStepsRef.current = navSteps }, [navSteps])
  useEffect(() => { navTargetRef.current = navTarget }, [navTarget])
  useEffect(() => { stepIdxRef.current = stepIdx }, [stepIdx])

  // Safe numeric location for navTarget (fixes string-coord bug)
  const navTargetLoc = useMemo(
    () => (navTarget ? safeLocation(navTarget) : null),
    [navTarget],
  )

  // Fit bounds once the initial route loads; then enable follow mode
  useEffect(() => {
    if (!routeCoords.length || !userLoc || !navTargetLoc || fitDoneRef.current) return
    if (!mapRef.current || !mapReady) return
    fitDoneRef.current = true
    try {
      mapRef.current.fitBounds(
        [
          [Math.min(userLoc.lng, navTargetLoc.lng), Math.min(userLoc.lat, navTargetLoc.lat)],
          [Math.max(userLoc.lng, navTargetLoc.lng), Math.max(userLoc.lat, navTargetLoc.lat)],
        ],
        { padding: 60, maxZoom: 17, duration: 800 },
      )
    } catch (e) {
      logMapError('Map fitBounds failed', {
        action: 'fit_bounds',
        has_user_loc: Boolean(userLoc),
        has_nav_target: Boolean(navTargetLoc),
        error: String(e?.message || e),
      }, 'warn', 'MAP_FIT_BOUNDS_FAILED')
    }
    const t = setTimeout(() => { if (mountedRef.current) setFollowUser(true) }, 900)
    return () => clearTimeout(t)
  }, [routeCoords, userLoc, navTargetLoc, mapReady, logMapError, mapRef])

  // Pan to user whenever location updates while following
  useEffect(() => {
    if (!followUser || !userLoc || !mapRef.current || !mapReady) return
    if (!validCoord(userLoc.lat, userLoc.lng)) return
    try {
      mapRef.current.flyTo({ center: [userLoc.lng, userLoc.lat], zoom: 17, duration: 700 })
    } catch (e) {
      logMapError('Map follow-user flyTo failed', {
        action: 'follow_user',
        error: String(e?.message || e),
      }, 'warn', 'MAP_FOLLOW_FAILED')
    }
  }, [followUser, userLoc, mapReady, logMapError, mapRef])

  // ── fetchRoute ──────────────────────────────────────────────────────────────
  const fetchRoute = useCallback(async (listing, fromLoc, mode) => {
    const destLoc = safeLocation(listing)
    if (!destLoc) {
      if (mountedRef.current) setNavError('Destination has no valid coordinates.')
      logMapError('Route fetch blocked: invalid destination coordinates', {
        action: 'fetch_route',
        listing_id: listing?.id || null,
      }, 'warn', 'MAP_INVALID_DESTINATION')
      return
    }
    if (!validCoord(fromLoc?.lat, fromLoc?.lng)) {
      if (mountedRef.current)
        setNavError('Your location could not be determined accurately.')
      logMapError('Route fetch blocked: invalid user coordinates', {
        action: 'fetch_route',
        from_location: fromLoc || null,
      }, 'warn', 'MAP_INVALID_USER_COORDS')
      return
    }

    const profile = OSRM_PROFILE[mode] ?? 'driving'
    const url =
      `${OSRM_BASE}/${profile}/` +
      `${fromLoc.lng},${fromLoc.lat};${destLoc.lng},${destLoc.lat}` +
      `?overview=full&geometries=geojson&steps=true`

    try {
      const res = await fetch(url)
      if (!mountedRef.current) return
      if (!res.ok) throw new Error('Routing service unavailable')
      const data = await res.json()
      if (!mountedRef.current) return
      if (data.code !== 'Ok' || !data.routes?.length)
        throw new Error('No route found between these points')

      const r = data.routes[0]
      const steps = r.legs?.[0]?.steps ?? []
      const raw = Array.isArray(r.geometry?.coordinates) ? r.geometry.coordinates : []
      const coords = raw.filter(
        (pt) =>
          Array.isArray(pt) &&
          pt.length >= 2 &&
          Number.isFinite(Number(pt[0])) &&
          Number.isFinite(Number(pt[1])),
      )

      if (mountedRef.current) {
        setRouteCoords(coords)
        routeCoordsRef.current = coords
        navStepsRef.current = steps
        setNavSteps(steps)
        setNavSummary({ distance: r.distance, duration: r.duration })
        setStepIdx(0)
        setNavError(null)
      }
    } catch (e) {
      if (mountedRef.current) setNavError(`Could not calculate a route. ${e.message}`)
      logMapError('Route calculation failed', {
        action: 'fetch_route',
        listing_id: listing?.id || null,
        mode,
        error: String(e?.message || e),
      }, 'error', 'MAP_ROUTE_FETCH_FAILED')
    }
  }, [logMapError])

  // ── startNavigation ─────────────────────────────────────────────────────────
  const startNavigation = useCallback(
    async (listing, mode = 'driving') => {
      if (!safeLocation(listing)) {
        setNavError('This listing has no map coordinates to navigate to.')
        setNavTarget(listing)
        logMapError('Navigation start blocked: listing missing coordinates', {
          action: 'start_navigation',
          listing_id: listing?.id || null,
        }, 'warn', 'MAP_NAV_NO_COORDS')
        return
      }

      if (!navigator.geolocation) {
        setNavError('Geolocation is not available. Please use HTTPS or a supported browser.')
        setNavTarget(listing)
        logMapError('Navigation start blocked: geolocation unavailable', {
          action: 'start_navigation',
          listing_id: listing?.id || null,
        }, 'warn', 'MAP_GEOLOCATION_UNAVAILABLE')
        return
      }

      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }

      navTargetRef.current = listing
      navModeRef.current = OSRM_PROFILE[mode] ?? 'walking'
      fitDoneRef.current = false
      isRecalcRef.current = false
      lastRecalcLocRef.current = null
      speedSamplesRef.current = []
      lastLocRef.current = null
      lastLocTimeRef.current = null

      setNavError(null)
      setNavLoading(true)
      setNavTarget(listing)
      setNavMode(mode)
      setRouteCoords([])
      setNavSteps([])
      setNavSummary(null)
      setStepIdx(0)
      setFollowUser(false)
      setRerouting(false)
      setRollingSpeed(null)

      // Close any open popup
      onNavigationStart?.()

      let pos
      try {
        pos = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 12000,
          }),
        )
      } catch (e) {
        if (!mountedRef.current) return
        setNavError(
          e.code === 1
            ? 'Location access was denied. Allow location in your browser settings and try again.'
            : 'Could not get your location. Check device settings and try again.',
        )
        logMapError('Initial geolocation fetch failed', {
          action: 'start_navigation',
          listing_id: listing?.id || null,
          geolocation_error_code: e?.code ?? null,
          error: String(e?.message || e),
        }, 'error', 'MAP_GEOLOCATION_FAILED')
        setNavLoading(false)
        return
      }

      if (!mountedRef.current) return

      const ul = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      if (!validCoord(ul.lat, ul.lng)) {
        setNavError('Received an invalid GPS position. Please try again.')
        logMapError('Initial GPS returned invalid coordinates', {
          action: 'start_navigation',
          listing_id: listing?.id || null,
          user_location: ul,
        }, 'warn', 'MAP_INVALID_GPS_POSITION')
        setNavLoading(false)
        return
      }

      setUserLoc(ul)
      lastRecalcLocRef.current = ul
      lastLocRef.current = ul
      lastLocTimeRef.current = Date.now()

      if (mapRef.current && mapReady) {
        try {
          mapRef.current.flyTo({ center: [ul.lng, ul.lat], zoom: 14, duration: 700 })
        } catch (e) {
          logMapError('Map flyTo failed after initial location', {
            action: 'start_navigation',
            listing_id: listing?.id || null,
            error: String(e?.message || e),
          }, 'warn', 'MAP_FLYTO_FAILED')
        }
      }

      await fetchRoute(listing, ul, mode)
      if (!mountedRef.current) return
      setNavLoading(false)

      watchIdRef.current = navigator.geolocation.watchPosition(
        (p) => {
          if (!mountedRef.current) return
          const loc = { lat: p.coords.latitude, lng: p.coords.longitude }
          if (!validCoord(loc.lat, loc.lng)) return

          // ── Speed sampling ─────────────────────────────────────────────────
          const now = Date.now()
          if (lastLocRef.current && lastLocTimeRef.current) {
            const d = haversine(lastLocRef.current.lat, lastLocRef.current.lng, loc.lat, loc.lng)
            const dt = now - lastLocTimeRef.current
            if (d > 0 && dt > 0) {
              const samples = speedSamplesRef.current
              if (samples.length >= 5) samples.shift()
              samples.push({ distMetres: d, dtMs: dt })
            }
          }
          lastLocRef.current = loc
          lastLocTimeRef.current = now

          // Rolling speed from ring buffer (updated as state so etaSecs memo re-fires)
          const samples = speedSamplesRef.current
          if (samples.length >= 2) {
            const td = samples.reduce((s, x) => s + x.distMetres, 0)
            const tt = samples.reduce((s, x) => s + x.dtMs, 0)
            const spd = (td / tt) * 1000 // m/s
            setRollingSpeed(spd >= 0.5 ? spd : null)
          } else {
            setRollingSpeed(null)
          }
          // ──────────────────────────────────────────────────────────────────

          setUserLoc(loc)

          // Step advancement
          setStepIdx((prev) => {
            const steps = navStepsRef.current
            if (prev >= steps.length - 1) return prev
            const next = steps[prev + 1]
            const nextLoc = next?.maneuver?.location
            if (!Array.isArray(nextLoc) || nextLoc.length < 2) return prev
            return haversine(loc.lat, loc.lng, nextLoc[1], nextLoc[0]) < STEP_ADVANCE_M
              ? prev + 1
              : prev
          })

          // Auto-reroute
          if (!isRecalcRef.current && routeCoordsRef.current) {
            const offDist = minDistToPolyline(routeCoordsRef.current, loc)
            const lastRecalc = lastRecalcLocRef.current
            const moved = lastRecalc
              ? haversine(loc.lat, loc.lng, lastRecalc.lat, lastRecalc.lng)
              : Infinity
            if (offDist > REROUTE_M && moved > 50 && navTargetRef.current) {
              isRecalcRef.current = true
              lastRecalcLocRef.current = loc
              setRerouting(true)
              fetchRoute(navTargetRef.current, loc, navModeRef.current).finally(() => {
                if (mountedRef.current) {
                  isRecalcRef.current = false
                  setRerouting(false)
                }
              })
            }
          }
        },
        (err) => {
          logMapError('watchPosition callback error', {
            action: 'watch_position',
            geolocation_error_code: err?.code ?? null,
            error: String(err?.message || err),
          }, 'error', 'MAP_WATCH_POSITION_FAILED')
        },
        { enableHighAccuracy: true, maximumAge: 2000 },
      )
    },
    [fetchRoute, mapReady, logMapError, onNavigationStart, mapRef],
  )

  // ── clearNav ────────────────────────────────────────────────────────────────
  const clearNav = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation?.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    fitDoneRef.current = false
    speedSamplesRef.current = []
    lastLocRef.current = null
    lastLocTimeRef.current = null
    setNavTarget(null)
    setUserLoc(null)
    setRouteCoords([])
    setNavSteps([])
    setNavSummary(null)
    setStepIdx(0)
    setNavError(null)
    setNavLoading(false)
    setFollowUser(false)
    setRerouting(false)
    setRollingSpeed(null)
  }, [])

  // ── changeMode ──────────────────────────────────────────────────────────────
  // Immediately clears stale route data so the panel shows "Calculating..." —
  // no stale steps remain visible while the new route is loading.
  const changeMode = useCallback(async (newMode) => {
    if (newMode === navMode || navLoading) return
    setNavMode(newMode)
    navModeRef.current = OSRM_PROFILE[newMode] ?? 'walking'
    // Clear stale data immediately
    setNavSteps([])
    setStepIdx(0)
    setNavSummary(null)
    setRouteCoords([])
    setNavError(null)
    setRollingSpeed(null)
    speedSamplesRef.current = []
    if (!navTarget || !userLoc) return
    fitDoneRef.current = false
    setNavLoading(true)
    await fetchRoute(navTarget, userLoc, newMode)
    if (mountedRef.current) setNavLoading(false)
  }, [navMode, navLoading, navTarget, userLoc, fetchRoute])

  // ── handleRecenter ──────────────────────────────────────────────────────────
  const handleRecenter = useCallback(() => {
    if (recenteringRef.current) return
    if (!mapReady || !mapRef.current) return
    if (!userLoc || !validCoord(userLoc.lat, userLoc.lng)) {
      setNavError('Coordinates unavailable. Cannot re-center map.')
      logMapError('Re-center blocked: invalid user coordinates', {
        action: 'recenter',
        user_location: userLoc || null,
      }, 'warn', 'MAP_RECENTER_INVALID_COORDS')
      return
    }
    recenteringRef.current = true
    setFollowUser(true)
    try {
      mapRef.current.flyTo({ center: [userLoc.lng, userLoc.lat], zoom: 17, duration: 600 })
    } catch (e) {
      logMapError('Map flyTo failed during re-center', {
        action: 'recenter',
        error: String(e?.message || e),
      }, 'warn', 'MAP_RECENTER_FAILED')
    }
    setTimeout(() => { recenteringRef.current = false }, 800)
  }, [mapReady, mapRef, userLoc, logMapError])

  // ── Derived values ───────────────────────────────────────────────────────────
  // distRemaining: live from GPS position relative to upcoming step maneuvers
  const distRemaining = useMemo(() => {
    if (!navSteps.length) return 0
    const nextManeuverLoc = navSteps[stepIdx + 1]?.maneuver?.location
    const distToNextTurn =
      Array.isArray(nextManeuverLoc) && nextManeuverLoc.length >= 2 && userLoc
        ? haversine(userLoc.lat, userLoc.lng, nextManeuverLoc[1], nextManeuverLoc[0])
        : (navSteps[stepIdx]?.distance ?? 0)
    return (
      distToNextTurn +
      navSteps.slice(stepIdx + 1).reduce((s, st) => s + (st?.distance ?? 0), 0)
    )
  }, [navSteps, stepIdx, userLoc])

  // etaSecs: speed-based when rollingSpeed is available, proportional OSRM fallback otherwise
  const etaSecs = useMemo(() => {
    if (rollingSpeed !== null && rollingSpeed >= 0.5 && distRemaining > 0) {
      return distRemaining / rollingSpeed
    }
    if (!navSummary) return null
    return navSummary.duration * (distRemaining / Math.max(navSummary.distance, 1))
  }, [rollingSpeed, distRemaining, navSummary])

  const arrived = useMemo(
    () =>
      navTargetLoc && userLoc
        ? haversine(userLoc.lat, userLoc.lng, navTargetLoc.lat, navTargetLoc.lng) < 50
        : false,
    [userLoc, navTargetLoc],
  )

  const navState = {
    target: navTarget,
    mode: navMode,
    steps: navSteps,
    stepIdx,
    routeCoords,
    summary: navSummary,
    userLoc,
    distRemaining,
    etaSecs,
    loading: navLoading,
    error: navError,
    rerouting,
    arrived,
    followUser,
  }

  return { navState, navTargetLoc, startNavigation, clearNav, changeMode, handleRecenter, setFollowUser }
}
```

- [ ] **Step 1.2: Replace the `MealMap` component body with the hook-driven version**

Replace from `const MealMap = forwardRef(` to `export default MealMap` with:

```jsx
const MealMap = forwardRef(function MealMap(
  {
    listings = [],
    focusedId = null,
    onListingClick,
    onClaim,
    claimingIds = new Set(),
    height = 560,
  },
  ref,
) {
  const mapRef = useRef(null)
  const [mapReady, setMapReady] = useState(false)
  const [popupId, setPopupId] = useState(null)

  const logMapError = useCallback(
    (message, context = {}, level = 'error', code = 'MAP_CLIENT_ERROR') => {
      reportMapError({ message, code, level, source: 'meal-map', context })
    },
    [],
  )

  const {
    navState,
    navTargetLoc,
    startNavigation,
    clearNav,
    changeMode,
    handleRecenter,
    setFollowUser,
  } = useNavigation({
    mapRef,
    mapReady,
    logMapError,
    onNavigationStart: () => setPopupId(null),
  })

  const {
    target: navTarget,
    mode: navMode,
    steps: navSteps,
    stepIdx,
    routeCoords,
    userLoc,
    distRemaining,
    etaSecs,
    loading: navLoading,
    error: navError,
    rerouting,
    arrived: isArrived,
    followUser,
  } = navState

  useImperativeHandle(ref, () => ({ startNavigation }), [startNavigation])

  const onMapLoad = useCallback(() => {
    if (mountedRef.current) setMapReady(true)
  }, [])
```

Wait — `mountedRef` is now inside `useNavigation`. The `onMapLoad` callback only needs to set `mapReady`, so it doesn't need `mountedRef`. Replace that line:

```jsx
  const onMapLoad = useCallback(() => { setMapReady(true) }, [])
```

Continuing the component:

```jsx
  // Listings filtered to those with valid numeric coords
  const withCoords = useMemo(
    () =>
      listings
        .map((listing) => {
          const location = safeLocation(listing)
          if (!location) return null
          return { ...listing, location }
        })
        .filter(Boolean),
    [listings],
  )

  // Clear popup when its listing disappears from the filtered set
  useEffect(() => {
    if (!popupId || withCoords.some((l) => l.id === popupId)) return
    setPopupId(null)
  }, [popupId, withCoords])

  // Fly to focused listing — skips camera move and popup during active navigation.
  useEffect(() => {
    if (!focusedId) return
    if (navTarget) return  // During active navigation, never auto-open popup
    setPopupId(focusedId)
    const listing = withCoords.find((l) => l.id === focusedId)
    if (!listing || !mapRef.current || !mapReady) return
    try {
      mapRef.current.flyTo({
        center: [listing.location.lng, listing.location.lat],
        zoom: 16,
        duration: 800,
      })
    } catch (e) {
      logMapError('Failed to focus listing on map', {
        action: 'focus_listing',
        listing_id: focusedId,
        error: String(e?.message || e),
      }, 'warn', 'MAP_FOCUS_FAILED')
    }
  }, [focusedId, withCoords, mapReady, logMapError, navTarget])

  // Derived display values for the direction panel
  const currentStep = navSteps[stepIdx]
  const nextStep    = navSteps[stepIdx + 1]
  const nextManeuverLoc = nextStep?.maneuver?.location
  const distToTurn =
    userLoc && Array.isArray(nextManeuverLoc) && nextManeuverLoc.length >= 2
      ? haversine(userLoc.lat, userLoc.lng, nextManeuverLoc[1], nextManeuverLoc[0])
      : null

  // Stable GeoJSON ref prevents MapLibre setData on every userLoc re-render
  const routeGeoJSON = useMemo(
    () => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: routeCoords } }),
    [routeCoords],
  )

  const focusedListing = focusedId ? listings.find((l) => l.id === focusedId) : null
  const popupListing   = popupId   ? withCoords.find((l) => l.id === popupId) : null
  const focusedMissingCoords =
    focusedListing != null && !withCoords.some((l) => l.id === focusedId)

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', height, borderRadius: 22, overflow: 'hidden' }}>
      {/* Missing-coords notice */}
      {focusedMissingCoords && !navTarget && (
        <div style={s.banner}>
          No map coordinates for this listing
          {focusedListing?.address ? ` — ${focusedListing.address}` : ''}
        </div>
      )}

      {/* Navigation panel */}
      {(navTarget || navLoading) && (
        <div style={s.dirPanel}>
          <div style={s.dirHeader}>
            <button style={s.dirClose} onClick={clearNav} aria-label="End navigation">
              ✕
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={s.dirDest}>
                {navTarget?.location_name || navTarget?.title || 'Destination'}
              </div>
              {distRemaining > 0 && etaSecs != null ? (
                <div style={s.dirSummary}>
                  {formatDist(distRemaining)} · {formatDuration(etaSecs)} left
                  {rerouting && <span style={{ marginLeft: 6, color: '#f59e0b', fontSize: 10 }}>Rerouting…</span>}
                </div>
              ) : navLoading ? (
                <div style={s.dirSummary}>Calculating route…</div>
              ) : null}
            </div>
          </div>

          {/* Transport mode selector */}
          <div style={s.modeRow}>
            {NAV_MODES_MAP.map((m) => (
              <button
                key={m.key}
                style={{ ...s.modeBtn, ...(navMode === m.key ? s.modeBtnActive : {}) }}
                onClick={() => changeMode(m.key)}
                aria-pressed={navMode === m.key}
                title={m.label}
                disabled={navLoading}
              >
                {m.icon}
              </button>
            ))}
          </div>

          {/* Transit fallback notice */}
          {navMode === 'transit' && (
            <div style={s.transitNote}>
              🚌 Live transit data is unavailable — showing a walking route as a guide.
            </div>
          )}

          {navError && <div style={s.dirError}>{navError}</div>}

          {isArrived && (
            <div style={s.arrivalBanner}>
              <span>⚑</span>
              <span>You have arrived!</span>
            </div>
          )}

          {navLoading && !navError && (
            <div style={s.shimmerWrap}>
              {[78, 58, 68, 46].map((w, i) => (
                <div key={i} style={{ ...s.shimmer, width: `${w}%` }} />
              ))}
            </div>
          )}

          {currentStep && !isArrived && (
            <div style={s.currentStep}>
              <div style={s.currentIcon}>{stepIcon(currentStep.maneuver)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={s.currentText}>{stepText(currentStep)}</div>
                {distToTurn != null && distToTurn > 10 && (
                  <div style={s.inDist}>in {formatDist(distToTurn)}</div>
                )}
              </div>
            </div>
          )}

          {nextStep && !isArrived && (
            <div style={s.nextRow}>
              <span style={s.nextLabel}>Then</span>
              <span style={s.nextIcon}>{stepIcon(nextStep.maneuver)}</span>
              <span style={s.nextText}>{stepText(nextStep)}</span>
            </div>
          )}

          {navSteps.length > 0 && (
            <div style={s.stepList}>
              {navSteps.map((step, i) => {
                if (i < stepIdx + 2) return null
                return (
                  <div
                    key={i}
                    style={{
                      ...s.stepRow,
                      ...(i === navSteps.length - 1 ? s.stepRowLast : {}),
                    }}
                  >
                    <span
                      style={{
                        ...s.stepIcon,
                        ...(step?.maneuver?.type === 'arrive' ? s.stepIconArrive : {}),
                      }}
                    >
                      {stepIcon(step?.maneuver)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={s.stepText}>{stepText(step)}</div>
                      {step?.distance > 0 && (
                        <div style={s.stepDist}>{formatDist(step.distance)}</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Re-center button */}
      {navTarget && !followUser && !navLoading && (
        <button
          style={{
            ...s.recenterBtn,
            ...(!mapReady || !userLoc ? { opacity: 0.4, cursor: 'not-allowed' } : {}),
          }}
          disabled={!mapReady || !userLoc}
          onClick={handleRecenter}
        >
          ⊕ Re-center
        </button>
      )}

      <Map
        ref={mapRef}
        mapLib={maplibregl}
        initialViewState={{
          longitude: DEFAULT_CENTER.lng,
          latitude: DEFAULT_CENTER.lat,
          zoom: DEFAULT_ZOOM,
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={MAP_STYLE}
        onLoad={onMapLoad}
        onError={(e) => {
          logMapError('Map runtime error event', {
            action: 'map_on_error',
            error: String(e?.error?.message || e?.message || e),
            type: e?.type || null,
          }, 'error', 'MAP_RUNTIME_ERROR')
        }}
        onDragStart={() => setFollowUser(false)}
      >
        <NavigationControl position="top-right" showCompass={false} />

        {routeCoords.length >= 2 && (
          <Source id="route" type="geojson" data={routeGeoJSON}>
            <Layer
              id="route-casing"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': '#1d4ed8', 'line-width': 10, 'line-opacity': 0.22 }}
            />
            <Layer
              id="route-line"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': '#3b82f6', 'line-width': 5, 'line-opacity': 0.95 }}
            />
          </Source>
        )}

        {userLoc && validCoord(userLoc.lat, userLoc.lng) && (
          <Marker longitude={userLoc.lng} latitude={userLoc.lat} anchor="center">
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: '#3b82f6',
                border: '2px solid #fff',
                boxShadow: '0 0 0 3px rgba(59,130,246,0.3)',
                pointerEvents: 'none',
              }}
            />
          </Marker>
        )}

        {withCoords.map((listing) => {
          const variant =
            navTarget?.id === listing.id
              ? 'nav'
              : popupId === listing.id
                ? 'active'
                : 'default'
          return (
            <Marker
              key={listing.id}
              longitude={listing.location.lng}
              latitude={listing.location.lat}
              anchor="center"
            >
              <MarkerPin
                variant={variant}
                onClick={(e) => {
                  e.stopPropagation()
                  setPopupId(listing.id)
                  onListingClick?.(listing)
                }}
              />
            </Marker>
          )
        })}

        {popupListing && (
          <Popup
            longitude={popupListing.location.lng}
            latitude={popupListing.location.lat}
            anchor="bottom"
            offset={12}
            maxWidth="280px"
            onClose={() => setPopupId(null)}
            closeOnClick={false}
          >
            <div style={s.popup}>
              <div style={s.popupTitle}>{popupListing.title}</div>
              <div style={s.popupDesc}>{popupListing.description}</div>
              <div style={s.popupMeta}>
                Qty: {popupListing.quantity}
                {popupListing.address ? ` · ${popupListing.address}` : ''}
              </div>
              <div style={s.popupActions}>
                {onClaim && (
                  <button
                    onClick={() => onClaim(popupListing)}
                    disabled={claimingIds.has(popupListing.id)}
                    style={{
                      ...s.popupBtn,
                      ...(claimingIds.has(popupListing.id) ? s.popupBtnDis : {}),
                    }}
                  >
                    {claimingIds.has(popupListing.id) ? 'Claiming…' : 'Claim now'}
                  </button>
                )}
                <button
                  onClick={() => startNavigation(popupListing)}
                  disabled={navLoading}
                  style={s.popupDirBtn}
                >
                  {navLoading && navTarget?.id === popupListing.id ? 'Loading…' : '↗ Directions'}
                </button>
              </div>
            </div>
          </Popup>
        )}
      </Map>
    </div>
  )
})

export default MealMap
```

The `const s = { ... }` styles block at the bottom of the file stays exactly as it is — do not change it.

Note: `routeGeoJSON` is kept as a `useMemo` (not inlined) to prevent MapLibre calling `setData` on every `userLoc` re-render, which would cause route-line flicker during navigation.

- [ ] **Step 1.3: Run lint checkpoint**

```bash
cd /Users/arjunbojja/Documents/mealmatch/frontend && npm run lint
```

Expected: no errors. Common fix if lint fails: check for any references to old variable names (`handleModeChange`, `isRecalc`, `recenteringRef`, `mountedRef`) that weren't removed from the component body.

- [ ] **Step 1.4: Run build checkpoint**

```bash
cd /Users/arjunbojja/Documents/mealmatch/frontend && npm run build
```

Expected: build completes with no errors. Warnings about bundle size are OK.

- [ ] **Step 1.5: Commit**

```bash
git add frontend/src/components/MealMap.jsx
git commit -m "refactor(map): extract useNavigation hook, add speed ETA, fix changeMode"
```

---

## Task 2: Fix RecipientFeed pendingNav flow

**Files:**
- Modify: `frontend/src/components/RecipientFeed.jsx`

Two fixes:
1. `navIntentActive` is now set to `false` only after `startNavigation` resolves (not inside the `setTimeout` before it fires). This closes the window where `focusedId` could be briefly un-suppressed before nav state is established in MealMap.
2. Retry loop: if `mapRef.current?.startNavigation` is not available when the timeout fires, retry up to 3 × 150ms before giving up with telemetry.

- [ ] **Step 2.1: Replace the pendingNav `useEffect` in RecipientFeed.jsx**

Find this block (lines ~65–78 in RecipientFeed.jsx):

```js
  useEffect(() => {
    if (!pendingNav || !focusedListingId || isLoading || !listings.length) return;
    if (pendingNavFiredRef.current) return;
    const listing = listings.find((l) => l.id === focusedListingId);
    if (!listing?.location) return;
    pendingNavFiredRef.current = true;
    // Short delay — lets the map finish its initial render cycle
    const t = setTimeout(() => {
      mapRef.current?.startNavigation(listing, pendingNav.navMode);
      // Intent consumed — MealMap's focusedId guard (navTarget check) now prevents popup
      setNavIntentActive(false);
    }, 400);
    return () => clearTimeout(t);
  }, [pendingNav, focusedListingId, listings, isLoading]);
```

Replace it with:

```js
  // Auto-start in-app navigation when arriving from My Claims with autoNav state.
  // pendingNavFiredRef prevents retrigger on every 15s listing poll.
  // navIntentActive is cleared AFTER startNavigation resolves so focusedId is never
  // briefly un-suppressed before MealMap's navTarget guard is in place.
  useEffect(() => {
    if (!pendingNav || !focusedListingId || isLoading || !listings.length) return;
    if (pendingNavFiredRef.current) return;
    const listing = listings.find((l) => l.id === focusedListingId);
    if (!listing?.location) return;
    pendingNavFiredRef.current = true;

    const t = setTimeout(async () => {
      // Retry up to 3 × 150ms if mapRef not yet assigned (safety net for slow mounts)
      let attempts = 0;
      while (!mapRef.current?.startNavigation && attempts < 3) {
        await new Promise((r) => setTimeout(r, 150));
        attempts++;
      }
      if (!mapRef.current?.startNavigation) {
        console.warn("[MealMatch] MAP_NAV_REF_MISSING: mapRef not ready after retries");
        return;
      }
      await mapRef.current.startNavigation(listing, pendingNav.navMode);
      // Intent consumed — clear AFTER startNavigation resolves so navTarget guard is active
      setNavIntentActive(false);
    }, 400);

    return () => clearTimeout(t);
  }, [pendingNav, focusedListingId, listings, isLoading]);
```

- [ ] **Step 2.2: Run lint + build**

```bash
cd /Users/arjunbojja/Documents/mealmatch/frontend && npm run lint && npm run build
```

Expected: no errors.

- [ ] **Step 2.3: Commit**

```bash
git add frontend/src/components/RecipientFeed.jsx
git commit -m "fix(feed): harden pendingNav startNavigation timing and mapRef retry"
```

---

## Task 3: Cleanup — delete design doc and commit

- [ ] **Step 3.1: Delete the design spec**

```bash
git rm docs/superpowers/specs/2026-04-11-live-navigation-design.md
git commit -m "chore: remove live navigation design spec after implementation"
```

- [ ] **Step 3.2: Final lint + build confirmation**

```bash
cd /Users/arjunbojja/Documents/mealmatch/frontend && npm run lint && npm run build
```

Expected: clean lint, successful build.

---

## Manual Verification Checklist

After implementation, verify in the browser:

- [ ] From My Claims, click **Drive** → navigates to map, auto-starts driving route
- [ ] From My Claims, click **Walk / Bike / Transit** → each starts the correct mode directly
- [ ] While route is active: ETA and distance update as you move (or simulate with browser DevTools geolocation override)
- [ ] While route active, click a mode button (e.g., Walk → Bike) → route line, step list, and ETA all update; no stale steps visible during loading
- [ ] No popup overlays the map after navigation starts
- [ ] If transit is selected, the walking-fallback notice appears and no error is thrown
- [ ] Clicking **✕** ends navigation; arrival banner does not end navigation
- [ ] Re-center button recenters map without ending navigation
