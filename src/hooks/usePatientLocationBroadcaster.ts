import { useEffect } from "react";
import { firestoreClient } from "@/lib/firestore-client";

/**
 * On patient login, ask once for geolocation permission, then upsert a "Current
 * location" address as default. Refreshes every ~60s while the tab is open.
 */
export function usePatientLocationBroadcaster(opts: {
  userId: string | null | undefined;
  enabled?: boolean;
}) {
  const { userId, enabled = true } = opts;

  useEffect(() => {
    if (!enabled || !userId || typeof window === "undefined" || !("geolocation" in navigator)) return;
    let cancelled = false;
    let watchId: number | null = null;
    let lastSent = 0;

    async function upsert(coords: GeolocationCoordinates) {
      if (cancelled) return;
      const now = Date.now();
      if (now - lastSent < 55_000) return;
      lastSent = now;
      // Find existing "Current location" row for this user
      const { data: existing } = await firestoreClient
        .from("user_addresses")
        .select("id")
        .eq("user_id", userId!)
        .eq("label", "Current location")
        .maybeSingle();
      const street = `Live location · ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`;
      if (existing?.id) {
        await firestoreClient.from("user_addresses").update({
          street, lat: coords.latitude, lng: coords.longitude, is_default: true,
        }).eq("id", existing.id);
      } else {
        await firestoreClient.from("user_addresses").insert({
          user_id: userId!, label: "Current location", street,
          lat: coords.latitude, lng: coords.longitude, is_default: true,
        });
      }
    }

    watchId = navigator.geolocation.watchPosition(
      (pos) => { void upsert(pos.coords); },
      () => { /* permission denied — silent */ },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
    );

    return () => {
      cancelled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [userId, enabled]);
}
