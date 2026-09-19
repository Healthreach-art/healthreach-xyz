import { createFileRoute, Link } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { reverseGeocodeBatch } from "@/lib/geocode.functions";
import { ArrowLeft, Activity, Truck, Pill, Package } from "lucide-react";

export const Route = createFileRoute("/dashboard/admin/live")({
  head: () => ({ meta: [{ title: "Live Map — HealthReachCare Admin" }] }),
  component: () => (
    <RoleGuard allow="admin">
      <LiveMapPage />
    </RoleGuard>
  ),
});

type PharmacyPin = { id: string; name: string; lat: number; lng: number; address: string };
type DriverPin = { id: string; name: string; lat: number; lng: number; status: string; address: string };
type OrderPin = { id: string; medication: string; lat: number; lng: number; status: string; address: string };

function LiveMapPage() {
  const [pharmacies, setPharmacies] = useState<PharmacyPin[]>([]);
  const [drivers, setDrivers] = useState<DriverPin[]>([]);
  const [orders, setOrders] = useState<OrderPin[]>([]);
  const reverseGeocode = useServerFn(reverseGeocodeBatch);
  // Cache lat,lng → address so we don't re-geocode unchanged drivers every tick
  const addressCacheRef = useRef<Map<string, string>>(new Map());

  function cacheKey(lat: number, lng: number) {
    return `${lat.toFixed(4)},${lng.toFixed(4)}`;
  }

  async function loadStatic() {
    const [{ data: ph }, { data: ors }] = await Promise.all([
      supabase
        .from("profiles")
        .select("user_id, organization_name, full_name, latitude, longitude, address, approval_status")
        .eq("approval_status", "approved")
        .not("latitude", "is", null)
        .not("longitude", "is", null),
      supabase
        .from("orders")
        .select("id, medication_name, delivery_lat, delivery_lng, delivery_address, status, patient_id, pharmacy_id")
        .not("delivery_lat", "is", null)
        .not("delivery_lng", "is", null)
        .in("status", ["pending", "preparing", "ready", "out_for_delivery"]),
    ]);
    const userIds = (ph ?? []).map((p) => p.user_id);
    const { data: roles } = userIds.length
      ? await supabase.from("user_roles").select("user_id, role").in("user_id", userIds)
      : { data: [] as { user_id: string; role: string }[] };
    const phRoles = new Set((roles ?? []).filter((r) => r.role === "pharmacy").map((r) => r.user_id));
    setPharmacies(
      (ph ?? [])
        .filter((p) => phRoles.has(p.user_id))
        .map((p) => ({
          id: p.user_id,
          name: p.organization_name || p.full_name || "Pharmacy",
          lat: Number(p.latitude),
          lng: Number(p.longitude),
          address: (p.address && p.address.trim()) || `${Number(p.latitude).toFixed(4)}, ${Number(p.longitude).toFixed(4)}`,
        })),
    );
    setOrders(
      (ors ?? []).map((o) => ({
        id: o.id,
        medication: o.medication_name,
        lat: Number(o.delivery_lat),
        lng: Number(o.delivery_lng),
        status: o.status,
        address: (o.delivery_address && o.delivery_address.trim()) || `${Number(o.delivery_lat).toFixed(4)}, ${Number(o.delivery_lng).toFixed(4)}`,
      })),
    );
  }

  async function loadDrivers() {
    const { data: locs } = await supabase.from("driver_locations").select("driver_id, lat, lng");
    if (!locs?.length) {
      setDrivers([]);
      return;
    }
    const ids = locs.map((l) => l.driver_id);
    const [{ data: profs }, { data: stats }] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name").in("user_id", ids),
      supabase.from("driver_status").select("driver_id, status").in("driver_id", ids),
    ]);
    const nameMap = new Map((profs ?? []).map((p) => [p.user_id, p.full_name]));
    const statusMap = new Map((stats ?? []).map((s) => [s.driver_id, s.status]));

    // Determine which coords need reverse geocoding (not in cache)
    const cache = addressCacheRef.current;
    const toGeocode = locs
      .filter((l) => !cache.has(cacheKey(Number(l.lat), Number(l.lng))))
      .map((l) => ({ id: cacheKey(Number(l.lat), Number(l.lng)), lat: Number(l.lat), lng: Number(l.lng) }));
    if (toGeocode.length > 0) {
      try {
        const { addresses } = await reverseGeocode({ data: { points: toGeocode } });
        for (const [k, v] of Object.entries(addresses)) cache.set(k, v);
      } catch {
        // Soft-fail; fallbacks below
      }
    }
    setDrivers(
      locs.map((l) => {
        const lat = Number(l.lat);
        const lng = Number(l.lng);
        return {
          id: l.driver_id,
          name: nameMap.get(l.driver_id) || "Driver",
          lat,
          lng,
          status: statusMap.get(l.driver_id) || "unknown",
          address: cache.get(cacheKey(lat, lng)) || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        };
      }),
    );
  }

  useEffect(() => {
    loadStatic();
    loadDrivers();
    const ch = supabase
      .channel("admin-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_locations" }, () => loadDrivers())
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_status" }, () => loadDrivers())
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => loadStatic())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => loadStatic())
      .subscribe();
    const t = setInterval(() => {
      loadDrivers();
    }, 10000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container-narrow px-4 sm:px-6 py-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link to="/dashboard/admin" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Back to admin
          </Link>
          <h1 className="text-2xl font-bold text-foreground mt-1 flex items-center gap-2">
            <Activity className="h-5 w-5 text-healthcare-green animate-pulse" /> Live network
          </h1>
          <p className="text-sm text-muted-foreground">Real-time pharmacies, drivers, and active orders — addresses shown as street names.</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat icon={<Pill className="h-4 w-4 text-healthcare-teal" />} label="Pharmacies online" value={pharmacies.length} />
        <Stat icon={<Truck className="h-4 w-4 text-healthcare-sky" />} label="Drivers tracked" value={drivers.length} />
        <Stat icon={<Package className="h-4 w-4 text-primary" />} label="Active orders" value={orders.length} />
      </div>

      <LiveLeafletMap pharmacies={pharmacies} drivers={drivers} orders={orders} />

      <div className="grid gap-3 sm:grid-cols-2">
        <ListCard
          title="Pharmacies"
          items={pharmacies.map((p) => ({ id: p.id, primary: p.name, secondary: p.address }))}
        />
        <ListCard
          title="Drivers"
          items={drivers.map((d) => ({ id: d.id, primary: `${d.name} · ${d.status}`, secondary: d.address }))}
        />
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="healthcare-card p-3 flex items-center gap-3">
      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">{icon}</div>
      <div>
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-lg font-bold text-foreground leading-tight">{value}</p>
      </div>
    </div>
  );
}

function ListCard({ title, items }: { title: string; items: Array<{ id: string; primary: string; secondary: string }> }) {
  return (
    <div className="healthcare-card p-4">
      <h3 className="font-semibold mb-2 text-sm">{title} ({items.length})</h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">None yet.</p>
      ) : (
        <ul className="space-y-1 max-h-48 overflow-auto">
          {items.map((i) => (
            <li key={i.id} className="text-xs flex flex-col gap-0.5 border-b border-border/40 pb-1 last:border-b-0">
              <span className="font-medium truncate">{i.primary}</span>
              <span className="text-[10px] text-muted-foreground truncate">{i.secondary}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LiveLeafletMap({ pharmacies, drivers, orders }: {
  pharmacies: PharmacyPin[]; drivers: DriverPin[]; orders: OrderPin[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ L: typeof import("leaflet"); map: import("leaflet").Map } | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === "undefined") return;
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current || mapRef.current) return;
      const map = L.map(ref.current, { zoomControl: true, attributionControl: false }).setView([-26.2041, 28.0473], 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = { L, map };
      setReady(true);
    })();
    return () => {
      cancelled = true;
      if (mapRef.current?.map) {
        mapRef.current.map.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current || !layerRef.current) return;
    const { L, map } = mapRef.current;
    layerRef.current.clearLayers();
    const all: [number, number][] = [];
    pharmacies.forEach((p) => {
      L.marker([p.lat, p.lng], { icon: pin(L, "#0ea5e9", "P") })
        .addTo(layerRef.current!)
        .bindTooltip(`<strong>${escapeHtml(p.name)}</strong><br/>${escapeHtml(p.address)}`);
      all.push([p.lat, p.lng]);
    });
    drivers.forEach((d) => {
      L.marker([d.lat, d.lng], { icon: pin(L, "#10b981", "🚗") })
        .addTo(layerRef.current!)
        .bindTooltip(`<strong>${escapeHtml(d.name)} · ${escapeHtml(d.status)}</strong><br/>${escapeHtml(d.address)}`);
      all.push([d.lat, d.lng]);
    });
    orders.forEach((o) => {
      L.marker([o.lat, o.lng], { icon: pin(L, "#f59e0b", "📦") })
        .addTo(layerRef.current!)
        .bindTooltip(`<strong>${escapeHtml(o.medication)} · ${escapeHtml(o.status)}</strong><br/>${escapeHtml(o.address)}`);
      all.push([o.lat, o.lng]);
    });
    if (all.length > 0) map.fitBounds(L.latLngBounds(all), { padding: [40, 40], maxZoom: 13 });
  }, [ready, pharmacies, drivers, orders]);

  return <div className="h-[420px] w-full rounded-xl overflow-hidden border border-border" ref={ref} />;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function pin(L: typeof import("leaflet"), color: string, label: string) {
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};color:white;width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.3);border:2px solid white"><span style="transform:rotate(45deg);font-weight:700;font-size:12px">${label}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
  });
}
