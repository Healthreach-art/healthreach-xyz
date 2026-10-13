import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { firestoreClient } from "@/lib/firestore-client";
import { getDirections } from "@/lib/directions.functions";

type Coords = [number, number];

interface Props {
  pickup?: string | null;
  dropoff?: string | null;
  status?: string;
  /** When provided, the map subscribes to live driver location for this order. */
  orderId?: string | null;
  /** When provided, the map subscribes to live location for this driver. */
  driverId?: string | null;
  className?: string;
}

const DEFAULT_CENTER: Coords = [-26.2041, 28.0473]; // Johannesburg
const ACTIVE_STATUSES = new Set(["pending", "accepted", "preparing", "ready", "assigned", "picked_up", "in_transit"]);

/** Leaflet OSM map with REAL driving route (Mapbox) + LIVE driver marker (realtime). */
export function DeliveryMap({ pickup, dropoff, status, orderId, driverId, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const driverMarkerRef = useRef<any>(null);
  const ptsRef = useRef<{ a: Coords | null; b: Coords | null; route: Coords[] }>({ a: null, b: null, route: [] });
  const [ready, setReady] = useState(false);
  const [liveCoords, setLiveCoords] = useState<Coords | null>(null);
  const [info, setInfo] = useState<{ km: number | null; min: number | null }>({ km: null, min: null });
  const [collapsed, setCollapsed] = useState(false);
  const fetchDirections = useServerFn(getDirections);
  // Privacy: customer location is only shown while an order is actively in progress.
  const isActive = !!status && ACTIVE_STATUSES.has(status);
  const safeDropoff = isActive ? dropoff : null;


  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === "undefined") return;
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current || mapRef.current) return;
      const map = L.map(ref.current, { zoomControl: true, attributionControl: false }).setView(DEFAULT_CENTER, 12);
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
      let q = firestoreClient.from("driver_locations").select("lat, lng, updated_at").limit(1);
      q = orderId ? q.eq("order_id", orderId) : q.eq("driver_id", driverId!);
      const { data } = await q.maybeSingle();
      if (active && data) setLiveCoords([Number(data.lat), Number(data.lng)]);
    }
    fetchLatest();
    const channel = firestoreClient
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
    return () => { active = false; firestoreClient.removeChannel(channel); };
  }, [orderId, driverId]);

  // Render real driving route + endpoint pins on pickup/dropoff change
  useEffect(() => {
    if (!ready || !mapRef.current || !pickup) return;
    const { L, map, layer } = mapRef.current;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchDirections({ data: { pickup, dropoff: safeDropoff || pickup } });
        if (cancelled) return;
        layer.clearLayers();
        driverMarkerRef.current = null;
        const a = res.pickup as Coords | null;
        const b = safeDropoff ? (res.dropoff as Coords | null) : null;
        const route = b ? ((res.route as Coords[] | null) ?? (a ? [a, b] : [])) : [];
        ptsRef.current = { a, b, route };
        if (a) L.marker(a, { icon: pinIcon(L, "#0ea5e9", "P") }).addTo(layer).bindTooltip("Pharmacy (pickup)");
        if (b) L.marker(b, { icon: pinIcon(L, "#10b981", "C") }).addTo(layer).bindTooltip("Customer (drop-off)");
        if (route.length >= 2) {
          L.polyline(route, { color: "#3b82f6", weight: 5, opacity: 0.85 }).addTo(layer);
          map.fitBounds(L.latLngBounds(route), { padding: [40, 40] });
        } else if (a) {
          map.setView(a, 13);
        }
        setInfo({ km: res.distance_km ?? null, min: res.duration_min ?? null });
      } catch (e) {
        // Silent — keep last route
        console.warn("getDirections failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, [ready, pickup, safeDropoff, fetchDirections]);

  // Driver pin: prefer live coords; otherwise interpolate along the route
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const { L, map, layer } = mapRef.current;
    const { a, b, route } = ptsRef.current;
    if (!isActive && !liveCoords) {
      if (driverMarkerRef.current) { layer.removeLayer(driverMarkerRef.current); driverMarkerRef.current = null; }
      return;
    }
    let pos: Coords | null = liveCoords;
    if (!pos && route.length >= 2) {
      const t = status === "delivered" ? 1 : status === "in_transit" ? 0.65 : status === "picked_up" ? 0.2 : 0.0;
      const idx = Math.max(0, Math.min(route.length - 1, Math.floor((route.length - 1) * t)));
      pos = route[idx];
    } else if (!pos && a && b) {
      pos = a;
    }
    if (!pos) return;
    if (driverMarkerRef.current) {
      driverMarkerRef.current.setLatLng(pos);
    } else {
      driverMarkerRef.current = L.marker(pos, { icon: driverIcon(L) }).addTo(layer).bindTooltip("Driver");
    }
    if (liveCoords) map.panTo(pos, { animate: true });
  }, [ready, liveCoords, status, pickup, safeDropoff, isActive]);

  // Leaflet needs invalidateSize when the container is re-shown from display:none
  useEffect(() => {
    if (!collapsed && mapRef.current?.map) {
      setTimeout(() => mapRef.current?.map?.invalidateSize(), 50);
    }
  }, [collapsed]);

  // Keep Leaflet sized correctly when its container resizes (rotation, layout shifts)
  useEffect(() => {
    if (!ready || !ref.current || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => mapRef.current?.map?.invalidateSize());
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ready]);

  return (
    <div className={`${className ?? "w-full rounded-xl overflow-hidden border border-border"} relative flex flex-col ${collapsed ? "!h-auto" : ""}`}>
      <div className="flex items-center justify-between gap-2 px-2 py-1 border-b border-border bg-background/95 text-[11px] font-medium">
        <span className="truncate">
          {info.km !== null && <span>{info.km} km</span>}
          {info.km !== null && info.min !== null && <span className="mx-1 text-muted-foreground">·</span>}
          {info.min !== null && <span>{info.min} min</span>}
          {info.km === null && info.min === null && <span className="text-muted-foreground">Route map</span>}
        </span>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="rounded-md border border-border px-2 py-0.5 text-[10px] hover:bg-accent shrink-0"
          aria-expanded={!collapsed}
        >
          {collapsed ? "Show map" : "Hide map"}
        </button>
      </div>
      <div ref={ref} className="relative z-0 w-full flex-1 min-h-[160px]" style={collapsed ? { display: "none" } : undefined} />
    </div>
  );
}


function pinIcon(L: any, color: string, label: string) {
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};color:white;width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.35);border:2px solid white"><span style="transform:rotate(45deg);font-weight:700;font-size:12px">${label}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
  });
}
function driverIcon(L: any) {
  return L.divIcon({
    className: "",
    html: `<div style="background:#1f2937;color:white;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 4px rgba(59,130,246,.35),0 2px 8px rgba(0,0,0,.4);border:2px solid white;font-size:18px">🚗</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}
