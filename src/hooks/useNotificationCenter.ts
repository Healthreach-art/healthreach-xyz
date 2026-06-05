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

function browserNotify(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try { new Notification(title, { body, icon: "/favicon.ico" }); } catch { /* noop */ }
}

/**
 * Subscribes the current user to:
 *  - public.notifications (existing system notifications)
 *  - public.appointment_messages (chat with doctor/pharmacy on bookings)
 *  - public.order_messages (chat on a delivery order)
 *
 * Each new message becomes a toast + sound + browser push. We suppress the
 * toast when the matching chat dialog is already open (the chat dialog sets
 * window.__activeChatId while mounted).
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
          if (new Date(n.created_at).getTime() < startedAt.current - 5000) return;
          const prefs = prefsRef.current;
          const isPromo = n.category === "promotion";
          const allowed = isPromo ? prefs.email_promotions : prefs.push_orders;
          if (!allowed) return;
          toast.message(n.title, { description: n.body });
          playNotificationSound();
          browserNotify(n.title, n.body);
        })
      .subscribe();

    // --- Chat messages: appointment_messages ---
    const apptMsgChannel = supabase
      .channel(`appt-msg-${userId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "appointment_messages" },
        (payload) => {
          const m: any = payload.new;
          if (m.sender_id === userId) return;
          if (m.patient_id !== userId && m.provider_id !== userId) return;
          if (typeof window !== "undefined" && (window as any).__activeChatId === m.appointment_id) return;
          const who = m.sender_role === "doctor" ? "Doctor"
            : m.sender_role === "pharmacy" ? "Pharmacy"
            : m.sender_role === "patient" ? "Patient" : "Provider";
          toast.message(`New message from ${who}`, {
            description: (m.body ?? "").slice(0, 140),
          });
          playNotificationSound();
          browserNotify(`New message from ${who}`, m.body ?? "");
        })
      .subscribe();

    // --- Chat messages: order_messages ---
    const orderMsgChannel = supabase
      .channel(`order-msg-${userId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "order_messages" },
        (payload) => {
          const m: any = payload.new;
          if (m.sender_id === userId) return;
          // RLS already filters to messages we can see; skip self.
          if (typeof window !== "undefined" && (window as any).__activeChatId === m.order_id) return;
          const who = m.sender_role === "driver" ? "Driver"
            : m.sender_role === "pharmacy" ? "Pharmacy"
            : m.sender_role === "patient" ? "Patient" : "Order update";
          toast.message(`New message from ${who}`, {
            description: (m.body ?? "").slice(0, 140),
          });
          playNotificationSound();
          browserNotify(`New message from ${who}`, m.body ?? "");
        })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(prefsChannel);
      supabase.removeChannel(notifChannel);
      supabase.removeChannel(apptMsgChannel);
      supabase.removeChannel(orderMsgChannel);
    };
  }, [userId]);
}
