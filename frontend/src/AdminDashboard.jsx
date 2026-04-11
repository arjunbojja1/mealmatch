import React, { useEffect, useMemo, useState } from "react";

const API_BASE = "http://localhost:8000/api/v1";

export default function AdminDashboard() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const fetchListings = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(`${API_BASE}/listings`);

      if (!response.ok) {
        throw new Error("Failed to fetch listings.");
      }

      const data = await response.json();
      setListings(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Fetch error:", err);
      setError("Could not load listings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchListings();
  }, []);

  const updateListingStatus = async (listingId, newStatus) => {
    try {
      setActionLoadingId(listingId);
      setError("");
      setSuccessMessage("");

      const response = await fetch(`${API_BASE}/listings/${listingId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: newStatus,
        }),
      });

      if (!response.ok) {
        let message = `Failed to update listing to ${newStatus}.`;
        try {
          const errorData = await response.json();
          if (errorData?.detail) {
            message = errorData.detail;
          }
        } catch {
          // ignore parse issue
        }
        throw new Error(message);
      }

      setSuccessMessage(`Listing marked as ${newStatus}.`);
      await fetchListings();
    } catch (err) {
      console.error("Status update error:", err);
      setError(err.message || "Could not update listing.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRemoveListing = async (listingId) => {
    // Since your provided API does not include DELETE,
    // we simulate "remove listing" by marking it expired.
    await updateListingStatus(listingId, "expired");
  };

  const handleMarkExpired = async (listingId) => {
    await updateListingStatus(listingId, "expired");
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return "N/A";

    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;

    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const activeListings = useMemo(
    () => listings.filter((listing) => listing.status === "active"),
    [listings]
  );

  const claimedListings = useMemo(
    () => listings.filter((listing) => listing.status === "claimed"),
    [listings]
  );

  const expiredListings = useMemo(
    () => listings.filter((listing) => listing.status === "expired"),
    [listings]
  );

  const mealsSaved = useMemo(() => {
    return claimedListings.reduce((sum, listing) => {
      return sum + (Number(listing.quantity) || 0);
    }, 0);
  }, [claimedListings]);

  const renderListingSection = (title, sectionListings) => (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>
        {title} ({sectionListings.length})
      </h2>

      {sectionListings.length === 0 ? (
        <p style={styles.emptyText}>No listings in this category.</p>
      ) : (
        <div style={styles.cardGrid}>
          {sectionListings.map((listing) => (
            <div key={listing.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <h3 style={styles.cardTitle}>{listing.title}</h3>
                <span style={styles.statusBadge}>{listing.status}</span>
              </div>

              <p style={styles.cardDescription}>
                {listing.description || "No description provided."}
              </p>

              <p style={styles.detail}>
                <strong>ID:</strong> {listing.id}
              </p>

              <p style={styles.detail}>
                <strong>Restaurant ID:</strong> {listing.restaurant_id}
              </p>

              <p style={styles.detail}>
                <strong>Quantity:</strong> {listing.quantity}
              </p>

              <p style={styles.detail}>
                <strong>Dietary Tags:</strong>{" "}
                {Array.isArray(listing.dietary_tags) && listing.dietary_tags.length > 0
                  ? listing.dietary_tags.join(", ")
                  : "None"}
              </p>

              <p style={styles.detail}>
                <strong>Pickup Window:</strong>{" "}
                {formatDateTime(listing.pickup_start)} -{" "}
                {formatDateTime(listing.pickup_end)}
              </p>

              <p style={styles.detail}>
                <strong>Created:</strong> {formatDateTime(listing.created_at)}
              </p>

              <div style={styles.buttonRow}>
                <button
                  style={{
                    ...styles.secondaryButton,
                    ...(actionLoadingId === listing.id ? styles.buttonDisabled : {}),
                  }}
                  onClick={() => handleMarkExpired(listing.id)}
                  disabled={actionLoadingId === listing.id}
                >
                  Mark Expired
                </button>

                <button
                  style={{
                    ...styles.dangerButton,
                    ...(actionLoadingId === listing.id ? styles.buttonDisabled : {}),
                  }}
                  onClick={() => handleRemoveListing(listing.id)}
                  disabled={actionLoadingId === listing.id}
                >
                  Remove Listing
                </button>

                <button
                  style={styles.placeholderButton}
                  onClick={() => alert("Restaurant verified placeholder.")}
                >
                  Verify
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.heading}>Admin Dashboard</h1>
        <p style={styles.subheading}>
          Monitor listings, update statuses, and track platform activity.
        </p>

        {successMessage && <div style={styles.successBox}>{successMessage}</div>}
        {error && <div style={styles.errorBox}>{error}</div>}

        {loading ? (
          <p style={styles.infoText}>Loading admin dashboard...</p>
        ) : (
          <>
            <div style={styles.statsGrid}>
              <div style={styles.statCard}>
                <p style={styles.statLabel}>Active Listings</p>
                <h2 style={styles.statValue}>{activeListings.length}</h2>
              </div>

              <div style={styles.statCard}>
                <p style={styles.statLabel}>Claimed Listings</p>
                <h2 style={styles.statValue}>{claimedListings.length}</h2>
              </div>

              <div style={styles.statCard}>
                <p style={styles.statLabel}>Meals Saved</p>
                <h2 style={styles.statValue}>{mealsSaved}</h2>
              </div>
            </div>

            {renderListingSection("Active Listings", activeListings)}
            {renderListingSection("Claimed Listings", claimedListings)}
            {renderListingSection("Expired Listings", expiredListings)}
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    backgroundColor: "#f8fafc",
    padding: "40px 20px",
    fontFamily: "Arial, sans-serif",
  },
  container: {
    maxWidth: "1200px",
    margin: "0 auto",
  },
  heading: {
    fontSize: "2rem",
    marginBottom: "8px",
    color: "#1e293b",
  },
  subheading: {
    fontSize: "1rem",
    color: "#475569",
    marginBottom: "24px",
  },
  successBox: {
    backgroundColor: "#dcfce7",
    color: "#166534",
    padding: "12px 16px",
    borderRadius: "10px",
    marginBottom: "16px",
  },
  errorBox: {
    backgroundColor: "#fee2e2",
    color: "#991b1b",
    padding: "12px 16px",
    borderRadius: "10px",
    marginBottom: "16px",
  },
  infoText: {
    color: "#334155",
    fontSize: "1rem",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "18px",
    marginBottom: "32px",
  },
  statCard: {
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    padding: "20px",
    boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
    border: "1px solid #e2e8f0",
  },
  statLabel: {
    margin: 0,
    fontSize: "0.95rem",
    color: "#64748b",
  },
  statValue: {
    margin: "10px 0 0 0",
    fontSize: "2rem",
    color: "#0f172a",
  },
  section: {
    marginBottom: "36px",
  },
  sectionTitle: {
    fontSize: "1.4rem",
    color: "#0f172a",
    marginBottom: "16px",
  },
  emptyText: {
    color: "#64748b",
  },
  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: "20px",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    padding: "20px",
    boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
    border: "1px solid #e2e8f0",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "10px",
    marginBottom: "10px",
  },
  cardTitle: {
    fontSize: "1.1rem",
    margin: 0,
    color: "#0f172a",
  },
  statusBadge: {
    backgroundColor: "#dbeafe",
    color: "#1d4ed8",
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "0.8rem",
    fontWeight: "bold",
    textTransform: "capitalize",
  },
  cardDescription: {
    color: "#475569",
    marginBottom: "14px",
  },
  detail: {
    marginBottom: "8px",
    color: "#1e293b",
    fontSize: "0.95rem",
  },
  buttonRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    marginTop: "16px",
  },
  secondaryButton: {
    padding: "10px 12px",
    border: "none",
    borderRadius: "10px",
    backgroundColor: "#f59e0b",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer",
  },
  dangerButton: {
    padding: "10px 12px",
    border: "none",
    borderRadius: "10px",
    backgroundColor: "#dc2626",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer",
  },
  placeholderButton: {
    padding: "10px 12px",
    border: "none",
    borderRadius: "10px",
    backgroundColor: "#2563eb",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer",
  },
  buttonDisabled: {
    opacity: 0.7,
    cursor: "not-allowed",
  },
};