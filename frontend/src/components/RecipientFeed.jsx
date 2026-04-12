import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { getListings, claimListing as apiClaimListing, getMyClaims } from "../api/client";
import { useAuth } from "../auth/useAuth";
import MealMap from "./MealMap";
import { Notification } from "./ui/Notification";
import ListingCard, { getMinutesLeft } from "./ListingCard";


export default function RecipientFeed() {
  const { state: routeState } = useLocation();
  const mapRef = useRef(null);
  const [listings, setListings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [claimingIds, setClaimingIds] = useState(new Set());
  const [viewMode, setViewMode] = useState(routeState?.focusListingId ? "map" : "list");
  const [focusedListingId, setFocusedListingId] = useState(routeState?.focusListingId || null);
  const [pendingNav] = useState(
    routeState?.autoNav ? { navMode: routeState.navMode || "driving" } : null
  );
  const pendingNavFiredRef = useRef(false);
  const [mapMounted, setMapMounted] = useState(
    routeState?.focusListingId ? true : false
  );
  // While true, we withhold focusedId from MealMap to prevent popup from flashing
  // open during the ~300ms window before startNavigation fires.
  const [navIntentActive, setNavIntentActive] = useState(
    !!(routeState?.autoNav && routeState?.focusListingId)
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTag, setSelectedTag] = useState("all");
  const [sortBy, setSortBy] = useState("recommended");
  const [showUrgentOnly, setShowUrgentOnly] = useState(false);
  const [notification, setNotification] = useState(null);
  const [claimCounts, setClaimCounts] = useState({});
  const [slotSelections, setSlotSelections] = useState({});
  const [justClaimedIds, setJustClaimedIds] = useState(new Set());

  const { user } = useAuth();
  const userId = user?.id || "user-demo";

  const fetchListings = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await getListings();
      setListings(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Could not load listings. Is the backend running?");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchListings();
    const interval = setInterval(fetchListings, 15000);
    return () => clearInterval(interval);
  }, [fetchListings]);

  // Auto-start in-app navigation when arriving from My Claims with autoNav state.
  // pendingNavFiredRef prevents retrigger on every 15s listing poll.
  // navIntentActive is cleared AFTER startNavigation resolves so focusedId is never
  // briefly un-suppressed before MealMap's navTarget guard is in place.
  useEffect(() => {
    if (!pendingNav || !focusedListingId || isLoading || !listings.length) return;
    if (pendingNavFiredRef.current) return;
    const listing = listings.find((l) => l.id === focusedListingId);
    if (!listing?.location) return;
    pendingNavFiredRef.current = true;

    let cancelled = false;
    const t = setTimeout(async () => {
      // Retry up to 3 × 150ms if mapRef not yet assigned (safety net for slow mounts)
      let attempts = 0;
      while (!mapRef.current?.startNavigation && attempts < 3) {
        await new Promise((r) => setTimeout(r, 150));
        attempts++;
        if (cancelled) return;
      }
      if (cancelled) return;
      if (!mapRef.current?.startNavigation) {
        console.warn("[MealMatch] MAP_NAV_REF_MISSING: mapRef not ready after retries");
        // Unblock focusedId so the map isn't permanently frozen
        setNavIntentActive(false);
        return;
      }
      await mapRef.current.startNavigation(listing, pendingNav.navMode);
      // Intent consumed — clear AFTER startNavigation resolves so navTarget guard is active
      if (!cancelled) setNavIntentActive(false);
    }, 400);

    return () => { cancelled = true; clearTimeout(t); };
  }, [pendingNav, focusedListingId, listings, isLoading]);

  // Pre-populate justClaimedIds from My Claims so returning users see "Claimed" state
  useEffect(() => {
    getMyClaims().then((data) => {
      if (!Array.isArray(data)) return;
      const ids = new Set(
        data
          .filter((c) => c.status === "confirmed")
          .map((c) => c.listing_id)
      );
      setJustClaimedIds(ids);
    }).catch(() => {/* not signed in or error — ignore */});
  }, [userId]);

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
    listings
      .filter((listing) => listing.status === "active")
      .forEach((listing) => {
      (listing.dietary_tags || []).forEach((tag) => tagSet.add(tag));
      });
    return ["all", ...Array.from(tagSet)];
  }, [listings]);

  const baseFilteredListings = useMemo(() => {
    let result = listings.filter((listing) => listing.status === "active");

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

    if (showUrgentOnly) {
      result = result.filter((listing) => {
        const mins = getMinutesLeft(listing.pickup_end);
        return mins > 0 && mins <= 30;
      });
    }

    return result;
  }, [listings, searchTerm, showUrgentOnly]);

  const tagOptions = useMemo(() => {
    const counts = new Map();

    baseFilteredListings.forEach((listing) => {
      (listing.dietary_tags || []).forEach((tag) => {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      });
    });

    return allTags.map((tag) => ({
      value: tag,
      label:
        tag === "all"
          ? `All Dietary Tags (${baseFilteredListings.length})`
          : `${formatTagWithIcon(tag)} (${counts.get(tag) || 0})`,
    }));
  }, [allTags, baseFilteredListings]);

  const filteredListings = useMemo(() => {
    let result = [...baseFilteredListings];

    if (selectedTag !== "all") {
      result = result.filter((listing) =>
        (listing.dietary_tags || []).includes(selectedTag)
      );
    }

    result.sort((a, b) => {
      if (sortBy === "recommended") {
        return Number(b.match_score || 0) - Number(a.match_score || 0);
      }
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
  }, [baseFilteredListings, selectedTag, sortBy]);

  const stats = useMemo(() => {
    const mealsAvailable = filteredListings.reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0
    );
    const urgentPickups = filteredListings.filter((item) => {
      const mins = getMinutesLeft(item.pickup_end);
      return mins > 0 && mins <= 30;
    }).length;

    return {
      activeListings: filteredListings.length,
      mealsAvailable,
      urgentPickups,
    };
  }, [filteredListings]);

  const showOnMap = useCallback((listing) => {
    setFocusedListingId(listing.id);
    setMapMounted(true);
    setViewMode("map");
  }, []);

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
    const maxQuantity = Number(listing.quantity || 1);

    // Require slot selection when listing defines slots
    const slots = listing.pickup_slots || [];
    const selectedSlot = slotSelections[listing.id] || null;
    if (slots.length > 0 && !selectedSlot) {
      showNotification("Please select a pickup slot before claiming.", "error");
      return;
    }

    // Client-side guardrail — clamp before hitting the network
    if (requestedQuantity < 1 || requestedQuantity > maxQuantity) {
      showNotification(
        `Please enter a quantity between 1 and ${maxQuantity}.`,
        "error"
      );
      return;
    }

    // Per-listing double-submit prevention
    if (claimingIds.has(listing.id)) return;
    setClaimingIds((prev) => new Set(prev).add(listing.id));

    try {
      await apiClaimListing(listing.id, requestedQuantity, selectedSlot);
      setJustClaimedIds((prev) => new Set(prev).add(listing.id));
      showNotification(
        `Pickup secured for ${requestedQuantity} item${requestedQuantity > 1 ? "s" : ""}.`,
        "success"
      );
      fetchListings(); // background refresh — don't block spinner release
    } catch (err) {
      let msg = err.message || "Could not complete that claim right now.";
      if (err.code === "ALREADY_CLAIMED") {
        msg = "You have already claimed this listing.";
      } else if (err.code === "OVER_QUANTITY") {
        msg = `Only ${listing.quantity} available — reduce your quantity and try again.`;
      } else if (err.code === "UNAVAILABLE") {
        msg = "This listing is no longer available for claiming.";
      } else if (err.code === "SLOT_REQUIRED") {
        msg = "Please select a valid pickup slot.";
      }
      showNotification(msg, "error");
    } finally {
      setClaimingIds((prev) => {
        const next = new Set(prev);
        next.delete(listing.id);
        return next;
      });
    }
  };

  return (
    <div className="mm-page-wrap">
      {/* Hero */}
      <div className="mm-page-hero">
        <div style={{ flex: 1 }}>
          <p className="mm-page-hero-eyebrow">MealMatch · Browse</p>
          <h1 className="mm-page-hero-title">Find nearby meals.<br />Claim in seconds.</h1>
          <p className="mm-page-hero-subtitle">
            Browse live surplus listings, filter by dietary needs, and reserve a
            pickup slot through a fast, mobile-friendly interface.
          </p>
        </div>

        <div style={s.livePanel}>
          <div style={s.liveHeader}>
            <span style={s.liveDot} />
            <span>Live availability</span>
          </div>
          <div style={s.liveStatRow}>
            <MiniStat label="Listings" value={stats.activeListings} />
            <MiniStat label="Meals"    value={stats.mealsAvailable} />
            <MiniStat label="Urgent"   value={stats.urgentPickups} />
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mm-alert mm-alert-error" style={{ marginBottom: 16 }} role="alert">
          {error}
          <button
            onClick={fetchListings}
            style={{ marginLeft: "auto", background: "none", border: "none", color: "inherit", cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}
          >
            Retry
          </button>
        </div>
      )}

      <Notification notification={notification} />

      {/* Toolbar */}
      <div style={s.toolbar}>
        <div style={s.searchWrap}>
          <span style={s.searchIcon} aria-hidden="true">⌕</span>
          <input
            type="text"
            placeholder="Search meals, tags, or location"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={s.searchInput}
            aria-label="Search listings"
          />
        </div>

        <div style={s.controls}>
          <select
            value={selectedTag}
            onChange={(e) => setSelectedTag(e.target.value)}
            className="mm-select"
            style={{ minHeight: 44 }}
            aria-label="Filter by dietary tag"
          >
            {tagOptions.map((tag) => (
              <option key={tag.value} value={tag.value}>
                {tag.label}
              </option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="mm-select"
            style={{ minHeight: 44 }}
            aria-label="Sort listings"
          >
            <option value="recommended">Recommended</option>
            <option value="ending-soon">Ending soon</option>
            <option value="quantity-high">Highest quantity</option>
            <option value="newest">Newest listings</option>
            <option value="alphabetical">A → Z</option>
          </select>

          <button
            onClick={() => setShowUrgentOnly((prev) => !prev)}
            className={`mm-btn ${showUrgentOnly ? "mm-btn-warning" : "mm-btn-ghost"} mm-btn-sm`}
            aria-pressed={showUrgentOnly}
          >
            Urgent only
          </button>

          <div style={s.viewToggle}>
            <button
              onClick={() => setViewMode("list")}
              className={`mm-btn mm-btn-sm${viewMode === "list" ? " mm-btn-primary" : " mm-btn-ghost"}`}
              style={{ minWidth: 60 }}
              aria-pressed={viewMode === "list"}
            >
              List
            </button>
            <button
              onClick={() => { setMapMounted(true); setViewMode("map"); }}
              className={`mm-btn mm-btn-sm${viewMode === "map" ? " mm-btn-primary" : " mm-btn-ghost"}`}
              style={{ minWidth: 60 }}
              aria-pressed={viewMode === "map"}
            >
              Map
            </button>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={s.statsRow}>
        {[
          { label: "Active listings", value: stats.activeListings },
          { label: "Meals available", value: stats.mealsAvailable },
          { label: "Ending soon",     value: stats.urgentPickups },
        ].map(({ label, value }) => (
          <div key={label} className="mm-card" style={s.statCard}>
            <div style={s.statLabel}>{label}</div>
            <div style={s.statValue}>{value}</div>
          </div>
        ))}
      </div>

      {/* Loading skeletons */}
      {isLoading && (
        <div style={s.cardGrid}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="mm-card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 12, minHeight: 200 }}>
              <div className="mm-skeleton" style={{ height: 12, width: "40%" }} />
              <div className="mm-skeleton" style={{ height: 18, width: "70%" }} />
              <div className="mm-skeleton" style={{ height: 12, width: "85%" }} />
              <div className="mm-skeleton" style={{ height: 12, width: "55%" }} />
            </div>
          ))}
        </div>
      )}

      {/* Map view — lazy-mount on first open, then keep-alive with display:none */}
      {mapMounted && (
        <div style={{ ...s.mapShell, display: viewMode === "map" ? undefined : "none" }}>
          <MealMap
            ref={mapRef}
            listings={filteredListings}
            focusedId={navIntentActive ? null : focusedListingId}
            onListingClick={(l) => setFocusedListingId(l.id)}
            onClaim={handleClaim}
            claimingIds={claimingIds}
            height={560}
          />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && viewMode === "list" && filteredListings.length === 0 && (
        <div className="mm-empty">
          <div className="mm-empty-icon" aria-hidden="true">⌕</div>
          <h3 className="mm-empty-title">No matching listings right now</h3>
          <p className="mm-empty-text">
            Try a different search, remove a filter, or switch to map view.
          </p>
        </div>
      )}

      {/* Listing cards */}
      {!isLoading && viewMode === "list" && filteredListings.length > 0 && (
        <div style={s.cardGrid}>
          {filteredListings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              isClaiming={claimingIds.has(listing.id)}
              justClaimed={justClaimedIds.has(listing.id)}
              claimCount={claimCounts[listing.id] || 1}
              slotSelection={slotSelections[listing.id] || ""}
              onClaim={() => handleClaim(listing)}
              onCountChange={(value, max) => handleClaimCountChange(listing.id, value, max)}
              onSlotChange={(slotId) => setSlotSelections(prev => ({ ...prev, [listing.id]: slotId }))}
              onShowMap={() => showOnMap(listing)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div style={s.miniStat}>
      <div style={s.miniStatValue}>{value}</div>
      <div style={s.miniStatLabel}>{label}</div>
    </div>
  );
}

const s = {
  hero: {
    background: "var(--mm-surface-1)",
    border: "1px solid var(--mm-border)",
    borderRadius: "var(--mm-r-2xl)",
    padding: "28px 32px",
    boxShadow: "var(--mm-shadow-sm)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 24,
    flexWrap: "wrap",
    marginBottom: 20,
  },
  heroBadge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 14px",
    borderRadius: "var(--mm-r-full)",
    background: "var(--mm-brand-dim)",
    border: "1px solid var(--mm-brand-ring)",
    color: "var(--mm-brand)",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: ".04em",
    marginBottom: 14,
  },
  title: {
    margin: "0 0 10px",
    fontSize: "clamp(1.6rem,3.5vw,2.6rem)",
    lineHeight: 1.1,
    fontWeight: 800,
    color: "var(--mm-text-1)",
    letterSpacing: "-.025em",
  },
  subtitle: {
    margin: 0,
    maxWidth: 680,
    color: "var(--mm-text-3)",
    fontSize: 15,
    lineHeight: 1.65,
  },
  livePanel: {
    flexShrink: 0,
    background: "var(--mm-surface-2)",
    border: "1px solid var(--mm-border)",
    borderRadius: "var(--mm-r-xl)",
    padding: 18,
  },
  liveHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "var(--mm-text-2)",
    fontWeight: 700,
    fontSize: 13,
    marginBottom: 12,
  },
  liveDot: {
    width: 9,
    height: 9,
    borderRadius: "50%",
    background: "#16A34A",
    boxShadow: "0 0 0 5px rgba(22,163,74,.15)",
  },
  liveStatRow: { display: "flex", gap: 10, flexWrap: "wrap" },
  miniStat: {
    background: "var(--mm-surface-1)",
    border: "1px solid var(--mm-border)",
    borderRadius: "var(--mm-r-lg)",
    padding: "10px 14px",
    minWidth: 80,
    boxShadow: "var(--mm-shadow-sm)",
  },
  miniStatValue: { fontWeight: 800, fontSize: 20, color: "var(--mm-text-1)" },
  miniStatLabel: { marginTop: 3, color: "var(--mm-text-4)", fontSize: 11 },
  toolbar: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  searchWrap: {
    flex: "1 1 260px",
    minWidth: 240,
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "var(--mm-surface-1)",
    border: "1px solid var(--mm-border-md)",
    borderRadius: "var(--mm-r-xl)",
    padding: "0 14px",
    minHeight: 48,
  },
  searchIcon: { color: "var(--mm-text-4)", fontSize: 18 },
  searchInput: {
    flex: 1,
    border: "none",
    outline: "none",
    background: "transparent",
    color: "var(--mm-text-1)",
    fontSize: 14,
    fontFamily: "inherit",
  },
  controls: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
  },
  viewToggle: { display: "flex", gap: 4 },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 12,
    marginBottom: 20,
  },
  statCard: { padding: "16px 18px" },
  statLabel: { color: "var(--mm-text-4)", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 },
  statValue: { fontSize: 30, fontWeight: 800, color: "var(--mm-text-1)", lineHeight: 1 },
  mapShell: {
    borderRadius: "var(--mm-r-2xl)",
    overflow: "hidden",
    border: "1px solid var(--mm-border)",
    boxShadow: "var(--mm-shadow-lg)",
    marginBottom: 20,
  },
  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
    gap: 18,
  },
  emptyState: {
    borderRadius: "var(--mm-r-2xl)",
    padding: "52px 24px",
    textAlign: "center",
    background: "var(--mm-surface-2)",
    border: "1.5px dashed var(--mm-border-md)",
  },
  emptyIcon: { fontSize: 40, marginBottom: 12, color: "var(--mm-brand)", opacity: .7 },
  emptyTitle: { margin: "0 0 10px", fontSize: 22, fontWeight: 700, color: "var(--mm-text-1)" },
  emptyText: { margin: 0, color: "var(--mm-text-4)", lineHeight: 1.65 },
  listingCard: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    padding: 22,
  },
  cardPrimary: {
    display: "flex",
    alignItems: "flex-start",
    gap: 14,
    flex: 1,
    minWidth: 0,
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    alignItems: "flex-start",
  },
  thumbnail: {
    width: 84,
    minWidth: 84,
    height: 84,
    borderRadius: 20,
    position: "relative",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.45)",
  },
  thumbnailOrb: {
    position: "absolute",
    width: 58,
    height: 58,
    borderRadius: "50%",
    top: -10,
    right: -8,
    filter: "blur(2px)",
  },
  thumbnailIcon: {
    fontSize: 32,
    lineHeight: 1,
    transform: "translateY(-4px)",
  },
  thumbnailLabel: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 8,
    padding: "4px 0",
    borderRadius: "var(--mm-r-full)",
    background: "rgba(255,255,255,.78)",
    color: "#1F2937",
    fontSize: 10,
    fontWeight: 800,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: ".08em",
  },
  locationPill: {
    display: "inline-flex",
    padding: "4px 10px",
    borderRadius: "var(--mm-r-full)",
    background: "var(--mm-brand-dim)",
    color: "var(--mm-brand)",
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 8,
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  cardTitle: { margin: "0 0 6px", color: "var(--mm-text-1)", fontSize: 18, fontWeight: 800, lineHeight: 1.2 },
  cardDescription: { margin: 0, color: "var(--mm-text-3)", lineHeight: 1.6, fontSize: 13 },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
  },
  infoBlock: {
    background: "var(--mm-surface-2)",
    border: "1px solid var(--mm-border)",
    borderRadius: "var(--mm-r-lg)",
    padding: "10px 12px",
  },
  infoLabel: { color: "var(--mm-text-4)", fontSize: 10, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: ".06em" },
  infoValue: { color: "var(--mm-text-1)", fontSize: 14, fontWeight: 700 },
  tagRow: { display: "flex", gap: 6, flexWrap: "wrap" },
  addressRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  addressText: { color: "var(--mm-text-4)", fontSize: 13, flex: 1, minWidth: 0, lineHeight: 1.4 },
  cardFooter: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-end",
    flexWrap: "wrap",
    borderTop: "1px solid var(--mm-border)",
    paddingTop: 14,
    marginTop: 2,
  },
};
