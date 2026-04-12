import { formatDietaryTagWithIcon as formatTagWithIcon } from "../utils/dietaryTags";
import { getListingVisual, formatTime, getMinutesLeft, formatMinutesLeft } from "../utils/listingUtils";

// ─── Sub-components ───────────────────────────────────────────────────────────

function FoodThumbnail({ listing }) {
  const visual = getListingVisual(listing);
  return (
    <div
      aria-hidden="true"
      style={{
        width: 64, height: 64, borderRadius: "var(--mm-r-xl)", flexShrink: 0,
        position: "relative", overflow: "hidden", display: "flex",
        alignItems: "center", justifyContent: "center",
        background: `linear-gradient(145deg, ${visual.colors[0]} 0%, ${visual.colors[1]} 100%)`,
      }}
    >
      <span style={{ position: "absolute", width: 40, height: 40, borderRadius: "50%", background: `${visual.colors[0]}CC`, top: -8, right: -8 }} />
      <span style={{ fontSize: 26, position: "relative", zIndex: 1 }}>{visual.icon}</span>
      <span style={{ position: "absolute", bottom: 3, right: 5, fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em", color: visual.colors[1], zIndex: 1 }}>{visual.label}</span>
    </div>
  );
}

function InfoBlock({ label, value }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ fontSize: 11, color: "var(--mm-text-4)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--mm-text-2)" }}>{value}</div>
    </div>
  );
}

// ─── ListingCard ──────────────────────────────────────────────────────────────

/**
 * Props:
 *   listing      — the full listing object
 *   isClaiming   — boolean (spinner state)
 *   justClaimed  — boolean (claimed this session)
 *   claimCount   — current qty input value
 *   slotSelection — currently selected slot id (or "")
 *   onClaim      — () => void
 *   onCountChange — (value: string, max: number) => void
 *   onSlotChange  — (slotId: string | null) => void
 *   onShowMap    — () => void
 */
export default function ListingCard({
  listing,
  isClaiming,
  justClaimed,
  claimCount,
  slotSelection,
  onClaim,
  onCountChange,
  onSlotChange,
  onShowMap,
}) {
  const minutesLeft = getMinutesLeft(listing.pickup_end);
  const isUrgent    = minutesLeft > 0 && minutesLeft <= 30;
  const maxQuantity = Number(listing.quantity || 1);

  let statusBadge = "mm-badge-success";
  let statusLabel = "Available";
  if (justClaimed)      { statusBadge = "mm-badge-neutral"; statusLabel = "Claimed"; }
  else if (isUrgent)    { statusBadge = "mm-badge-warning"; statusLabel = "Urgent"; }

  return (
    <div className="mm-card" style={{ display: "flex", flexDirection: "column", gap: 14, padding: 20 }}>
      {/* Card top */}
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ display: "flex", gap: 14, flex: 1, minWidth: 0 }}>
          <FoodThumbnail listing={listing} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--mm-text-4)", fontWeight: 600, marginBottom: 3 }}>
              📍 {listing.location_name || listing.address || "Nearby pickup"}
            </div>
            <h3 style={{ margin: "0 0 4px", fontSize: ".9375rem", fontWeight: 700, color: "var(--mm-text-1)", lineHeight: 1.35, letterSpacing: "-.01em" }}>
              {listing.title}
            </h3>
            <p style={{ margin: 0, fontSize: ".8125rem", color: "var(--mm-text-3)", lineHeight: 1.55 }}>
              {listing.description || "Freshly posted listing."}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
          <span className={`mm-badge ${statusBadge}`}>{statusLabel}</span>
          {listing.match_score != null && listing.match_score >= 55 && (
            <span className="mm-badge mm-badge-partner" title={(listing.match_reasons || []).join(" · ")} style={{ fontSize: 11 }}>
              {Math.round(listing.match_score)}% match
            </span>
          )}
        </div>
      </div>

      {/* Info grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>
        <InfoBlock label="Quantity"      value={`${listing.quantity}`} />
        <InfoBlock label="Pickup starts" value={formatTime(listing.pickup_start)} />
        <InfoBlock label="Pickup ends"   value={formatTime(listing.pickup_end)} />
        <InfoBlock label="Time left"     value={formatMinutesLeft(minutesLeft)} />
      </div>

      {/* Tags */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {(listing.dietary_tags || []).length > 0
          ? listing.dietary_tags.map(tag => (
              <span key={tag} className="mm-badge mm-badge-success" style={{ fontSize: 11 }}>
                {formatTagWithIcon(tag)}
              </span>
            ))
          : <span style={{ color: "var(--mm-text-4)", fontSize: 13 }}>No dietary tags</span>
        }
      </div>

      {/* Address + show on map */}
      {(listing.address || listing.location?.lat != null) && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {listing.address && (
            <span style={{ fontSize: 12, color: "var(--mm-text-4)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {listing.address}
            </span>
          )}
          <button onClick={onShowMap} className="mm-btn mm-btn-ghost mm-btn-sm">Show on map</button>
        </div>
      )}

      {/* Urgent banner */}
      {isUrgent && (
        <div className="mm-alert mm-alert-warning" style={{ marginTop: 0 }}>
          This listing is about to expire. Claim soon for the best chance of pickup.
        </div>
      )}

      {/* Slot picker */}
      {(listing.pickup_slots || []).length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label className="mm-field-label" htmlFor={`slot-${listing.id}`}>Pickup slot</label>
          <select
            id={`slot-${listing.id}`}
            value={slotSelection || ""}
            onChange={e => onSlotChange(e.target.value || null)}
            className="mm-select"
            disabled={justClaimed}
          >
            <option value="">Select a slot…</option>
            {listing.pickup_slots.map(slot => (
              <option key={slot.id} value={slot.id}>{slot.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Claim row */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, borderTop: "1px solid var(--mm-border)", paddingTop: 14, marginTop: 2 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label className="mm-field-label" htmlFor={`qty-${listing.id}`}>Claim qty</label>
          <input
            id={`qty-${listing.id}`}
            type="number" min="1" max={maxQuantity}
            value={claimCount}
            onChange={e => onCountChange(e.target.value, maxQuantity)}
            className="mm-input"
            style={{ width: 90 }}
            disabled={justClaimed}
          />
        </div>
        <button
          onClick={onClaim}
          disabled={justClaimed || isClaiming}
          className={`mm-btn ${justClaimed ? "mm-btn-ghost" : "mm-btn-primary"}`}
          style={{ minWidth: 160 }}
        >
          {justClaimed ? "Claimed" : isClaiming ? "Claiming…" : "Reserve pickup"}
        </button>
      </div>
    </div>
  );
}
