import { useCallback, useEffect, useMemo, useState } from "react";
import { getListings, bulkClaimListing } from "../api/client";
import { useAuth } from "../auth/useAuth";

const MAX_BULK = 50;

export default function PartnerPage() {
  const { user } = useAuth();
  const userId = user?.id || "partner-001";

  const [listings, setListings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState(null);

  // Per-listing form state
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

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  const showNotification = useCallback((msg, type = "success") => {
    setNotification({ msg, type, id: Date.now() });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  const activeListings = useMemo(
    () => listings.filter((l) => l.status === "active"),
    [listings]
  );

  const handleBulkClaim = useCallback(
    async (listing) => {
      if (claimingIds.has(listing.id)) return;

      const qty = Number(quantities[listing.id] || 1);
      const group = groupNames[listing.id] || "";
      const contact = contactInfos[listing.id] || "";
      const slotId = slotSelections[listing.id] || null;

      const slots = listing.pickup_slots || [];
      if (slots.length > 0 && !slotId) {
        showNotification("Please select a pickup slot.", "error");
        return;
      }

      if (qty < 1 || qty > MAX_BULK) {
        showNotification(`Quantity must be 1–${MAX_BULK}.`, "error");
        return;
      }

      setClaimingIds((prev) => new Set(prev).add(listing.id));
      try {
        await bulkClaimListing(listing.id, userId, qty, {
          slotId,
          groupName: group,
          contactInfo: contact,
        });
        setClaimedIds((prev) => new Set(prev).add(listing.id));
        showNotification(
          `Bulk claim of ${qty} item${qty > 1 ? "s" : ""} confirmed.`,
          "success"
        );
        await fetchListings();
      } catch (err) {
        let msg = err.message || "Could not complete bulk claim.";
        if (err.code === "OVER_QUANTITY") msg = `Only ${listing.quantity} available.`;
        if (err.code === "UNCLAIMABLE_STATUS") msg = "This listing is no longer available.";
        if (err.code === "SLOT_REQUIRED") msg = "Please select a valid pickup slot.";
        showNotification(msg, "error");
      } finally {
        setClaimingIds((prev) => {
          const next = new Set(prev);
          next.delete(listing.id);
          return next;
        });
      }
    },
    [claimingIds, quantities, groupNames, contactInfos, slotSelections, userId, fetchListings, showNotification]
  );

  return (
    <div style={s.page}>
      <section style={s.hero}>
        <div>
          <p style={s.eyebrow}>MealMatch · Partner Portal</p>
          <h1 style={s.title}>Community Partner Hub</h1>
          <p style={s.subtitle}>
            Bulk-claim surplus food for your organization. Up to {MAX_BULK} items
            per claim — coordinated pickups, priority access, group logistics.
          </p>
        </div>
        <div style={s.statBadge}>
          <div style={s.statNum}>{activeListings.length}</div>
          <div style={s.statLabel}>Available now</div>
        </div>
      </section>

      {notification && (
        <div
          style={{
            ...s.toast,
            ...(notification.type === "success" ? s.toastSuccess : s.toastError),
          }}
        >
          {notification.msg}
        </div>
      )}

      {error && <div style={{ ...s.toast, ...s.toastError }}>{error}</div>}

      {isLoading ? (
        <div style={s.empty}>Loading available listings…</div>
      ) : activeListings.length === 0 ? (
        <div style={s.empty}>No active listings right now. Check back soon.</div>
      ) : (
        <div style={s.grid}>
          {activeListings.map((listing) => {
            const alreadyClaimed = claimedIds.has(listing.id);
            const isClaiming = claimingIds.has(listing.id);
            const slots = listing.pickup_slots || [];
            const maxQty = Math.min(listing.quantity, MAX_BULK);

            return (
              <div key={listing.id} style={s.card}>
                <div style={s.cardHeader}>
                  <div>
                    <p style={s.cardLocation}>
                      {listing.location_name || listing.address || "Pickup location TBD"}
                    </p>
                    <h3 style={s.cardTitle}>{listing.title}</h3>
                    <p style={s.cardDesc}>{listing.description}</p>
                  </div>
                  <span style={{ ...s.badge, ...(alreadyClaimed ? s.badgeClaimed : s.badgeActive) }}>
                    {alreadyClaimed ? "Claimed" : `${listing.quantity} avail.`}
                  </span>
                </div>

                <div style={s.tagRow}>
                  {(listing.dietary_tags || []).map((t) => (
                    <span key={t} style={s.tag}>{t}</span>
                  ))}
                  {listing.priority_window_end && (
                    <span style={s.priorityTag}>Priority access</span>
                  )}
                </div>

                {!alreadyClaimed && (
                  <div style={s.form}>
                    <div style={s.formRow}>
                      <div style={s.fieldGroup}>
                        <label style={s.label}>Quantity (max {maxQty})</label>
                        <input
                          type="number"
                          min={1}
                          max={maxQty}
                          value={quantities[listing.id] ?? 1}
                          onChange={(e) =>
                            setQuantities((prev) => ({
                              ...prev,
                              [listing.id]: Math.max(1, Math.min(maxQty, Number(e.target.value))),
                            }))
                          }
                          style={s.input}
                          disabled={isClaiming}
                        />
                      </div>
                      <div style={s.fieldGroup}>
                        <label style={s.label}>Group / org name</label>
                        <input
                          type="text"
                          placeholder="e.g. City Food Bank"
                          value={groupNames[listing.id] || ""}
                          onChange={(e) =>
                            setGroupNames((prev) => ({ ...prev, [listing.id]: e.target.value }))
                          }
                          style={s.input}
                          disabled={isClaiming}
                        />
                      </div>
                    </div>

                    <div style={s.fieldGroup}>
                      <label style={s.label}>Contact info (optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. coordinator@foodbank.org"
                        value={contactInfos[listing.id] || ""}
                        onChange={(e) =>
                          setContactInfos((prev) => ({ ...prev, [listing.id]: e.target.value }))
                        }
                        style={s.input}
                        disabled={isClaiming}
                      />
                    </div>

                    {slots.length > 0 && (
                      <div style={s.fieldGroup}>
                        <label style={s.label}>Pickup slot</label>
                        <select
                          value={slotSelections[listing.id] || ""}
                          onChange={(e) =>
                            setSlotSelections((prev) => ({ ...prev, [listing.id]: e.target.value }))
                          }
                          style={s.select}
                          disabled={isClaiming}
                        >
                          <option value="">Select a slot…</option>
                          {slots.map((slot) => (
                            <option key={slot.id} value={slot.id}>
                              {slot.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <button
                      onClick={() => handleBulkClaim(listing)}
                      disabled={isClaiming}
                      style={{ ...s.claimBtn, ...(isClaiming ? s.claimBtnDisabled : {}) }}
                    >
                      {isClaiming ? "Claiming…" : "Bulk Claim"}
                    </button>
                  </div>
                )}

                {alreadyClaimed && (
                  <div style={s.claimedNote}>
                    Claim registered. Coordinate pickup with the restaurant.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  page: { color: "#e5eefc", paddingBottom: 48 },
  hero: {
    maxWidth: 1200, margin: "0 auto 24px", borderRadius: 28, padding: 32,
    background: "radial-gradient(circle at top right, rgba(168,85,247,0.22), transparent 28%), linear-gradient(135deg, #020617 0%, #0f172a 45%, #111827 100%)",
    border: "1px solid rgba(148,163,184,0.18)",
    boxShadow: "0 28px 80px rgba(2,6,23,0.42)",
    display: "flex", justifyContent: "space-between", alignItems: "center",
    gap: 24, flexWrap: "wrap",
  },
  eyebrow: { margin: "0 0 10px", fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(216,180,254,0.9)", fontWeight: 700 },
  title: { margin: "0 0 12px", fontSize: 42, lineHeight: 1.05, color: "#f8fbff" },
  subtitle: { margin: 0, maxWidth: 680, fontSize: 16, lineHeight: 1.7, color: "rgba(226,232,240,0.92)" },
  statBadge: { minWidth: 160, padding: 22, borderRadius: 22, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(148,163,184,0.18)", textAlign: "center" },
  statNum: { fontSize: 36, fontWeight: 800, color: "#fff" },
  statLabel: { fontSize: 13, color: "#cbd5e1" },
  toast: { maxWidth: 1200, margin: "0 auto 16px", padding: "12px 20px", borderRadius: 12, fontSize: 14, fontWeight: 600 },
  toastSuccess: { background: "rgba(34,197,94,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.25)" },
  toastError: { background: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.25)" },
  empty: { maxWidth: 1200, margin: "48px auto", textAlign: "center", color: "#64748b", fontSize: 15 },
  grid: { maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 20 },
  card: { background: "rgba(15,23,42,0.72)", border: "1px solid rgba(148,163,184,0.12)", borderRadius: 22, padding: 24, boxShadow: "0 18px 40px rgba(2,6,23,0.22)" },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 },
  cardLocation: { margin: "0 0 4px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#64748b", fontWeight: 700 },
  cardTitle: { margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: "#f1f5f9" },
  cardDesc: { margin: 0, fontSize: 13, color: "#94a3b8", lineHeight: 1.5 },
  badge: { padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, flexShrink: 0, whiteSpace: "nowrap" },
  badgeActive: { background: "rgba(34,197,94,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" },
  badgeClaimed: { background: "rgba(148,163,184,0.1)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.2)" },
  tagRow: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 },
  tag: { padding: "3px 10px", borderRadius: 999, fontSize: 11, background: "rgba(59,130,246,0.1)", color: "#93c5fd", border: "1px solid rgba(59,130,246,0.18)" },
  priorityTag: { padding: "3px 10px", borderRadius: 999, fontSize: 11, background: "rgba(168,85,247,0.14)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.25)", fontWeight: 700 },
  form: { display: "flex", flexDirection: "column", gap: 14 },
  formRow: { display: "flex", gap: 12 },
  fieldGroup: { display: "flex", flexDirection: "column", gap: 6, flex: 1 },
  label: { fontSize: 12, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" },
  input: { padding: "9px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.18)", background: "rgba(255,255,255,0.05)", color: "#f1f5f9", fontSize: 14, fontFamily: "inherit", outline: "none" },
  select: { padding: "9px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.18)", background: "rgba(15,23,42,0.9)", color: "#f1f5f9", fontSize: 14, fontFamily: "inherit", outline: "none" },
  claimBtn: { padding: "11px 20px", borderRadius: 12, border: "none", background: "rgba(168,85,247,0.85)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "opacity 0.15s" },
  claimBtnDisabled: { opacity: 0.5, cursor: "not-allowed" },
  claimedNote: { marginTop: 8, padding: "10px 14px", borderRadius: 10, background: "rgba(34,197,94,0.08)", color: "#4ade80", fontSize: 13, border: "1px solid rgba(34,197,94,0.15)" },
};
