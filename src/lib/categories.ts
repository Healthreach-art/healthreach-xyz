// Predefined medicine categories used across pharmacy add/edit, AI bulk
// import, and patient browse filters so the same labels show up everywhere
// in real-time.

export const MEDICINE_CATEGORIES = [
  "Pain Relief",
  "Antibiotics",
  "Cold & Flu",
  "Allergy",
  "Chronic / Cardiovascular",
  "Diabetes",
  "Digestive",
  "Mental Health",
  "Skin & Topical",
  "Eye & Ear",
  "Vitamins & Supplements",
  "Baby & Infant",
  "Women's Health",
  "Men's Health",
  "First Aid",
  "Other",
] as const;

export type MedicineCategory = (typeof MEDICINE_CATEGORIES)[number];

export function normalizeCategory(input: string | null | undefined): MedicineCategory {
  if (!input) return "Other";
  const found = MEDICINE_CATEGORIES.find(
    (c) => c.toLowerCase() === input.trim().toLowerCase(),
  );
  return found ?? "Other";
}
