import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  CheckCircle2, Pill, ClipboardCheck, Package, Bike, Truck, MapPin, Loader2, XCircle,
} from "lucide-react";

/**
 * Unified lifecycle timeline for an order_group_id.
 *
 * Streams `order_group_events` (logged by DB triggers when order_groups.status
 * or the linked delivery.status changes) and renders the canonical
 *   placed → accepted → preparing → ready → assigned → picked_up → in_transit → delivered
 * stages with timestamp + actor name for each.
 */

export interface OrderGroupTimelineProps {
  orderGroupId: string | null;
  /** Hide the header (live dot + group code). */
  hideHeader?: boolean;
  /** Show the 6-digit delivery code in the header. */
  deliveryCode?: string | null;
  className?: string;
}

interface EventRow {
  id: string;
  stage: string;
  source: string;
  actor_id: string | null;
  actor_role: string | null;
  actor_name: string | null;
  at: string;
}

const STAGES: { key: string; label: string; icon: typeof CheckCircle2 }[] = [
  { key: "placed",      label: "Placed",         icon: CheckCircle2 },
  { key: "accepted",    label: "Accepted",       icon: ClipboardCheck },
  { key: "preparing",   label: "Preparing",      icon: Pill },
  { key: "ready",       label: "Ready",          icon: Package },
  { key: "assigned",    label: "Driver Assigned",icon: Package },
  { key: "picked_up",   label: "Picked Up",      icon: Bike },
  { key: "in_transit",  label: "On The Way",     icon: Truck },
  { key: "delivered",   label: "Delivered",      icon: MapPin },
];

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString([], {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function OrderGroupTimeline({
  orderGroupId,
  hideHeader = false,
  deliveryCode = null,
  className = "",
}: OrderGroupTimelineProps) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (!orderGroupId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    (async () => {
      const { data } = await supabase.rpc(
        "get_order_group_timeline" as never,
        { _group_id: orderGroupId } as never,
      );
      if (cancelled) return;
      setEvents(((data ?? []) as unknown as EventRow[]));
      setLoading(false);
    })();

    const ch = supabase
      .channel(`order-group-timeline-${orderGroupId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "order_group_events", filter: `order_group_id=eq.${orderGroupId}` },
        (payload) => {
          setEvents((prev) => {
            const next = [...prev, payload.new as EventRow];
            next.sort((a, b) => +new Date(a.at) - +new Date(b.at));
            return next;
          });
          setPulse(true);
          window.setTimeout(() => setPulse(false), 1200);
        },
      )
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [orderGroupId]);

  const cancelled = events.some((e) => e.stage === "cancelled");
  const failed = events.some((e) => e.stage === "failed");
  const reached = new Set(events.map((e) => e.stage));
  const latestForStage = new Map<string, EventRow>();
  for (const e of events) latestForStage.set(e.stage, e);

  if (!orderGroupId) {
    return <div className={`text-xs text-muted-foreground ${className}`}>No order group selected.</div>;
  }

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-6 ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={`w-full ${className}`}>
      {!hideHeader && (
        <div className="flex items-center justify-between mb-3">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
            <span className={`inline-block h-1.5 w-1.5 rounded-full bg-healthcare-green transition-all ${pulse ? "scale-150 shadow-[0_0_8px_currentColor]" : ""}`} />
            Live timeline
          </span>
          {deliveryCode && (
            <span className="text-[11px] font-mono font-bold tracking-wider text-foreground bg-muted px-2 py-0.5 rounded">
              CODE {deliveryCode}
            </span>
          )}
        </div>
      )}

      {(cancelled || failed) && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <XCircle className="h-3.5 w-3.5" />
          {cancelled ? "Order cancelled" : "Delivery failed"}
          {latestForStage.get(cancelled ? "cancelled" : "failed")?.actor_name && (
            <span className="text-destructive/80">
              · by {latestForStage.get(cancelled ? "cancelled" : "failed")!.actor_name}
            </span>
          )}
        </div>
      )}

      <ol className="space-y-3">
        {STAGES.map((s, idx) => {
          const evt = latestForStage.get(s.key);
          const done = !!evt;
          const isCurrent =
            done &&
            !STAGES.slice(idx + 1).some((next) => reached.has(next.key));
          const Icon = s.icon;
          return (
            <li key={s.key} className="flex items-start gap-3">
              <div
                className={`mt-0.5 h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all shrink-0 ${
                  done
                    ? "border-healthcare-green bg-healthcare-green text-white"
                    : "border-border bg-card text-muted-foreground"
                } ${isCurrent && pulse ? "ring-4 ring-healthcare-green/20" : ""}`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-sm font-semibold leading-tight ${done ? "text-foreground" : "text-muted-foreground"}`}>
                    {s.label}
                  </p>
                  {done && (
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {fmtTime(evt!.at)}
                    </span>
                  )}
                </div>
                {done && evt?.actor_name && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    by <span className="font-medium text-foreground/80">{evt.actor_name}</span>
                    {evt.actor_role && evt.actor_role !== "null" ? ` · ${evt.actor_role}` : ""}
                  </p>
                )}
                {!done && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">Pending</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
