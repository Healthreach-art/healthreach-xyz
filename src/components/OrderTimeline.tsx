import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Pill, Package, Bike, Truck, MapPin, ClipboardCheck, Loader2 } from "lucide-react";

/**
 * Unified real-time order status timeline.
 * Subscribes to `orders` + `deliveries` for the given order_id and
 * renders the same 7-stage progression across patient/pharmacy/driver views.
 */

const STEPS = [
  { key: "placed",       label: "Order Placed",   icon: CheckCircle2 },
  { key: "preparing",    label: "Preparing",      icon: Pill },
  { key: "ready",        label: "Ready",          icon: ClipboardCheck },
  { key: "assigned",     label: "Driver Assigned",icon: Package },
  { key: "picked_up",    label: "Picked Up",      icon: Bike },
  { key: "in_transit",   label: "On The Way",     icon: Truck },
  { key: "delivered",    label: "Delivered",      icon: MapPin },
] as const;

function computeStep(orderStatus: string | null, deliveryStatus: string | null): number {
  if (orderStatus === "cancelled") return -1;
  if (deliveryStatus === "delivered" || orderStatus === "delivered") return 6;
  if (deliveryStatus === "in_transit" || orderStatus === "out_for_delivery") return 5;
  if (deliveryStatus === "picked_up") return 4;
  if (deliveryStatus === "assigned") return 3;
  if (orderStatus === "ready") return 2;
  if (orderStatus === "preparing" || orderStatus === "accepted") return 1;
  if (orderStatus === "pending") return 0;
  return 0;
}

interface OrderTimelineProps {
  orderId: string | null;
  /** Optional initial values to avoid an empty flicker. */
  initialOrderStatus?: string | null;
  initialDeliveryStatus?: string | null;
  compact?: boolean;
  /** "driver" shows only the 4 driver-controlled stages. */
  variant?: "full" | "driver";
  className?: string;
}

export function OrderTimeline({
  orderId,
  initialOrderStatus = null,
  initialDeliveryStatus = null,
  compact = false,
  variant = "full",
  className = "",
}: OrderTimelineProps) {
  const [orderStatus, setOrderStatus] = useState<string | null>(initialOrderStatus);
  const [deliveryStatus, setDeliveryStatus] = useState<string | null>(initialDeliveryStatus);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [pulse, setPulse] = useState(false);
  const [loading, setLoading] = useState(!!orderId);
  const pulseTimer = useRef<number | null>(null);

  function ping() {
    setPulse(true);
    if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
    pulseTimer.current = window.setTimeout(() => setPulse(false), 1200);
  }

  useEffect(() => {
    if (!orderId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    (async () => {
      const [{ data: o }, { data: d }] = await Promise.all([
        supabase.from("orders").select("status, updated_at").eq("id", orderId).maybeSingle(),
        supabase.from("deliveries").select("status, updated_at").eq("order_id", orderId).maybeSingle(),
      ]);
      if (cancelled) return;
      setOrderStatus((o?.status as string) ?? null);
      setDeliveryStatus((d?.status as string) ?? null);
      setUpdatedAt(((d?.updated_at as string) ?? (o?.updated_at as string)) ?? null);
      setLoading(false);
    })();

    const ch = supabase
      .channel(`order-timeline-${orderId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        (payload) => {
          const row = payload.new as { status?: string; updated_at?: string };
          if (row?.status !== undefined) setOrderStatus(row.status);
          if (row?.updated_at) setUpdatedAt(row.updated_at);
          ping();
        })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "deliveries", filter: `order_id=eq.${orderId}` },
        (payload) => {
          const row = payload.new as { status?: string; updated_at?: string };
          if (row?.status !== undefined) setDeliveryStatus(row.status);
          if (row?.updated_at) setUpdatedAt(row.updated_at);
          ping();
        })
      .subscribe();

    return () => {
      cancelled = true;
      if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
      supabase.removeChannel(ch);
    };
  }, [orderId]);

  const fullStepIdx = computeStep(orderStatus, deliveryStatus);
  // Driver variant: collapse to Assigned → Picked Up → On The Way → Delivered (indices 3..6 in STEPS)
  const STEPS_VIEW = variant === "driver" ? STEPS.slice(3) : STEPS;
  const stepIdx = variant === "driver" ? Math.max(0, fullStepIdx - 3) : fullStepIdx;
  const cancelled = orderStatus === "cancelled";

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-6 ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (cancelled) {
    return (
      <div className={`rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive ${className}`}>
        Order cancelled.
      </div>
    );
  }

  const dotSize = compact ? "h-7 w-7" : "h-10 w-10";
  const iconSize = compact ? "h-3.5 w-3.5" : "h-4 w-4";
  const labelSize = compact ? "text-[9px]" : "text-[10px]";

  return (
    <div className={`w-full ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
          <span className={`inline-block h-1.5 w-1.5 rounded-full bg-healthcare-green transition-all ${pulse ? "scale-150 shadow-[0_0_8px_currentColor]" : ""}`} />
          Live
        </span>
        {updatedAt && (
          <span className="text-[10px] text-muted-foreground">
            Updated {new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
      <div className="relative flex items-start justify-between">
        <div className="absolute top-1/2 left-0 right-0 -translate-y-1/2 h-0.5 bg-border" style={{ top: compact ? "14px" : "20px" }} />
        <div
          className="absolute left-0 h-0.5 bg-healthcare-green transition-all duration-500"
          style={{
            top: compact ? "14px" : "20px",
            width: stepIdx <= 0 ? "0%" : `${(stepIdx / Math.max(1, STEPS_VIEW.length - 1)) * 100}%`,
          }}
        />
        {STEPS_VIEW.map((step, i) => {
          const done = i < stepIdx;
          const active = i === stepIdx;
          const Icon = step.icon;
          return (
            <div key={step.key} className="relative z-10 flex flex-col items-center text-center" style={{ width: `${100 / STEPS_VIEW.length}%` }}>
              <div
                className={`${dotSize} rounded-full flex items-center justify-center border-2 transition-all bg-card ${
                  done
                    ? "border-healthcare-green bg-healthcare-green text-white"
                    : active
                    ? "border-healthcare-green text-healthcare-green ring-4 ring-healthcare-green/20"
                    : "border-border text-muted-foreground"
                } ${active && pulse ? "scale-110" : ""}`}
              >
                <Icon className={iconSize} />
              </div>
              <p className={`mt-1.5 ${labelSize} font-semibold leading-tight px-0.5 ${active ? "text-foreground" : done ? "text-foreground/70" : "text-muted-foreground"}`}>
                {step.label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
