import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteListing,
  getAdminListings,
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
    <div style={styles.toastContainer}>
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            ...styles.toast,
            ...(t.type === "success" ? styles.toastSuccess : styles.toastError),
          }}
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
    <div style={styles.activityMetric}>
      <div style={styles.activityMetricHeader}>
        <span style={styles.activityMetricLabel}>{label}</span>
        <span style={styles.activityMetricValue}>{value}</span>
      </div>
      <div style={styles.activityTrack}>
        <div style={{ ...styles.activityFill, width, background: color }} />
      </div>
      <div style={styles.activityHelper}>{helper}</div>
    </div>
  );
}

function ImpactMetric({ label, value, detail, accent, glow }) {
  return (
    <div style={{ ...styles.impactMetricCard, boxShadow: glow }}>
      <div style={styles.impactMetricLabel}>{label}</div>
      <div style={{ ...styles.impactMetricValue, color: accent }}>{value}</div>
      <div style={styles.impactMetricDetail}>{detail}</div>
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
      const [listingsData, statsData] = await Promise.all([
        getAdminListings(),
        getAdminStats(),
      ]);
      setListings(Array.isArray(listingsData) ? listingsData : []);
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
    { key: "active", label: "Active", count: active.length, data: active },
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

  const statusColors = {
    active: {
      bg: "rgba(34,197,94,0.12)",
      color: "#86efac",
      border: "rgba(34,197,94,0.25)",
    },
    claimed: {
      bg: "rgba(249,115,22,0.12)",
      color: "#fdba74",
      border: "rgba(249,115,22,0.3)",
    },
    expired: {
      bg: "rgba(148,163,184,0.1)",
      color: "#94a3b8",
      border: "rgba(148,163,184,0.2)",
    },
  };

  const statCards = [
    {
      label: "Active Listings",
      value: stats.active_listings,
      accent: "#22c55e",
      caption: "Live supply currently visible to recipients",
    },
    {
      label: "Claimed Listings",
      value: stats.claimed_listings,
      accent: "#f97316",
      caption: "Listings fully claimed across the platform",
    },
    {
      label: "Expired Listings",
      value: stats.expired_listings,
      accent: "#94a3b8",
      caption: "Listings that aged out of their pickup window",
    },
    {
      label: "Total Claims",
      value: stats.total_claims,
      accent: "#38bdf8",
      caption: "Successful claim records confirmed by the backend",
    },
    {
      label: "Meals Saved",
      value: stats.meals_saved,
      accent: "#facc15",
      caption: "Backend aggregate from the admin stats endpoint",
    },
  ];

  const activitySummary = [
    {
      label: "Open supply",
      value: Number(stats.active_listings || 0),
      detail: "Listings currently available for pickup",
      color: "#4ade80",
    },
    {
      label: "Completed flow",
      value: Number(stats.claimed_listings || 0),
      detail: "Listings that reached a completed claimed state",
      color: "#fb923c",
    },
    {
      label: "Claims processed",
      value: Number(stats.total_claims || 0),
      detail: "Successful claim records counted by the backend",
      color: "#38bdf8",
    },
  ];

  return (
    <div style={styles.shell}>
      <Toast toasts={toasts} />

      <section style={styles.hero}>
        <div>
          <div style={styles.eyebrow}>MealMatch • Admin Console</div>
          <h1 style={styles.heroTitle}>Admin Dashboard</h1>
          <p style={styles.heroSubtitle}>
            Monitor listings across every restaurant, drive moderation actions,
            and follow the system-wide activity pulse from backend-backed stats.
          </p>
        </div>
        <button
          onClick={fetchDashboardData}
          style={styles.refreshBtn}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "↻ Refresh"}
        </button>
      </section>

      <section style={styles.impactSection}>
        <div style={styles.impactHeader}>
          <div>
            <div style={styles.sectionKicker}>Impact Dashboard</div>
            <h2 style={styles.sectionTitle}>Outcome snapshot across the platform</h2>
            <p style={styles.sectionText}>
              A dedicated view of the platform outcomes that matter most, wired
              directly to the admin stats endpoint.
            </p>
          </div>
        </div>

        <div style={styles.impactGrid}>
          <div style={styles.impactMetricColumn}>
            <ImpactMetric
              label="Meals Saved"
              value={Number(stats.meals_saved || 0)}
              detail="Total meals recovered according to backend admin stats"
              accent="#facc15"
              glow="0 24px 48px rgba(250, 204, 21, 0.08)"
            />
            <ImpactMetric
              label="Listings Completed"
              value={Number(stats.claimed_listings || 0)}
              detail="Listings fully completed through successful claiming"
              accent="#fb923c"
              glow="0 24px 48px rgba(251, 146, 60, 0.08)"
            />
          </div>

          <div style={styles.impactActivityCard}>
            <div style={styles.impactActivityTitle}>System Activity</div>
            <div style={styles.impactActivityText}>
              Live operational movement across supply, fulfillment, and claim volume.
            </div>
            <div style={styles.impactMiniStats}>
              {activitySummary.map((item) => (
                <div key={item.label} style={styles.impactMiniStat}>
                  <div
                    style={{
                      ...styles.impactMiniAccent,
                      background: item.color,
                    }}
                  />
                  <div style={styles.impactMiniLabel}>{item.label}</div>
                  <div style={styles.impactMiniValue}>{item.value}</div>
                  <div style={styles.impactMiniDetail}>{item.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div style={styles.statsRow}>
        {statCards.map((card) => (
          <div key={card.label} style={styles.statCard}>
            <div style={styles.statLabel}>{card.label}</div>
            <div style={{ ...styles.statValue, color: card.accent }}>
              {card.value}
            </div>
            <div style={styles.statCaption}>{card.caption}</div>
          </div>
        ))}
      </div>

      <section style={styles.activitySection}>
        <div style={styles.activityHeader}>
          <div>
            <div style={styles.sectionKicker}>System Activity</div>
            <h2 style={styles.sectionTitle}>Platform flow and operational pressure</h2>
            <p style={styles.sectionText}>
              A dedicated snapshot of listing movement, claim volume, and the
              most recently created inventory.
            </p>
          </div>
        </div>

        <div style={styles.activityGrid}>
          <div style={styles.activityPanel}>
            <div style={styles.panelTitle}>Status Distribution</div>
            <ActivityBar
              label="Active"
              value={Number(stats.active_listings || 0)}
              total={totalTrackedListings}
              color="linear-gradient(90deg, #16a34a 0%, #4ade80 100%)"
              helper="Listings still open for pickup"
            />
            <ActivityBar
              label="Claimed"
              value={Number(stats.claimed_listings || 0)}
              total={totalTrackedListings}
              color="linear-gradient(90deg, #ea580c 0%, #fb923c 100%)"
              helper="Inventory fully matched with recipients"
            />
            <ActivityBar
              label="Expired"
              value={Number(stats.expired_listings || 0)}
              total={totalTrackedListings}
              color="linear-gradient(90deg, #475569 0%, #94a3b8 100%)"
              helper="Supply that missed its pickup window"
            />
          </div>

          <div style={styles.activityPanel}>
            <div style={styles.panelTitle}>Recent Listing Activity</div>
            {recentActivity.length === 0 ? (
              <div style={styles.panelEmpty}>No listing activity yet.</div>
            ) : (
              <div style={styles.timeline}>
                {recentActivity.map((item) => {
                  const sc = statusColors[item.status] ?? statusColors.expired;
                  return (
                    <div key={item.id} style={styles.timelineItem}>
                      <div style={styles.timelineRail}>
                        <div style={styles.timelineDot} />
                        <div style={styles.timelineLine} />
                      </div>
                      <div style={styles.timelineContent}>
                        <div style={styles.timelineTop}>
                          <div style={styles.timelineTitle}>{item.title}</div>
                          <span
                            style={{
                              ...styles.statusBadge,
                              background: sc.bg,
                              color: sc.color,
                              border: `1px solid ${sc.border}`,
                            }}
                          >
                            {item.status}
                          </span>
                        </div>
                        <div style={styles.timelineMeta}>
                          {item.restaurantId} • created {formatDateTime(item.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={styles.activityPanel}>
            <div style={styles.panelTitle}>Restaurant Load</div>
            {restaurants.length === 0 ? (
              <div style={styles.panelEmpty}>No restaurant data available.</div>
            ) : (
              <div style={styles.restaurantList}>
                {restaurants.slice(0, 5).map((restaurant) => (
                  <div key={restaurant.restaurantId} style={styles.restaurantRow}>
                    <div>
                      <div style={styles.restaurantName}>{restaurant.restaurantId}</div>
                      <div style={styles.restaurantMeta}>
                        {restaurant.active} active • {restaurant.claimed} claimed •{" "}
                        {restaurant.expired} expired
                      </div>
                    </div>
                    <div style={styles.restaurantTotal}>{restaurant.total}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <div style={styles.tabRow}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSelectedTab(tab.key)}
            style={{
              ...styles.tabBtn,
              ...(selectedTab === tab.key ? styles.tabBtnActive : {}),
            }}
          >
            {tab.label}
            <span
              style={{
                ...styles.tabCount,
                ...(selectedTab === tab.key ? styles.tabCountActive : {}),
              }}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div style={styles.cardGrid}>
          {[1, 2, 3].map((item) => (
            <div key={item} style={styles.skeletonCard}>
              <div style={{ ...styles.skeletonBar, width: "55%" }} />
              <div style={{ ...styles.skeletonBar, width: "85%" }} />
              <div style={{ ...styles.skeletonBar, width: "40%" }} />
            </div>
          ))}
        </div>
      ) : currentListings.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>📋</div>
          <h3 style={styles.emptyTitle}>No {selectedTab} listings</h3>
          <p style={styles.emptyText}>Listings in this category will appear here.</p>
        </div>
      ) : (
        <div style={styles.cardGrid}>
          {currentListings.map((listing) => {
            const sc = statusColors[listing.status] ?? statusColors.expired;
            const isActing = actionId === listing.id;

            return (
              <div key={listing.id} style={styles.card}>
                <div style={styles.cardHeader}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={styles.cardTitle}>{listing.title}</h3>
                    <div style={styles.cardMeta}>
                      Restaurant: <span style={styles.metaVal}>{listing.restaurant_id}</span>
                    </div>
                  </div>
                  <span
                    style={{
                      ...styles.statusBadge,
                      background: sc.bg,
                      color: sc.color,
                      border: `1px solid ${sc.border}`,
                    }}
                  >
                    {listing.status}
                  </span>
                </div>

                <p style={styles.cardDescription}>{listing.description}</p>

                <div style={styles.infoGrid}>
                  <div style={styles.infoBlock}>
                    <div style={styles.infoLabel}>Quantity</div>
                    <div style={styles.infoValue}>{listing.quantity}</div>
                  </div>
                  <div style={styles.infoBlock}>
                    <div style={styles.infoLabel}>Pickup Start</div>
                    <div style={styles.infoValue}>
                      {formatDateTime(listing.pickup_start)}
                    </div>
                  </div>
                  <div style={styles.infoBlock}>
                    <div style={styles.infoLabel}>Pickup End</div>
                    <div style={styles.infoValue}>
                      {formatDateTime(listing.pickup_end)}
                    </div>
                  </div>
                  <div style={styles.infoBlock}>
                    <div style={styles.infoLabel}>Created</div>
                    <div style={styles.infoValue}>
                      {formatDateTime(listing.created_at)}
                    </div>
                  </div>
                </div>

                {listing.dietary_tags?.length > 0 && (
                  <div style={styles.tagRow}>
                    {listing.dietary_tags.map((tag) => (
                      <span key={tag} style={styles.tag}>
                        {formatTag(tag)}
                      </span>
                    ))}
                  </div>
                )}

                <div style={styles.idRow}>
                  ID: <span style={styles.idVal}>{listing.id}</span>
                </div>

                <div style={styles.actionRow}>
                  {listing.status !== "expired" && (
                    <button
                      style={{
                        ...styles.btnAmber,
                        ...(isActing ? styles.btnDisabled : {}),
                      }}
                      onClick={() => handleStatusUpdate(listing.id, "expired")}
                      disabled={isActing}
                    >
                      Mark Expired
                    </button>
                  )}
                  {listing.status === "active" ? (
                    <button
                      style={{
                        ...styles.btnBlue,
                        ...(isActing ? styles.btnDisabled : {}),
                      }}
                      onClick={() => handleStatusUpdate(listing.id, "claimed")}
                      disabled={isActing}
                    >
                      Mark Claimed
                    </button>
                  ) : null}
                  <button
                    style={{
                      ...styles.btnRed,
                      ...(isActing ? styles.btnDisabled : {}),
                    }}
                    onClick={() => handleDelete(listing.id, listing.title)}
                    disabled={isActing}
                  >
                    {isActing ? "Working..." : "Delete"}
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

const styles = {
  shell: {
    maxWidth: 1400,
    margin: "0 auto",
    padding: "28px 24px 48px",
    width: "100%",
    color: "#f8fafc",
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif",
  },
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
    padding: "12px 20px",
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 600,
    boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
    maxWidth: 420,
    textAlign: "center",
    pointerEvents: "auto",
  },
  toastSuccess: {
    background: "rgba(20,83,45,0.95)",
    color: "#bbf7d0",
    border: "1px solid rgba(34,197,94,0.4)",
  },
  toastError: {
    background: "rgba(127,29,29,0.95)",
    color: "#fecaca",
    border: "1px solid rgba(239,68,68,0.4)",
  },
  hero: {
    background:
      "radial-gradient(circle at top right, rgba(249,115,22,0.14), transparent 35%), linear-gradient(135deg, #0a1628 0%, #020817 100%)",
    border: "1px solid rgba(148,163,184,0.12)",
    borderRadius: 24,
    padding: "32px",
    marginBottom: 24,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 24,
    flexWrap: "wrap",
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: 700,
    color: "rgba(148,163,184,0.7)",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    marginBottom: 10,
  },
  heroTitle: {
    fontSize: "clamp(1.8rem, 3vw, 2.6rem)",
    fontWeight: 800,
    color: "#f1f5f9",
    letterSpacing: "-0.02em",
    marginBottom: 10,
  },
  heroSubtitle: {
    fontSize: 15,
    color: "rgba(203,213,225,0.85)",
    lineHeight: 1.65,
    maxWidth: 620,
  },
  refreshBtn: {
    padding: "12px 20px",
    borderRadius: 12,
    border: "1px solid rgba(148,163,184,0.2)",
    background: "rgba(255,255,255,0.06)",
    color: "#e2e8f0",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    fontFamily: "inherit",
    flexShrink: 0,
  },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
    marginBottom: 24,
  },
  impactSection: {
    marginBottom: 24,
    padding: "24px",
    borderRadius: 24,
    border: "1px solid rgba(148,163,184,0.12)",
    background:
      "radial-gradient(circle at top left, rgba(56,189,248,0.1), transparent 28%), radial-gradient(circle at bottom right, rgba(249,115,22,0.12), transparent 30%), linear-gradient(135deg, rgba(15,23,42,0.96) 0%, rgba(7,12,24,0.98) 100%)",
  },
  impactHeader: {
    marginBottom: 18,
  },
  impactGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(220px, 320px) minmax(0, 1fr)",
    gap: 16,
    alignItems: "start",
  },
  impactMetricColumn: {
    display: "grid",
    gap: 12,
  },
  impactMetricCard: {
    borderRadius: 20,
    padding: "16px 18px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(148,163,184,0.12)",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start",
  },
  impactMetricLabel: {
    fontSize: 12,
    fontWeight: 800,
    color: "rgba(148,163,184,0.74)",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
  },
  impactMetricValue: {
    fontSize: "clamp(1.8rem, 2.6vw, 2.4rem)",
    fontWeight: 900,
    lineHeight: 0.95,
    letterSpacing: "-0.04em",
    marginTop: 8,
  },
  impactMetricDetail: {
    fontSize: 13,
    color: "rgba(203,213,225,0.76)",
    lineHeight: 1.5,
    marginTop: 10,
    maxWidth: "none",
  },
  impactActivityCard: {
    borderRadius: 20,
    padding: "18px",
    background: "linear-gradient(180deg, rgba(12,20,38,0.92) 0%, rgba(6,10,20,0.96) 100%)",
    border: "1px solid rgba(148,163,184,0.14)",
    minHeight: 160,
    display: "flex",
    flexDirection: "column",
  },
  impactActivityTitle: {
    fontSize: 20,
    fontWeight: 800,
    color: "#f8fafc",
    marginBottom: 8,
    letterSpacing: "-0.02em",
  },
  impactActivityText: {
    fontSize: 14,
    lineHeight: 1.6,
    color: "rgba(203,213,225,0.74)",
    marginBottom: 18,
    maxWidth: 440,
  },
  impactMiniStats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 12,
    marginTop: "auto",
  },
  impactMiniStat: {
    position: "relative",
    borderRadius: 16,
    padding: "16px 16px 14px",
    background: "rgba(255,255,255,0.035)",
    border: "1px solid rgba(148,163,184,0.1)",
    overflow: "hidden",
  },
  impactMiniAccent: {
    width: 40,
    height: 4,
    borderRadius: 999,
    marginBottom: 12,
  },
  impactMiniLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "rgba(148,163,184,0.74)",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: 6,
  },
  impactMiniValue: {
    fontSize: 26,
    fontWeight: 800,
    color: "#f8fafc",
    marginBottom: 6,
    lineHeight: 1,
  },
  impactMiniDetail: {
    fontSize: 12,
    lineHeight: 1.45,
    color: "rgba(148,163,184,0.72)",
  },
  statCard: {
    background: "rgba(13,22,43,0.85)",
    border: "1px solid rgba(148,163,184,0.12)",
    borderRadius: 18,
    padding: "18px 20px",
  },
  statLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "rgba(148,163,184,0.7)",
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    marginBottom: 10,
  },
  statValue: {
    fontSize: 32,
    fontWeight: 800,
    lineHeight: 1,
    marginBottom: 10,
  },
  statCaption: {
    fontSize: 13,
    color: "rgba(148,163,184,0.74)",
    lineHeight: 1.5,
  },
  activitySection: {
    marginBottom: 24,
    background: "rgba(10,16,33,0.82)",
    border: "1px solid rgba(148,163,184,0.12)",
    borderRadius: 24,
    padding: "24px",
  },
  activityHeader: {
    marginBottom: 18,
  },
  sectionKicker: {
    fontSize: 12,
    fontWeight: 700,
    color: "rgba(148,163,184,0.7)",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: 800,
    color: "#f8fafc",
    margin: "0 0 8px",
    letterSpacing: "-0.02em",
  },
  sectionText: {
    fontSize: 14,
    color: "rgba(203,213,225,0.75)",
    lineHeight: 1.6,
    maxWidth: 680,
    margin: 0,
  },
  activityGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 16,
  },
  activityPanel: {
    background: "rgba(2,6,23,0.62)",
    border: "1px solid rgba(148,163,184,0.1)",
    borderRadius: 18,
    padding: "18px",
    minHeight: 240,
  },
  panelTitle: {
    fontSize: 14,
    fontWeight: 800,
    color: "#e2e8f0",
    marginBottom: 16,
    letterSpacing: "0.01em",
  },
  panelEmpty: {
    fontSize: 14,
    color: "rgba(148,163,184,0.72)",
  },
  activityMetric: {
    marginBottom: 16,
  },
  activityMetricHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 8,
  },
  activityMetricLabel: {
    fontSize: 14,
    fontWeight: 700,
    color: "#e2e8f0",
  },
  activityMetricValue: {
    fontSize: 14,
    fontWeight: 800,
    color: "#f8fafc",
  },
  activityTrack: {
    height: 10,
    borderRadius: 999,
    background: "rgba(148,163,184,0.12)",
    overflow: "hidden",
    marginBottom: 6,
  },
  activityFill: {
    height: "100%",
    borderRadius: 999,
  },
  activityHelper: {
    fontSize: 12,
    color: "rgba(148,163,184,0.72)",
    lineHeight: 1.45,
  },
  timeline: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  timelineItem: {
    display: "grid",
    gridTemplateColumns: "18px 1fr",
    gap: 12,
  },
  timelineRail: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "#f97316",
    boxShadow: "0 0 0 4px rgba(249,115,22,0.15)",
    marginTop: 6,
    flexShrink: 0,
  },
  timelineLine: {
    width: 1,
    flex: 1,
    background: "rgba(148,163,184,0.18)",
    marginTop: 6,
  },
  timelineContent: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  timelineTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
  },
  timelineTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "#f8fafc",
  },
  timelineMeta: {
    fontSize: 12,
    color: "rgba(148,163,184,0.74)",
    lineHeight: 1.5,
  },
  restaurantList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  restaurantRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 14,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(148,163,184,0.08)",
  },
  restaurantName: {
    fontSize: 14,
    fontWeight: 700,
    color: "#f8fafc",
  },
  restaurantMeta: {
    fontSize: 12,
    color: "rgba(148,163,184,0.72)",
    marginTop: 4,
  },
  restaurantTotal: {
    minWidth: 42,
    height: 42,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    background: "rgba(249,115,22,0.12)",
    border: "1px solid rgba(249,115,22,0.24)",
    color: "#fdba74",
    fontWeight: 800,
    fontSize: 15,
  },
  tabRow: {
    display: "flex",
    gap: 6,
    marginBottom: 20,
    flexWrap: "wrap",
  },
  tabBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 18px",
    borderRadius: 10,
    border: "1px solid rgba(148,163,184,0.14)",
    background: "transparent",
    color: "rgba(148,163,184,0.8)",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  tabBtnActive: {
    background: "rgba(249,115,22,0.12)",
    border: "1px solid rgba(249,115,22,0.3)",
    color: "#fdba74",
  },
  tabCount: {
    padding: "2px 8px",
    borderRadius: 999,
    background: "rgba(148,163,184,0.1)",
    color: "rgba(148,163,184,0.7)",
    fontSize: 12,
    fontWeight: 700,
  },
  tabCountActive: {
    background: "rgba(249,115,22,0.18)",
    color: "#fdba74",
  },
  skeletonCard: {
    minHeight: 200,
    borderRadius: 20,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(148,163,184,0.1)",
    padding: 22,
  },
  skeletonBar: {
    height: 13,
    borderRadius: 8,
    background: "rgba(148,163,184,0.14)",
    marginBottom: 14,
  },
  emptyState: {
    textAlign: "center",
    padding: "60px 24px",
    background: "rgba(255,255,255,0.02)",
    border: "1px dashed rgba(148,163,184,0.14)",
    borderRadius: 20,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: "#f1f5f9",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "rgba(148,163,184,0.7)",
  },
  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
    gap: 18,
  },
  card: {
    background: "rgba(13,22,43,0.85)",
    border: "1px solid rgba(148,163,184,0.12)",
    borderRadius: 20,
    padding: 22,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "#f1f5f9",
    margin: "0 0 4px 0",
    lineHeight: 1.3,
  },
  cardMeta: {
    fontSize: 12,
    color: "rgba(148,163,184,0.7)",
    fontWeight: 500,
  },
  metaVal: {
    color: "#fdba74",
    fontWeight: 600,
  },
  statusBadge: {
    padding: "5px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    textTransform: "capitalize",
    flexShrink: 0,
  },
  cardDescription: {
    fontSize: 14,
    color: "rgba(203,213,225,0.75)",
    lineHeight: 1.6,
    margin: 0,
  },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 10,
  },
  infoBlock: {
    background: "rgba(2,6,23,0.5)",
    border: "1px solid rgba(148,163,184,0.1)",
    borderRadius: 12,
    padding: "10px 12px",
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "rgba(148,163,184,0.6)",
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    marginBottom: 5,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: 600,
    color: "#e2e8f0",
  },
  tagRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 7,
  },
  tag: {
    padding: "4px 10px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(148,163,184,0.14)",
    color: "#dbeafe",
    fontSize: 12,
    fontWeight: 600,
  },
  idRow: {
    fontSize: 11,
    color: "rgba(148,163,184,0.5)",
    fontFamily: "ui-monospace, Consolas, monospace",
  },
  idVal: {
    color: "rgba(148,163,184,0.7)",
  },
  actionRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 2,
  },
  btnAmber: {
    padding: "9px 14px",
    borderRadius: 10,
    background: "rgba(249,115,22,0.15)",
    color: "#fdba74",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
    border: "1px solid rgba(249,115,22,0.3)",
  },
  btnBlue: {
    padding: "9px 14px",
    borderRadius: 10,
    border: "1px solid rgba(249,115,22,0.3)",
    background: "rgba(249,115,22,0.12)",
    color: "#fdba74",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  btnRed: {
    padding: "9px 14px",
    borderRadius: 10,
    border: "1px solid rgba(239,68,68,0.3)",
    background: "rgba(239,68,68,0.1)",
    color: "#fca5a5",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  btnDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
};
