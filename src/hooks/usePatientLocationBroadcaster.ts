import { useEffect } from "react";
import { firestoreClient } from "@/lib/firestore-client";
import { reverseGeocodeOne } from "@/lib/places.functions";
import { readPatientAddress, setPatientAddress } from "@/lib/patient-address";

const COORDS_ONLY = /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/;

/**
 * Keeps the patient's live location up to date while they use the app.
 * Coordinates are turned into a real place name, saved as the default
 * "Current location" address and selected for delivery and nearest-provider matching.
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
      let street = "";
      try {
        const { address } = await reverseGeocodeOne({ data: { lat: coords.latitude, lng: coords.longitude } });
        if (address && !COORDS_ONLY.test(address.trim())) street = address;
      } catch { /* keep previous name */ }
      if (cancelled) return;
      const { data: existing } = await firestoreClient
        .from("user_addresses")
        .select("id, street")
        .eq("user_id", userId!)
        .eq("label", "Current location")
        .maybeSingle();
      const finalStreet = street || (existing?.street && !String(existing.street).startsWith("Live location") ? existing.street : "Current location");
      let id = existing?.id as string | undefined;
      if (id) {
        await firestoreClient.from("user_addresses").update({
          street: finalStreet, lat: coords.latitude, lng: coords.longitude, is_default: true,
        }).eq("id", id);
      } else {
        const { data } = await firestoreClient.from("user_addresses").insert({
          user_id: userId!, label: "Current location", street: finalStreet,
          lat: coords.latitude, lng: coords.longitude, is_default: true,
        }).select("id").single();
        id = (data as { id?: string } | null)?.id;
      }
      // Use live location unless the patient deliberately chose another saved address.
      const active = readPatientAddress(userId!);
      if (!active || active.label === "Current location" || !active.address) {
        setPatientAddress(userId!, { id, label: "Current location", address: finalStreet, lat: coords.latitude, lng: coords.longitude });
      }
    }

    watchId = navigator.geolocation.watchPosition(
      (pos) => { void upsert(pos.coords); },
      () => { /* permission denied — patient can still pick an address */ },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
    );

    return () => {
      cancelled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [userId, enabled]);
}
