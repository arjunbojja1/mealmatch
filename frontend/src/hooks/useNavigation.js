import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// ─── Constants ───────────────────────────────────────────────────────────────

export const OSRM_BASE = 'https://router.project-osrm.org/route/v1'
// transit is not supported by OSRM — falls back to walking (noted in UI)
export const OSRM_PROFILE = {
  driving: 'driving',
  walking: 'walking',
  bicycling: 'cycling',
  cycling: 'cycling',
  transit: 'walking',
}

export const STEP_ADVANCE_M = 30
export const REROUTE_M = 200

// ─── Pure utilities (exported for tests) ─────────────────────────────────────

// Coerce to number before validating — handles string coords from API
export function validCoord(lat, lng) {
  const la = Number(lat)
  const lo = Number(lng)
  return (
    lat != null &&
    lng != null &&
    Number.isFinite(la) &&
    Number.isFinite(lo) &&
    la >= -90 &&
    la <= 90 &&
    lo >= -180 &&
    lo <= 180
  )
}

// Returns { lat: number, lng: number } or null — always numeric, never string
export function safeLocation(listing) {
  const rawLat = listing?.location?.lat
  const rawLng = listing?.location?.lng
  if (rawLat == null || rawLng == null || rawLat === '' || rawLng === '') return null
  const lat = Number(rawLat)
  const lng = Number(rawLng)
  return Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
    ? { lat, lng }
    : null
}

export function haversine(lat1, lng1, lat2, lng2) {
  const la1 = Number(lat1)
  const lo1 = Number(lng1)
  const la2 = Number(lat2)
  const lo2 = Number(lng2)
  if (
    !Number.isFinite(la1) ||
    !Number.isFinite(lo1) ||
    !Number.isFinite(la2) ||
    !Number.isFinite(lo2)
  )
    return Infinity
  const R = 6371000
  const dLat = ((la2 - la1) * Math.PI) / 180
  const dLng = ((lo2 - lo1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((la1 * Math.PI) / 180) *
      Math.cos((la2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// coords is GeoJSON [[lng, lat], ...]
export function minDistToPolyline(coords, loc) {
  if (!Array.isArray(coords) || coords.length === 0) return Infinity
  let min = Infinity
  for (const pt of coords) {
    if (!Array.isArray(pt) || pt.length < 2) continue
    const d = haversine(loc.lat, loc.lng, pt[1], pt[0])
    if (d < min) min = d
  }
  return min
}

export function formatDist(m) {
  if (!Number.isFinite(m) || m < 0) return '—'
  const ft = m * 3.28084
  if (ft < 528) return `${Math.round(ft / 10) * 10} ft`
  const mi = m * 0.000621371
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`
}

export function formatDuration(s) {
  if (!Number.isFinite(s) || s < 0) return '—'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem ? `${h} hr ${rem} min` : `${h} hr`
}

export function stepIcon(maneuver) {
  const mod = maneuver?.modifier ?? ''
  const type = maneuver?.type ?? ''
  if (type === 'depart') return '▶'
  if (type === 'arrive') return '⚑'
  if (type === 'roundabout' || type === 'rotary') return '↻'
  if (mod === 'uturn') return '↩'
  if (mod.includes('sharp right')) return '↱'
  if (mod.includes('sharp left')) return '↰'
  if (mod.includes('right')) return '→'
  if (mod.includes('left')) return '←'
  return '↑'
}

export function stepText(step) {
  const type = step?.maneuver?.type ?? ''
  const mod = step?.maneuver?.modifier ?? ''
  const road = step?.name ? ` onto ${step.name}` : ''
  if (type === 'depart') return `Head ${mod || 'forward'}${road}`
  if (type === 'arrive') return 'You have arrived'
  if (type === 'turn') return `Turn ${mod}${road}`
  if (type === 'fork') return `Keep ${mod} at the fork${road}`
  if (type === 'merge') return `Merge ${mod}${road}`
  if (type === 'on ramp') return `Take the on-ramp${road}`
  if (type === 'off ramp') return `Take the exit${road}`
  if (type === 'end of road') return `Turn ${mod} at road's end${road}`
  if (type === 'roundabout' || type === 'rotary') return `Take the roundabout${road}`
  return `Continue${road}`
}

// ─── useNavigation hook ───────────────────────────────────────────────────────

export function useNavigation({ mapRef, mapReady, logMapError, onNavigationStart }) {
  const mountedRef            = useRef(true)
  const watchIdRef            = useRef(null)
  const navTargetRef          = useRef(null)
  const navModeRef            = useRef('driving')
  const navStepsRef           = useRef([])
  const routeCoordsRef        = useRef(null)
  const changeModeInFlightRef = useRef(false)
  const isRecalcRef           = useRef(false)
  const lastRecalcLocRef      = useRef(null)
  const fitDoneRef            = useRef(false)
  const recenteringRef        = useRef(false)
  const speedSamplesRef       = useRef([])   // ring buffer [{ distMetres, dtMs }], max 5
  const lastLocRef            = useRef(null) // previous GPS { lat, lng }
  const lastLocTimeRef        = useRef(null) // ms timestamp of lastLocRef

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
      navModeRef.current = mode  // raw key; fetchRoute handles OSRM translation
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
  // Immediately clears stale route data so the panel shows "Calculating..."
  // Uses a ref-based lock to guard against concurrent calls (not just navLoading state).
  const changeMode = useCallback(async (newMode) => {
    if (newMode === navMode || changeModeInFlightRef.current) return
    changeModeInFlightRef.current = true
    setNavMode(newMode)
    navModeRef.current = newMode  // raw key; fetchRoute handles OSRM translation
    // Clear stale data immediately
    setNavSteps([])
    setStepIdx(0)
    setNavSummary(null)
    setRouteCoords([])
    setNavError(null)
    setRollingSpeed(null)
    speedSamplesRef.current = []
    if (!navTarget || !userLoc) {
      changeModeInFlightRef.current = false
      return
    }
    fitDoneRef.current = false
    setNavLoading(true)
    await fetchRoute(navTarget, userLoc, newMode)
    if (mountedRef.current) setNavLoading(false)
    changeModeInFlightRef.current = false
  }, [navMode, navTarget, userLoc, fetchRoute])

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

  // ── Derived values ────────────────────────────────────────────────────────
  // distRemaining: live from GPS position relative to upcoming step maneuvers.
  // Fallback for final/unknown step uses haversine to destination so the last-mile
  // display doesn't over-report (avoids showing full step distance when user is mid-step).
  const distRemaining = useMemo(() => {
    if (!navSteps.length) return 0
    const nextManeuverLoc = navSteps[stepIdx + 1]?.maneuver?.location
    const distToNextTurn =
      Array.isArray(nextManeuverLoc) && nextManeuverLoc.length >= 2 && userLoc
        ? haversine(userLoc.lat, userLoc.lng, nextManeuverLoc[1], nextManeuverLoc[0])
        : navTargetLoc && userLoc
          ? haversine(userLoc.lat, userLoc.lng, navTargetLoc.lat, navTargetLoc.lng)
          : (navSteps[stepIdx]?.distance ?? 0)
    return (
      distToNextTurn +
      navSteps.slice(stepIdx + 1).reduce((s, st) => s + (st?.distance ?? 0), 0)
    )
  }, [navSteps, stepIdx, userLoc, navTargetLoc])

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

  return { navState, startNavigation, clearNav, changeMode, handleRecenter, setFollowUser }
}
