import { useCallback, useEffect, useMemo, useState } from "react";
import { getListings, bulkClaimListing } from "../api/client";
import { useAuth } from "../auth/useAuth";
import { Notification } from "../components/ui/Notification";
import { EmptyState, LoadingSkeleton } from "../components/ui/EmptyState";
import { PageLayout, PageHero } from "../components/ui/PageLayout";

const MAX_BULK = 50;

export default function PartnerPage() {
  const { user } = useAuth();
  const userId = user?.id || "partner-001";

  const [listings, setListings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState(null);

  const [quantities, setQuantities] = useState({});
  const [groupNames, setGroupNames] = useState({});
  const [contactInfos, setContactInfos] = useState({});
  const [slotSelections, setSlotSelections] = useState({});
  const [claimingIds, setClaimingIds] = useState(new Set());
  const [claimedIds, setClaimedIds] = useState(new Set());

  const fetchListings = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await getListings();
      setListings(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Could not load listings.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchListings(); }, [fetchListings]);

  const showNotification = useCallback((msg, type = "success") => {
    setNotification({ msg, type, id: Date.now() });
    setTimeout(() => setNotification(null), 3500);
  }, []);

  const activeListings = useMemo(() => listings.filter(l => l.status === "active"), [listings]);

  const handleBulkClaim = useCallback(async (listing) => {
    if (claimingIds.has(listing.id)) return;

    const qty    = Number(quantities[listing.id] || 1);
    const group   = groupNames[listing.id] || "";
    const contact = contactInfos[listing.id] || "";
    const slotId  = slotSelections[listing.id] || null;
    const slots   = listing.pickup_slots || [];

    if (slots.length > 0 && !slotId) { showNotification("Please select a pickup slot.", "error"); return; }
    if (qty < 1 || qty > MAX_BULK)    { showNotification(`Quantity must be 1–${MAX_BULK}.`, "error"); return; }

    setClaimingIds(prev => new Set(prev).add(listing.id));
    try {
      await bulkClaimListing(listing.id, userId, qty, { slotId, groupName: group, contactInfo: contact });
      setClaimedIds(prev => new Set(prev).add(listing.id));
      showNotification(`Bulk claim of ${qty} item${qty > 1 ? "s" : ""} confirmed.`, "success");
      await fetchListings();
    } catch (err) {
      let msg = err.message || "Could not complete bulk claim.";
      if (err.code === "OVER_QUANTITY")    msg = `Only ${listing.quantity} available.`;
      if (err.code === "UNCLAIMABLE_STATUS") msg = "This listing is no longer available.";
      if (err.code === "SLOT_REQUIRED")    msg = "Please select a valid pickup slot.";
      showNotification(msg, "error");
    } finally {
      setClaimingIds(prev => { const n = new Set(prev); n.delete(listing.id); return n; });
    }
  }, [claimingIds, quantities, groupNames, contactInfos, slotSelections, userId, fetchListings, showNotification]);

  return (
    <PageLayout>
      <PageHero
        eyebrow="Partner Portal"
        title="Community Partner Hub"
        subtitle={`Bulk-claim surplus food for your organization. Up to ${MAX_BULK} items per claim — coordinated pickups, priority access, group logistics.`}
        stats={[
          { num: activeListings.length, label: 'Available now', accent: '#7C3AED' },
        ]}
      />

      {error && (
        <div className="mm-alert mm-alert-error mm-fade-in" style={{ marginBottom: 20 }} role="alert">
          {error}
          <button onClick={fetchListings} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700 }}>
            Retry
          </button>
        </div>
      )}

      {isLoading && <LoadingSkeleton rows={3} />}

      {!isLoading && activeListings.length === 0 && (
        <EmptyState
          icon="🤝"
          title="No active listings"
          text="No surplus food is available right now. Check back soon."
        />
      )}

      {!isLoading && activeListings.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 16 }}>
          {activeListings.map(listing => {
            const alreadyClaimed = claimedIds.has(listing.id);
            const isClaiming     = claimingIds.has(listing.id);
            const slots          = listing.pickup_slots || [];
            const maxQty         = Math.min(listing.quantity, MAX_BULK);

            return (
              <div key={listing.id} className="mm-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: "0 0 4px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".10em", color: "var(--mm-text-4)", fontWeight: 700 }}>
                      📍 {listing.location_name || listing.address || "Location TBD"}
                    </p>
                    <h3 style={{ margin: "0 0 6px", fontSize: "1.0625rem", fontWeight: 700, color: "var(--mm-text-1)", lineHeight: 1.3, letterSpacing: "-.01em" }}>
                      {listing.title}
                    </h3>
                    {listing.description && (
                      <p style={{ margin: 0, fontSize: ".8125rem", color: "var(--mm-text-3)", lineHeight: 1.55 }}>
                        {listing.description}
                      </p>
                    )}
                  </div>
                  <span className={`mm-badge ${alreadyClaimed ? "mm-badge-neutral" : "mm-badge-success"}`}>
                    {alreadyClaimed ? "Claimed" : `${listing.quantity} avail.`}
                  </span>
                </div>

                {/* Tags */}
                {((listing.dietary_tags || []).length > 0 || listing.priority_window_end) && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {(listing.dietary_tags || []).map(t => (
                      <span key={t} className="mm-badge mm-badge-info" style={{ fontSize: 11 }}>{t}</span>
                    ))}
                    {listing.priority_window_end && (
                      <span className="mm-badge mm-badge-partner" style={{ fontSize: 11 }}>Priority access</span>
                    )}
                  </div>
                )}

                {/* Claim form */}
                {!alreadyClaimed && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, borderTop: "1px solid var(--mm-border)", paddingTop: 14 }}>
                    <div style={{ display: "flex", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <label className="mm-label" htmlFor={`qty-${listing.id}`}>Quantity (max {maxQty})</label>
                        <input
                          id={`qty-${listing.id}`} type="number" min={1} max={maxQty}
                          value={quantities[listing.id] ?? 1}
                          onChange={e => setQuantities(prev => ({ ...prev, [listing.id]: Math.max(1, Math.min(maxQty, Number(e.target.value))) }))}
                          className="mm-input" disabled={isClaiming}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label className="mm-label" htmlFor={`group-${listing.id}`}>Group / org name</label>
                        <input
                          id={`group-${listing.id}`} type="text" placeholder="e.g. City Food Bank"
                          value={groupNames[listing.id] || ""}
                          onChange={e => setGroupNames(prev => ({ ...prev, [listing.id]: e.target.value }))}
                          className="mm-input" disabled={isClaiming}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mm-label" htmlFor={`contact-${listing.id}`}>Contact info (optional)</label>
                      <input
                        id={`contact-${listing.id}`} type="text" placeholder="coordinator@org.example"
                        value={contactInfos[listing.id] || ""}
                        onChange={e => setContactInfos(prev => ({ ...prev, [listing.id]: e.target.value }))}
                        className="mm-input" disabled={isClaiming}
                      />
                    </div>

                    {slots.length > 0 && (
                      <div>
                        <label className="mm-label" htmlFor={`slot-${listing.id}`}>Pickup slot</label>
                        <select
                          id={`slot-${listing.id}`}
                          value={slotSelections[listing.id] || ""}
                          onChange={e => setSlotSelections(prev => ({ ...prev, [listing.id]: e.target.value }))}
                          className="mm-select" disabled={isClaiming}
                        >
                          <option value="">Select a slot…</option>
                          {slots.map(slot => <option key={slot.id} value={slot.id}>{slot.label}</option>)}
                        </select>
                      </div>
                    )}

                    <button
                      onClick={() => handleBulkClaim(listing)}
                      disabled={isClaiming}
                      className="mm-btn mm-btn-partner mm-btn-full"
                      style={{ borderRadius: 'var(--mm-r-xl)' }}
                    >
                      {isClaiming ? "Claiming…" : "Bulk Claim"}
                    </button>
                  </div>
                )}

                {alreadyClaimed && (
                  <div className="mm-alert mm-alert-success" style={{ marginTop: 4 }}>
                    ✓ Claim registered. Coordinate pickup with the restaurant.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Notification notification={notification ? { ...notification, message: notification.msg } : null} />
    </PageLayout>
  );
}
