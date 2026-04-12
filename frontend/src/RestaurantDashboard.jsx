import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getAdminListings,
  createListing,
  updateListingStatus,
  getDemandPrediction,
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
    lat: null,
    lng: null,
    pickup_slots: [],
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
  const [customDietaryTag, setCustomDietaryTag] = useState("");
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

  function handleChange(e) {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  const handleAddressChange = useCallback((value) => {
    setFormData((prev) => ({ ...prev, address: value, lat: null, lng: null }));
  }, []);

  const handleAddSlot = useCallback(() => {
    setFormData((prev) => ({
      ...prev,
      pickup_slots: [
        ...prev.pickup_slots,
        { tempId: Date.now(), label: "", pickup_start: "", pickup_end: "" },
      ],
    }));
  }, []);

  const handleRemoveSlot = useCallback((tempId) => {
    setFormData((prev) => ({
      ...prev,
      pickup_slots: prev.pickup_slots.filter((s) => s.tempId !== tempId),
    }));
  }, []);

  const handleSlotChange = useCallback((tempId, field, value) => {
    setFormData((prev) => ({
      ...prev,
      pickup_slots: prev.pickup_slots.map((s) =>
        s.tempId === tempId ? { ...s, [field]: value } : s
      ),
    }));
  }, []);

  const handleAddressSelect = useCallback(({ address, lat, lng }) => {
    setFormData((prev) => ({ ...prev, address, lat, lng }));
  }, []);

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

  function handleRemoveTag(tagToRemove) {
    setFormData((prev) => ({
      ...prev,
      dietary_tags: prev.dietary_tags.filter((tag) => tag !== tagToRemove),
    }));
  }

  function handleAddCustomTag() {
    const normalizedTag = normalizeDietaryTag(customDietaryTag);

    if (!normalizedTag) {
      return;
    }

    setFormData((prev) => ({
      ...prev,
      dietary_tags: prev.dietary_tags.includes(normalizedTag)
        ? prev.dietary_tags
        : [...prev.dietary_tags, normalizedTag],
    }));
    setCustomDietaryTag("");
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
      lat: formData.lat,
      lng: formData.lng,
      pickup_slots: formData.pickup_slots
        .filter((s) => s.label.trim() && s.pickup_start && s.pickup_end)
        .map((s) => ({
          label: s.label.trim(),
          pickup_start: new Date(s.pickup_start).toISOString(),
          pickup_end: new Date(s.pickup_end).toISOString(),
        })),
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
        lat: null,
        lng: null,
        pickup_slots: [],
      });
      setCustomDietaryTag("");

      await fetchListings(); // rebuilds all tab arrays from backend
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

          <form onSubmit={handleSubmit} style={s.form}>
            <div style={s.fieldGroup}>
              <label className="mm-label" htmlFor="rd-title">Title</label>
              <input
                id="rd-title"
                type="text"
                name="title"
                placeholder="Example: Vegetarian Pasta Meals"
                value={formData.title}
                onChange={handleChange}
                className="mm-input"
              />
            </div>

            <div style={s.fieldGroup}>
              <label className="mm-label" htmlFor="rd-desc">Description</label>
              <textarea
                id="rd-desc"
                name="description"
                placeholder="Describe the food and any pickup details"
                value={formData.description}
                onChange={handleChange}
                className="mm-textarea"
                style={{ minHeight: 100 }}
              />
            </div>

            <div style={s.row}>
              <div style={s.fieldGroupHalf}>
                <label className="mm-label" htmlFor="rd-qty">Quantity</label>
                <input
                  id="rd-qty"
                  type="number"
                  name="quantity"
                  placeholder="10"
                  value={formData.quantity}
                  onChange={handleChange}
                  className="mm-input"
                  min="1"
                />
              </div>
            </div>

            <div style={s.row}>
              <div style={s.fieldGroupHalf}>
                <label className="mm-label" htmlFor="rd-loc">
                  Location Name <span style={{ color: "var(--mm-text-4)", fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  id="rd-loc"
                  type="text"
                  name="location_name"
                  placeholder="e.g. Stamp Student Union"
                  value={formData.location_name}
                  onChange={handleChange}
                  className="mm-input"
                />
              </div>
            </div>

            <div style={s.fieldGroup}>
              <label className="mm-label">
                Street Address <span style={{ color: "var(--mm-text-4)", fontWeight: 400 }}>(optional — enables map)</span>
              </label>
              <AddressAutocomplete
                value={formData.address}
                onAddressChange={handleAddressChange}
                onSelect={handleAddressSelect}
                existingAddresses={savedAddresses}
              />
              {formData.lat != null && (
                <div style={s.coordsHint}>
                  Coordinates saved: {formData.lat.toFixed(5)}, {formData.lng.toFixed(5)}
                </div>
              )}
            </div>

            <div style={s.fieldGroup}>
              <label className="mm-label">Dietary Tags</label>
              <div style={s.tagContainer}>
                {dietaryOptions.map((tag) => {
                  const selected = formData.dietary_tags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleTagToggle(tag)}
                      className={`mm-btn mm-btn-sm ${selected ? "mm-btn-primary" : "mm-btn-ghost"}`}
                    >
                      {formatTag(tag)}
                    </button>
                  );
                })}
              </div>
              <div style={s.customTagRow}>
                <input
                  type="text"
                  placeholder="Add custom dietary tag"
                  value={customDietaryTag}
                  onChange={(e) => setCustomDietaryTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddCustomTag();
                    }
                  }}
                  className="mm-input"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  onClick={handleAddCustomTag}
                  className="mm-btn mm-btn-info mm-btn-sm"
                >
                  Add Tag
                </button>
              </div>
              {formData.dietary_tags.length > 0 && (
                <div style={s.selectedTagsRow}>
                  {formData.dietary_tags.map((tag) => (
                    <span key={tag} style={s.selectedTagChip}>
                      {formatTag(tag)}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        style={s.selectedTagRemoveBtn}
                        aria-label={`Remove ${formatTag(tag)} tag`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div style={s.fieldGroup}>
              <label className="mm-label">
                Pickup Slots{" "}
                <span style={{ color: "var(--mm-text-4)", fontWeight: 400 }}>(optional — recipients must select one)</span>
              </label>
              {formData.pickup_slots.map((slot) => (
                <div key={slot.tempId} style={s.slotRow}>
                  <input
                    type="text"
                    placeholder="Label (e.g. 12pm – 1pm)"
                    value={slot.label}
                    onChange={(e) => handleSlotChange(slot.tempId, "label", e.target.value)}
                    className="mm-input"
                    style={{ flex: "1 1 130px", minWidth: 0 }}
                  />
                  <input
                    type="datetime-local"
                    value={slot.pickup_start}
                    onChange={(e) => handleSlotChange(slot.tempId, "pickup_start", e.target.value)}
                    className="mm-input"
                    style={{ flex: "1 1 160px", minWidth: 0 }}
                  />
                  <input
                    type="datetime-local"
                    value={slot.pickup_end}
                    onChange={(e) => handleSlotChange(slot.tempId, "pickup_end", e.target.value)}
                    className="mm-input"
                    style={{ flex: "1 1 160px", minWidth: 0 }}
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveSlot(slot.tempId)}
                    style={s.removeSlotBtn}
                    aria-label="Remove slot"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={handleAddSlot}
                className="mm-btn mm-btn-ghost mm-btn-sm"
                style={{ alignSelf: "flex-start" }}
              >
                + Add pickup slot
              </button>
            </div>

            <div style={s.row}>
              <div style={s.fieldGroupHalf}>
                <label className="mm-label" htmlFor="rd-start">Pickup Start Time</label>
                <input
                  id="rd-start"
                  type="datetime-local"
                  name="pickup_start"
                  value={formData.pickup_start}
                  onChange={handleChange}
                  className="mm-input"
                />
              </div>
              <div style={s.fieldGroupHalf}>
                <label className="mm-label" htmlFor="rd-end">Pickup End Time</label>
                <input
                  id="rd-end"
                  type="datetime-local"
                  name="pickup_end"
                  value={formData.pickup_end}
                  onChange={handleChange}
                  className="mm-input"
                />
              </div>
            </div>

            {error && <div className="mm-alert mm-alert-error" role="alert">{error}</div>}
            {successMessage && <div className="mm-alert mm-alert-success" role="status">{successMessage}</div>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mm-btn mm-btn-primary mm-btn-lg mm-btn-full"
            >
              {isSubmitting ? "Creating Listing…" : "Create Listing"}
            </button>
          </form>
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
                          {formatTag(tag)}
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

function formatTag(tag) {
  return tag
    .split(/[_-]/)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeDietaryTag(tag) {
  return tag.trim().toLowerCase().replace(/\s+/g, "_");
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
  form: { display: "flex", flexDirection: "column", gap: 16 },
  fieldGroup: { display: "flex", flexDirection: "column", gap: 7 },
  fieldGroupHalf: { flex: 1, display: "flex", flexDirection: "column", gap: 7, minWidth: 200 },
  row: { display: "flex", gap: 14, flexWrap: "wrap" },
  tagContainer: { display: "flex", flexWrap: "wrap", gap: 8 },
  customTagRow: { display: "flex", gap: 8, alignItems: "stretch", flexWrap: "wrap", marginTop: 8 },
  selectedTagsRow: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 },
  selectedTagChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    borderRadius: "var(--mm-r-full)",
    background: "var(--mm-brand-dim)",
    border: "1px solid var(--mm-brand-ring)",
    color: "var(--mm-brand)",
    fontWeight: 600,
    fontSize: 12,
  },
  selectedTagRemoveBtn: {
    border: "none",
    background: "transparent",
    color: "inherit",
    cursor: "pointer",
    fontSize: 15,
    lineHeight: 1,
    padding: 0,
  },
  coordsHint: { fontSize: 12, color: "var(--mm-brand)", marginTop: 4, fontWeight: 600 },
  slotRow: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 },
  removeSlotBtn: {
    flexShrink: 0,
    width: 32,
    height: 32,
    borderRadius: "50%",
    border: "1px solid var(--mm-error-ring)",
    background: "var(--mm-error-dim)",
    color: "var(--mm-error)",
    fontSize: 18,
    lineHeight: 1,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
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

// ---------------------------------------------------------------------------
// Address autocomplete
// ---------------------------------------------------------------------------

function AddressAutocomplete({ value, onAddressChange, onSelect, existingAddresses }) {
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isFocused || !value || value.length < 3) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const q = value.toLowerCase();

      // Local: existing listing addresses
      const local = (existingAddresses || [])
        .filter((a) => a && a.toLowerCase().includes(q))
        .slice(0, 3)
        .map((a) => ({ label: a, address: a, lat: null, lng: null, source: "local" }));

      // Remote: Photon geocoding
      let remote = [];
      try {
        setIsSearching(true);
        const res = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(value)}&limit=5`,
        );
        if (res.ok) {
          const json = await res.json();
          remote = (json.features || []).map((f) => {
            const p = f.properties;
            const parts = [
              p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street || p.name,
              p.city,
              p.state,
            ].filter(Boolean);
            const label = parts.length > 0 ? parts.join(", ") : (p.name || value);
            return {
              label,
              address: label,
              lat: f.geometry.coordinates[1],
              lng: f.geometry.coordinates[0],
              source: "remote",
            };
          });
        }
      } catch {
        // graceful fallback — remote unavailable
      } finally {
        setIsSearching(false);
      }

      const seen = new Set(local.map((s) => s.label.toLowerCase()));
      const merged = [
        ...local,
        ...remote.filter((s) => !seen.has(s.label.toLowerCase())),
      ].slice(0, 7);

      setSuggestions(merged);
      setShowDropdown(isFocused && merged.length > 0);
      setActiveIndex(-1);
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [value, existingAddresses, isFocused]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function selectSuggestion(suggestion) {
    onSelect({ address: suggestion.address, lat: suggestion.lat, lng: suggestion.lng });
    setSuggestions([]);
    setShowDropdown(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(e) {
    if (!showDropdown || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <input
        type="text"
        placeholder="e.g. 3972 Campus Dr, College Park, MD 20742"
        value={value}
        onChange={(e) => onAddressChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          setIsFocused(true);
          if (suggestions.length > 0) setShowDropdown(true);
        }}
        onBlur={() => {
          setIsFocused(false);
          setTimeout(() => setShowDropdown(false), 160);
        }}
        className="mm-input"
        autoComplete="off"
      />
      {isSearching && (
        <div style={ac.spinner}>Searching…</div>
      )}
      {showDropdown && suggestions.length > 0 && (
        <ul style={ac.dropdown}>
          {suggestions.map((s, i) => (
            <li
              key={i}
              style={{
                ...ac.item,
                ...(i === activeIndex ? ac.itemActive : {}),
              }}
              onMouseDown={() => selectSuggestion(s)}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <span style={ac.itemLabel}>{s.label}</span>
              {s.source === "local" && <span style={ac.badge}>saved</span>}
              {s.lat != null && <span style={ac.coordBadge}>⊙</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const ac = {
  spinner: {
    position: "absolute",
    right: 14,
    top: "50%",
    transform: "translateY(-50%)",
    fontSize: 12,
    color: "var(--mm-text-4)",
    pointerEvents: "none",
  },
  dropdown: {
    position: "absolute",
    top: "calc(100% + 4px)",
    left: 0,
    right: 0,
    zIndex: 200,
    background: "var(--mm-surface-2)",
    border: "1px solid var(--mm-border-md)",
    borderRadius: "var(--mm-r-xl)",
    padding: 6,
    listStyle: "none",
    margin: 0,
    boxShadow: "var(--mm-shadow-xl)",
    backdropFilter: "blur(12px)",
    maxHeight: 260,
    overflowY: "auto",
  },
  item: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    borderRadius: "var(--mm-r-md)",
    cursor: "pointer",
    color: "var(--mm-text-2)",
    fontSize: 14,
  },
  itemActive: {
    background: "var(--mm-brand-dim)",
    color: "var(--mm-brand)",
  },
  itemLabel: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  badge: {
    flexShrink: 0,
    fontSize: 10,
    fontWeight: 700,
    padding: "2px 6px",
    borderRadius: 6,
    background: "var(--mm-success-dim)",
    color: "#15803D",
    border: "1px solid var(--mm-success-ring)",
  },
  coordBadge: {
    flexShrink: 0,
    fontSize: 14,
    color: "var(--mm-info)",
  },
};
