import { useEffect, useMemo, useState } from "react";
import {
  getAdminListings,
  createListing,
  updateListingStatus,
  getDemandPrediction,
} from "./api/client";
import { useAuth } from "./auth/useAuth";
import { formatDietaryTagWithIcon as formatTagWithIcon } from "./utils/dietaryTags";
import ListingForm from "./components/ListingForm";

export default function RestaurantDashboard() {
  const [listings, setListings] = useState([]);
  const [selectedTab, setSelectedTab] = useState("active");

  // isLoading: true only on initial mount (shows skeletons)
  // isFetching: true on every fetch including post-mutation (shows refresh indicator only)
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [predictions, setPredictions] = useState({}); // listingId → DemandPrediction

  const { user } = useAuth();
  const restaurantId = user?.id || "rest-001";

  useEffect(() => {
    fetchListings({ initial: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchListings({ initial = false } = {}) {
    if (initial) setIsLoading(true);
    setIsFetching(true);
    setError("");
    try {
      const data = await getAdminListings();
      // Single canonical source: all tabs are derived from this array
      const restaurantListings = Array.isArray(data)
        ? data.filter((l) => l.restaurant_id === restaurantId)
        : [];
      setListings(restaurantListings);
    } catch (err) {
      setError(err.message || "Something went wrong while loading listings.");
    } finally {
      if (initial) setIsLoading(false);
      setIsFetching(false);
    }
  }

  async function handleSubmit(payload, localError, onReset) {
    if (localError) {
      setError(localError);
      return;
    }
    setError("");
    setSuccessMessage("");
    try {
      setIsSubmitting(true);
      await createListing(payload);
      onReset();
      await fetchListings();
      setSuccessMessage("Listing created successfully.");
      setSelectedTab("active");
    } catch (err) {
      setError(err.message || "Something went wrong while creating the listing.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleFetchPrediction(listingId) {
    try {
      const data = await getDemandPrediction(listingId);
      setPredictions((prev) => ({ ...prev, [listingId]: data }));
    } catch {
      // silently ignore — prediction is non-blocking
    }
  }

  async function handleStatusUpdate(listingId, newStatus) {
    try {
      setError("");
      setSuccessMessage("");

      await updateListingStatus(listingId, newStatus);
      await fetchListings();

      setSuccessMessage(`Listing marked as ${newStatus}.`);
    } catch (err) {
      setError(err.message || "Something went wrong while updating the listing.");
    }
  }

  const activeListings = useMemo(
    () =>
      listings.filter(
        (listing) => (listing.status || "").toLowerCase() === "active"
      ),
    [listings]
  );

  const claimedListings = useMemo(
    () =>
      listings.filter(
        (listing) => (listing.status || "").toLowerCase() === "claimed"
      ),
    [listings]
  );

  const expiredListings = useMemo(
    () =>
      listings.filter(
        (listing) => (listing.status || "").toLowerCase() === "expired"
      ),
    [listings]
  );

  const totalMeals = useMemo(() => {
    return listings.reduce(
      (sum, listing) => sum + Number(listing.quantity || 0),
      0
    );
  }, [listings]);

  // Both derived purely from canonical `listings` — no separate persisted state
  const tabCounts = useMemo(
    () => ({
      active: activeListings.length,
      claimed: claimedListings.length,
      expired: expiredListings.length,
    }),
    [activeListings, claimedListings, expiredListings]
  );

  const displayedListings = useMemo(() => {
    if (selectedTab === "claimed") return claimedListings;
    if (selectedTab === "expired") return expiredListings;
    return activeListings;
  }, [selectedTab, activeListings, claimedListings, expiredListings]);

  const savedAddresses = useMemo(
    () => listings.map((listing) => listing.address).filter(Boolean),
    [listings]
  );

  return (
    <div className="mm-page-wrap">
      {/* Hero */}
      <div className="mm-page-hero" style={{ marginBottom: 24 }}>
        <div>
          <p className="mm-page-hero-eyebrow">Restaurant Portal</p>
          <h1 className="mm-page-hero-title">Restaurant Dashboard</h1>
          <p className="mm-page-hero-subtitle">
            Create surplus food listings, manage statuses, and monitor active,
            claimed, and expired inventory from backend-synced data.
          </p>
        </div>
        <div className="mm-page-hero-stat">
          <div className="mm-page-hero-stat-num">{activeListings.length}</div>
          <div className="mm-page-hero-stat-label">Currently Active</div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="mm-stats-grid">
        {[
          { label: "Active Listings",    value: activeListings.length },
          { label: "Claimed Listings",   value: claimedListings.length },
          { label: "Expired Listings",   value: expiredListings.length },
          { label: "Total Meals Posted", value: totalMeals },
        ].map(({ label, value }) => (
          <div key={label} className="mm-stats-card">
            <p className="mm-stats-card-label">{label}</p>
            <h3 className="mm-stats-card-value">{value}</h3>
          </div>
        ))}
      </div>

      {/* Main grid: form + listings */}
      <div style={s.mainGrid}>
        {/* ── Create form ─────────────────────────────────── */}
        <div className="mm-card" style={s.panelCard}>
          <div style={s.sectionHeader}>
            <p style={s.sectionKicker}>Listing Creation</p>
            <h2 style={s.sectionTitle}>Create New Listing</h2>
            <p style={s.sectionText}>
              Fill out the details below to publish a new surplus food listing.
            </p>
          </div>

          <ListingForm
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            error={error}
            successMessage={successMessage}
            savedAddresses={savedAddresses}
          />
        </div>

        {/* ── Listings management ──────────────────────────── */}
        <div className="mm-card" style={s.panelCard}>
          <div style={{ ...s.sectionHeader, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <p style={s.sectionKicker}>Listing Management</p>
              <h2 style={s.sectionTitle}>Manage Listings</h2>
              <p style={s.sectionText}>
                View active, claimed, and expired listings synced from backend.
              </p>
            </div>
            <button
              onClick={() => fetchListings()}
              disabled={isFetching}
              className="mm-btn mm-btn-ghost mm-btn-sm"
              style={{ flexShrink: 0 }}
            >
              {isFetching ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {/* Tabs */}
          <div style={s.tabs}>
            {[
              { key: "active",  label: `Active (${tabCounts.active})` },
              { key: "claimed", label: `Claimed (${tabCounts.claimed})` },
              { key: "expired", label: `Expired (${tabCounts.expired})` },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSelectedTab(key)}
                className={`mm-btn mm-btn-sm ${selectedTab === key ? "mm-btn-primary" : "mm-btn-ghost"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Content */}
          {isLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[1, 2].map((i) => (
                <div key={i} className="mm-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div className="mm-skeleton" style={{ height: 12, width: "30%" }} />
                  <div className="mm-skeleton" style={{ height: 18, width: "65%" }} />
                  <div className="mm-skeleton" style={{ height: 12, width: "80%" }} />
                </div>
              ))}
            </div>
          ) : displayedListings.length === 0 ? (
            <div style={s.emptyState}>
              <h3 style={{ margin: "0 0 8px", color: "var(--mm-text-1)", fontSize: 18, fontWeight: 700 }}>
                No {selectedTab} listings
              </h3>
              <p style={{ margin: 0, color: "var(--mm-text-4)" }}>
                Listings in this category will appear here.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {displayedListings.map((listing) => (
                <div key={listing.id} className="mm-card" style={s.listingCard}>
                  <div style={s.listingHeader}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={s.listingId}>Listing #{listing.id}</p>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--mm-text-1)" }}>
                          {listing.title}
                        </h3>
                        {listing.is_urgent && (
                          <span className="mm-badge mm-badge-brand" style={{ fontSize: 11 }}>⚡ Urgent</span>
                        )}
                      </div>
                      <p style={s.listingDescription}>{listing.description}</p>
                    </div>
                    <span
                      className={`mm-badge ${
                        listing.status === "active" ? "mm-badge-success" :
                        listing.status === "claimed" ? "mm-badge-brand" :
                        "mm-badge-neutral"
                      }`}
                      style={{ textTransform: "capitalize", flexShrink: 0 }}
                    >
                      {listing.status}
                    </span>
                  </div>

                  <div style={s.metaGrid}>
                    <div style={s.metaBox}>
                      <span style={s.metaLabel}>Quantity</span>
                      <span style={s.metaValue}>{listing.quantity}</span>
                    </div>
                    <div style={s.metaBox}>
                      <span style={s.metaLabel}>Pickup Start</span>
                      <span style={s.metaValueSmall}>{formatDate(listing.pickup_start)}</span>
                    </div>
                    <div style={s.metaBox}>
                      <span style={s.metaLabel}>Pickup End</span>
                      <span style={s.metaValueSmall}>{formatDate(listing.pickup_end)}</span>
                    </div>
                  </div>

                  <div style={s.tagContainer}>
                    {listing.dietary_tags?.length ? (
                      listing.dietary_tags.map((tag) => (
                        <span key={tag} className="mm-badge mm-badge-info" style={{ fontSize: 11 }}>
                          {formatTagWithIcon(tag)}
                        </span>
                      ))
                    ) : (
                      <span style={{ color: "var(--mm-text-4)", fontSize: 13 }}>No tags</span>
                    )}
                  </div>

                  {selectedTab === "active" && (
                    <>
                      {predictions[listing.id] && (
                        <div style={s.predictionBox}>
                          <span style={s.predictionLabel}>Demand prediction</span>
                          <span style={s.predictionProb}>
                            {Math.round(predictions[listing.id].claim_probability * 100)}% claim probability
                          </span>
                          <span style={s.predictionEta}>
                            Est. {predictions[listing.id].estimated_minutes_to_claim} min to claim ·{" "}
                            <em>{predictions[listing.id].confidence} confidence</em>
                          </span>
                          {predictions[listing.id].factors?.length > 0 && (
                            <ul style={s.predictionFactors}>
                              {predictions[listing.id].factors.map((f, i) => (
                                <li key={i}>{f}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                      <div style={s.cardActions}>
                        <button
                          onClick={() => handleFetchPrediction(listing.id)}
                          className="mm-btn mm-btn-partner mm-btn-sm"
                        >
                          Predict Demand
                        </button>
                        <button
                          onClick={() => handleStatusUpdate(listing.id, "claimed")}
                          className="mm-btn mm-btn-primary mm-btn-sm"
                        >
                          Mark Claimed
                        </button>
                        <button
                          onClick={() => handleStatusUpdate(listing.id, "expired")}
                          className="mm-btn mm-btn-ghost mm-btn-sm"
                        >
                          Mark Expired
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleString();
}

const s = {
  hero: {
    background: "radial-gradient(circle at top right, rgba(96,165,250,.22), transparent 28%), linear-gradient(135deg, var(--mm-surface-1), var(--mm-surface-2))",
    border: "1px solid var(--mm-border)",
    borderRadius: "var(--mm-r-2xl)",
    padding: "28px 32px",
    boxShadow: "var(--mm-shadow-lg)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 24,
    flexWrap: "wrap",
    marginBottom: 24,
  },
  eyebrow: { margin: "0 0 10px", fontSize: 11, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(191,219,254,.8)" },
  title: { margin: "0 0 10px", fontSize: "clamp(1.7rem,3.5vw,2.5rem)", fontWeight: 800, color: "var(--mm-text-1)", letterSpacing: "-.025em" },
  subtitle: { margin: 0, maxWidth: 560, color: "var(--mm-text-3)", lineHeight: 1.65, fontSize: 15 },
  heroStat: { minWidth: 140, padding: "18px 22px", borderRadius: "var(--mm-r-xl)", background: "rgba(255,255,255,.05)", border: "1px solid var(--mm-border-md)", textAlign: "center", flexShrink: 0 },
  heroStatNum: { fontSize: 34, fontWeight: 800, color: "#fff", lineHeight: 1 },
  heroStatLabel: { fontSize: 12, color: "var(--mm-text-3)", marginTop: 6 },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 14,
    marginBottom: 24,
  },
  statCard: { padding: "18px 20px" },
  statLabel: { margin: "0 0 6px", color: "var(--mm-brand)", fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 700 },
  statValue: { margin: 0, fontSize: 30, fontWeight: 800, color: "var(--mm-text-1)" },
  mainGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))",
    gap: 22,
    alignItems: "start",
  },
  panelCard: { padding: 24 },
  sectionHeader: { marginBottom: 20 },
  sectionKicker: { margin: "0 0 6px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--mm-brand)", fontWeight: 700 },
  sectionTitle: { margin: "0 0 8px", fontSize: 22, fontWeight: 800, color: "var(--mm-text-1)" },
  sectionText: { margin: 0, color: "var(--mm-text-3)", lineHeight: 1.6, fontSize: 14 },
  tagContainer: { display: "flex", flexWrap: "wrap", gap: 8 },
  tabs: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 },
  emptyState: {
    padding: "32px 20px",
    borderRadius: "var(--mm-r-xl)",
    background: "var(--mm-surface-2)",
    border: "1.5px dashed var(--mm-border-md)",
    textAlign: "center",
  },
  listingCard: { padding: 18, display: "flex", flexDirection: "column", gap: 12 },
  listingHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  listingId: { margin: "0 0 4px", color: "var(--mm-brand)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 700 },
  listingDescription: { margin: "4px 0 0", color: "var(--mm-text-3)", lineHeight: 1.55, fontSize: 13 },
  metaGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 },
  metaBox: {
    background: "var(--mm-surface-2)",
    border: "1px solid var(--mm-border)",
    borderRadius: "var(--mm-r-lg)",
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  metaLabel: { fontSize: 10, color: "var(--mm-brand)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700 },
  metaValue: { fontSize: 22, fontWeight: 800, color: "var(--mm-text-1)" },
  metaValueSmall: { fontSize: 13, fontWeight: 600, color: "var(--mm-text-2)", lineHeight: 1.5 },
  predictionBox: {
    padding: "12px 14px",
    borderRadius: "var(--mm-r-lg)",
    background: "rgba(168,85,247,.08)",
    border: "1px solid rgba(168,85,247,.2)",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  predictionLabel: { fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", color: "#7C3AED", fontWeight: 700 },
  predictionProb: { fontSize: 15, fontWeight: 800, color: "#5B21B6" },
  predictionEta: { fontSize: 12, color: "#6D28D9" },
  predictionFactors: { margin: "4px 0 0", paddingLeft: 18, fontSize: 12, color: "#7C3AED", lineHeight: 1.6 },
  cardActions: { display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap", paddingTop: 4 },
};
