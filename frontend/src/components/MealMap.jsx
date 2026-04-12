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
import {
  useNavigation,
  validCoord, safeLocation, haversine,
  formatDist, formatDuration, stepIcon, stepText,
  OSRM_PROFILE, OSRM_BASE, STEP_ADVANCE_M, REROUTE_M,
} from '../hooks/useNavigation'

const DEFAULT_CENTER = { lat: 38.9869, lng: -76.9426 }
const DEFAULT_ZOOM = 13

const NAV_MODES_MAP = [
  { key: 'driving',   icon: '🚗', label: 'Drive' },
  { key: 'walking',   icon: '🚶', label: 'Walk' },
  { key: 'bicycling', icon: '🚴', label: 'Bike' },
  { key: 'transit',   icon: '🚌', label: 'Transit' },
]

function MarkerPin({ variant = 'default', onClick }) {
  const base = {
    width: 20, height: 20, borderRadius: '50%',
    border: '2.5px solid rgba(255,255,255,0.9)',
    cursor: 'pointer', transition: 'transform 0.15s',
  }
  const variants = {
    default: { background: 'var(--mm-brand)', boxShadow: '0 2px 8px rgba(22,163,74,0.45)' },
    active:  { background: '#15803d', boxShadow: '0 2px 12px rgba(22,163,74,0.8)', transform: 'scale(1.12)' },
    nav:     { background: '#3b82f6', boxShadow: '0 2px 12px rgba(59,130,246,0.65)' },
  }
  return <div style={{ ...base, ...(variants[variant] ?? variants.default) }} onClick={onClick} />
}

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
