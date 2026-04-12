// ─── Food visual config ───────────────────────────────────────────────────────

const FOOD_VISUALS = [
  { key: "salad",   icon: "🥗", label: "Fresh",  colors: ["#DCFCE7","#86EFAC"], keywords: ["salad","vegan","vegetarian","greens","produce","fresh","plant"] },
  { key: "bakery",  icon: "🥐", label: "Bakery", colors: ["#FEF3C7","#F59E0B"], keywords: ["bread","bakery","pastry","bagel","croissant","muffin"] },
  { key: "meal",    icon: "🍱", label: "Meal",   colors: ["#DBEAFE","#60A5FA"], keywords: ["rice","bowl","entree","lunch","dinner","meal","combo"] },
  { key: "pizza",   icon: "🍕", label: "Hot",    colors: ["#FEE2E2","#F97316"], keywords: ["pizza","slice","flatbread"] },
  { key: "dessert", icon: "🧁", label: "Sweet",  colors: ["#FCE7F3","#F472B6"], keywords: ["dessert","cake","cookie","sweet","brownie","donut"] },
  { key: "soup",    icon: "🍜", label: "Warm",   colors: ["#EDE9FE","#8B5CF6"], keywords: ["soup","ramen","noodle","stew","broth","pasta"] },
  { key: "fruit",   icon: "🍎", label: "Fruit",  colors: ["#FEF9C3","#FACC15"], keywords: ["fruit","apple","banana","orange","berry","snack"] },
];

export function getListingVisual(listing) {
  const text = [listing.title, listing.description, ...(listing.dietary_tags || [])]
    .filter(Boolean).join(" ").toLowerCase();
  return FOOD_VISUALS.find(v => v.keywords.some(k => text.includes(k))) || FOOD_VISUALS[2];
}

export function formatTime(dateString) {
  if (!dateString) return "N/A";
  return new Date(dateString).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function getMinutesLeft(dateString) {
  if (!dateString) return 0;
  return Math.floor((new Date(dateString) - new Date()) / 60000);
}

export function formatMinutesLeft(minutes) {
  if (minutes <= 0) return "Closing";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}
