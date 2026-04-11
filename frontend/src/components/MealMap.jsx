import { useEffect, useState } from 'react'
import Map, { Marker, Popup, NavigationControl } from 'react-map-gl/maplibre'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const DEFAULT_VIEW = { longitude: -76.9426, latitude: 38.9869, zoom: 13 }

export default function MealMap({
  listings = [],
  focusedId = null,
  onListingClick,
  onClaim,
  claimingIds = new Set(),
  height = 560,
}) {
  const [viewState, setViewState] = useState(DEFAULT_VIEW)
  const [popupId, setPopupId] = useState(focusedId)

  const withCoords = listings.filter(
    (l) => l.location?.lat != null && l.location?.lng != null,
  )

  useEffect(() => {
    if (!focusedId) return
    setPopupId(focusedId)
    const l = listings.find((x) => x.id === focusedId && x.location?.lat != null)
    if (!l) return
    setViewState((prev) => ({
      ...prev,
      longitude: l.location.lng,
      latitude: l.location.lat,
      zoom: 16,
    }))
  }, [focusedId, listings])

  const popupListing = popupId ? withCoords.find((l) => l.id === popupId) : null
  const focusedListing = focusedId ? listings.find((l) => l.id === focusedId) : null
  const focusedMissingCoords =
    focusedListing != null && !withCoords.find((l) => l.id === focusedId)

  return (
    <div style={{ position: 'relative', height, borderRadius: 22, overflow: 'hidden' }}>
      {focusedMissingCoords && (
        <div style={s.banner}>
          No map coordinates for this listing
          {focusedListing.address ? ` — address: ${focusedListing.address}` : ''}
        </div>
      )}

      <Map
        {...viewState}
        onMove={(e) => setViewState(e.viewState)}
        style={{ width: '100%', height: '100%' }}
        mapStyle={MAP_STYLE}
        mapLib={maplibregl}
      >
        <NavigationControl position="top-right" />

        {withCoords.map((listing) => (
          <Marker
            key={listing.id}
            longitude={listing.location.lng}
            latitude={listing.location.lat}
            anchor="bottom"
            onClick={(e) => {
              e.originalEvent.stopPropagation()
              setPopupId(listing.id)
              onListingClick?.(listing)
            }}
          >
            <div
              style={{
                ...s.marker,
                ...(popupId === listing.id ? s.markerActive : {}),
              }}
              title={listing.title}
            />
          </Marker>
        ))}

        {popupListing && (
          <Popup
            longitude={popupListing.location.lng}
            latitude={popupListing.location.lat}
            anchor="top"
            onClose={() => setPopupId(null)}
            closeOnClick={false}
            maxWidth="280px"
          >
            <div style={s.popup}>
              <div style={s.popupTitle}>{popupListing.title}</div>
              <div style={s.popupDesc}>{popupListing.description}</div>
              <div style={s.popupMeta}>
                Qty: {popupListing.quantity}
                {popupListing.address ? ` · ${popupListing.address}` : ''}
              </div>
              {onClaim && (
                <button
                  onClick={() => onClaim(popupListing)}
                  disabled={claimingIds.has(popupListing.id)}
                  style={{
                    ...s.popupBtn,
                    ...(claimingIds.has(popupListing.id) ? s.popupBtnDisabled : {}),
                  }}
                >
                  {claimingIds.has(popupListing.id) ? 'Claiming…' : 'Claim now'}
                </button>
              )}
            </div>
          </Popup>
        )}
      </Map>
    </div>
  )
}

const s = {
  banner: {
    position: 'absolute',
    top: 12,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 10,
    background: 'rgba(15,23,42,0.93)',
    border: '1px solid rgba(249,115,22,0.45)',
    color: '#fdba74',
    padding: '9px 18px',
    borderRadius: 12,
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    maxWidth: '90%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  marker: {
    width: 20,
    height: 20,
    borderRadius: '50%',
    background: '#f97316',
    border: '3px solid #fff',
    boxShadow: '0 2px 8px rgba(249,115,22,0.6)',
    cursor: 'pointer',
    transition: 'transform 0.15s, box-shadow 0.15s',
  },
  markerActive: {
    width: 26,
    height: 26,
    background: '#ea580c',
    boxShadow: '0 2px 14px rgba(249,115,22,0.9)',
  },
  popup: {
    fontFamily: 'Inter, ui-sans-serif, sans-serif',
    padding: '2px 0',
    minWidth: 190,
  },
  popupTitle: {
    fontWeight: 700,
    fontSize: 14,
    color: '#0f172a',
    marginBottom: 6,
    lineHeight: 1.3,
  },
  popupDesc: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 1.5,
    marginBottom: 6,
  },
  popupMeta: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 10,
  },
  popupBtn: {
    width: '100%',
    padding: '9px 12px',
    border: 'none',
    borderRadius: 10,
    background: '#f97316',
    color: '#fff',
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  popupBtnDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
}
