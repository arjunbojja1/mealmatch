import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import Map, { Marker, Popup, Source, Layer, NavigationControl } from 'react-map-gl'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { reportMapError } from '../api/client'

const DEFAULT_CENTER = { lat: 38.9869, lng: -76.9426 }
const DEFAULT_ZOOM = 13

const OSRM_BASE = 'https://router.project-osrm.org/route/v1'
// transit is not supported by OSRM — falls back to walking (noted in UI)
const OSRM_PROFILE = {
  driving: 'driving',
  walking: 'walking',
  bicycling: 'cycling',
  cycling: 'cycling',
  transit: 'walking',
}

const NAV_MODES_MAP = [
  { key: 'driving',  icon: '🚗', label: 'Drive' },
  { key: 'walking',  icon: '🚶', label: 'Walk' },
  { key: 'bicycling', icon: '🚴', label: 'Bike' },
  { key: 'transit',  icon: '🚌', label: 'Transit' },
]

const STEP_ADVANCE_M = 30
const REROUTE_M = 200

// OpenStreetMap tile style — no API key required
const MAP_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxzoom: 19,
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
}

// Coerce to number before validating — handles string coords from API
function validCoord(lat, lng) {
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
function safeLocation(listing) {
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

function haversine(lat1, lng1, lat2, lng2) {
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
function minDistToPolyline(coords, loc) {
  if (!Array.isArray(coords) || coords.length === 0) return Infinity
  let min = Infinity
  for (const pt of coords) {
    if (!Array.isArray(pt) || pt.length < 2) continue
    const d = haversine(loc.lat, loc.lng, pt[1], pt[0])
    if (d < min) min = d
  }
  return min
}

function formatDist(m) {
  if (!Number.isFinite(m) || m < 0) return '—'
  const ft = m * 3.28084
  if (ft < 528) return `${Math.round(ft / 10) * 10} ft`
  const mi = m * 0.000621371
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`
}

function formatDuration(s) {
  if (!Number.isFinite(s) || s < 0) return '—'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem ? `${h} hr ${rem} min` : `${h} hr`
}

function stepIcon(maneuver) {
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

function stepText(step) {
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

function MarkerPin({ variant = 'default', onClick }) {
  const base = {
    width: 20,
    height: 20,
    borderRadius: '50%',
    border: '2.5px solid rgba(255,255,255,0.9)',
    cursor: 'pointer',
    transition: 'transform 0.15s',
  }
  const variants = {
    default: {
      background: 'var(--mm-brand)',
      boxShadow: '0 2px 8px rgba(22,163,74,0.45)',
    },
    active: {
      background: '#15803d',
      boxShadow: '0 2px 12px rgba(22,163,74,0.8)',
      transform: 'scale(1.12)',
    },
    nav: {
      background: '#3b82f6',
      boxShadow: '0 2px 12px rgba(59,130,246,0.65)',
    },
  }
  return (
    <div
      style={{ ...base, ...(variants[variant] ?? variants.default) }}
      onClick={onClick}
    />
  )
}

// ─── useNavigation hook ──────────────────────────────────────────────────────

function useNavigation({ mapRef, mapReady, logMapError, onNavigationStart }) {
  const mountedRef           = useRef(true)
  const watchIdRef           = useRef(null)
  const navTargetRef         = useRef(null)
  const navModeRef           = useRef('driving')
  const navStepsRef          = useRef([])
  const routeCoordsRef       = useRef(null)
  const changeModeInFlightRef = useRef(false)
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

  // ── Derived values ───────────────────────────────────────────────────────────
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

  // Stable callback so startNavigation's deps don't change every render
  const onNavigationStart = useCallback(() => setPopupId(null), [])

  const {
    navState,
    startNavigation,
    clearNav,
    changeMode,
    handleRecenter,
    setFollowUser,
  } = useNavigation({
    mapRef,
    mapReady,
    logMapError,
    onNavigationStart,
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

  const onMapLoad = useCallback(() => { setMapReady(true) }, [])

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

  // Stable GeoJSON ref prevents MapLibre setData on every userLoc re-render
  const routeGeoJSON = useMemo(
    () => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: routeCoords } }),
    [routeCoords],
  )

  // Derived display values for the direction panel
  const currentStep = navSteps[stepIdx]
  const nextStep    = navSteps[stepIdx + 1]
  const nextManeuverLoc = nextStep?.maneuver?.location
  const distToTurn =
    userLoc && Array.isArray(nextManeuverLoc) && nextManeuverLoc.length >= 2
      ? haversine(userLoc.lat, userLoc.lng, nextManeuverLoc[1], nextManeuverLoc[0])
      : null

  const focusedListing = focusedId ? listings.find((l) => l.id === focusedId) : null
  const popupListing   = popupId   ? withCoords.find((l) => l.id === popupId) : null
  const focusedMissingCoords =
    focusedListing != null && !withCoords.some((l) => l.id === focusedId)

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

const s = {
  banner: {
    position: 'absolute',
    top: 12,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 10,
    background: 'rgba(9,9,11,0.95)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(249,115,22,0.35)',
    color: '#fdba74',
    padding: '7px 16px',
    borderRadius: 99,
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    maxWidth: '90%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  dirPanel: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 20,
    width: 272,
    maxHeight: 'calc(100% - 24px)',
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(9,9,11,0.97)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(59,130,246,0.25)',
    borderRadius: 20,
    overflow: 'hidden',
    boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
  },
  dirHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '14px 14px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    flexShrink: 0,
  },
  dirClose: {
    flexShrink: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.05)',
    color: '#6b7280',
    fontSize: 11,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dirDest: {
    fontSize: 13,
    fontWeight: 700,
    color: '#f4f4f5',
    lineHeight: 1.3,
    marginBottom: 2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  dirSummary: { fontSize: 11, color: '#60a5fa', fontWeight: 600 },
  dirError: {
    padding: '10px 14px',
    fontSize: 12,
    color: '#fca5a5',
    lineHeight: 1.5,
    background: 'rgba(239,68,68,0.08)',
    borderBottom: '1px solid rgba(239,68,68,0.12)',
    flexShrink: 0,
  },
  arrivalBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '11px 14px',
    background: 'rgba(249,115,22,0.10)',
    borderBottom: '1px solid rgba(249,115,22,0.15)',
    color: '#fb923c',
    fontSize: 13,
    fontWeight: 700,
    flexShrink: 0,
  },
  shimmerWrap: {
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    flexShrink: 0,
  },
  shimmer: {
    height: 9,
    borderRadius: 5,
    background:
      'linear-gradient(90deg,rgba(255,255,255,.04)25%,rgba(255,255,255,.10)50%,rgba(255,255,255,.04)75%)',
    backgroundSize: '200% 100%',
    animation: 'mm-shimmer 1.4s infinite',
  },
  currentStep: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    padding: '14px',
    background: 'rgba(59,130,246,0.07)',
    borderBottom: '1px solid rgba(59,130,246,0.12)',
    flexShrink: 0,
  },
  currentIcon: {
    flexShrink: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    background: 'rgba(59,130,246,0.18)',
    color: '#60a5fa',
    fontSize: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentText: { fontSize: 14, fontWeight: 700, color: '#f4f4f5', lineHeight: 1.35 },
  inDist: { fontSize: 11, color: '#60a5fa', fontWeight: 600, marginTop: 4 },
  nextRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '9px 14px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    flexShrink: 0,
  },
  nextLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: '#3f3f46',
    textTransform: 'uppercase',
    letterSpacing: '.07em',
    flexShrink: 0,
  },
  nextIcon: { fontSize: 13, color: '#71717a', flexShrink: 0 },
  nextText: {
    fontSize: 11,
    color: '#71717a',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  stepList: { overflowY: 'auto', flex: 1, minHeight: 0 },
  stepRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '9px 14px',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  },
  stepRowLast: { borderBottom: 'none' },
  stepIcon: {
    flexShrink: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    background: 'rgba(59,130,246,0.10)',
    color: '#60a5fa',
    fontSize: 11,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepIconArrive: { background: 'rgba(249,115,22,0.12)', color: '#fb923c' },
  stepText: { fontSize: 12, color: '#d4d4d8', lineHeight: 1.4, fontWeight: 500 },
  stepDist: { fontSize: 10, color: '#52525b', marginTop: 2, fontWeight: 600 },
  recenterBtn: {
    position: 'absolute',
    bottom: 50,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 20,
    padding: '8px 18px',
    borderRadius: 99,
    background: 'rgba(9,9,11,0.92)',
    backdropFilter: 'blur(14px)',
    border: '1px solid rgba(59,130,246,0.35)',
    color: '#60a5fa',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    boxShadow: '0 4px 18px rgba(0,0,0,0.45)',
  },
  // Popup — uses the app's light surface so text must be dark
  popup: { fontFamily: 'Inter, ui-sans-serif, sans-serif', minWidth: 200 },
  popupTitle: {
    fontWeight: 700,
    fontSize: 13,
    color: 'var(--mm-text-1)',
    marginBottom: 5,
    lineHeight: 1.3,
  },
  popupDesc: { fontSize: 11, color: 'var(--mm-text-3)', lineHeight: 1.55, marginBottom: 5 },
  popupMeta: {
    fontSize: 10,
    color: 'var(--mm-text-4)',
    marginBottom: 12,
    fontWeight: 600,
  },
  popupActions: { display: 'flex', flexDirection: 'column', gap: 6 },
  popupBtn: {
    width: '100%',
    padding: '8px 12px',
    border: 'none',
    borderRadius: 10,
    background: 'var(--mm-brand)',
    color: '#fff',
    fontWeight: 700,
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'background 0.15s',
  },
  popupBtnDis: { opacity: 0.5, cursor: 'not-allowed' },
  popupDirBtn: {
    width: '100%',
    padding: '7px 12px',
    border: '1px solid rgba(59,130,246,0.35)',
    borderRadius: 10,
    background: 'rgba(59,130,246,0.10)',
    color: '#1d4ed8',
    fontWeight: 600,
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  modeRow: {
    display: 'flex',
    gap: 6,
    padding: '10px 14px 4px',
    flexShrink: 0,
  },
  modeBtn: {
    flex: 1,
    padding: '6px 0',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.10)',
    background: 'rgba(255,255,255,0.04)',
    color: '#71717a',
    fontSize: 16,
    cursor: 'pointer',
    transition: 'background 0.15s, border-color 0.15s',
  },
  modeBtnActive: {
    background: 'rgba(59,130,246,0.18)',
    border: '1px solid rgba(59,130,246,0.45)',
    color: '#60a5fa',
  },
  transitNote: {
    padding: '6px 14px 10px',
    fontSize: 11,
    color: '#a3a3a3',
    lineHeight: 1.5,
    flexShrink: 0,
  },
}
