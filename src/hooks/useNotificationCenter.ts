import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Prefs {
  email_orders: boolean;
  email_promotions: boolean;
  sms_orders: boolean;
  push_orders: boolean;
}
const DEFAULT_PREFS: Prefs = { email_orders: true, email_promotions: false, sms_orders: true, push_orders: true };

function playNotificationSound() {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const tone = ctx.createOscillator();
    const gain = ctx.createGain();
    tone.type = "sine";
    tone.frequency.value = 1046;
    gain.gain.value = 0.0001;
    tone.connect(gain);
    gain.connect(ctx.destination);
    const t = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.2, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    tone.start(t);
    tone.stop(t + 0.24);
    setTimeout(() => ctx.close().catch(() => {}), 350);
  } catch { /* audio may be blocked until user interaction */ }
}

/**
 * Subscribes to public.notifications for the current user and surfaces them
 * as toasts / browser-push, gated by the user's notification_preferences.
 *
 * Categories mapped:
 *   - order, delivery, payment → push_orders + sms_orders/email_orders (logged)
 *   - promotion → email_promotions
 */
export function useNotificationCenter(userId: string | null | undefined) {
  const prefsRef = useRef<Prefs>(DEFAULT_PREFS);
  const startedAt = useRef<number>(Date.now());

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    async function loadPrefs() {
      const { data } = await supabase
        .from("notification_preferences")
        .select("email_orders, email_promotions, sms_orders, push_orders")
        .eq("user_id", userId!)
        .maybeSingle();
      if (!cancelled && data) prefsRef.current = data as Prefs;
    }
    loadPrefs();

    // Request browser push permission once (best-effort).
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    const prefsChannel = supabase
      .channel(`prefs-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notification_preferences", filter: `user_id=eq.${userId}` },
        (payload) => { prefsRef.current = { ...prefsRef.current, ...(payload.new as any) }; })
      .subscribe();

    const notifChannel = supabase
      .channel(`notif-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          const n: any = payload.new;
          // Only show notifications generated after the page mounted (avoid spamming on reload).
          if (new Date(n.created_at).getTime() < startedAt.current - 5000) return;

          const prefs = prefsRef.current;
          const isPromo = n.category === "promotion";
          const allowed = isPromo ? prefs.email_promotions : prefs.push_orders;
          if (!allowed) return;

          toast.message(n.title, { description: n.body });
          playNotificationSound();
          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            try { new Notification(n.title, { body: n.body, icon: "/favicon.ico" }); } catch { /* noop */ }
          }
        })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(prefsChannel);
      supabase.removeChannel(notifChannel);
    };
  }, [userId]);
}
