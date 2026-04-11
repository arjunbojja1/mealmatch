import { useEffect, useMemo, useState } from "react";
import {
  getAdminListings,
  createListing,
  updateListingStatus,
} from "./api/client";
import { useAuth } from "./auth/useAuth";

const dietaryOptions = [
  "vegetarian",
  "vegan",
  "halal",
  "contains_dairy",
  "non_veg",
];

export default function RestaurantDashboard() {
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    quantity: "",
    dietary_tags: [],
    pickup_start: "",
    pickup_end: "",
    location_name: "",
    address: "",
  });

  const [listings, setListings] = useState([]);
  const [selectedTab, setSelectedTab] = useState("active");

  // isLoading: true only on initial mount (shows skeletons)
  // isFetching: true on every fetch including post-mutation (shows refresh indicator only)
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

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

  function handleChange(e) {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function handleTagToggle(tag) {
    setFormData((prev) => {
      const alreadySelected = prev.dietary_tags.includes(tag);

      return {
        ...prev,
        dietary_tags: alreadySelected
          ? prev.dietary_tags.filter((t) => t !== tag)
          : [...prev.dietary_tags, tag],
      };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    if (
      !formData.title.trim() ||
      !formData.description.trim() ||
      !formData.quantity ||
      !formData.pickup_start ||
      !formData.pickup_end
    ) {
      setError("Please fill in all required fields.");
      return;
    }

    const payload = {
      restaurant_id: restaurantId,
      title: formData.title,
      description: formData.description,
      quantity: Number(formData.quantity),
      dietary_tags: formData.dietary_tags,
      pickup_start: new Date(formData.pickup_start).toISOString(),
      pickup_end: new Date(formData.pickup_end).toISOString(),
      location_name: formData.location_name.trim(),
      address: formData.address.trim(),
    };

    try {
      setIsSubmitting(true);

      await createListing(payload);

      setFormData({
        title: "",
        description: "",
        quantity: "",
        dietary_tags: [],
        pickup_start: "",
        pickup_end: "",
        location_name: "",
        address: "",
      });

      await fetchListings(); // rebuilds all tab arrays from backend
      setSuccessMessage("Listing created successfully.");
      setSelectedTab("active");
    } catch (err) {
      setError(err.message || "Something went wrong while creating the listing.");
    } finally {
      setIsSubmitting(false);
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

  return (
    <div style={styles.page}>
      <section style={styles.hero}>
        <div>
          <p style={styles.eyebrow}>MealMatch • Restaurant Portal</p>
          <h1 style={styles.heroTitle}>Restaurant Dashboard</h1>
          <p style={styles.heroText}>
            Create surplus food listings, manage statuses, and monitor active,
            claimed, and expired inventory from backend-synced data.
          </p>
        </div>

        <div style={styles.heroBadge}>
          <div style={styles.heroBadgeNumber}>{activeListings.length}</div>
          <div style={styles.heroBadgeLabel}>Currently Active</div>
        </div>
      </section>

      <section style={styles.statsGrid}>
        <div style={styles.statCard}>
          <p style={styles.statLabel}>Active Listings</p>
          <h3 style={styles.statValue}>{activeListings.length}</h3>
        </div>
        <div style={styles.statCard}>
          <p style={styles.statLabel}>Claimed Listings</p>
          <h3 style={styles.statValue}>{claimedListings.length}</h3>
        </div>
        <div style={styles.statCard}>
          <p style={styles.statLabel}>Expired Listings</p>
          <h3 style={styles.statValue}>{expiredListings.length}</h3>
        </div>
        <div style={styles.statCard}>
          <p style={styles.statLabel}>Total Meals Posted</p>
          <h3 style={styles.statValue}>{totalMeals}</h3>
        </div>
      </section>

      <section style={styles.mainGrid}>
        <div style={styles.formCard}>
          <div style={styles.sectionHeader}>
            <p style={styles.sectionKicker}>Listing Creation</p>
            <h2 style={styles.sectionTitle}>Create New Listing</h2>
            <p style={styles.sectionText}>
              Fill out the details below to publish a new surplus food listing.
            </p>
          </div>

          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Title</label>
              <input
                type="text"
                name="title"
                placeholder="Example: Vegetarian Pasta Meals"
                value={formData.title}
                onChange={handleChange}
                style={styles.input}
              />
            </div>

            <div style={styles.fieldGroup}>
              <label style={styles.label}>Description</label>
              <textarea
                name="description"
                placeholder="Describe the food and any pickup details"
                value={formData.description}
                onChange={handleChange}
                style={styles.textarea}
              />
            </div>

            <div style={styles.row}>
              <div style={styles.fieldGroupHalf}>
                <label style={styles.label}>Quantity</label>
                <input
                  type="number"
                  name="quantity"
                  placeholder="10"
                  value={formData.quantity}
                  onChange={handleChange}
                  style={styles.input}
                  min="1"
                />
              </div>
            </div>

            <div style={styles.row}>
              <div style={styles.fieldGroupHalf}>
                <label style={styles.label}>Location Name <span style={{ color: "#64748b", fontWeight: 400 }}>(optional)</span></label>
                <input
                  type="text"
                  name="location_name"
                  placeholder="e.g. Stamp Student Union"
                  value={formData.location_name}
                  onChange={handleChange}
                  style={styles.input}
                />
              </div>
            </div>

            <div style={styles.fieldGroup}>
              <label style={styles.label}>Street Address <span style={{ color: "#64748b", fontWeight: 400 }}>(optional — enables directions)</span></label>
              <input
                type="text"
                name="address"
                placeholder="e.g. 3972 Campus Dr, College Park, MD 20742"
                value={formData.address}
                onChange={handleChange}
                style={styles.input}
              />
            </div>

            <div style={styles.fieldGroup}>
              <label style={styles.label}>Dietary Tags</label>
              <div style={styles.tagContainer}>
                {dietaryOptions.map((tag) => {
                  const selected = formData.dietary_tags.includes(tag);

                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleTagToggle(tag)}
                      style={{
                        ...styles.tagButton,
                        ...(selected ? styles.tagButtonSelected : {}),
                      }}
                    >
                      {formatTag(tag)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={styles.row}>
              <div style={styles.fieldGroupHalf}>
                <label style={styles.label}>Pickup Start Time</label>
                <input
                  type="datetime-local"
                  name="pickup_start"
                  value={formData.pickup_start}
                  onChange={handleChange}
                  style={styles.input}
                />
              </div>

              <div style={styles.fieldGroupHalf}>
                <label style={styles.label}>Pickup End Time</label>
                <input
                  type="datetime-local"
                  name="pickup_end"
                  value={formData.pickup_end}
                  onChange={handleChange}
                  style={styles.input}
                />
              </div>
            </div>

            {error ? <div style={styles.errorBox}>{error}</div> : null}
            {successMessage ? <div style={styles.successBox}>{successMessage}</div> : null}

            <button type="submit" style={styles.submitButton} disabled={isSubmitting}>
              {isSubmitting ? "Creating Listing..." : "Create Listing"}
            </button>
          </form>
        </div>

        <div style={styles.listingsCard}>
          <div style={{ ...styles.sectionHeader, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <p style={styles.sectionKicker}>Listing Management</p>
              <h2 style={styles.sectionTitle}>Manage Listings</h2>
              <p style={styles.sectionText}>
                View active, claimed, and expired listings synced from backend.
              </p>
            </div>
            <button
              onClick={() => fetchListings()}
              disabled={isFetching}
              style={{
                ...styles.refreshButton,
                ...(isFetching ? styles.refreshButtonDisabled : {}),
              }}
            >
              {isFetching ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          <div style={styles.tabs}>
            <button
              onClick={() => setSelectedTab("active")}
              style={{
                ...styles.tabButton,
                ...(selectedTab === "active" ? styles.activeTab : {}),
              }}
            >
              Active ({tabCounts.active})
            </button>
            <button
              onClick={() => setSelectedTab("claimed")}
              style={{
                ...styles.tabButton,
                ...(selectedTab === "claimed" ? styles.activeTab : {}),
              }}
            >
              Claimed ({tabCounts.claimed})
            </button>
            <button
              onClick={() => setSelectedTab("expired")}
              style={{
                ...styles.tabButton,
                ...(selectedTab === "expired" ? styles.activeTab : {}),
              }}
            >
              Expired ({tabCounts.expired})
            </button>
          </div>

          {isLoading ? (
            <div style={styles.emptyState}>Loading listings...</div>
          ) : error ? (
            <div style={styles.emptyState}>
              <h3 style={styles.emptyTitle}>Failed to load listings</h3>
              <p style={styles.emptyText}>{error}</p>
            </div>
          ) : displayedListings.length === 0 ? (
            <div style={styles.emptyState}>
              <h3 style={styles.emptyTitle}>No {selectedTab} listings</h3>
              <p style={styles.emptyText}>
                Listings in this category will appear here.
              </p>
            </div>
          ) : (
            <div style={styles.listingsColumn}>
              {displayedListings.map((listing) => (
                <div key={listing.id} style={styles.listingCard}>
                  <div style={styles.listingHeader}>
                    <div>
                      <p style={styles.listingId}>Listing #{listing.id}</p>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          flexWrap: "wrap",
                          marginBottom: "6px",
                        }}
                      >
                        <h3 style={{ ...styles.listingTitle, marginBottom: 0 }}>
                          {listing.title}
                        </h3>
                        {listing.is_urgent && (
                          <span
                            style={{
                              padding: "4px 10px",
                              borderRadius: "999px",
                              background: "rgba(249,115,22,0.16)",
                              color: "#f97316",
                              fontSize: "12px",
                              fontWeight: 700,
                              border: "1px solid rgba(249,115,22,0.3)",
                              flexShrink: 0,
                            }}
                          >
                            ⚡ Urgent
                          </span>
                        )}
                      </div>
                      <p style={styles.listingDescription}>{listing.description}</p>
                    </div>
                    <span style={styles.statusPill}>{listing.status}</span>
                  </div>

                  <div style={styles.listingMetaGrid}>
                    <div style={styles.metaBox}>
                      <span style={styles.metaLabel}>Quantity</span>
                      <span style={styles.metaValue}>{listing.quantity}</span>
                    </div>
                    <div style={styles.metaBox}>
                      <span style={styles.metaLabel}>Pickup Start</span>
                      <span style={styles.metaValueSmall}>
                        {formatDate(listing.pickup_start)}
                      </span>
                    </div>
                    <div style={styles.metaBox}>
                      <span style={styles.metaLabel}>Pickup End</span>
                      <span style={styles.metaValueSmall}>
                        {formatDate(listing.pickup_end)}
                      </span>
                    </div>
                  </div>

                  <div style={styles.tagContainer}>
                    {listing.dietary_tags?.length ? (
                      listing.dietary_tags.map((tag) => (
                        <span key={tag} style={styles.listingTag}>
                          {formatTag(tag)}
                        </span>
                      ))
                    ) : (
                      <span style={styles.listingTag}>No Tags</span>
                    )}
                  </div>

                  {selectedTab === "active" ? (
                    <div style={styles.cardActions}>
                      <button
                        onClick={() => handleStatusUpdate(listing.id, "claimed")}
                        style={styles.claimButton}
                      >
                        Mark Claimed
                      </button>
                      <button
                        onClick={() => handleStatusUpdate(listing.id, "expired")}
                        style={styles.expireButton}
                      >
                        Mark Expired
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function formatTag(tag) {
  return tag
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleString();
}

const styles = {
  page: {
    color: "#e5eefc",
  },
  hero: {
    maxWidth: "1200px",
    margin: "0 auto 22px",
    borderRadius: "28px",
    padding: "32px",
    background:
      "radial-gradient(circle at top right, rgba(96,165,250,0.28), transparent 28%), linear-gradient(135deg, #020617 0%, #0f172a 45%, #111827 100%)",
    border: "1px solid rgba(148,163,184,0.18)",
    boxShadow: "0 28px 80px rgba(2, 6, 23, 0.42)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "24px",
    flexWrap: "wrap",
  },
  eyebrow: {
    margin: "0 0 10px 0",
    fontSize: "12px",
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "rgba(191,219,254,0.9)",
    fontWeight: 700,
  },
  heroTitle: {
    margin: "0 0 12px 0",
    fontSize: "42px",
    lineHeight: 1.05,
    color: "#f8fbff",
  },
  heroText: {
    margin: 0,
    maxWidth: "700px",
    fontSize: "16px",
    lineHeight: 1.7,
    color: "rgba(226,232,240,0.92)",
  },
  heroBadge: {
    minWidth: "180px",
    padding: "22px",
    borderRadius: "22px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(148,163,184,0.18)",
    textAlign: "center",
  },
  heroBadgeNumber: {
    fontSize: "36px",
    fontWeight: 800,
    color: "#ffffff",
  },
  heroBadgeLabel: {
    fontSize: "13px",
    color: "#cbd5e1",
  },
  statsGrid: {
    maxWidth: "1200px",
    margin: "0 auto 24px",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "16px",
  },
  statCard: {
    background: "rgba(15,23,42,0.72)",
    border: "1px solid rgba(249,115,22,0.12)",
    borderRadius: "22px",
    padding: "20px",
    boxShadow: "0 18px 36px rgba(2, 6, 23, 0.18)",
  },
  statLabel: {
    margin: "0 0 6px 0",
    color: "#fdba74",
    fontSize: "13px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontWeight: 700,
  },
  statValue: {
    margin: 0,
    fontSize: "32px",
    fontWeight: 800,
    color: "#f8fbff",
  },
  mainGrid: {
    maxWidth: "1200px",
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "24px",
    alignItems: "start",
  },
  formCard: {
    background: "rgba(15,23,42,0.72)",
    border: "1px solid rgba(148,163,184,0.12)",
    borderRadius: "26px",
    padding: "24px",
    boxShadow: "0 24px 48px rgba(2, 6, 23, 0.24)",
  },
  listingsCard: {
    background: "rgba(15,23,42,0.72)",
    border: "1px solid rgba(148,163,184,0.12)",
    borderRadius: "26px",
    padding: "24px",
    boxShadow: "0 24px 48px rgba(2, 6, 23, 0.24)",
  },
  sectionHeader: {
    marginBottom: "20px",
  },
  sectionKicker: {
    margin: "0 0 6px 0",
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "#fb923c",
    fontWeight: 700,
  },
  sectionTitle: {
    margin: "0 0 8px 0",
    fontSize: "28px",
    color: "#f8fbff",
  },
  sectionText: {
    margin: 0,
    color: "rgba(203,213,225,0.82)",
    lineHeight: 1.6,
    fontSize: "15px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "18px",
  },
  fieldGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  fieldGroupHalf: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    minWidth: "220px",
  },
  label: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#dbeafe",
  },
  input: {
    width: "100%",
    padding: "14px 16px",
    borderRadius: "16px",
    border: "1px solid rgba(148,163,184,0.18)",
    background: "rgba(2,6,23,0.52)",
    color: "#f8fbff",
    fontSize: "15px",
    outline: "none",
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    minHeight: "124px",
    padding: "14px 16px",
    borderRadius: "16px",
    border: "1px solid rgba(148,163,184,0.18)",
    background: "rgba(2,6,23,0.52)",
    color: "#f8fbff",
    fontSize: "15px",
    outline: "none",
    resize: "vertical",
    boxSizing: "border-box",
  },
  row: {
    display: "flex",
    gap: "16px",
    flexWrap: "wrap",
  },
  tagContainer: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
  },
  tagButton: {
    padding: "10px 14px",
    borderRadius: "999px",
    border: "1px solid rgba(148,163,184,0.18)",
    background: "rgba(255,255,255,0.04)",
    color: "#cbd5e1",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: "14px",
  },
  tagButtonSelected: {
    background: "#f97316",
    color: "white",
    border: "1px solid rgba(249,115,22,0.6)",
    boxShadow: "0 4px 12px rgba(249,115,22,0.25)",
  },
  errorBox: {
    background: "rgba(127,29,29,0.32)",
    color: "#fecaca",
    border: "1px solid rgba(248,113,113,0.26)",
    padding: "12px 14px",
    borderRadius: "14px",
    fontSize: "14px",
  },
  successBox: {
    background: "rgba(20,83,45,0.3)",
    color: "#bbf7d0",
    border: "1px solid rgba(74,222,128,0.22)",
    padding: "12px 14px",
    borderRadius: "14px",
    fontSize: "14px",
  },
  submitButton: {
    padding: "15px 20px",
    borderRadius: "16px",
    border: "none",
    background: "#f97316",
    color: "white",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: "15px",
    boxShadow: "0 8px 20px rgba(249,115,22,0.3)",
  },
  tabs: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    marginBottom: "18px",
  },
  tabButton: {
    padding: "10px 14px",
    borderRadius: "999px",
    border: "1px solid rgba(148,163,184,0.18)",
    background: "rgba(255,255,255,0.04)",
    color: "#cbd5e1",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "14px",
  },
  activeTab: {
    background: "#f97316",
    color: "white",
    border: "1px solid rgba(234,88,12,0.8)",
  },
  emptyState: {
    padding: "34px 20px",
    borderRadius: "20px",
    background: "rgba(2,6,23,0.44)",
    border: "1px dashed rgba(148,163,184,0.18)",
    textAlign: "center",
    color: "#cbd5e1",
  },
  emptyTitle: {
    margin: "0 0 8px 0",
    color: "#f8fbff",
  },
  emptyText: {
    margin: 0,
    color: "rgba(203,213,225,0.82)",
  },
  listingsColumn: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  listingCard: {
    border: "1px solid rgba(148,163,184,0.16)",
    borderRadius: "22px",
    padding: "18px",
    background:
      "linear-gradient(180deg, rgba(30,41,59,0.88) 0%, rgba(15,23,42,0.94) 100%)",
    boxShadow: "0 16px 34px rgba(2, 6, 23, 0.22)",
  },
  listingHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    alignItems: "flex-start",
    marginBottom: "16px",
    flexWrap: "wrap",
  },
  listingId: {
    margin: "0 0 6px 0",
    color: "#fb923c",
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontWeight: 700,
  },
  listingTitle: {
    margin: "0 0 6px 0",
    fontSize: "22px",
    color: "#f8fbff",
  },
  listingDescription: {
    margin: 0,
    color: "rgba(203,213,225,0.82)",
    lineHeight: 1.6,
  },
  statusPill: {
    padding: "8px 12px",
    borderRadius: "999px",
    background: "rgba(249,115,22,0.18)",
    color: "#fed7aa",
    fontSize: "13px",
    fontWeight: 700,
    textTransform: "capitalize",
    border: "1px solid rgba(249,115,22,0.18)",
  },
  listingMetaGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: "12px",
    marginBottom: "14px",
  },
  metaBox: {
    background: "rgba(2,6,23,0.46)",
    border: "1px solid rgba(148,163,184,0.14)",
    borderRadius: "16px",
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  metaLabel: {
    fontSize: "12px",
    color: "#fdba74",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    fontWeight: 700,
  },
  metaValue: {
    fontSize: "24px",
    fontWeight: 800,
    color: "#f8fbff",
  },
  metaValueSmall: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#e2e8f0",
    lineHeight: 1.5,
  },
  listingTag: {
    padding: "8px 12px",
    borderRadius: "999px",
    background: "rgba(255,255,255,0.05)",
    color: "#dbeafe",
    fontSize: "13px",
    fontWeight: 600,
    border: "1px solid rgba(148,163,184,0.14)",
  },
  refreshButton: {
    padding: "9px 16px",
    borderRadius: "12px",
    border: "1px solid rgba(249,115,22,0.28)",
    background: "rgba(249,115,22,0.08)",
    color: "#fb923c",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "13px",
    flexShrink: 0,
    whiteSpace: "nowrap",
  },
  refreshButtonDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  cardActions: {
    marginTop: "16px",
    display: "flex",
    gap: "10px",
    justifyContent: "flex-end",
    flexWrap: "wrap",
  },
  claimButton: {
    padding: "11px 14px",
    borderRadius: "12px",
    border: "none",
    background: "#f97316",
    color: "#ffffff",
    cursor: "pointer",
    fontWeight: 700,
  },
  expireButton: {
    padding: "11px 14px",
    borderRadius: "12px",
    border: "none",
    background: "#f97316",
    color: "#ffffff",
    cursor: "pointer",
    fontWeight: 700,
  },
};
