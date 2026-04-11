import { useCallback, useEffect, useMemo, useState } from "react";
import { getAdminListings, updateListingStatus, deleteListing } from "./api/client";

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
          style={{ ...styles.toast, ...(t.type === "success" ? styles.toastSuccess : styles.toastError) }}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [selectedTab, setSelectedTab] = useState("active");

  const addToast = useCallback((message, type = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const fetchListings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getAdminListings();
      setListings(Array.isArray(data) ? data : []);
    } catch (err) {
      addToast(err.message || "Could not load listings from server.", "error");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { fetchListings(); }, [fetchListings]);

  async function handleStatusUpdate(listingId, newStatus) {
    setActionId(listingId);
    try {
      await updateListingStatus(listingId, newStatus);
      addToast(`Listing marked as ${newStatus}.`, "success");
      await fetchListings();
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
      await fetchListings();
    } catch (err) {
      addToast(err.message || "Failed to delete listing.", "error");
    } finally {
      setActionId(null);
    }
  }

  const active = useMemo(() => listings.filter((l) => l.status === "active"), [listings]);
  const claimed = useMemo(() => listings.filter((l) => l.status === "claimed"), [listings]);
  const expired = useMemo(() => listings.filter((l) => l.status === "expired"), [listings]);
  const mealsSaved = useMemo(() => claimed.reduce((s, l) => s + (Number(l.quantity) || 0), 0), [claimed]);

  const tabs = [
    { key: "active", label: "Active", count: active.length, data: active },
    { key: "claimed", label: "Claimed", count: claimed.length, data: claimed },
    { key: "expired", label: "Expired", count: expired.length, data: expired },
  ];

  const currentListings = tabs.find((t) => t.key === selectedTab)?.data ?? [];

  const statusColors = {
    active: { bg: "rgba(34,197,94,0.12)", color: "#86efac", border: "rgba(34,197,94,0.25)" },
    claimed: { bg: "rgba(34,197,94,0.12)", color: "#86efac", border: "rgba(34,197,94,0.25)" },
    expired: { bg: "rgba(148,163,184,0.1)", color: "#94a3b8", border: "rgba(148,163,184,0.2)" },
  };

  return (
    <div style={styles.shell}>
      <Toast toasts={toasts} />

      {/* Hero */}
      <section style={styles.hero}>
        <div>
          <div style={styles.eyebrow}>MealMatch • Admin Console</div>
          <h1 style={styles.heroTitle}>Admin Dashboard</h1>
          <p style={styles.heroSubtitle}>
            Monitor all listings, update statuses, and track platform activity across every restaurant.
          </p>
        </div>
        <button onClick={fetchListings} style={styles.refreshBtn} disabled={loading}>
          {loading ? "Refreshing..." : "↻ Refresh"}
        </button>
      </section>

      {/* Stats */}
      <div style={styles.statsRow}>
        {[
          { label: "Active Listings", value: active.length, accent: "#22c55e" },
          { label: "Claimed Listings", value: claimed.length, accent: "#f97316" },
          { label: "Expired Listings", value: expired.length, accent: "#94a3b8" },
          { label: "Meals Saved", value: mealsSaved, accent: "#f97316" },
        ].map((s) => (
          <div key={s.label} style={styles.statCard}>
            <div style={styles.statLabel}>{s.label}</div>
            <div style={{ ...styles.statValue, color: s.accent }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={styles.tabRow}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setSelectedTab(t.key)}
            style={{
              ...styles.tabBtn,
              ...(selectedTab === t.key ? styles.tabBtnActive : {}),
            }}
          >
            {t.label}
            <span style={{ ...styles.tabCount, ...(selectedTab === t.key ? styles.tabCountActive : {}) }}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Listing cards */}
      {loading ? (
        <div style={styles.cardGrid}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={styles.skeletonCard}>
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
                {/* Card header */}
                <div style={styles.cardHeader}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={styles.cardTitle}>{listing.title}</h3>
                    <div style={styles.cardMeta}>
                      Restaurant: <span style={styles.metaVal}>{listing.restaurant_id}</span>
                    </div>
                  </div>
                  <span style={{ ...styles.statusBadge, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                    {listing.status}
                  </span>
                </div>

                {/* Description */}
                <p style={styles.cardDescription}>{listing.description}</p>

                {/* Info grid */}
                <div style={styles.infoGrid}>
                  <div style={styles.infoBlock}>
                    <div style={styles.infoLabel}>Quantity</div>
                    <div style={styles.infoValue}>{listing.quantity}</div>
                  </div>
                  <div style={styles.infoBlock}>
                    <div style={styles.infoLabel}>Pickup Start</div>
                    <div style={styles.infoValue}>{formatDateTime(listing.pickup_start)}</div>
                  </div>
                  <div style={styles.infoBlock}>
                    <div style={styles.infoLabel}>Pickup End</div>
                    <div style={styles.infoValue}>{formatDateTime(listing.pickup_end)}</div>
                  </div>
                  <div style={styles.infoBlock}>
                    <div style={styles.infoLabel}>Created</div>
                    <div style={styles.infoValue}>{formatDateTime(listing.created_at)}</div>
                  </div>
                </div>

                {/* Dietary tags */}
                {listing.dietary_tags?.length > 0 && (
                  <div style={styles.tagRow}>
                    {listing.dietary_tags.map((tag) => (
                      <span key={tag} style={styles.tag}>{formatTag(tag)}</span>
                    ))}
                  </div>
                )}

                {/* ID */}
                <div style={styles.idRow}>
                  ID: <span style={styles.idVal}>{listing.id}</span>
                </div>

                {/* Actions */}
                <div style={styles.actionRow}>
                  {listing.status !== "expired" && (
                    <button
                      style={{ ...styles.btnAmber, ...(isActing ? styles.btnDisabled : {}) }}
                      onClick={() => handleStatusUpdate(listing.id, "expired")}
                      disabled={isActing}
                    >
                      Mark Expired
                    </button>
                  )}
                  {listing.status !== "active" && listing.status !== "claimed" ? null : listing.status === "active" ? (
                    <button
                      style={{ ...styles.btnBlue, ...(isActing ? styles.btnDisabled : {}) }}
                      onClick={() => handleStatusUpdate(listing.id, "claimed")}
                      disabled={isActing}
                    >
                      Mark Claimed
                    </button>
                  ) : null}
                  <button
                    style={{ ...styles.btnRed, ...(isActing ? styles.btnDisabled : {}) }}
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
    maxWidth: 580,
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
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 22, fontWeight: 700, color: "#f1f5f9", marginBottom: 8 },
  emptyText: { fontSize: 14, color: "rgba(148,163,184,0.7)" },
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
    background: "rgba(245,158,11,0.15)",
    color: "#fcd34d",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
    border: "1px solid rgba(245,158,11,0.25)",
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
