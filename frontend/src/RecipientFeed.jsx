import { useEffect, useState, useCallback } from 'react'
import { getListings, claimListing } from './api/client'

function formatTime(dateString) {
  const d = new Date(dateString)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function getTimeLeft(dateString) {
  const now = Date.now()
  const end = new Date(dateString).getTime()
  const diffMs = end - now
  if (diffMs <= 0) return null
  const totalMinutes = Math.floor(diffMs / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return `${hours}h ${minutes}m left`
  return `${minutes}m left`
}

function formatTag(tag) {
  return tag
    .split('_')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
}

export default function RecipientFeed() {
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState(null)
  const [toasts, setToasts] = useState([])
  const [claimingId, setClaimingId] = useState(null)

  const addToast = useCallback((message, type) => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }, [])

  const fetchListings = useCallback(async () => {
    try {
      const data = await getListings()
      setListings(Array.isArray(data) ? data : [])
    } catch {
      // silently keep existing data on poll errors
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchListings()
    const interval = setInterval(fetchListings, 30000)
    return () => clearInterval(interval)
  }, [fetchListings])

  async function handleClaim(listing) {
    setClaimingId(listing.id)
    try {
      await claimListing(listing.id, 'user-demo', 1)
      addToast(`Claimed "${listing.title}" successfully!`, 'success')
      await fetchListings()
    } catch {
      addToast('Failed to claim listing. Please try again.', 'error')
    } finally {
      setClaimingId(null)
    }
  }

  const allTags = Array.from(
    new Set(listings.flatMap((l) => l.dietary_tags || []))
  )

  const filtered =
    activeFilter
      ? listings.filter((l) => (l.dietary_tags || []).includes(activeFilter))
      : listings

  if (loading) {
    return (
      <div style={styles.centered}>
        <div style={styles.loadingSpinner} />
        <p style={styles.loadingText}>Loading available food...</p>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      {/* Toasts */}
      <div style={styles.toastContainer}>
        {toasts.map((toast) => (
          <div
            key={toast.id}
            style={{
              ...styles.toast,
              ...(toast.type === 'success' ? styles.toastSuccess : styles.toastError),
            }}
          >
            {toast.message}
          </div>
        ))}
      </div>

      {/* Hero */}
      <section style={styles.hero}>
        <div style={styles.heroContent}>
          <h1 style={styles.heroTitle}>Available Food Near You</h1>
          <p style={styles.heroSubtitle}>
            Fresh surplus food from local restaurants — claim a listing before pickup closes.
          </p>
        </div>
        <div style={styles.heroBadge}>
          <span style={styles.heroBadgeNumber}>{listings.length}</span>
          <span style={styles.heroBadgeLabel}>
            {listings.length === 1 ? 'Listing Available' : 'Listings Available'}
          </span>
        </div>
      </section>

      {/* Filter chips */}
      {allTags.length > 0 && (
        <div style={styles.filterRow}>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveFilter(activeFilter === tag ? null : tag)}
              style={{
                ...styles.filterChip,
                ...(activeFilter === tag ? styles.filterChipActive : {}),
              }}
            >
              {formatTag(tag)}
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      {filtered.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyEmoji}>🍽</div>
          <h2 style={styles.emptyTitle}>No listings available right now</h2>
          <p style={styles.emptyText}>
            Check back near closing time — restaurants typically post surplus food in the evening.
          </p>
        </div>
      ) : (
        <div style={styles.grid}>
          {filtered.map((listing) => {
            const timeLeft = getTimeLeft(listing.pickup_end)
            const urgent = listing.is_urgent === true
            const isClaiming = claimingId === listing.id

            return (
              <div
                key={listing.id}
                style={{
                  ...styles.card,
                  ...(urgent ? styles.cardUrgent : {}),
                }}
              >
                {urgent && (
                  <div style={styles.urgentBadge}>⚡ Expiring Soon</div>
                )}

                {/* Card header */}
                <div style={styles.cardHeader}>
                  <h3 style={styles.cardTitle}>{listing.title}</h3>
                  <span style={styles.quantityBadge}>
                    {listing.quantity} {listing.quantity === 1 ? 'portion' : 'portions'}
                  </span>
                </div>

                {/* Description */}
                <p style={styles.cardDescription}>{listing.description}</p>

                {/* Pickup window */}
                <div style={styles.pickupBox}>
                  <div style={styles.pickupRow}>
                    <span style={styles.pickupLabel}>Pickup window</span>
                    <span style={styles.pickupTime}>
                      {formatTime(listing.pickup_start)} – {formatTime(listing.pickup_end)}
                    </span>
                  </div>
                  {timeLeft && (
                    <span
                      style={{
                        ...styles.timeLeftBadge,
                        ...(urgent ? styles.timeLeftBadgeUrgent : {}),
                      }}
                    >
                      {timeLeft}
                    </span>
                  )}
                </div>

                {/* Dietary tags */}
                {listing.dietary_tags?.length > 0 && (
                  <div style={styles.tagRow}>
                    {listing.dietary_tags.map((tag) => (
                      <span key={tag} style={styles.tag}>
                        {formatTag(tag)}
                      </span>
                    ))}
                  </div>
                )}

                {/* Claim button */}
                <button
                  onClick={() => handleClaim(listing)}
                  disabled={isClaiming}
                  style={{
                    ...styles.claimBtn,
                    ...(isClaiming ? styles.claimBtnDisabled : {}),
                  }}
                >
                  {isClaiming ? 'Claiming...' : 'Claim This Listing'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const styles = {
  page: {
    padding: '32px 24px 48px',
    maxWidth: '1400px',
    margin: '0 auto',
    width: '100%',
    position: 'relative',
  },
  centered: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    gap: '16px',
  },
  loadingSpinner: {
    width: '40px',
    height: '40px',
    border: '3px solid rgba(148,163,184,0.2)',
    borderTop: '3px solid #22c55e',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: {
    color: 'rgba(148,163,184,0.7)',
    fontSize: '15px',
  },
  toastContainer: {
    position: 'fixed',
    top: '80px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  toast: {
    padding: '12px 20px',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: 600,
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    maxWidth: '420px',
    textAlign: 'center',
    pointerEvents: 'auto',
  },
  toastSuccess: {
    background: 'rgba(20,83,45,0.95)',
    color: '#bbf7d0',
    border: '1px solid rgba(34,197,94,0.4)',
  },
  toastError: {
    background: 'rgba(127,29,29,0.95)',
    color: '#fecaca',
    border: '1px solid rgba(239,68,68,0.4)',
  },
  hero: {
    background:
      'radial-gradient(circle at top right, rgba(34,197,94,0.12), transparent 40%), linear-gradient(135deg, #0a1628 0%, #020817 100%)',
    border: '1px solid rgba(148,163,184,0.12)',
    borderRadius: '24px',
    padding: '36px 32px',
    marginBottom: '28px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '24px',
    flexWrap: 'wrap',
  },
  heroContent: {
    flex: 1,
  },
  heroTitle: {
    fontSize: '38px',
    fontWeight: 800,
    color: '#f1f5f9',
    letterSpacing: '-0.02em',
    marginBottom: '12px',
  },
  heroSubtitle: {
    fontSize: '16px',
    color: 'rgba(203,213,225,0.85)',
    lineHeight: 1.65,
    maxWidth: '580px',
  },
  heroBadge: {
    background: 'rgba(34,197,94,0.1)',
    border: '1px solid rgba(34,197,94,0.22)',
    borderRadius: '20px',
    padding: '20px 28px',
    textAlign: 'center',
    flexShrink: 0,
  },
  heroBadgeNumber: {
    display: 'block',
    fontSize: '42px',
    fontWeight: 800,
    color: '#22c55e',
    lineHeight: 1,
  },
  heroBadgeLabel: {
    display: 'block',
    fontSize: '13px',
    color: 'rgba(148,163,184,0.7)',
    marginTop: '6px',
    fontWeight: 500,
  },
  filterRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: '28px',
  },
  filterChip: {
    padding: '8px 16px',
    borderRadius: '999px',
    border: '1px solid rgba(148,163,184,0.18)',
    background: 'rgba(255,255,255,0.04)',
    color: 'rgba(203,213,225,0.85)',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '13px',
    fontFamily: 'inherit',
    transition: 'background 0.15s, border-color 0.15s',
  },
  filterChipActive: {
    background: 'rgba(34,197,94,0.14)',
    border: '1px solid rgba(34,197,94,0.4)',
    color: '#22c55e',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: '20px',
  },
  card: {
    background: 'rgba(13,22,43,0.85)',
    border: '1px solid rgba(148,163,184,0.12)',
    borderRadius: '20px',
    padding: '22px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    transition: 'border-color 0.2s',
  },
  cardUrgent: {
    border: '1px solid rgba(249,115,22,0.45)',
    boxShadow: '0 0 0 1px rgba(249,115,22,0.15), 0 16px 40px rgba(249,115,22,0.08)',
  },
  urgentBadge: {
    display: 'inline-flex',
    alignSelf: 'flex-start',
    padding: '5px 12px',
    borderRadius: '999px',
    background: 'rgba(249,115,22,0.16)',
    color: '#f97316',
    fontSize: '12px',
    fontWeight: 700,
    border: '1px solid rgba(249,115,22,0.3)',
    letterSpacing: '0.02em',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
  },
  cardTitle: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#f1f5f9',
    lineHeight: 1.25,
    flex: 1,
  },
  quantityBadge: {
    padding: '5px 11px',
    borderRadius: '999px',
    background: 'rgba(59,130,246,0.14)',
    border: '1px solid rgba(59,130,246,0.28)',
    color: '#93c5fd',
    fontSize: '12px',
    fontWeight: 700,
    flexShrink: 0,
  },
  cardDescription: {
    fontSize: '14px',
    color: 'rgba(203,213,225,0.85)',
    lineHeight: 1.6,
  },
  pickupBox: {
    background: 'rgba(2,6,23,0.5)',
    border: '1px solid rgba(148,163,184,0.12)',
    borderRadius: '12px',
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  pickupRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  pickupLabel: {
    fontSize: '11px',
    fontWeight: 700,
    color: 'rgba(148,163,184,0.7)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  pickupTime: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  timeLeftBadge: {
    alignSelf: 'flex-start',
    padding: '3px 10px',
    borderRadius: '999px',
    background: 'rgba(59,130,246,0.14)',
    color: '#93c5fd',
    fontSize: '12px',
    fontWeight: 700,
    border: '1px solid rgba(59,130,246,0.2)',
  },
  timeLeftBadgeUrgent: {
    background: 'rgba(249,115,22,0.14)',
    color: '#f97316',
    border: '1px solid rgba(249,115,22,0.28)',
  },
  tagRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  tag: {
    padding: '5px 11px',
    borderRadius: '999px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(148,163,184,0.14)',
    color: '#dbeafe',
    fontSize: '12px',
    fontWeight: 600,
  },
  claimBtn: {
    marginTop: 'auto',
    padding: '13px 18px',
    borderRadius: '12px',
    border: 'none',
    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
    color: '#ffffff',
    fontWeight: 700,
    fontSize: '14px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    boxShadow: '0 8px 20px rgba(34,197,94,0.22)',
    transition: 'opacity 0.15s',
  },
  claimBtnDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '360px',
    gap: '14px',
    textAlign: 'center',
  },
  emptyEmoji: {
    fontSize: '56px',
    lineHeight: 1,
  },
  emptyTitle: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#f1f5f9',
  },
  emptyText: {
    fontSize: '15px',
    color: 'rgba(148,163,184,0.7)',
    maxWidth: '420px',
    lineHeight: 1.65,
  },
}
