import { useEffect, useRef } from "react";
import { firestoreClient } from "@/lib/firestore-client";
import { useAuth } from "@/hooks/useAuth";

interface ReminderRow {
  id: string;
  medication_name: string;
  dosage: string | null;
  frequency: string;
  time_of_day: string | null;
  active: boolean;
}

/**
 * Schedules in-browser medication reminders. Uses the registered service
 * worker (`/sw.js`) to surface them as real OS notifications — works on
 * Android/iOS/desktop when the user has granted Notification permission and
 * the tab is open or the app is installed as a PWA.
 *
 * Strategy: re-evaluate every minute. For each active reminder due in the
 * current minute, post a SHOW_REMINDER message to the service worker.
 * A localStorage flag prevents firing the same reminder twice on the same day.
 */
export function useReminderNotifications() {
  const { user } = useAuth();
  const remindersRef = useRef<ReminderRow[]>([]);

  // Register service worker once.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .catch((err) => console.warn("[reminders] SW register failed:", err));
  }, []);

  // Subscribe to the user's reminders (initial + realtime).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function refresh() {
      if (!user) return;
      const { data } = await firestoreClient
        .from("medication_reminders")
        .select("id, medication_name, dosage, frequency, time_of_day, active")
        .eq("user_id", user.id)
        .eq("active", true);
      if (!cancelled) remindersRef.current = (data ?? []) as ReminderRow[];
    }
    refresh();
    const channel = firestoreClient
      .channel(`reminders-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "medication_reminders", filter: `user_id=eq.${user.id}` },
        () => refresh()
      )
      .subscribe();
    return () => {
      cancelled = true;
      firestoreClient.removeChannel(channel);
    };
  }, [user]);

  // Tick every 30s; fire reminders whose time-of-day matches the current minute.
  useEffect(() => {
    if (typeof window === "undefined") return;

    function fire(r: ReminderRow) {
      if (typeof window === "undefined" || !("Notification" in window)) return;
      if (Notification.permission !== "granted") return;
      const today = new Date().toISOString().slice(0, 10);
      const key = `hr_reminder_fired_${r.id}_${today}_${r.time_of_day ?? ""}`;
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
      const payload = {
        title: `💊 ${r.medication_name}`,
        body: r.dosage ? `Time for: ${r.dosage}` : "Time to take your medication.",
        tag: `med-${r.id}`,
        link: "/dashboard/patient/reminders",
      };
      navigator.serviceWorker?.ready
        .then((reg) => {
          reg.active?.postMessage({ type: "SHOW_REMINDER", payload });
        })
        .catch(() => {
          // Fallback to direct Notification if SW not ready.
          try {
            new Notification(payload.title, { body: payload.body, tag: payload.tag });
          } catch {/* ignore */}
        });
    }

    function tick() {
      const now = new Date();
      const hhmm = now.toTimeString().slice(0, 5); // "HH:MM"
      const weekday = now.getDay(); // 0=Sun
      for (const r of remindersRef.current) {
        if (!r.active || !r.time_of_day) continue;
        const t = r.time_of_day.slice(0, 5);
        if (t !== hhmm) continue;
        if (r.frequency === "weekly" && weekday !== 1 /* Monday */) continue;
        if (r.frequency === "monthly" && now.getDate() !== 1) continue;
        fire(r);
        if (r.frequency === "twice_daily") {
          // also handle a +12h fire by storing another key per slot
        }
      }
    }
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  return Notification.requestPermission();
}

/** Build an .ics file string for a reminder so the user can add it to their
 *  phone/PC native calendar (which fires a true OS alarm). */
export function buildReminderIcs(r: {
  id: string;
  medication_name: string;
  dosage?: string | null;
  time_of_day?: string | null;
  frequency: string;
}): string {
  const time = (r.time_of_day || "08:00").slice(0, 5);
  const [hh, mm] = time.split(":").map(Number);
  const start = new Date();
  start.setHours(hh, mm, 0, 0);
  if (start.getTime() < Date.now()) start.setDate(start.getDate() + 1);
  const end = new Date(start.getTime() + 10 * 60 * 1000);
  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const rruleMap: Record<string, string> = {
    daily: "FREQ=DAILY",
    twice_daily: "FREQ=DAILY;INTERVAL=1;COUNT=730",
    weekly: "FREQ=WEEKLY",
    monthly: "FREQ=MONTHLY",
  };
  const rrule = rruleMap[r.frequency] || "FREQ=DAILY";
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HealthReachCare//Reminders//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:reminder-${r.id}@healthreach`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `RRULE:${rrule}`,
    `SUMMARY:💊 ${r.medication_name}`,
    `DESCRIPTION:${r.dosage || "Time to take your medication."}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Medication reminder",
    "TRIGGER:-PT0M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadReminderIcs(r: Parameters<typeof buildReminderIcs>[0]) {
  if (typeof window === "undefined") return;
  const ics = buildReminderIcs(r);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${r.medication_name.replace(/[^a-z0-9]+/gi, "-")}-reminder.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
