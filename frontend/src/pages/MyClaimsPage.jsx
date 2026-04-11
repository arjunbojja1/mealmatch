import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMyClaims, cancelClaim } from '../api/client'

function formatTime(dateString) {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

const STATUS_STYLE = {
  confirmed: { background: 'rgba(34,197,94,0.12)', color: '#86efac', border: '1px solid rgba(34,197,94,0.25)' },
  cancelled: { background: 'rgba(148,163,184,0.1)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.2)' },
  pending:   { background: 'rgba(249,115,22,0.12)', color: '#fdba74', border: '1px solid rgba(249,115,22,0.3)' },
}

export default function MyClaimsPage() {
  const navigate = useNavigate()
  const [myClaims, setMyClaims] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [cancellingIds, setCancellingIds] = useState(new Set())
  const [notification, setNotification] = useState(null)

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type, id: Date.now() })
    setTimeout(() => setNotification(null), 3000)
  }

  const fetchClaims = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const data = await getMyClaims()
      setMyClaims(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || 'Could not load your claims.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchClaims() }, [fetchClaims])

  const handleShowOnMap = useCallback((listing) => {
    if (!listing) return
    navigate('/browse', { state: { focusListingId: listing.id } })
  }, [navigate])

  const handleCancel = async (claim) => {
    if (cancellingIds.has(claim.id)) return
    setCancellingIds((prev) => new Set(prev).add(claim.id))
    try {
      await cancelClaim(claim.id)
      showNotification('Claim cancelled — listing quantity restored.', 'success')
      await fetchClaims()
    } catch (err) {
      showNotification(err.message || 'Could not cancel claim.', 'error')
    } finally {
      setCancellingIds((prev) => { const n = new Set(prev); n.delete(claim.id); return n })
    }
  }

  const confirmed = myClaims.filter((c) => c.status === 'confirmed')
  const past      = myClaims.filter((c) => c.status !== 'confirmed')

  return (
    <div style={s.page}>
      <div style={s.hero}>
        <div>
          <div style={s.eyebrow}>MealMatch • Recipient</div>
          <h1 style={s.title}>My Claims</h1>
          <p style={s.subtitle}>
            Track your active and past pickup reservations. Cancel a confirmed claim to free up
            inventory for other recipients.
          </p>
        </div>
        <div style={s.badge}>
          <div style={s.badgeNum}>{confirmed.length}</div>
          <div style={s.badgeLabel}>Active reservations</div>
        </div>
      </div>

      {notification && (
        <div style={{
          ...s.toast,
          ...(notification.type === 'success' ? s.toastSuccess : s.toastError),
        }}>
          {notification.message}
        </div>
      )}

      {error && (
        <div style={{ ...s.toast, ...s.toastError }}>
          {error}
          <button onClick={fetchClaims} style={s.retryBtn}>Retry</button>
        </div>
      )}

      {isLoading ? (
        <div style={s.skeleton}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={s.skeletonCard}>
              <div style={{ ...s.skeletonBar, width: '55%' }} />
              <div style={{ ...s.skeletonBar, width: '80%' }} />
            </div>
          ))}
        </div>
      ) : myClaims.length === 0 ? (
        <div style={s.empty}>
          <div style={s.emptyIcon}>📋</div>
          <h3 style={s.emptyTitle}>No claims yet</h3>
          <p style={s.emptyText}>
            Browse available listings and reserve a pickup to see your claims here.
          </p>
        </div>
      ) : (
        <>
          {confirmed.length > 0 && (
            <section style={s.section}>
              <h2 style={s.sectionTitle}>Active Reservations</h2>
              <div style={s.grid}>
                {confirmed.map((claim) => (
                  <ClaimCard
                    key={claim.id}
                    claim={claim}
                    isCancelling={cancellingIds.has(claim.id)}
                    onCancel={handleCancel}
                    onShowMap={handleShowOnMap}
                  />
                ))}
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section style={s.section}>
              <h2 style={{ ...s.sectionTitle, color: '#64748b' }}>Past Claims</h2>
              <div style={s.grid}>
                {past.map((claim) => (
                  <ClaimCard key={claim.id} claim={claim} onShowMap={handleShowOnMap} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

const NAV_MODES = [
  { key: 'driving',   label: 'Car',     icon: '🚗', travelmode: 'driving' },
  { key: 'walking',   label: 'Walk',    icon: '🚶', travelmode: 'walking' },
  { key: 'bicycling', label: 'Bike',    icon: '🚲', travelmode: 'bicycling' },
  { key: 'transit',   label: 'Transit', icon: '🚌', travelmode: 'transit' },
]

function buildNavUrl(listing, travelmode) {
  const dest = listing?.lat != null && listing?.lng != null
    ? `${listing.lat},${listing.lng}`
    : encodeURIComponent(listing?.address || listing?.location_name || '')
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=${travelmode}`
}

function ClaimCard({ claim, isCancelling, onCancel, onShowMap }) {
  const listing = claim.listing
  const statusStyle = STATUS_STYLE[claim.status] || STATUS_STYLE.pending
  const canCancel = claim.status === 'confirmed' && onCancel
  const hasLocation = listing && (listing.address || listing.location_name || listing?.lat != null)
  const canShowOnMap = listing && (listing.address || listing.location?.lat != null)

  return (
    <div style={s.card}>
      <div style={s.cardTop}>
        <div style={s.cardInfo}>
          <div style={s.listingTitle}>{listing?.title || '(listing removed)'}</div>
          {(listing?.location_name || listing?.address) && (
            <div style={s.locationLine}>
              {listing.location_name || listing.address}
            </div>
          )}
          {claim.slot_id && listing?.pickup_slots?.length > 0 && (() => {
            const slot = listing.pickup_slots.find((s) => s.id === claim.slot_id)
            return slot ? <div style={s.slotLine}>Slot: {slot.label}</div> : null
          })()}
        </div>
        <span style={{ ...s.statusPill, ...statusStyle }}>{claim.status}</span>
      </div>

      <div style={s.metaGrid}>
        <MetaBox label="Qty claimed" value={claim.claimed_quantity} />
        <MetaBox label="Reserved at" value={formatTime(claim.claimed_at)} small />
        {listing && <MetaBox label="Pickup ends" value={formatTime(listing.pickup_end)} small />}
      </div>

      {hasLocation && (
        <div style={s.navSection}>
          <div style={s.navLabel}>Navigate</div>
          <div style={s.navRow}>
            {NAV_MODES.map((mode) => (
              <a
                key={mode.key}
                href={buildNavUrl(listing, mode.travelmode)}
                target="_blank"
                rel="noopener noreferrer"
                style={s.navBtn}
              >
                <span>{mode.icon}</span>
                <span>{mode.label}</span>
              </a>
            ))}
            {canShowOnMap && (
              <button onClick={() => onShowMap(listing)} style={s.navMapBtn}>
                🗺 Map
              </button>
            )}
          </div>
        </div>
      )}

      <div style={s.cardFooter}>
        {canCancel && (
          <button
            onClick={() => onCancel(claim)}
            disabled={isCancelling}
            style={{ ...s.cancelBtn, ...(isCancelling ? s.cancelBtnDisabled : {}) }}
          >
            {isCancelling ? 'Cancelling…' : 'Cancel reservation'}
          </button>
        )}
      </div>
    </div>
  )
}

function MetaBox({ label, value, small }) {
  return (
    <div style={s.metaBox}>
      <div style={s.metaLabel}>{label}</div>
      <div style={small ? s.metaValueSmall : s.metaValue}>{value}</div>
    </div>
  )
}

const s = {
  page: {
    maxWidth: 1100,
    margin: '0 auto',
    padding: '28px 24px 48px',
    color: '#f8fafc',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  },
  hero: {
    background: 'radial-gradient(circle at top left, rgba(34,197,94,0.18), transparent 30%), linear-gradient(135deg, #0f172a 0%, #111827 100%)',
    border: '1px solid rgba(148,163,184,0.18)',
    borderRadius: 24,
    padding: '28px 32px',
    boxShadow: '0 24px 60px rgba(2,6,23,0.4)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 24,
    flexWrap: 'wrap',
    marginBottom: 24,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'rgba(191,219,254,0.85)',
    marginBottom: 10,
  },
  title: { margin: '0 0 10px', fontSize: 'clamp(1.8rem,4vw,2.8rem)', fontWeight: 800, color: '#f8fafc' },
  subtitle: { margin: 0, maxWidth: 640, color: '#94a3b8', lineHeight: 1.65, fontSize: 15 },
  badge: {
    minWidth: 160,
    padding: '20px 24px',
    borderRadius: 20,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(148,163,184,0.16)',
    textAlign: 'center',
    flexShrink: 0,
  },
  badgeNum: { fontSize: 36, fontWeight: 800, color: '#ffffff', lineHeight: 1 },
  badgeLabel: { fontSize: 13, color: '#94a3b8', marginTop: 6 },
  toast: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '13px 18px',
    borderRadius: 14,
    fontWeight: 600,
    marginBottom: 16,
    fontSize: 14,
  },
  toastSuccess: {
    background: 'rgba(34,197,94,0.12)',
    border: '1px solid rgba(34,197,94,0.28)',
    color: '#bbf7d0',
  },
  toastError: {
    background: 'rgba(239,68,68,0.12)',
    border: '1px solid rgba(239,68,68,0.28)',
    color: '#fecaca',
  },
  retryBtn: {
    marginLeft: 'auto',
    background: 'none',
    border: 'none',
    color: 'inherit',
    cursor: 'pointer',
    fontWeight: 700,
    fontFamily: 'inherit',
  },
  skeleton: { display: 'flex', flexDirection: 'column', gap: 14 },
  skeletonCard: {
    borderRadius: 18,
    padding: 22,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(148,163,184,0.1)',
  },
  skeletonBar: { height: 13, borderRadius: 8, background: 'rgba(148,163,184,0.14)', marginBottom: 12 },
  empty: {
    borderRadius: 22,
    padding: '52px 24px',
    textAlign: 'center',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(148,163,184,0.12)',
  },
  emptyIcon: { fontSize: 40, marginBottom: 14 },
  emptyTitle: { margin: '0 0 10px', fontSize: 22, color: '#f8fafc', fontWeight: 700 },
  emptyText: { margin: 0, color: '#64748b', lineHeight: 1.6 },
  section: { marginBottom: 32 },
  sectionTitle: { margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: '#e2e8f0' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: 16,
  },
  card: {
    background: 'linear-gradient(180deg, rgba(15,23,42,0.96), rgba(2,6,23,0.96))',
    border: '1px solid rgba(148,163,184,0.15)',
    borderRadius: 20,
    padding: 22,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    boxShadow: '0 16px 36px rgba(2,6,23,0.28)',
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 14,
  },
  cardInfo: { flex: 1, minWidth: 0 },
  listingTitle: { fontSize: 17, fontWeight: 700, color: '#f1f5f9', marginBottom: 4, lineHeight: 1.3 },
  locationLine: { fontSize: 13, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  slotLine: { fontSize: 12, color: '#7dd3fc', marginTop: 3, fontWeight: 600 },
  statusPill: {
    flexShrink: 0,
    padding: '6px 12px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'capitalize',
  },
  metaGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
    gap: 10,
  },
  metaBox: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(148,163,184,0.1)',
    borderRadius: 14,
    padding: '10px 12px',
  },
  metaLabel: { color: '#64748b', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  metaValue: { color: '#f8fafc', fontSize: 22, fontWeight: 800 },
  metaValueSmall: { color: '#e2e8f0', fontSize: 13, fontWeight: 600, lineHeight: 1.4 },
  navSection: { marginTop: 14 },
  navLabel: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#64748b', marginBottom: 8 },
  navRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  navBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '7px 11px',
    borderRadius: 10,
    border: '1px solid rgba(249,115,22,0.28)',
    background: 'rgba(249,115,22,0.08)',
    color: '#fdba74',
    fontSize: 12,
    fontWeight: 600,
    textDecoration: 'none',
    cursor: 'pointer',
  },
  navMapBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '7px 11px',
    borderRadius: 10,
    border: '1px solid rgba(96,165,250,0.28)',
    background: 'rgba(96,165,250,0.08)',
    color: '#7dd3fc',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  cardFooter: { display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', marginTop: 4 },
  cancelBtn: {
    padding: '9px 14px',
    borderRadius: 12,
    border: '1px solid rgba(239,68,68,0.24)',
    background: 'rgba(239,68,68,0.14)',
    color: '#fca5a5',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  cancelBtnDisabled: { opacity: 0.55, cursor: 'not-allowed' },
}
