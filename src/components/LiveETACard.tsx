import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Clock, Navigation, Loader2 } from "lucide-react";

interface Props {
  orderId: string | null;
  /** Show "to pharmacy" copy when status is `assigned` (driver still on the way to pickup). */
  deliveryStatus?: string | null;
  className?: string;
}

const KMH_AVG = 30; // urban average — adjust per local data

function haversineKm(a: [number, number], b: [number, number]) {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Auto-updating ETA card. Subscribes to `driver_locations` for the order
 * and recomputes distance + ETA whenever the driver pings.
 * Customers and pharmacies see it without any map.
 */
export function LiveETACard({ orderId, deliveryStatus, className = "" }: Props) {
  const [driverLoc, setDriverLoc] = useState<[number, number] | null>(null);
  const [target, setTarget] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load order coordinates once
  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    (async () => {
      const { data: o } = await supabase
        .from("orders")
        .select("delivery_lat, delivery_lng, pickup_lat, pickup_lng, delivery_address")
        .eq("id", orderId)
        .maybeSingle();
      if (cancelled || !o) return;
      const assigned = deliveryStatus === "assigned";
      const lat = assigned ? Number(o.pickup_lat) : Number(o.delivery_lat);
      const lng = assigned ? Number(o.pickup_lng) : Number(o.delivery_lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        setTarget({ lat, lng, label: assigned ? "Pharmacy" : (o.delivery_address || "Delivery address") });
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orderId, deliveryStatus]);

  // Subscribe to driver location for this order
  useEffect(() => {
    if (!orderId) return;
    let active = true;

    (async () => {
      const { data } = await supabase
        .from("driver_locations")
        .select("lat, lng, updated_at")
        .eq("order_id", orderId)
        .maybeSingle();
      if (active && data) {
        setDriverLoc([Number(data.lat), Number(data.lng)]);
        setUpdatedAt(data.updated_at as string);
      }
    })();

    const ch = supabase
      .channel(`eta-${orderId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "driver_locations", filter: `order_id=eq.${orderId}` },
        (payload) => {
          const row = payload.new as { lat?: number; lng?: number; updated_at?: string };
          if (row?.lat != null && row?.lng != null) {
            setDriverLoc([Number(row.lat), Number(row.lng)]);
            if (row.updated_at) setUpdatedAt(row.updated_at);
          }
        })
      .subscribe();

    return () => { active = false; supabase.removeChannel(ch); };
  }, [orderId]);

  if (loading) {
    return (
      <div className={`flex items-center gap-2 text-xs text-muted-foreground ${className}`}>
        <Loader2 className="h-3 w-3 animate-spin" /> Calculating ETA…
      </div>
    );
  }

  if (!target || !driverLoc) {
    return (
      <div className={`rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2 ${className}`}>
        <Clock className="h-3.5 w-3.5" />
        Waiting for driver location… ETA will appear once tracking starts.
      </div>
    );
  }

  const km = haversineKm(driverLoc, [target.lat, target.lng]);
  const minutes = Math.max(1, Math.round((km / KMH_AVG) * 60));
  const fresh = updatedAt ? Math.max(0, Math.round((Date.now() - new Date(updatedAt).getTime()) / 1000)) : null;
  const arrived = km < 0.15;

  return (
    <div className={`rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
            <Navigation className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">
              {arrived ? "Driver has arrived" : `ETA to ${target.label}`}
            </p>
            <p className="text-sm font-bold text-foreground leading-tight">
              {arrived ? "Now" : `${minutes} min`}
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">· {km.toFixed(1)} km away</span>
            </p>
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground flex items-center gap-1 shrink-0">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-healthcare-green animate-pulse" />
          {fresh != null && fresh < 30 ? "live" : `${fresh ?? "?"}s ago`}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
        <MapPin className="h-3 w-3" /> Updates automatically as the driver moves.
      </div>
    </div>
  );
}
