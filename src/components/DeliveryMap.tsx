import { useEffect, useRef, useState } from "react";

type Coords = [number, number];

interface Props {
  pickup?: string | null;
  dropoff?: string | null;
  status?: string;
  className?: string;
}

const DEFAULT_CENTER: Coords = [-26.2041, 28.0473]; // Johannesburg

async function geocode(address: string): Promise<Coords | null> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`);
    const j = (await r.json()) as Array<{ lat: string; lon: string }>;
    if (!j.length) return null;
    return [parseFloat(j[0].lat), parseFloat(j[0].lon)];
  } catch { return null; }
}

/** Simple Leaflet OSM map showing pickup → dropoff with an animated driver pin. */
export function DeliveryMap({ pickup, dropoff, status, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

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

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const { L, map, layer } = mapRef.current;
    layer.clearLayers();
    (async () => {
      const a = pickup ? await geocode(pickup) : null;
      const b = dropoff ? await geocode(dropoff) : null;
      const pts: Coords[] = [a, b].filter(Boolean) as Coords[];
      if (pts.length === 0) { map.setView(DEFAULT_CENTER, 12); return; }

      if (a) L.marker(a, { icon: pinIcon(L, "#0ea5e9", "P") }).addTo(layer).bindTooltip("Pharmacy");
      if (b) L.marker(b, { icon: pinIcon(L, "#10b981", "D") }).addTo(layer).bindTooltip("You");

      if (a && b) {
        L.polyline([a, b], { color: "#3b82f6", weight: 4, opacity: 0.7, dashArray: "6 8" }).addTo(layer);
        // Driver pin progresses along path based on status
        const t = status === "delivered" ? 1 : status === "in_transit" ? 0.65 : status === "picked_up" ? 0.15 : 0.0;
        const lat = a[0] + (b[0] - a[0]) * t;
        const lng = a[1] + (b[1] - a[1]) * t;
        L.marker([lat, lng], { icon: driverIcon(L) }).addTo(layer).bindTooltip("Driver");
      }
      map.fitBounds(L.latLngBounds(pts), { padding: [30, 30] });
    })();
  }, [ready, pickup, dropoff, status]);

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
