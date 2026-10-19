export interface Availability {
  day_of_week: number; start_hour: number; end_hour: number; slot_minutes: number; is_active: boolean;
}
export interface ExistingAppointment {
  scheduled_at: string; duration_minutes?: number; status: string;
}
export function availableDoctorSlots(availability: Availability[], appointments: ExistingAppointment[], now: number) {
  const result = new Map<string, { scheduledAt: string; durationMinutes: number }>();
  const localDay = new Date(now + 2 * 60 * 60_000);
  const midnight = Date.UTC(localDay.getUTCFullYear(), localDay.getUTCMonth(), localDay.getUTCDate()) - 2 * 60 * 60_000;
  for (let day = 0; day < 14; day++) {
    const date = midnight + day * 86_400_000;
    const dow = new Date(date + 2 * 60 * 60_000).getUTCDay();
    for (const row of availability) {
      if (!row.is_active || row.day_of_week !== dow || !Number.isInteger(row.slot_minutes)
        || row.slot_minutes < 30 || row.slot_minutes > 120 || row.slot_minutes % 30 !== 0
        || row.start_hour < 0 || row.end_hour > 24 || row.end_hour <= row.start_hour) continue;
      for (let minute = row.start_hour * 60; minute + row.slot_minutes <= row.end_hour * 60; minute += row.slot_minutes) {
        const start = date + minute * 60_000;
        const end = start + row.slot_minutes * 60_000;
        if (start <= now) continue;
        if (appointments.some((appointment) => {
          if (["cancelled", "no_show"].includes(appointment.status)) return false;
          const bookedStart = Date.parse(appointment.scheduled_at);
          const bookedEnd = bookedStart + (appointment.duration_minutes ?? 30) * 60_000;
          return start < bookedEnd && end > bookedStart;
        })) continue;
        const scheduledAt = new Date(start).toISOString();
        result.set(scheduledAt, { scheduledAt, durationMinutes: row.slot_minutes });
      }
    }
  }
  return [...result.values()].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}