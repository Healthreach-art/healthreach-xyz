export interface CalendarAppointment {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  doctor: string;
  location: string;
}

export function appointmentCalendar(event: CalendarAppointment, now = new Date()): string {
  const start = new Date(event.scheduledAt);
  if (!Number.isFinite(start.getTime()) || !Number.isInteger(event.durationMinutes) || event.durationMinutes <= 0) {
    throw new Error("Invalid appointment date or duration.");
  }
  const format = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const escape = (value: string) => value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//HealthReachCare//Appointments//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:${escape(event.id)}@healthreachcare.co.za`, `DTSTAMP:${format(now)}`, `DTSTART:${format(start)}`,
    `DTEND:${format(new Date(start.getTime() + event.durationMinutes * 60_000))}`,
    `SUMMARY:${escape(`Appointment with ${event.doctor}`)}`, `LOCATION:${escape(event.location)}`,
    "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
}

export function downloadAppointmentCalendar(event: CalendarAppointment) {
  const url = URL.createObjectURL(new Blob([appointmentCalendar(event)], { type: "text/calendar;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `appointment-${event.id}.ics`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}