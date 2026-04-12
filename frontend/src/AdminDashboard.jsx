import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteListing,
  getAdminListings,
  getAdminLoginArchive,
  getAdminStats,
  updateListingStatus,
} from "./api/client";

function formatDateTime(dateString) {
  if (!dateString) return "N/A";
  return new Date(dateString).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTag(tag) {
  return tag.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

function Toast({ toasts }) {
  return (
    <div style={s.toastContainer}>
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`mm-alert ${t.type === "success" ? "mm-alert-success" : "mm-alert-error"}`}
          style={s.toast}
          role="status"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

function ActivityBar({ label, value, total, color, helper }) {
  const width = total > 0 ? `${Math.max((value / total) * 100, value > 0 ? 8 : 0)}%` : "0%";

  return (
    <div style={s.activityMetric}>
      <div style={s.activityMetricHeader}>
        <span style={s.activityMetricLabel}>{label}</span>
        <span style={s.activityMetricValue}>{value}</span>
      </div>
      <div style={s.activityTrack}>
        <div style={{ ...s.activityFill, width, background: color }} />
      </div>
      <div style={s.activityHelper}>{helper}</div>
    </div>
  );
}

function ImpactMetric({ label, value, detail, accent }) {
  return (
    <div className="mm-card" style={s.impactMetricCard}>
      <div style={s.impactMetricLabel}>{label}</div>
      <div style={{ ...s.impactMetricValue, color: accent }}>{value}</div>
      <div style={s.impactMetricDetail}>{detail}</div>
    </div>
  );
}

export default function AdminDashboard() {
  const [listings, setListings] = useState([]);
  const [stats, setStats] = useState({
    active_listings: 0,
    claimed_listings: 0,
    expired_listings: 0,
    total_claims: 0,
    meals_saved: 0,
  });
  const [loginArchive, setLoginArchive] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [selectedTab, setSelectedTab] = useState("active");

  const addToast = useCallback((message, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const [listingsData, statsData, loginArchiveData] = await Promise.all([
        getAdminListings(),
        getAdminStats(),
        getAdminLoginArchive(),
      ]);
      setListings(Array.isArray(listingsData) ? listingsData : []);
      setLoginArchive(Array.isArray(loginArchiveData) ? loginArchiveData : []);
      setStats(
        statsData && typeof statsData === "object"
          ? statsData
          : {
              active_listings: 0,
              claimed_listings: 0,
              expired_listings: 0,
              total_claims: 0,
              meals_saved: 0,
            }
      );
    } catch (err) {
      addToast(err.message || "Could not load admin dashboard data.", "error");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  async function handleStatusUpdate(listingId, newStatus) {
    setActionId(listingId);
    try {
      await updateListingStatus(listingId, newStatus);
      addToast(`Listing marked as ${newStatus}.`, "success");
      await fetchDashboardData();
    } catch (err) {
      addToast(err.message || "Failed to update listing status.", "error");
    } finally {
      setActionId(null);
    }
  }

  async function handleDelete(listingId, title) {
    setActionId(listingId);
    try {
      await deleteListing(listingId);
      addToast(`"${title}" removed.`, "success");
      await fetchDashboardData();
    } catch (err) {
      addToast(err.message || "Failed to delete listing.", "error");
    } finally {
      setActionId(null);
    }
  }

  const active = useMemo(
    () => listings.filter((listing) => listing.status === "active"),
    [listings]
  );
  const claimed = useMemo(
    () => listings.filter((listing) => listing.status === "claimed"),
    [listings]
  );
  const expired = useMemo(
    () => listings.filter((listing) => listing.status === "expired"),
    [listings]
  );

  const tabs = [
    { key: "active",  label: "Active",  count: active.length,  data: active },
    { key: "claimed", label: "Claimed", count: claimed.length, data: claimed },
    { key: "expired", label: "Expired", count: expired.length, data: expired },
  ];

  const currentListings = tabs.find((tab) => tab.key === selectedTab)?.data ?? [];

  const totalTrackedListings =
    Number(stats.active_listings || 0) +
    Number(stats.claimed_listings || 0) +
    Number(stats.expired_listings || 0);

  const restaurants = useMemo(() => {
    const map = new Map();

    listings.forEach((listing) => {
      const existing = map.get(listing.restaurant_id) || {
        restaurantId: listing.restaurant_id,
        total: 0,
        active: 0,
        claimed: 0,
        expired: 0,
      };

      existing.total += 1;
      existing[listing.status] += 1;
      map.set(listing.restaurant_id, existing);
    });

    return Array.from(map.values()).sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return a.restaurantId.localeCompare(b.restaurantId);
    });
  }, [listings]);

  const recentActivity = useMemo(() => {
    return [...listings]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 6)
      .map((listing) => ({
        id: listing.id,
        title: listing.title,
        status: listing.status,
        restaurantId: listing.restaurant_id,
        createdAt: listing.created_at,
      }));
  }, [listings]);

  const statCards = [
    { label: "Active Listings",   value: stats.active_listings,  accent: "#16A34A", caption: "Live supply currently visible to recipients" },
    { label: "Claimed Listings",  value: stats.claimed_listings, accent: "#D97706", caption: "Listings fully claimed across the platform" },
    { label: "Expired Listings",  value: stats.expired_listings, accent: "#636366", caption: "Listings that aged out of their pickup window" },
    { label: "Total Claims",      value: stats.total_claims,     accent: "#2563EB", caption: "Successful claim records confirmed by the backend" },
    { label: "Meals Saved",       value: stats.meals_saved,      accent: "#DC2626", caption: "Backend aggregate from the admin stats endpoint" },
  ];

  const activitySummary = [
    { label: "Open supply",       value: Number(stats.active_listings || 0),  detail: "Listings currently available for pickup",             color: "#16A34A" },
    { label: "Completed flow",    value: Number(stats.claimed_listings || 0), detail: "Listings that reached a completed claimed state",      color: "#D97706" },
    { label: "Claims processed",  value: Number(stats.total_claims || 0),     detail: "Successful claim records counted by the backend",     color: "#2563EB" },
  ];

  return (
    <div className="mm-page-wrap">
      <Toast toasts={toasts} />

      {/* Hero */}
      <div className="mm-page-hero" style={{ marginBottom: 24 }}>
        <div>
          <p className="mm-page-hero-eyebrow">Admin Console</p>
          <h1 className="mm-page-hero-title">Admin Dashboard</h1>
          <p className="mm-page-hero-subtitle">
            Monitor listings across every restaurant, drive moderation actions,
            and follow the system-wide activity pulse from backend-backed stats.
          </p>
        </div>
        <button
          onClick={fetchDashboardData}
          disabled={loading}
          className="mm-btn mm-btn-ghost"
          style={{ flexShrink: 0 }}
        >
          {loading ? "Refreshing…" : "↻ Refresh"}
        </button>
      </div>

      {/* Impact section */}
      <div className="mm-card" style={s.impactSection}>
        <div style={s.sectionHeader}>
          <p style={s.sectionKicker}>Impact Dashboard</p>
          <h2 style={s.sectionTitle}>Outcome snapshot across the platform</h2>
          <p style={s.sectionText}>
            A dedicated view of the platform outcomes that matter most, wired
            directly to the admin stats endpoint.
          </p>
        </div>

        <div style={s.impactGrid}>
          <div style={s.impactMetricColumn}>
            <ImpactMetric
              label="Meals Saved"
              value={Number(stats.meals_saved || 0)}
              detail="Total meals recovered according to backend admin stats"
              accent="#D97706"
            />
            <ImpactMetric
              label="Listings Completed"
              value={Number(stats.claimed_listings || 0)}
              detail="Listings fully completed through successful claiming"
              accent="#16A34A"
            />
          </div>

          <div className="mm-card" style={s.impactActivityCard}>
            <div style={s.impactActivityTitle}>System Activity</div>
            <div style={s.impactActivityText}>
              Live operational movement across supply, fulfillment, and claim volume.
            </div>
            <div style={s.impactMiniStats}>
              {activitySummary.map((item) => (
                <div key={item.label} className="mm-card" style={s.impactMiniStat}>
                  <div style={{ ...s.impactMiniAccent, background: item.color }} />
                  <div style={s.impactMiniLabel}>{item.label}</div>
                  <div style={s.impactMiniValue}>{item.value}</div>
                  <div style={s.impactMiniDetail}>{item.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={s.statsRow}>
        {statCards.map((card) => (
          <div key={card.label} className="mm-card" style={s.statCard}>
            <div style={s.statLabel}>{card.label}</div>
            <div style={{ ...s.statValue, color: card.accent }}>{card.value}</div>
            <div style={s.statCaption}>{card.caption}</div>
          </div>
        ))}
      </div>

      {/* Activity section */}
      <div className="mm-card" style={s.activitySection}>
        <div style={s.sectionHeader}>
          <p style={s.sectionKicker}>System Activity</p>
          <h2 style={s.sectionTitle}>Platform flow and operational pressure</h2>
          <p style={s.sectionText}>
            A dedicated snapshot of listing movement, claim volume, and the
            most recently created inventory.
          </p>
        </div>

        <div style={s.activityGrid}>
          {/* Status distribution */}
          <div className="mm-card" style={s.activityPanel}>
            <div style={s.panelTitle}>Status Distribution</div>
            <ActivityBar label="Active"  value={Number(stats.active_listings || 0)}  total={totalTrackedListings} color="linear-gradient(90deg, #16A34A 0%, #22C55E 100%)"  helper="Listings still open for pickup" />
            <ActivityBar label="Claimed" value={Number(stats.claimed_listings || 0)} total={totalTrackedListings} color="linear-gradient(90deg, #D97706 0%, #F59E0B 100%)"  helper="Inventory fully matched with recipients" />
            <ActivityBar label="Expired" value={Number(stats.expired_listings || 0)} total={totalTrackedListings} color="linear-gradient(90deg, #9CA3AF 0%, #D1D5DB 100%)"  helper="Supply that missed its pickup window" />
          </div>

          {/* Recent activity timeline */}
          <div className="mm-card" style={s.activityPanel}>
            <div style={s.panelTitle}>Recent Listing Activity</div>
            {recentActivity.length === 0 ? (
              <div style={s.panelEmpty}>No listing activity yet.</div>
            ) : (
              <div style={s.timeline}>
                {recentActivity.map((item) => (
                  <div key={item.id} style={s.timelineItem}>
                    <div style={s.timelineRail}>
                      <div style={s.timelineDot} />
                      <div style={s.timelineLine} />
                    </div>
                    <div style={s.timelineContent}>
                      <div style={s.timelineTop}>
                        <div style={s.timelineTitle}>{item.title}</div>
                        <span
                          className={`mm-badge ${
                            item.status === "active"  ? "mm-badge-success" :
                            item.status === "claimed" ? "mm-badge-brand"   :
                            "mm-badge-neutral"
                          }`}
                          style={{ textTransform: "capitalize" }}
                        >
                          {item.status}
                        </span>
                      </div>
                      <div style={s.timelineMeta}>
                        {item.restaurantId} · created {formatDateTime(item.createdAt)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Restaurant load */}
          <div className="mm-card" style={s.activityPanel}>
            <div style={s.panelTitle}>Restaurant Load</div>
            {restaurants.length === 0 ? (
              <div style={s.panelEmpty}>No restaurant data available.</div>
            ) : (
              <div style={s.restaurantList}>
                {restaurants.slice(0, 5).map((restaurant) => (
                  <div key={restaurant.restaurantId} style={s.restaurantRow}>
                    <div>
                      <div style={s.restaurantName}>{restaurant.restaurantId}</div>
                      <div style={s.restaurantMeta}>
                        {restaurant.active} active · {restaurant.claimed} claimed · {restaurant.expired} expired
                      </div>
                    </div>
                    <div style={s.restaurantTotal}>{restaurant.total}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Login archive */}
          <div className="mm-card" style={s.activityPanel}>
            <div style={s.panelTitle}>Login Archive</div>
            {loginArchive.length === 0 ? (
              <div style={s.panelEmpty}>No login attempts archived yet.</div>
            ) : (
              <div style={s.loginArchiveList}>
                {loginArchive.slice(0, 6).map((entry) => (
                  <div key={entry.id} style={s.loginArchiveRow}>
                    <div style={s.loginArchiveTop}>
                      <div style={s.loginArchiveEmail}>{entry.email}</div>
                      <span className={`mm-badge ${entry.success ? "mm-badge-success" : "mm-badge-error"}`} style={{ fontSize: 10 }}>
                        {entry.success ? "success" : entry.code}
                      </span>
                    </div>
                    <div style={s.loginArchiveMeta}>
                      {entry.role || "unknown role"} · {formatDateTime(entry.created_at)}
                      {entry.requires_ebt ? " · EBT checked" : ""}
                      {entry.ebt_last4 ? ` · card •••• ${entry.ebt_last4}` : ""}
                    </div>
                    <div style={s.loginArchiveMessage}>{entry.message}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={s.tabRow}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSelectedTab(tab.key)}
            className={`mm-btn mm-btn-sm ${selectedTab === tab.key ? "mm-btn-primary" : "mm-btn-ghost"}`}
          >
            {tab.label}
            <span style={{
              padding: "2px 7px",
              borderRadius: 999,
              background: selectedTab === tab.key ? "rgba(255,255,255,.18)" : "rgba(148,163,184,.12)",
              color: selectedTab === tab.key ? "#fff" : "var(--mm-text-4)",
              fontSize: 11,
              fontWeight: 700,
            }}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Loading skeletons */}
      {loading && (
        <div style={s.cardGrid}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="mm-card" style={{ padding: 22, minHeight: 200, display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="mm-skeleton" style={{ height: 13, width: "55%" }} />
              <div className="mm-skeleton" style={{ height: 13, width: "85%" }} />
              <div className="mm-skeleton" style={{ height: 13, width: "40%" }} />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && currentListings.length === 0 && (
        <div style={s.emptyState}>
          <div style={{ fontSize: 40, marginBottom: 12 }} aria-hidden="true">📋</div>
          <h3 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700, color: "var(--mm-text-1)" }}>
            No {selectedTab} listings
          </h3>
          <p style={{ margin: 0, color: "var(--mm-text-4)", fontSize: 14 }}>
            Listings in this category will appear here.
          </p>
        </div>
      )}

      {/* Listing cards */}
      {!loading && currentListings.length > 0 && (
        <div style={s.cardGrid}>
          {currentListings.map((listing) => {
            const isActing = actionId === listing.id;

            return (
              <div key={listing.id} className="mm-card" style={s.card}>
                <div style={s.cardHeader}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={s.cardTitle}>{listing.title}</h3>
                    <div style={s.cardMeta}>
                      Restaurant: <span style={{ color: "var(--mm-brand)", fontWeight: 600 }}>{listing.restaurant_id}</span>
                    </div>
                  </div>
                  <span
                    className={`mm-badge ${
                      listing.status === "active"  ? "mm-badge-success" :
                      listing.status === "claimed" ? "mm-badge-brand"   :
                      "mm-badge-neutral"
                    }`}
                    style={{ textTransform: "capitalize", flexShrink: 0 }}
                  >
                    {listing.status}
                  </span>
                </div>

                <p style={s.cardDescription}>{listing.description}</p>

                <div style={s.infoGrid}>
                  <div style={s.infoBlock}>
                    <div style={s.infoLabel}>Quantity</div>
                    <div style={s.infoValue}>{listing.quantity}</div>
                  </div>
                  <div style={s.infoBlock}>
                    <div style={s.infoLabel}>Pickup Start</div>
                    <div style={s.infoValue}>{formatDateTime(listing.pickup_start)}</div>
                  </div>
                  <div style={s.infoBlock}>
                    <div style={s.infoLabel}>Pickup End</div>
                    <div style={s.infoValue}>{formatDateTime(listing.pickup_end)}</div>
                  </div>
                  <div style={s.infoBlock}>
                    <div style={s.infoLabel}>Created</div>
                    <div style={s.infoValue}>{formatDateTime(listing.created_at)}</div>
                  </div>
                </div>

                {listing.dietary_tags?.length > 0 && (
                  <div style={s.tagRow}>
                    {listing.dietary_tags.map((tag) => (
                      <span key={tag} className="mm-badge mm-badge-neutral" style={{ fontSize: 11 }}>
                        {formatTag(tag)}
                      </span>
                    ))}
                  </div>
                )}

                <div style={{ fontSize: 11, color: "var(--mm-text-4)", fontFamily: "ui-monospace, Consolas, monospace" }}>
                  ID: <span style={{ color: "var(--mm-text-3)" }}>{listing.id}</span>
                </div>

                <div style={s.actionRow}>
                  {listing.status !== "expired" && (
                    <button
                      onClick={() => handleStatusUpdate(listing.id, "expired")}
                      disabled={isActing}
                      className="mm-btn mm-btn-ghost mm-btn-sm"
                    >
                      Mark Expired
                    </button>
                  )}
                  {listing.status === "active" && (
                    <button
                      onClick={() => handleStatusUpdate(listing.id, "claimed")}
                      disabled={isActing}
                      className="mm-btn mm-btn-primary mm-btn-sm"
                    >
                      Mark Claimed
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(listing.id, listing.title)}
                    disabled={isActing}
                    className="mm-btn mm-btn-danger mm-btn-sm"
                  >
                    {isActing ? "Working…" : "Delete"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const s = {
  toastContainer: {
    position: "fixed",
    top: 80,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 9999,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    alignItems: "center",
    pointerEvents: "none",
  },
  toast: {
    maxWidth: 420,
    textAlign: "center",
    pointerEvents: "auto",
  },
  hero: {
    background: "radial-gradient(circle at top right, rgba(249,115,22,.14), transparent 35%), linear-gradient(135deg, var(--mm-surface-1), var(--mm-surface-2))",
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
  eyebrow: { margin: "0 0 10px", fontSize: 11, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(148,163,184,.7)" },
  title: { margin: "0 0 10px", fontSize: "clamp(1.7rem,3.5vw,2.5rem)", fontWeight: 800, color: "var(--mm-text-1)", letterSpacing: "-.025em" },
  subtitle: { margin: 0, maxWidth: 580, color: "var(--mm-text-3)", lineHeight: 1.65, fontSize: 15 },
  impactSection: { marginBottom: 24, padding: "22px 24px" },
  sectionHeader: { marginBottom: 18 },
  sectionKicker: { margin: "0 0 6px", fontSize: 11, fontWeight: 700, color: "var(--mm-brand)", textTransform: "uppercase", letterSpacing: ".1em" },
  sectionTitle: { fontSize: 22, fontWeight: 800, color: "var(--mm-text-1)", margin: "0 0 8px", letterSpacing: "-.02em" },
  sectionText: { fontSize: 14, color: "var(--mm-text-3)", lineHeight: 1.6, maxWidth: 680, margin: 0 },
  impactGrid: { display: "grid", gridTemplateColumns: "minmax(200px, 300px) minmax(0, 1fr)", gap: 14, alignItems: "start" },
  impactMetricColumn: { display: "grid", gap: 10 },
  impactMetricCard: { padding: "14px 16px" },
  impactMetricLabel: { fontSize: 11, fontWeight: 800, color: "var(--mm-text-4)", textTransform: "uppercase", letterSpacing: ".1em" },
  impactMetricValue: { fontSize: "clamp(1.6rem, 2.6vw, 2.2rem)", fontWeight: 900, lineHeight: 1, letterSpacing: "-.04em", marginTop: 8 },
  impactMetricDetail: { fontSize: 12, color: "var(--mm-text-3)", lineHeight: 1.5, marginTop: 8 },
  impactActivityCard: { padding: 18, minHeight: 160 },
  impactActivityTitle: { fontSize: 18, fontWeight: 800, color: "var(--mm-text-1)", marginBottom: 8, letterSpacing: "-.02em" },
  impactActivityText: { fontSize: 13, lineHeight: 1.6, color: "var(--mm-text-3)", marginBottom: 16, maxWidth: 440 },
  impactMiniStats: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 },
  impactMiniStat: { padding: "14px 14px 12px", position: "relative", overflow: "hidden" },
  impactMiniAccent: { width: 36, height: 3, borderRadius: 999, marginBottom: 10 },
  impactMiniLabel: { fontSize: 11, fontWeight: 700, color: "var(--mm-text-4)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 },
  impactMiniValue: { fontSize: 24, fontWeight: 800, color: "var(--mm-text-1)", lineHeight: 1, marginBottom: 4 },
  impactMiniDetail: { fontSize: 11, lineHeight: 1.45, color: "var(--mm-text-4)" },
  statsRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 24 },
  statCard: { padding: "16px 18px" },
  statLabel: { fontSize: 11, fontWeight: 700, color: "var(--mm-text-4)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 },
  statValue: { fontSize: 30, fontWeight: 800, lineHeight: 1, marginBottom: 8 },
  statCaption: { fontSize: 12, color: "var(--mm-text-4)", lineHeight: 1.5 },
  activitySection: { marginBottom: 24, padding: "22px 24px" },
  activityGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 14 },
  activityPanel: { padding: 18, minHeight: 220 },
  panelTitle: { fontSize: 13, fontWeight: 800, color: "var(--mm-text-2)", marginBottom: 14, letterSpacing: ".01em" },
  panelEmpty: { fontSize: 13, color: "var(--mm-text-4)" },
  activityMetric: { marginBottom: 14 },
  activityMetricHeader: { display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 7 },
  activityMetricLabel: { fontSize: 13, fontWeight: 700, color: "var(--mm-text-2)" },
  activityMetricValue: { fontSize: 13, fontWeight: 800, color: "var(--mm-text-1)" },
  activityTrack: { height: 8, borderRadius: 999, background: "var(--mm-border-md)", overflow: "hidden", marginBottom: 4 },
  activityFill: { height: "100%", borderRadius: 999 },
  activityHelper: { fontSize: 11, color: "var(--mm-text-4)", lineHeight: 1.4 },
  timeline: { display: "flex", flexDirection: "column", gap: 12 },
  timelineItem: { display: "grid", gridTemplateColumns: "16px 1fr", gap: 10 },
  timelineRail: { display: "flex", flexDirection: "column", alignItems: "center" },
  timelineDot: { width: 9, height: 9, borderRadius: "50%", background: "var(--mm-brand)", boxShadow: "0 0 0 4px var(--mm-brand-dim)", marginTop: 5, flexShrink: 0 },
  timelineLine: { width: 1, flex: 1, background: "var(--mm-border)", marginTop: 5 },
  timelineContent: { display: "flex", flexDirection: "column", gap: 4 },
  timelineTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
  timelineTitle: { fontSize: 13, fontWeight: 700, color: "var(--mm-text-1)" },
  timelineMeta: { fontSize: 11, color: "var(--mm-text-4)", lineHeight: 1.5 },
  restaurantList: { display: "flex", flexDirection: "column", gap: 8 },
  restaurantRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: "var(--mm-r-lg)",
    background: "var(--mm-surface-2)",
    border: "1px solid var(--mm-border)",
  },
  restaurantName: { fontSize: 13, fontWeight: 700, color: "var(--mm-text-1)" },
  restaurantMeta: { fontSize: 11, color: "var(--mm-text-4)", marginTop: 3 },
  restaurantTotal: {
    minWidth: 38,
    height: 38,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    background: "var(--mm-brand-dim)",
    border: "1px solid var(--mm-brand-ring)",
    color: "var(--mm-brand)",
    fontWeight: 800,
    fontSize: 14,
    flexShrink: 0,
  },
  loginArchiveList: { display: "flex", flexDirection: "column", gap: 8 },
  loginArchiveRow: {
    padding: "10px 12px",
    borderRadius: "var(--mm-r-lg)",
    background: "var(--mm-surface-2)",
    border: "1px solid var(--mm-border)",
  },
  loginArchiveTop: { display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 },
  loginArchiveEmail: { fontSize: 12, fontWeight: 700, color: "var(--mm-text-1)", wordBreak: "break-word" },
  loginArchiveMeta: { fontSize: 11, color: "var(--mm-text-4)", lineHeight: 1.5, marginBottom: 3 },
  loginArchiveMessage: { fontSize: 11, color: "var(--mm-text-3)", lineHeight: 1.5 },
  tabRow: { display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" },
  emptyState: {
    textAlign: "center",
    padding: "52px 24px",
    background: "var(--mm-surface-2)",
    border: "1.5px dashed var(--mm-border-md)",
    borderRadius: "var(--mm-r-2xl)",
    marginBottom: 24,
  },
  cardGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 },
  card: { padding: 20, display: "flex", flexDirection: "column", gap: 12 },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: 700, color: "var(--mm-text-1)", margin: "0 0 4px", lineHeight: 1.3 },
  cardMeta: { fontSize: 12, color: "var(--mm-text-4)" },
  cardDescription: { fontSize: 13, color: "var(--mm-text-3)", lineHeight: 1.6, margin: 0 },
  infoGrid: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 },
  infoBlock: { background: "var(--mm-surface-2)", border: "1px solid var(--mm-border)", borderRadius: "var(--mm-r-lg)", padding: "8px 10px" },
  infoLabel: { fontSize: 10, fontWeight: 700, color: "var(--mm-text-4)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 4 },
  infoValue: { fontSize: 12, fontWeight: 600, color: "var(--mm-text-2)" },
  tagRow: { display: "flex", flexWrap: "wrap", gap: 6 },
  actionRow: { display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", marginTop: 2 },
};
