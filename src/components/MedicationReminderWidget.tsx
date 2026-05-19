import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BellRing, Pill, Clock, Check, ArrowRight, Volume2, VolumeX } from "lucide-react";
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
  time_of_day: string | null;
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
  if (diff < -1) diff += 24 * 60;
  return diff;
}
function fmtTime(t: { h: number; m: number }) {
  const d = new Date();
  d.setHours(t.h, t.m, 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Classic phone-ring style alert: two-tone ring bursts, looped until stopped. */
function createRingtone() {
  let ctx: AudioContext | null = null;
  let stopped = false;
  let timer: number | null = null;

  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return { stop: () => {} };
    ctx = new Ctx();
  } catch { return { stop: () => {} }; }

  const playBurst = () => {
    if (!ctx || stopped) return;
    const start = ctx.currentTime;
    // Classic ring: two warble tones (440Hz + 480Hz) for 1.2s, then 1.5s silence
    [440, 480].forEach((freq) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.22, start + 0.05);
      gain.gain.setValueAtTime(0.22, start + 1.15);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.25);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(start);
      osc.stop(start + 1.3);
    });
  };

  playBurst();
  timer = window.setInterval(playBurst, 2700);

  return {
    stop: () => {
      stopped = true;
      if (timer) window.clearInterval(timer);
      try { ctx?.close(); } catch { /* ignore */ }
    },
  };
}

export function MedicationReminderWidget() {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [popup, setPopup] = useState<Reminder | null>(null);
  const [snoozeMin, setSnoozeMin] = useState(10);
  const firedKeys = useRef<Set<string>>(new Set());
  /** Map of key → snooze re-fire timeout id, so cancelling stops the next ring. */
  const snoozeTimers = useRef<Map<string, number>>(new Map());
  const ringRef = useRef<{ stop: () => void } | null>(null);
  const [muted, setMuted] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("hr_reminder_muted") === "1";
  });

  function stopRing() { ringRef.current?.stop(); ringRef.current = null; }
  function startRing() { stopRing(); ringRef.current = createRingtone(); }

  function triggerReminder(r: Reminder) {
    setPopup(r);
    if (!muted) startRing();
    toast(`Time for ${r.medication_name}`, {
      description: r.dosage ? `Dose: ${r.dosage}` : "Tap to mark as taken.",
      icon: <Pill className="h-4 w-4" />,
    });
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      try { new Notification("Medication reminder", { body: `${r.medication_name}${r.dosage ? ` • ${r.dosage}` : ""}`, icon: "/favicon.ico" }); }
      catch { /* ignore */ }
    }
  }

  function snooze(r: Reminder, minutes: number) {
    stopRing();
    setPopup(null);
    const ms = Math.max(1, minutes) * 60_000;
    const key = `snz:${r.id}:${Date.now()}`;
    const id = window.setTimeout(() => {
      snoozeTimers.current.delete(key);
      triggerReminder(r);
    }, ms);
    snoozeTimers.current.set(key, id);
    toast.info(`Snoozed for ${minutes} min`, { description: r.medication_name });
  }

  function markTaken(r: Reminder) {
    stopRing();
    // Cancel any pending snoozes for this reminder so it doesn't ring again.
    for (const [k, id] of snoozeTimers.current.entries()) {
      if (k.startsWith(`snz:${r.id}:`)) { window.clearTimeout(id); snoozeTimers.current.delete(k); }
    }
    toast.success(`${r.medication_name} marked as taken`);
    setPopup(null);
  }

