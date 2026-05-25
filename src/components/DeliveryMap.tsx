import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Coords = [number, number];

interface Props {
  pickup?: string | null;
  dropoff?: string | null;
  status?: string;
  /** When provided, the map subscribes to live driver location for this order. */
  orderId?: string | null;
  /** When provided, the map subscribes to live location for this driver (used by drivers themselves). */
  driverId?: string | null;
  className?: string;
}

const DEFAULT_CENTER: Coords = [-33.9249, 18.4241]; // Cape Town

async function geocode(address: string): Promise<Coords | null> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`);
    const j = (await r.json()) as Array<{ lat: string; lon: string }>;
    if (!j.length) return null;
    return [parseFloat(j[0].lat), parseFloat(j[0].lon)];
  } catch { return null; }
}

/** Leaflet OSM map with pickup → dropoff route + LIVE driver marker (realtime subscription). */
export function DeliveryMap({ pickup, dropoff, status, orderId, driverId, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const driverMarkerRef = useRef<any>(null);
  const ptsRef = useRef<{ a: Coords | null; b: Coords | null }>({ a: null, b: null });
  const [ready, setReady] = useState(false);
  const [liveCoords, setLiveCoords] = useState<Coords | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === "undefined") return;
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current || mapRef.current) return;
      const map = L.map(ref.current, { zoomControl: false, attributionControl: false }).setView(DEFAULT_CENTER, 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
      mapRef.current = { L, map, layer: L.layerGroup().addTo(map) };
      setReady(true);
    })();
    return () => { cancelled = true; if (mapRef.current?.map) { mapRef.current.map.remove(); mapRef.current = null; } };
  }, []);

  // Subscribe to live driver location
  useEffect(() => {
    if (!orderId && !driverId) return;
    let active = true;

    async function fetchLatest() {
      let q = supabase.from("driver_locations").select("lat, lng, updated_at").limit(1);
      q = orderId ? q.eq("order_id", orderId) : q.eq("driver_id", driverId!);
      const { data } = await q.maybeSingle();
      if (active && data) setLiveCoords([Number(data.lat), Number(data.lng)]);
    }
    fetchLatest();

    const channel = supabase
      .channel(`driver-loc-${orderId || driverId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "driver_locations",
        filter: orderId ? `order_id=eq.${orderId}` : `driver_id=eq.${driverId}`,
      }, (payload) => {
        const row: any = payload.new;
        if (row?.lat != null && row?.lng != null) setLiveCoords([Number(row.lat), Number(row.lng)]);
      })
      .subscribe();

    return () => { active = false; supabase.removeChannel(channel); };
  }, [orderId, driverId]);

  // Render route + endpoint pins on pickup/dropoff change
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const { L, map, layer } = mapRef.current;
    layer.clearLayers();
    driverMarkerRef.current = null;
    (async () => {
      const a = pickup ? await geocode(pickup) : null;
      const b = dropoff ? await geocode(dropoff) : null;
      ptsRef.current = { a, b };
      const pts: Coords[] = [a, b].filter(Boolean) as Coords[];
      if (pts.length === 0) { map.setView(DEFAULT_CENTER, 12); return; }
      if (a) L.marker(a, { icon: pinIcon(L, "#0ea5e9", "P") }).addTo(layer).bindTooltip("Pharmacy");
      if (b) L.marker(b, { icon: pinIcon(L, "#10b981", "D") }).addTo(layer).bindTooltip("Drop-off");
      if (a && b) {
        L.polyline([a, b], { color: "#3b82f6", weight: 4, opacity: 0.7, dashArray: "6 8" }).addTo(layer);
      }
      map.fitBounds(L.latLngBounds(pts), { padding: [30, 30] });
    })();
  }, [ready, pickup, dropoff]);

  // Update driver pin (live coords preferred, otherwise interpolate by status)
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const { L, map, layer } = mapRef.current;
    const { a, b } = ptsRef.current;

    let pos: Coords | null = liveCoords;
    if (!pos && a && b) {
      const t = status === "delivered" ? 1 : status === "in_transit" ? 0.65 : status === "picked_up" ? 0.15 : 0.0;
      pos = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    if (!pos) return;
    if (driverMarkerRef.current) {
      driverMarkerRef.current.setLatLng(pos);
    } else {
      driverMarkerRef.current = L.marker(pos, { icon: driverIcon(L) }).addTo(layer).bindTooltip("Driver");
    }
    if (liveCoords) map.panTo(pos, { animate: true });
  }, [ready, liveCoords, status, pickup, dropoff]);

  return (
    <div className={className ?? "h-56 w-full rounded-xl overflow-hidden border border-border"}>
      <div ref={ref} className="h-full w-full" />
    </div>
  );
}

function pinIcon(L: any, color: string, label: string) {
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};color:white;width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.3);border:2px solid white"><span style="transform:rotate(45deg);font-weight:700;font-size:12px">${label}</span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });
}
function driverIcon(L: any) {
  return L.divIcon({
    className: "",
    html: `<div style="background:#1f2937;color:white;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 4px rgba(59,130,246,.3),0 2px 8px rgba(0,0,0,.4);border:2px solid white;font-size:18px">🚗</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}
