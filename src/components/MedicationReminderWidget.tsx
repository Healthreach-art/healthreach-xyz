import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BellRing, Pill, Clock, Check, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Reminder {
  id: string;
  medication_name: string;
  dosage: string | null;
  time_of_day: string | null; // "HH:MM:SS"
  frequency: string;
  active: boolean;
}

function parseTime(t: string | null): { h: number; m: number } | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return { h, m };
}

function minutesUntil(t: { h: number; m: number }) {
  const now = new Date();
  const target = new Date();
  target.setHours(t.h, t.m, 0, 0);
  let diff = (target.getTime() - now.getTime()) / 60000;
  if (diff < -1) diff += 24 * 60; // next day
  return diff;
}

function fmtTime(t: { h: number; m: number }) {
  const d = new Date();
  d.setHours(t.h, t.m, 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function MedicationReminderWidget() {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [popup, setPopup] = useState<Reminder | null>(null);
  const [firedKeys, setFiredKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id) return;
    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from("medication_reminders")
        .select("id, medication_name, dosage, time_of_day, frequency, active")
        .eq("user_id", user.id)
        .eq("active", true)
        .order("time_of_day", { ascending: true });
      if (!mounted) return;
      if (!error && data) setReminders(data as Reminder[]);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [user?.id]);

  // Ask for browser notification permission once
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") Notification.requestPermission().catch(() => {});
  }, []);

  // Poll every 30s and fire popup/toast when a dose is due
  useEffect(() => {
    if (reminders.length === 0) return;
    const tick = () => {
      const now = new Date();
      const todayKey = now.toISOString().slice(0, 10);
      for (const r of reminders) {
        const t = parseTime(r.time_of_day);
        if (!t) continue;
        const diff = minutesUntil(t);
        const key = `${r.id}:${todayKey}:${t.h}:${t.m}`;
        if (diff <= 0 && diff > -2 && !firedKeys.has(key)) {
          setFiredKeys(prev => new Set(prev).add(key));
          setPopup(r);
          toast(`Time for ${r.medication_name}`, {
            description: r.dosage ? `Dose: ${r.dosage}` : "Tap to mark as taken.",
            icon: <Pill className="h-4 w-4" />,
          });
          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            try {
              new Notification("Medication reminder", {
                body: `${r.medication_name}${r.dosage ? ` • ${r.dosage}` : ""}`,
                icon: "/favicon.ico",
              });
            } catch { /* ignore */ }
          }
        }
      }
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [reminders, firedKeys]);

  const upcoming = useMemo(() => {
    return reminders
      .map(r => ({ r, t: parseTime(r.time_of_day) }))
      .filter((x): x is { r: Reminder; t: { h: number; m: number } } => !!x.t)
      .map(x => ({ ...x, mins: minutesUntil(x.t) }))
      .sort((a, b) => a.mins - b.mins)
      .slice(0, 3);
  }, [reminders]);

  return (
    <>
      <div className="rounded-3xl bg-card border-2 border-healthcare-mint/40 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-healthcare-teal/15 flex items-center justify-center">
              <BellRing className="h-4 w-4 text-healthcare-teal" />
            </div>
            <span className="text-xs font-extrabold tracking-widest text-healthcare-teal">REMINDERS</span>
          </div>
          <Link to="/dashboard/patient/reminders" className="text-[11px] text-healthcare-teal hover:underline inline-flex items-center gap-1">
            Manage <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <h3 className="text-lg font-bold text-foreground">Take Your Medicine</h3>
        <p className="text-xs text-muted-foreground mb-4">We'll remind you when it's time.</p>

        {loading ? (
          <div className="space-y-2">
            <div className="h-12 rounded-xl bg-muted animate-pulse" />
            <div className="h-12 rounded-xl bg-muted animate-pulse" />
          </div>
        ) : upcoming.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-healthcare-mint/50 bg-healthcare-light/40 p-4 text-center">
            <p className="text-xs text-muted-foreground mb-2">No active reminders yet.</p>
            <Link to="/dashboard/patient/reminders" className="inline-flex items-center gap-1 text-xs font-semibold text-healthcare-teal hover:underline">
              Set up a reminder <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {upcoming.map(({ r, t, mins }) => (
              <li key={r.id} className="flex items-center gap-3 rounded-2xl border border-border bg-background/60 p-3">
                <div className="h-10 w-10 rounded-xl bg-healthcare-green/10 flex items-center justify-center shrink-0">
                  <Pill className="h-5 w-5 text-healthcare-green" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{r.medication_name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {r.dosage || r.frequency} • <Clock className="inline h-3 w-3 -mt-0.5" /> {fmtTime(t)}
                  </p>
                </div>
                <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">
                  {mins <= 0 ? "Now" : mins < 60 ? `in ${Math.round(mins)}m` : `in ${Math.round(mins / 60)}h`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={!!popup} onOpenChange={(o) => !o && setPopup(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pill className="h-5 w-5 text-healthcare-green" /> Time to take your medicine
            </DialogTitle>
            <DialogDescription>
              {popup?.medication_name}{popup?.dosage ? ` — ${popup.dosage}` : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setPopup(null)}>Snooze 10 min</Button>
            <Button onClick={() => { toast.success("Marked as taken"); setPopup(null); }}>
              <Check className="h-4 w-4 mr-1" /> Mark taken
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
