import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatDietaryTagWithIcon as formatTagWithIcon,
  formatDietaryTag as formatTag,
  normalizeDietaryTag,
} from "../utils/dietaryTags";

const DIETARY_OPTIONS = ["vegetarian", "vegan", "halal", "contains_dairy", "non_veg"];

const EMPTY_FORM = {
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
};

// ─── AddressAutocomplete (co-located with form) ───────────────────────────────

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
      const local = (existingAddresses || [])
        .filter(a => a && a.toLowerCase().includes(q))
        .slice(0, 3)
        .map(a => ({ label: a, address: a, lat: null, lng: null, source: "local" }));

      let remote = [];
      try {
        setIsSearching(true);
        const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(value)}&limit=5`);
        if (res.ok) {
          const json = await res.json();
          remote = (json.features || []).map(f => {
            const p = f.properties;
            const parts = [
              p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street || p.name,
              p.city, p.state,
            ].filter(Boolean);
            const label = parts.length > 0 ? parts.join(", ") : (p.name || value);
            return { label, address: label, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], source: "remote" };
          });
        }
      } catch { /* graceful fallback */ } finally { setIsSearching(false); }

      const seen = new Set(local.map(s => s.label.toLowerCase()));
      const merged = [...local, ...remote.filter(s => !seen.has(s.label.toLowerCase()))].slice(0, 7);
      setSuggestions(merged);
      setShowDropdown(isFocused && merged.length > 0);
      setActiveIndex(-1);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [value, existingAddresses, isFocused]);

  useEffect(() => {
    function handler(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setShowDropdown(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function selectSuggestion(s) {
    onSelect({ address: s.address, lat: s.lat, lng: s.lng });
    setSuggestions([]);
    setShowDropdown(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(e) {
    if (!showDropdown || !suggestions.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, -1)); }
    else if (e.key === "Enter" && activeIndex >= 0) { e.preventDefault(); selectSuggestion(suggestions[activeIndex]); }
    else if (e.key === "Escape") { setShowDropdown(false); setActiveIndex(-1); }
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <input
        type="text" placeholder="e.g. 3972 Campus Dr, College Park, MD 20742"
        value={value} onChange={e => onAddressChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => { setIsFocused(true); if (suggestions.length > 0) setShowDropdown(true); }}
        onBlur={() => { setIsFocused(false); setTimeout(() => setShowDropdown(false), 160); }}
        className="mm-input" autoComplete="off"
      />
      {isSearching && <div style={ac.spinner}>Searching…</div>}
      {showDropdown && suggestions.length > 0 && (
        <ul style={ac.dropdown}>
          {suggestions.map((s, i) => (
            <li key={i} style={{ ...ac.item, ...(i === activeIndex ? ac.itemActive : {}) }}
              onMouseDown={() => selectSuggestion(s)} onMouseEnter={() => setActiveIndex(i)}>
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
  spinner: { position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "var(--mm-text-4)", pointerEvents: "none" },
  dropdown: { position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 200, background: "var(--mm-surface-2)", border: "1px solid var(--mm-border-md)", borderRadius: "var(--mm-r-xl)", padding: 6, listStyle: "none", margin: 0, boxShadow: "var(--mm-shadow-xl)", backdropFilter: "blur(12px)", maxHeight: 260, overflowY: "auto" },
  item: { display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: "var(--mm-r-md)", cursor: "pointer", color: "var(--mm-text-2)", fontSize: 14 },
  itemActive: { background: "var(--mm-brand-dim)", color: "var(--mm-brand)" },
  itemLabel: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  badge: { flexShrink: 0, fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 6, background: "var(--mm-success-dim)", color: "#15803D", border: "1px solid var(--mm-success-ring)" },
  coordBadge: { flexShrink: 0, fontSize: 14, color: "var(--mm-brand)", marginLeft: 4 },
};

// ─── ListingForm ──────────────────────────────────────────────────────────────

/**
 * Props:
 *   onSubmit(payload)  — called with the cleaned form data; parent handles API call
 *   isSubmitting       — boolean; controls button disabled + label
 *   error              — string | "" — API / validation error from parent
 *   successMessage     — string | "" — success message from parent
 *   savedAddresses     — string[] — existing addresses for autocomplete suggestions
 */
export default function ListingForm({ onSubmit, isSubmitting, error, successMessage, savedAddresses = [] }) {
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [customDietaryTag, setCustomDietaryTag] = useState("");

  function handleChange(e) {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  }

  const handleAddressChange = useCallback(value => {
    setFormData(prev => ({ ...prev, address: value, lat: null, lng: null }));
  }, []);

  const handleAddressSelect = useCallback(({ address, lat, lng }) => {
    setFormData(prev => ({ ...prev, address, lat, lng }));
  }, []);

  const handleAddSlot = useCallback(() => {
    setFormData(prev => ({
      ...prev,
      pickup_slots: [...prev.pickup_slots, { tempId: Date.now(), label: "", pickup_start: "", pickup_end: "" }],
    }));
  }, []);

  const handleRemoveSlot = useCallback(tempId => {
    setFormData(prev => ({ ...prev, pickup_slots: prev.pickup_slots.filter(s => s.tempId !== tempId) }));
  }, []);

  const handleSlotChange = useCallback((tempId, field, value) => {
    setFormData(prev => ({
      ...prev,
      pickup_slots: prev.pickup_slots.map(s => s.tempId === tempId ? { ...s, [field]: value } : s),
    }));
  }, []);

  function handleTagToggle(tag) {
    setFormData(prev => ({
      ...prev,
      dietary_tags: prev.dietary_tags.includes(tag)
        ? prev.dietary_tags.filter(t => t !== tag)
        : [...prev.dietary_tags, tag],
    }));
  }

  function handleRemoveTag(tag) {
    setFormData(prev => ({ ...prev, dietary_tags: prev.dietary_tags.filter(t => t !== tag) }));
  }

  function handleAddCustomTag() {
    const normalized = normalizeDietaryTag(customDietaryTag);
    if (!normalized) return;
    setFormData(prev => ({
      ...prev,
      dietary_tags: prev.dietary_tags.includes(normalized) ? prev.dietary_tags : [...prev.dietary_tags, normalized],
    }));
    setCustomDietaryTag("");
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!formData.title.trim() || !formData.description.trim() || !formData.quantity || !formData.pickup_start || !formData.pickup_end) {
      onSubmit(null, "Please fill in all required fields.");
      return;
    }
    const payload = {
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
        .filter(s => s.label.trim() && s.pickup_start && s.pickup_end)
        .map(s => ({ label: s.label.trim(), pickup_start: new Date(s.pickup_start).toISOString(), pickup_end: new Date(s.pickup_end).toISOString() })),
    };
    onSubmit(payload, null, () => {
      setFormData(EMPTY_FORM);
      setCustomDietaryTag("");
    });
  }

  return (
    <form onSubmit={handleSubmit} style={fs.form}>
      <div style={fs.fieldGroup}>
        <label className="mm-field-label" htmlFor="lf-title">Title</label>
        <input id="lf-title" type="text" name="title" placeholder="Example: Vegetarian Pasta Meals" value={formData.title} onChange={handleChange} className="mm-input" />
      </div>

      <div style={fs.fieldGroup}>
        <label className="mm-field-label" htmlFor="lf-desc">Description</label>
        <textarea id="lf-desc" name="description" placeholder="Describe the food and any pickup details" value={formData.description} onChange={handleChange} className="mm-textarea" style={{ minHeight: 100 }} />
      </div>

      <div style={fs.row}>
        <div style={fs.half}>
          <label className="mm-field-label" htmlFor="lf-qty">Quantity</label>
          <input id="lf-qty" type="number" name="quantity" placeholder="10" value={formData.quantity} onChange={handleChange} className="mm-input" min="1" />
        </div>
        <div style={fs.half}>
          <label className="mm-field-label" htmlFor="lf-loc">Location Name <span style={{ color: "var(--mm-text-4)", fontWeight: 400 }}>(optional)</span></label>
          <input id="lf-loc" type="text" name="location_name" placeholder="e.g. Stamp Student Union" value={formData.location_name} onChange={handleChange} className="mm-input" />
        </div>
      </div>

      <div style={fs.fieldGroup}>
        <label className="mm-field-label">Street Address <span style={{ color: "var(--mm-text-4)", fontWeight: 400 }}>(optional — enables map)</span></label>
        <AddressAutocomplete value={formData.address} onAddressChange={handleAddressChange} onSelect={handleAddressSelect} existingAddresses={savedAddresses} />
        {formData.lat != null && (
          <div style={{ fontSize: 12, color: "var(--mm-brand)", marginTop: 4, fontWeight: 600 }}>
            Coordinates saved: {formData.lat.toFixed(5)}, {formData.lng.toFixed(5)}
          </div>
        )}
      </div>

      <div style={fs.fieldGroup}>
        <label className="mm-field-label">Dietary Tags</label>
        <div style={fs.tagRow}>
          {DIETARY_OPTIONS.map(tag => (
            <button key={tag} type="button" onClick={() => handleTagToggle(tag)}
              className={`mm-btn mm-btn-sm ${formData.dietary_tags.includes(tag) ? "mm-btn-primary" : "mm-btn-ghost"}`}>
              {formatTagWithIcon(tag)}
            </button>
          ))}
        </div>
        <div style={fs.customTagRow}>
          <input type="text" placeholder="Add custom dietary tag" value={customDietaryTag}
            onChange={e => setCustomDietaryTag(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddCustomTag(); } }}
            className="mm-input" style={{ flex: 1 }} />
          <button type="button" onClick={handleAddCustomTag} className="mm-btn mm-btn-info mm-btn-sm">Add Tag</button>
        </div>
        {formData.dietary_tags.length > 0 && (
          <div style={fs.selectedTags}>
            {formData.dietary_tags.map(tag => (
              <span key={tag} style={fs.tagChip}>
                {formatTagWithIcon(tag)}
                <button type="button" onClick={() => handleRemoveTag(tag)} style={fs.tagRemove} aria-label={`Remove ${formatTag(tag)}`}>×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div style={fs.fieldGroup}>
        <label className="mm-field-label">Pickup Slots <span style={{ color: "var(--mm-text-4)", fontWeight: 400 }}>(optional — recipients must select one)</span></label>
        {formData.pickup_slots.map(slot => (
          <div key={slot.tempId} style={fs.slotRow}>
            <input type="text" placeholder="Label (e.g. 12pm – 1pm)" value={slot.label}
              onChange={e => handleSlotChange(slot.tempId, "label", e.target.value)} className="mm-input" style={{ flex: "1 1 130px", minWidth: 0 }} />
            <input type="datetime-local" value={slot.pickup_start}
              onChange={e => handleSlotChange(slot.tempId, "pickup_start", e.target.value)} className="mm-input" style={{ flex: "1 1 160px", minWidth: 0 }} />
            <input type="datetime-local" value={slot.pickup_end}
              onChange={e => handleSlotChange(slot.tempId, "pickup_end", e.target.value)} className="mm-input" style={{ flex: "1 1 160px", minWidth: 0 }} />
            <button type="button" onClick={() => handleRemoveSlot(slot.tempId)} style={fs.removeSlot} aria-label="Remove slot">×</button>
          </div>
        ))}
        <button type="button" onClick={handleAddSlot} className="mm-btn mm-btn-ghost mm-btn-sm" style={{ alignSelf: "flex-start" }}>+ Add pickup slot</button>
      </div>

      <div style={fs.row}>
        <div style={fs.half}>
          <label className="mm-field-label" htmlFor="lf-start">Pickup Start Time</label>
          <input id="lf-start" type="datetime-local" name="pickup_start" value={formData.pickup_start} onChange={handleChange} className="mm-input" />
        </div>
        <div style={fs.half}>
          <label className="mm-field-label" htmlFor="lf-end">Pickup End Time</label>
          <input id="lf-end" type="datetime-local" name="pickup_end" value={formData.pickup_end} onChange={handleChange} className="mm-input" />
        </div>
      </div>

      {error && <div className="mm-alert mm-alert-error" role="alert">{error}</div>}
      {successMessage && <div className="mm-alert mm-alert-success" role="status">{successMessage}</div>}

      <button type="submit" disabled={isSubmitting} className="mm-btn mm-btn-primary mm-btn-lg mm-btn-full">
        {isSubmitting ? "Creating Listing…" : "Create Listing"}
      </button>
    </form>
  );
}

const fs = {
  form: { display: "flex", flexDirection: "column", gap: 16 },
  fieldGroup: { display: "flex", flexDirection: "column", gap: 7 },
  half: { flex: 1, display: "flex", flexDirection: "column", gap: 7, minWidth: 200 },
  row: { display: "flex", gap: 14, flexWrap: "wrap" },
  tagRow: { display: "flex", flexWrap: "wrap", gap: 8 },
  customTagRow: { display: "flex", gap: 8, alignItems: "stretch", flexWrap: "wrap", marginTop: 8 },
  selectedTags: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 },
  tagChip: { display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: "var(--mm-r-full)", background: "var(--mm-brand-dim)", border: "1px solid var(--mm-brand-ring)", color: "var(--mm-brand)", fontWeight: 600, fontSize: 12 },
  tagRemove: { border: "none", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: 0 },
  slotRow: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 },
  removeSlot: { flexShrink: 0, width: 32, height: 32, borderRadius: "50%", border: "1px solid var(--mm-error-ring)", background: "var(--mm-error-dim)", color: "var(--mm-error)", fontSize: 18, lineHeight: 1, cursor: "pointer" },
};
