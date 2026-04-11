import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const API_BASE = "http://localhost:8000/api/v1";

const defaultCenter = [38.9869, -76.9426];

const markerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const demoListings = [
  {
    id: 1,
    title: "Fresh Veggie Wraps",
    description: "Six ready-to-pickup wraps from today's lunch rush.",
    quantity: 6,
    dietary_tags: ["vegetarian", "contains_dairy"],
    pickup_start: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    pickup_end: new Date(Date.now() + 55 * 60 * 1000).toISOString(),
    status: "active",
    created_at: new Date().toISOString(),
    location_name: "Campus Café",
    location: { lat: 38.9882, lng: -76.9441 },
  },
  {
    id: 2,
    title: "Halal Rice Bowls",
    description: "Eight bowls available for quick pickup before close.",
    quantity: 8,
    dietary_tags: ["halal", "high_protein"],
    pickup_start: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    pickup_end: new Date(Date.now() + 40 * 60 * 1000).toISOString(),
    status: "active",
    created_at: new Date().toISOString(),
    location_name: "Union Kitchen",
    location: { lat: 38.9854, lng: -76.9398 },
  },
  {
    id: 3,
    title: "Bakery Box",
    description: "Assorted pastries and bread, best picked up soon.",
    quantity: 4,
    dietary_tags: ["vegetarian"],
    pickup_start: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    pickup_end: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
    status: "active",
    created_at: new Date().toISOString(),
    location_name: "Main Street Bakery",
    location: { lat: 38.9838, lng: -76.9475 },
  },
];

export default function RecipientFeed() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState(null);
  const [viewMode, setViewMode] = useState("list");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTag, setSelectedTag] = useState("all");
  const [sortBy, setSortBy] = useState("ending-soon");
  const [showUrgentOnly, setShowUrgentOnly] = useState(false);
  const [notification, setNotification] = useState(null);
  const [claimCounts, setClaimCounts] = useState({});
  const [usingDemoMode, setUsingDemoMode] = useState(false);

  const userId = "user-demo";

  const fetchListings = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/listings`);

      if (!response.ok) {
        throw new Error("Failed to fetch listings");
      }

      const data = await response.json();
      const normalized = Array.isArray(data) ? data : [];
      setListings(normalized);
      setUsingDemoMode(false);
    } catch (error) {
      setListings(demoListings);
      setUsingDemoMode(true);
      showNotification(
        "Running in polished demo mode because the backend feed is unavailable.",
        "warning"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchListings();
    const interval = setInterval(fetchListings, 15000);
    return () => clearInterval(interval);
  }, []);

  const showNotification = (message, type = "success") => {
    setNotification({ message, type, id: Date.now() });
  };

  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), 2600);
    return () => clearTimeout(timer);
  }, [notification]);

  const allTags = useMemo(() => {
    const tagSet = new Set();
    listings.forEach((listing) => {
      (listing.dietary_tags || []).forEach((tag) => tagSet.add(tag));
    });
    return ["all", ...Array.from(tagSet)];
  }, [listings]);

  const stats = useMemo(() => {
    const activeListings = listings.filter((item) => item.status === "active");
    const mealsAvailable = activeListings.reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0
    );
    const urgentPickups = activeListings.filter((item) => {
      const mins = getMinutesLeft(item.pickup_end);
      return mins > 0 && mins <= 30;
    }).length;

    return {
      activeListings: activeListings.length,
      mealsAvailable,
      urgentPickups,
    };
  }, [listings]);

  const filteredListings = useMemo(() => {
    let result = [...listings];

    result = result.filter((listing) => listing.status === "active");

    if (searchTerm.trim()) {
      const query = searchTerm.toLowerCase();
      result = result.filter((listing) => {
        const title = (listing.title || "").toLowerCase();
        const desc = (listing.description || "").toLowerCase();
        const tags = (listing.dietary_tags || []).join(" ").toLowerCase();
        const location = (listing.location_name || "").toLowerCase();
        return (
          title.includes(query) ||
          desc.includes(query) ||
          tags.includes(query) ||
          location.includes(query)
        );
      });
    }

    if (selectedTag !== "all") {
      result = result.filter((listing) =>
        (listing.dietary_tags || []).includes(selectedTag)
      );
    }

    if (showUrgentOnly) {
      result = result.filter((listing) => {
        const mins = getMinutesLeft(listing.pickup_end);
        return mins > 0 && mins <= 30;
      });
    }

    result.sort((a, b) => {
      if (sortBy === "ending-soon") {
        return new Date(a.pickup_end) - new Date(b.pickup_end);
      }
      if (sortBy === "quantity-high") {
        return Number(b.quantity || 0) - Number(a.quantity || 0);
      }
      if (sortBy === "newest") {
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      }
      if (sortBy === "alphabetical") {
        return (a.title || "").localeCompare(b.title || "");
      }
      return 0;
    });

    return result;
  }, [listings, searchTerm, selectedTag, sortBy, showUrgentOnly]);

  const handleClaimCountChange = (listingId, value, maxQuantity) => {
    const numberValue = Number(value);
    const safeValue = Math.max(
      1,
      Math.min(Number.isNaN(numberValue) ? 1 : numberValue, maxQuantity)
    );

    setClaimCounts((prev) => ({
      ...prev,
      [listingId]: safeValue,
    }));
  };

  const handleClaim = async (listing) => {
    const requestedQuantity = Number(claimCounts[listing.id] || 1);

    try {
      setClaimingId(listing.id);

      if (usingDemoMode) {
        setListings((prev) =>
          prev.map((item) => {
            if (item.id !== listing.id) return item;
            const remaining = Math.max(
              0,
              Number(item.quantity || 0) - requestedQuantity
            );
            return {
              ...item,
              quantity: remaining,
              status: remaining === 0 ? "claimed" : "active",
            };
          })
        );
        showNotification(
          `Reserved ${requestedQuantity} item${
            requestedQuantity > 1 ? "s" : ""
          } from ${listing.title}.`,
          "success"
        );
        return;
      }

      const response = await fetch(`${API_BASE}/listings/${listing.id}/claim`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: userId,
          claimed_quantity: requestedQuantity,
        }),
      });

      if (!response.ok) {
        throw new Error("Claim failed");
      }

      setListings((prev) =>
        prev.map((item) => {
          if (item.id !== listing.id) return item;
          const remaining = Math.max(
            0,
            Number(item.quantity || 0) - requestedQuantity
          );
          return {
            ...item,
            quantity: remaining,
            status: remaining === 0 ? "claimed" : "active",
          };
        })
      );

      showNotification(
        `Pickup secured for ${requestedQuantity} item${
          requestedQuantity > 1 ? "s" : ""
        }.`,
        "success"
      );
    } catch (error) {
      showNotification("Could not complete that claim right now.", "error");
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <div style={styles.shell}>
      <div style={styles.hero}>
        <div>
          <div style={styles.heroBadge}>Real-time food recovery network</div>
          <h1 style={styles.title}>Find nearby meals. Claim in seconds.</h1>
          <p style={styles.subtitle}>
            Browse live surplus listings, filter by dietary needs, and reserve a
            pickup slot through a fast, mobile-friendly interface.
          </p>
        </div>

        <div style={styles.livePanel}>
          <div style={styles.liveHeader}>
            <span style={styles.liveDot} />
            <span>Live availability</span>
          </div>
          <div style={styles.liveStatRow}>
            <MiniStat label="Listings" value={stats.activeListings} />
            <MiniStat label="Meals" value={stats.mealsAvailable} />
            <MiniStat label="Urgent" value={stats.urgentPickups} />
          </div>
        </div>
      </div>

      {notification && (
        <div
          style={{
            ...styles.notification,
            ...(notification.type === "success"
              ? styles.notificationSuccess
              : notification.type === "warning"
              ? styles.notificationWarning
              : styles.notificationError),
          }}
        >
          <span style={styles.notificationPulse} />
          {notification.message}
        </div>
      )}

      <div style={styles.toolbar}>
        <div style={styles.searchWrap}>
          <span style={styles.searchIcon}>⌕</span>
          <input
            type="text"
            placeholder="Search meals, tags, or location"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={styles.searchInput}
          />
        </div>

        <div style={styles.controls}>
          <select
            value={selectedTag}
            onChange={(e) => setSelectedTag(e.target.value)}
            style={styles.select}
          >
            {allTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag === "all" ? "All dietary tags" : tag}
              </option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={styles.select}
          >
            <option value="ending-soon">Ending soon</option>
            <option value="quantity-high">Highest quantity</option>
            <option value="newest">Newest listings</option>
            <option value="alphabetical">A → Z</option>
          </select>

          <button
            onClick={() => setShowUrgentOnly((prev) => !prev)}
            style={{
              ...styles.toggleButton,
              ...(showUrgentOnly ? styles.toggleButtonActive : {}),
            }}
          >
            Urgent only
          </button>

          <div style={styles.viewToggle}>
            <button
              onClick={() => setViewMode("list")}
              style={{
                ...styles.viewButton,
                ...(viewMode === "list" ? styles.viewButtonActive : {}),
              }}
            >
              List
            </button>
            <button
              onClick={() => setViewMode("map")}
              style={{
                ...styles.viewButton,
                ...(viewMode === "map" ? styles.viewButtonActive : {}),
              }}
            >
              Map
            </button>
          </div>
        </div>
      </div>

      <div style={styles.statsRow}>
        <GlassCard>
          <div style={styles.statLabel}>Active listings</div>
          <div style={styles.statValue}>{stats.activeListings}</div>
        </GlassCard>
        <GlassCard>
          <div style={styles.statLabel}>Meals available</div>
          <div style={styles.statValue}>{stats.mealsAvailable}</div>
        </GlassCard>
        <GlassCard>
          <div style={styles.statLabel}>Ending soon</div>
          <div style={styles.statValue}>{stats.urgentPickups}</div>
        </GlassCard>
      </div>

      {loading ? (
        <div style={styles.cardGrid}>
          {[1, 2, 3].map((item) => (
            <div key={item} style={styles.skeletonCard}>
              <div style={{ ...styles.skeletonBar, width: "60%" }} />
              <div style={{ ...styles.skeletonBar, width: "90%" }} />
              <div style={{ ...styles.skeletonBar, width: "50%" }} />
            </div>
          ))}
        </div>
      ) : viewMode === "map" ? (
        <div style={styles.mapShell}>
          <MapContainer
            center={defaultCenter}
            zoom={14}
            style={styles.map}
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {filteredListings.map((listing) => {
              const lat = listing.location?.lat ?? defaultCenter[0];
              const lng = listing.location?.lng ?? defaultCenter[1];
              return (
                <Marker
                  key={listing.id}
                  position={[lat, lng]}
                  icon={markerIcon}
                >
                  <Popup>
                    <div style={{ minWidth: 180 }}>
                      <strong>{listing.title}</strong>
                      <p style={{ margin: "8px 0" }}>{listing.description}</p>
                      <p style={{ margin: "8px 0" }}>
                        Qty: {listing.quantity} ·{" "}
                        {formatMinutesLeft(getMinutesLeft(listing.pickup_end))}
                      </p>
                      <button
                        onClick={() => handleClaim(listing)}
                        style={styles.popupButton}
                      >
                        Claim now
                      </button>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>
      ) : filteredListings.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>⌕</div>
          <h3 style={styles.emptyTitle}>No matching listings right now</h3>
          <p style={styles.emptyText}>
            Try a different search, remove a filter, or switch to map view.
          </p>
        </div>
      ) : (
        <div style={styles.cardGrid}>
          {filteredListings.map((listing) => {
            const minutesLeft = getMinutesLeft(listing.pickup_end);
            const isUrgent = minutesLeft > 0 && minutesLeft <= 30;
            const maxQuantity = Number(listing.quantity || 1);
            const claimValue = claimCounts[listing.id] || 1;

            return (
              <div key={listing.id} style={styles.listingCard}>
                <div style={styles.cardTop}>
                  <div>
                    <div style={styles.locationPill}>
                      {listing.location_name || "Nearby pickup"}
                    </div>
                    <h3 style={styles.cardTitle}>{listing.title}</h3>
                    <p style={styles.cardDescription}>
                      {listing.description || "Freshly posted listing."}
                    </p>
                  </div>

                  <div
                    style={{
                      ...styles.statusBadge,
                      ...(isUrgent ? styles.statusUrgent : styles.statusActive),
                    }}
                  >
                    {isUrgent ? "Urgent" : "Available"}
                  </div>
                </div>

                <div style={styles.infoGrid}>
                  <InfoBlock label="Quantity" value={`${listing.quantity}`} />
                  <InfoBlock
                    label="Pickup starts"
                    value={formatTime(listing.pickup_start)}
                  />
                  <InfoBlock
                    label="Pickup ends"
                    value={formatTime(listing.pickup_end)}
                  />
                  <InfoBlock
                    label="Time left"
                    value={formatMinutesLeft(minutesLeft)}
                  />
                </div>

                <div style={styles.tagRow}>
                  {(listing.dietary_tags || []).length > 0 ? (
                    listing.dietary_tags.map((tag) => (
                      <span key={tag} style={styles.tag}>
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span style={styles.tagMuted}>No dietary tags</span>
                  )}
                </div>

                {isUrgent && (
                  <div style={styles.urgentBanner}>
                    This listing is about to expire. Claim soon for the best
                    chance of pickup.
                  </div>
                )}

                <div style={styles.cardFooter}>
                  <div style={styles.claimControl}>
                    <label style={styles.claimLabel}>Claim</label>
                    <input
                      type="number"
                      min="1"
                      max={maxQuantity}
                      value={claimValue}
                      onChange={(e) =>
                        handleClaimCountChange(
                          listing.id,
                          e.target.value,
                          maxQuantity
                        )
                      }
                      style={styles.quantityInput}
                    />
                  </div>

                  <button
                    onClick={() => handleClaim(listing)}
                    disabled={claimingId === listing.id}
                    style={{
                      ...styles.claimButton,
                      ...(claimingId === listing.id
                        ? styles.claimButtonDisabled
                        : {}),
                    }}
                  >
                    {claimingId === listing.id ? "Claiming..." : "Reserve pickup"}
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

function GlassCard({ children }) {
  return <div style={styles.glassCard}>{children}</div>;
}

function MiniStat({ label, value }) {
  return (
    <div style={styles.miniStat}>
      <div style={styles.miniStatValue}>{value}</div>
      <div style={styles.miniStatLabel}>{label}</div>
    </div>
  );
}

function InfoBlock({ label, value }) {
  return (
    <div style={styles.infoBlock}>
      <div style={styles.infoLabel}>{label}</div>
      <div style={styles.infoValue}>{value}</div>
    </div>
  );
}

function formatTime(dateString) {
  if (!dateString) return "N/A";
  return new Date(dateString).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getMinutesLeft(dateString) {
  if (!dateString) return 0;
  return Math.floor((new Date(dateString) - new Date()) / 60000);
}

function formatMinutesLeft(minutes) {
  if (minutes <= 0) return "Closing";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

const styles = {
  shell: {
    maxWidth: 1400,
    margin: "0 auto",
    padding: "28px 24px 48px",
    width: "100%",
    color: "#f8fafc",
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  },
  hero: {
    position: "relative",
    overflow: "hidden",
    background:
      "radial-gradient(circle at top left, rgba(34,197,94,0.28), transparent 30%), radial-gradient(circle at top right, rgba(59,130,246,0.22), transparent 28%), linear-gradient(135deg, #0f172a 0%, #111827 48%, #020617 100%)",
    border: "1px solid rgba(148,163,184,0.18)",
    borderRadius: 24,
    padding: 28,
    boxShadow: "0 24px 60px rgba(2,6,23,0.45)",
    textAlign: "left",
  },
  heroBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 14px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "#cbd5e1",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 0.3,
    marginBottom: 16,
  },
  title: {
    margin: 0,
    fontSize: "clamp(2rem, 4vw, 3.3rem)",
    lineHeight: 1.05,
    fontWeight: 800,
    color: "#f8fafc",
  },
  subtitle: {
    marginTop: 14,
    maxWidth: 760,
    color: "#cbd5e1",
    fontSize: 16,
    lineHeight: 1.65,
  },
  livePanel: {
    marginTop: 24,
    display: "inline-block",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: 18,
    backdropFilter: "blur(10px)",
  },
  liveHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    color: "#e2e8f0",
    fontWeight: 700,
    marginBottom: 14,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "#22c55e",
    boxShadow: "0 0 0 6px rgba(34,197,94,0.15)",
  },
  liveStatRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
  },
  miniStat: {
    background: "rgba(2,6,23,0.35)",
    borderRadius: 14,
    padding: "12px 16px",
    minWidth: 90,
  },
  miniStatValue: {
    fontWeight: 800,
    fontSize: 22,
    color: "#ffffff",
  },
  miniStatLabel: {
    marginTop: 4,
    color: "#94a3b8",
    fontSize: 12,
  },
  notification: {
    marginTop: 18,
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 18px",
    borderRadius: 16,
    fontWeight: 700,
    animation: "slideIn 0.25s ease",
    textAlign: "left",
  },
  notificationSuccess: {
    background: "rgba(34,197,94,0.14)",
    border: "1px solid rgba(34,197,94,0.3)",
    color: "#bbf7d0",
  },
  notificationWarning: {
    background: "rgba(245,158,11,0.14)",
    border: "1px solid rgba(245,158,11,0.3)",
    color: "#fde68a",
  },
  notificationError: {
    background: "rgba(239,68,68,0.14)",
    border: "1px solid rgba(239,68,68,0.3)",
    color: "#fecaca",
  },
  notificationPulse: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "currentColor",
    opacity: 0.9,
  },
  toolbar: {
    marginTop: 22,
    display: "flex",
    gap: 14,
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
  },
  searchWrap: {
    flex: "1 1 280px",
    minWidth: 260,
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "rgba(15,23,42,0.9)",
    border: "1px solid rgba(148,163,184,0.16)",
    borderRadius: 16,
    padding: "0 14px",
    minHeight: 52,
    boxShadow: "0 8px 24px rgba(2,6,23,0.25)",
  },
  searchIcon: {
    color: "#94a3b8",
    fontSize: 18,
  },
  searchInput: {
    flex: 1,
    border: "none",
    outline: "none",
    background: "transparent",
    color: "#f8fafc",
    fontSize: 15,
  },
  controls: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  select: {
    background: "#0f172a",
    color: "#f8fafc",
    border: "1px solid rgba(148,163,184,0.18)",
    borderRadius: 14,
    padding: "12px 14px",
    minHeight: 48,
    outline: "none",
    boxShadow: "0 8px 24px rgba(2,6,23,0.2)",
  },
  toggleButton: {
    minHeight: 48,
    padding: "0 16px",
    borderRadius: 14,
    border: "1px solid rgba(148,163,184,0.18)",
    background: "#0f172a",
    color: "#e2e8f0",
    fontWeight: 700,
    cursor: "pointer",
  },
  toggleButtonActive: {
    background: "linear-gradient(135deg, #f59e0b, #ea580c)",
    color: "#fff",
    border: "none",
  },
  viewToggle: {
    display: "flex",
    background: "#0f172a",
    border: "1px solid rgba(148,163,184,0.16)",
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  viewButton: {
    minHeight: 40,
    minWidth: 72,
    borderRadius: 10,
    border: "none",
    background: "transparent",
    color: "#cbd5e1",
    cursor: "pointer",
    fontWeight: 700,
  },
  viewButtonActive: {
    background: "linear-gradient(135deg, #2563eb, #06b6d4)",
    color: "#fff",
  },
  statsRow: {
    marginTop: 20,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
  },
  glassCard: {
    background: "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))",
    backdropFilter: "blur(10px)",
    border: "1px solid rgba(148,163,184,0.16)",
    borderRadius: 18,
    padding: 18,
    textAlign: "left",
    boxShadow: "0 12px 30px rgba(2,6,23,0.2)",
  },
  statLabel: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statValue: {
    marginTop: 10,
    fontSize: 32,
    fontWeight: 800,
    color: "#ffffff",
  },
  mapShell: {
    marginTop: 20,
    borderRadius: 22,
    overflow: "hidden",
    border: "1px solid rgba(148,163,184,0.18)",
    boxShadow: "0 20px 50px rgba(2,6,23,0.35)",
  },
  map: {
    height: 560,
    width: "100%",
  },
  popupButton: {
    marginTop: 8,
    width: "100%",
    border: "none",
    borderRadius: 10,
    padding: "10px 12px",
    background: "linear-gradient(135deg, #2563eb, #06b6d4)",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  },
  cardGrid: {
    marginTop: 20,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 18,
  },
  skeletonCard: {
    minHeight: 220,
    borderRadius: 22,
    background: "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))",
    border: "1px solid rgba(148,163,184,0.12)",
    padding: 22,
  },
  skeletonBar: {
    height: 14,
    borderRadius: 10,
    background: "rgba(148,163,184,0.16)",
    marginBottom: 14,
  },
  emptyState: {
    marginTop: 20,
    borderRadius: 22,
    padding: "48px 24px",
    textAlign: "center",
    background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
    border: "1px solid rgba(148,163,184,0.14)",
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
    color: "#60a5fa",
  },
  emptyTitle: {
    margin: 0,
    fontSize: 24,
    color: "#f8fafc",
  },
  emptyText: {
    marginTop: 10,
    color: "#94a3b8",
  },
  listingCard: {
    background:
      "radial-gradient(circle at top right, rgba(37,99,235,0.14), transparent 24%), linear-gradient(180deg, rgba(15,23,42,0.96), rgba(2,6,23,0.96))",
    border: "1px solid rgba(148,163,184,0.16)",
    borderRadius: 22,
    padding: 22,
    textAlign: "left",
    boxShadow: "0 18px 40px rgba(2,6,23,0.32)",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
  },
  locationPill: {
    display: "inline-flex",
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(59,130,246,0.14)",
    color: "#93c5fd",
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 12,
  },
  cardTitle: {
    margin: 0,
    color: "#ffffff",
    fontSize: 22,
    fontWeight: 800,
  },
  cardDescription: {
    marginTop: 10,
    color: "#cbd5e1",
    lineHeight: 1.6,
    fontSize: 14,
  },
  statusBadge: {
    whiteSpace: "nowrap",
    borderRadius: 999,
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.4,
  },
  statusActive: {
    background: "rgba(34,197,94,0.12)",
    color: "#86efac",
    border: "1px solid rgba(34,197,94,0.22)",
  },
  statusUrgent: {
    background: "rgba(245,158,11,0.12)",
    color: "#fcd34d",
    border: "1px solid rgba(245,158,11,0.22)",
  },
  infoGrid: {
    marginTop: 18,
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
  },
  infoBlock: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(148,163,184,0.1)",
    borderRadius: 16,
    padding: 14,
  },
  infoLabel: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  infoValue: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: 700,
  },
  tagRow: {
    marginTop: 16,
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  tag: {
    display: "inline-flex",
    alignItems: "center",
    padding: "7px 11px",
    borderRadius: 999,
    background: "rgba(16,185,129,0.12)",
    color: "#6ee7b7",
    fontSize: 12,
    fontWeight: 700,
    border: "1px solid rgba(16,185,129,0.16)",
  },
  tagMuted: {
    color: "#94a3b8",
    fontSize: 13,
  },
  urgentBanner: {
    marginTop: 16,
    padding: "12px 14px",
    borderRadius: 14,
    background: "rgba(245,158,11,0.12)",
    color: "#fde68a",
    border: "1px solid rgba(245,158,11,0.2)",
    lineHeight: 1.5,
    fontSize: 13,
    fontWeight: 600,
  },
  cardFooter: {
    marginTop: 18,
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    alignItems: "end",
    flexWrap: "wrap",
  },
  claimControl: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  claimLabel: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  quantityInput: {
    width: 90,
    background: "#020617",
    color: "#f8fafc",
    border: "1px solid rgba(148,163,184,0.18)",
    borderRadius: 12,
    padding: "12px 14px",
    outline: "none",
    fontWeight: 700,
  },
  claimButton: {
    border: "none",
    borderRadius: 14,
    padding: "14px 18px",
    background: "linear-gradient(135deg, #2563eb, #22c55e)",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
    minWidth: 170,
    boxShadow: "0 14px 28px rgba(37,99,235,0.22)",
  },
  claimButtonDisabled: {
    opacity: 0.7,
    cursor: "not-allowed",
  },
};