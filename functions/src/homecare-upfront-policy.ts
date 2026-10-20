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

// Only explicit weekly windows can authorize automatic confirmation; ambiguous prose requires review.
export function withinCareHours(schedule: unknown, start: string, hours: number) {
  if (typeof schedule !== "string") return false;
  const match = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:\s*[-–]\s*(Mon|Tue|Wed|Thu|Fri|Sat|Sun))?\s*,?\s*(\d{2}):(\d{2})\s*[-–]\s*(\d{2}):(\d{2})$/i.exec(schedule.trim());
  if (!match) return false;
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const first = days.findIndex(day => day.toLowerCase() === match[1].toLowerCase());
  const last = days.findIndex(day => day.toLowerCase() === (match[2] ?? match[1]).toLowerCase());
  const local = new Date(Date.parse(start) + 2 * 3_600_000);
  const day = local.getUTCDay();
  const time = local.getUTCHours() * 60 + local.getUTCMinutes();
  const opening = Number(match[3]) * 60 + Number(match[4]);
  const closing = Number(match[5]) * 60 + Number(match[6]);
  const inDay = first <= last ? day >= first && day <= last : day >= first || day <= last;
  return Number.isFinite(local.getTime()) && inDay && opening >= 0 && closing <= 1440 && Number(match[4]) < 60 && Number(match[6]) < 60 && time >= opening && time + hours * 60 <= closing;
}