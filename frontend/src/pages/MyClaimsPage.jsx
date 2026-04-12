import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMyClaims, cancelClaim } from '../api/client'
import { Notification } from '../components/ui/Notification'
import { EmptyState, LoadingSkeleton, ErrorState } from '../components/ui/EmptyState'
import { PageLayout, PageHero } from '../components/ui/PageLayout'

function formatTime(dateString) {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

const STATUS_MAP = {
  confirmed: { cls: 'mm-badge-success', label: 'Confirmed' },
  cancelled: { cls: 'mm-badge-neutral', label: 'Cancelled' },
  pending:   { cls: 'mm-badge-brand',   label: 'Pending' },
}

const NAV_MODES = [
  { key: 'driving',   label: '🚗 Drive' },
  { key: 'walking',   label: '🚶 Walk' },
  { key: 'bicycling', label: '🚴 Bike' },
  { key: 'transit',   label: '🚌 Transit' },
]

export default function MyClaimsPage() {
  const navigate = useNavigate()
  const [myClaims,      setMyClaims]      = useState([])
  const [isLoading,     setIsLoading]     = useState(true)
  const [error,         setError]         = useState(null)
  const [cancellingIds, setCancellingIds] = useState(new Set())
  const [notification,  setNotification]  = useState(null)

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type, id: Date.now() })
    setTimeout(() => setNotification(null), 3500)
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

  const handleNavigate = useCallback((listing, mode) => {
    if (!listing) return
    // autoNav / navMode are consumed by RecipientFeed's pendingNav state machine
    navigate('/browse', {
      state: {
        focusListingId: listing.id,
        autoNav: true,
        navMode: mode,
        source: 'my-claims',
      },
    })
  }, [navigate])

  const handleCancel = async (claim) => {
    if (cancellingIds.has(claim.id)) return
    setCancellingIds(prev => new Set(prev).add(claim.id))
    try {
      await cancelClaim(claim.id)
      showNotification('Claim cancelled — listing quantity restored.', 'success')
      await fetchClaims()
    } catch (err) {
      showNotification(err.message || 'Could not cancel claim.', 'error')
    } finally {
      setCancellingIds(prev => { const n = new Set(prev); n.delete(claim.id); return n })
    }
  }

  const confirmed = myClaims.filter(c => c.status === 'confirmed')
  const past      = myClaims.filter(c => c.status !== 'confirmed')

  return (
    <PageLayout>
      <PageHero
        eyebrow="Recipient"
        title="My Claims"
        subtitle="Track active pickups and past reservations. Cancel a confirmed claim to free inventory for others."
        stats={[{ num: confirmed.length, label: 'Active', accent: 'var(--mm-brand)' }]}
      />

      {error && (
        <ErrorState message={error} onRetry={fetchClaims} />
      )}

      {isLoading && <LoadingSkeleton rows={4} />}

      {!isLoading && !error && myClaims.length === 0 && (
        <EmptyState
          icon="📋"
          title="No claims yet"
          text="Browse available listings and reserve a pickup to see your claims here."
          action={
            <button onClick={() => navigate('/browse')} className="mm-btn mm-btn-primary">
              Browse food
            </button>
          }
        />
      )}

      {!isLoading && myClaims.length > 0 && (
        <>
          {confirmed.length > 0 && (
            <section style={{ marginBottom: 36 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--mm-text-2)', letterSpacing: '-.01em' }}>
                  Active Reservations
                </h2>
                <span className="mm-badge mm-badge-success">{confirmed.length}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
                {confirmed.map(claim => (
                  <ClaimCard
                    key={claim.id}
                    claim={claim}
                    isCancelling={cancellingIds.has(claim.id)}
                    onCancel={handleCancel}
                    onShowMap={handleShowOnMap}
                    onNavigate={handleNavigate}
                  />
                ))}
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--mm-text-3)', letterSpacing: '-.01em' }}>
                  Past Claims
                </h2>
                <span className="mm-badge mm-badge-neutral">{past.length}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
                {past.map(claim => (
                  <ClaimCard key={claim.id} claim={claim} onShowMap={handleShowOnMap} onNavigate={handleNavigate} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <Notification notification={notification} />
    </PageLayout>
  )
}

function ClaimCard({ claim, isCancelling, onCancel, onShowMap, onNavigate }) {
  const listing    = claim.listing
  const statusInfo = STATUS_MAP[claim.status] || STATUS_MAP.pending
  const canCancel  = claim.status === 'confirmed' && onCancel
  const hasLocation = listing && (listing.address || listing.location_name || listing?.lat != null)
  const canShowMap  = listing && (listing.address || listing.location?.lat != null)

  return (
    <div className="mm-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontSize: '.9375rem', fontWeight: 700, color: 'var(--mm-text-1)', marginBottom: 4, lineHeight: 1.3, letterSpacing: '-.01em' }}>
            {listing?.title || '(listing removed)'}
          </h3>
          {(listing?.location_name || listing?.address) && (
            <p style={{ fontSize: '.8125rem', color: 'var(--mm-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              📍 {listing.location_name || listing.address}
            </p>
          )}
          {claim.slot_id && listing?.pickup_slots?.length > 0 && (() => {
            const slot = listing.pickup_slots.find(sl => sl.id === claim.slot_id)
            return slot ? (
              <p style={{ fontSize: '.75rem', color: 'var(--mm-info)', marginTop: 3, fontWeight: 600 }}>
                🕐 {slot.label}
              </p>
            ) : null
          })()}
        </div>
        <span className={`mm-badge ${statusInfo.cls}`}>{statusInfo.label}</span>
      </div>

      {/* Meta */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8 }}>
        <MetaItem label="Qty claimed"  value={claim.claimed_quantity} />
        <MetaItem label="Reserved at"  value={formatTime(claim.claimed_at)} small />
        {listing && <MetaItem label="Pickup ends" value={formatTime(listing.pickup_end)} small />}
      </div>

      {/* Navigation — only for confirmed claims */}
      {claim.status === 'confirmed' && hasLocation && (
        <div style={{ borderTop: '1px solid var(--mm-border)', paddingTop: 14 }}>
          <p style={{ fontSize: '.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--mm-text-4)', marginBottom: 10 }}>
            Navigate to pickup
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {NAV_MODES.map(mode => (
              <button
                key={mode.key}
                onClick={() => onNavigate(listing, mode.key)}
                className="mm-btn mm-btn-ghost mm-btn-sm"
              >
                {mode.label}
              </button>
            ))}
            {canShowMap && (
              <button
                onClick={() => onShowMap(listing)}
                className="mm-btn mm-btn-info mm-btn-sm"
              >
                Show on map
              </button>
            )}
          </div>
        </div>
      )}

      {/* Cancel */}
      {canCancel && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => onCancel(claim)}
            disabled={isCancelling}
            className="mm-btn mm-btn-danger mm-btn-sm"
          >
            {isCancelling ? 'Cancelling…' : 'Cancel reservation'}
          </button>
        </div>
      )}
    </div>
  )
}

function MetaItem({ label, value, small }) {
  return (
    <div style={{
      background: 'var(--mm-surface-2)',
      border: '1px solid var(--mm-border)',
      borderRadius: 'var(--mm-r-md)',
      padding: '10px 12px',
    }}>
      <div style={{ fontSize: '.625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--mm-text-4)', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ color: 'var(--mm-text-1)', fontSize: small ? '.8125rem' : '1.375rem', fontWeight: small ? 600 : 800, lineHeight: small ? 1.4 : 1 }}>
        {value}
      </div>
    </div>
  )
}
