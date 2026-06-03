import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Periodically pushes the driver's geolocation to driver_locations.
 * Uses browser Geolocation API; falls back silently if unavailable.
 */
export function useDriverLocationBroadcaster(opts: {
  driverId: string | null | undefined;
  activeOrderId: string | null | undefined;
  enabled?: boolean;
  intervalMs?: number;
}) {
  const { driverId, activeOrderId, enabled = true, intervalMs = 3000 } = opts;
  // Note: broadcasts as long as `enabled` is true, regardless of whether an
  // order is active — Uber-style continuous location while online.

  useEffect(() => {
    if (!enabled || !driverId || typeof window === "undefined" || !("geolocation" in navigator)) return;
    let cancelled = false;
    let watchId: number | null = null;
    let lastSent = 0;

    async function push(coords: GeolocationCoordinates) {
      if (cancelled) return;
      const now = Date.now();
      if (now - lastSent < intervalMs) return;
      lastSent = now;
      await supabase.from("driver_locations").upsert({
        driver_id: driverId!,
        order_id: activeOrderId ?? null,
        lat: coords.latitude,
        lng: coords.longitude,
        heading: coords.heading ?? null,
        speed: coords.speed ?? null,
        updated_at: new Date().toISOString(),
      } as any, { onConflict: "driver_id" });
    }

    watchId = navigator.geolocation.watchPosition(
      (pos) => { void push(pos.coords); },
      () => { /* permission denied — silent */ },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );

    return () => {
      cancelled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [driverId, activeOrderId, enabled, intervalMs]);
}
