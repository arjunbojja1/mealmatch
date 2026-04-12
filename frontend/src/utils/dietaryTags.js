const TAG_ICON_RULES = [
  { icon: "🌿", keywords: ["vegan", "plant_based", "plant-based", "plant"] },
  { icon: "🥬", keywords: ["vegetarian", "veggie", "greens", "salad"] },
  { icon: "🕌", keywords: ["halal"] },
  { icon: "✡️", keywords: ["kosher"] },
  { icon: "🌾", keywords: ["gluten_free", "gluten-free", "gluten", "wheat_free", "wheat-free"] },
  { icon: "🥛", keywords: ["dairy_free", "dairy-free", "contains_dairy", "dairy", "lactose"] },
  { icon: "🥜", keywords: ["nut_free", "nut-free", "nut", "peanut", "almond", "cashew"] },
  { icon: "🥚", keywords: ["egg_free", "egg-free", "egg"] },
  { icon: "🍗", keywords: ["non_veg", "non-veg", "meat", "chicken", "beef", "protein"] },
  { icon: "🐟", keywords: ["fish", "seafood", "pescatarian", "shrimp", "salmon", "tuna"] },
  { icon: "🧂", keywords: ["low_sodium", "low-sodium", "sodium", "salt"] },
  { icon: "🍬", keywords: ["low_sugar", "low-sugar", "sugar_free", "sugar-free", "sugar", "dessert"] },
  { icon: "🥑", keywords: ["keto", "healthy_fats", "healthy-fats", "avocado"] },
  { icon: "🌶️", keywords: ["spicy", "hot"] },
  { icon: "🍞", keywords: ["bakery", "bread", "pastry"] },
  { icon: "🍎", keywords: ["fruit", "produce"] },
  { icon: "🥣", keywords: ["soup", "broth", "oatmeal", "porridge"] },
];

export function formatDietaryTag(tag) {
  return String(tag || "")
    .split(/[_-]/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export function getDietaryTagIcon(tag) {
  const normalized = String(tag || "").trim().toLowerCase();
  if (!normalized) return "🏷️";

  const match = TAG_ICON_RULES.find((rule) =>
    rule.keywords.some((keyword) => normalized.includes(keyword))
  );

  return match?.icon || "🏷️";
}

export function formatDietaryTagWithIcon(tag) {
  return `${getDietaryTagIcon(tag)} ${formatDietaryTag(tag)}`;
}

export function normalizeDietaryTag(tag) {
  return String(tag || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}
