// Global platform rules for HealthReachCare delivery system.
// These constants are referenced across pharmacy, driver, and patient flows.

export const PLATFORM_RULES = {
  // Delivery radius (km) by zone
  RADIUS_KM: { urban: 8, suburban: 12, premium: 15 },
  DEFAULT_RADIUS_KM: 12,

  // Driver economics
  MIN_PAYOUT_ZAR: 150,
  PLATFORM_FEE_PCT: 0.15,

  // Offer flow
  ACCEPT_TIMEOUT_SECS: 15,

  // ETA targets (minutes) by distance bucket
  ETA_MIN: 20,
  ETA_MAX: 60,
} as const;

export function etaForDistance(km: number): { min: number; max: number; label: string } {
  if (km <= 3) return { min: 20, max: 30, label: "20–30 min" };
  if (km <= 7) return { min: 25, max: 40, label: "25–40 min" };
  if (km <= 12) return { min: 35, max: 50, label: "35–50 min" };
  return { min: 45, max: 60, label: "45–60 min" };
}

export const FAILURE_REASONS = [
  { value: "customer_unavailable", label: "Customer unavailable" },
  { value: "wrong_address", label: "Wrong address" },
  { value: "unsafe_area", label: "Unsafe delivery area" },
  { value: "pharmacy_issue", label: "Pharmacy issue" },
  { value: "customer_refused", label: "Customer refused order" },
] as const;

export type FailureReason = (typeof FAILURE_REASONS)[number]["value"];
