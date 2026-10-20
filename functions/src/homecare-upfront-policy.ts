export type CareProvider = { user_id?: unknown; approval_status?: unknown; is_active?: unknown; is_demo?: unknown; services?: unknown; hourly_rate?: unknown };

export function homecarePriceCents(provider: CareProvider, service: string, hours: number) {
  if (provider.approval_status !== "approved" || provider.is_active !== true || provider.is_demo === true
    || !Array.isArray(provider.services) || !provider.services.includes(service)
    || typeof provider.hourly_rate !== "number" || !Number.isFinite(provider.hourly_rate) || provider.hourly_rate <= 0
    || !Number.isInteger(hours) || hours < 1 || hours > 24) return null;
  const rate = Math.round(provider.hourly_rate * 100);
  const amount = rate * hours;
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function careVisitsOverlap(start: string, hours: number, other: { preferred_at?: unknown; duration_hours?: unknown; status?: unknown; reservation_expires_at?: unknown }, now: number) {
  if (!["awaiting_payment", "scheduled", "assigned", "accepted", "in_progress"].includes(String(other.status))) return false;
  if (other.status === "awaiting_payment" && (typeof other.reservation_expires_at !== "string" || Date.parse(other.reservation_expires_at) <= now)) return false;
  const from = Date.parse(start);
  const otherFrom = typeof other.preferred_at === "string" ? Date.parse(other.preferred_at) : NaN;
  const otherHours = typeof other.duration_hours === "number" ? other.duration_hours : NaN;
  if (!Number.isFinite(otherFrom) || !Number.isFinite(otherHours)) return true;
  return from < otherFrom + otherHours * 3_600_000 && otherFrom < from + hours * 3_600_000;
}