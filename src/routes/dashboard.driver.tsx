import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Truck, MapPin, Clock, CheckCircle, Package,
  DollarSign, Navigation, Radio, X, Loader2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getMapboxDistance } from "@/utils/mapbox.functions";

type DStatus = "assigned" | "picked_up" | "in_transit" | "delivered";

interface LiveDelivery {
  id: string;
  order_id: string;
  status: DStatus;
  pickup_address: string | null;
  delivery_address: string | null;
  estimated_time: string | null;
  created_at: string;
  updated_at: string;
}

interface CompletedDelivery {
  id: string;
  order_id: string;
  updated_at: string;
  patient_name: string;
  earnings: number;
}

interface Offer {
  id: string;
  order_id: string;
  message: string | null;
  created_at: string;
  declined_by: string[] | null;
  expires_at: string;
  pickup_address: string | null;
  delivery_address: string | null;
  distance_km: number;
  earnings: number;
}

const STAGE_ORDER: DStatus[] = ["assigned", "picked_up", "in_transit", "delivered"];
const nextStatus: Record<DStatus, DStatus | null> = {
  assigned: "picked_up", picked_up: "in_transit", in_transit: "delivered", delivered: null,
};
const prevStatus: Record<DStatus, DStatus | null> = {
  assigned: null, picked_up: "assigned", in_transit: "picked_up", delivered: "in_transit",
};
const nextLabel: Record<DStatus, string> = {
  assigned: "Mark Picked Up", picked_up: "Start Delivery", in_transit: "Complete Delivery", delivered: "",
};
const stageLabel: Record<DStatus, string> = {
  assigned: "Assigned", picked_up: "Picked Up", in_transit: "In Transit", delivered: "Delivered",
};
const deliveryStatusLabels: Record<DStatus, { label: string; color: string }> = {
  assigned: { label: "Assigned", color: "bg-accent text-accent-foreground" },
  picked_up: { label: "Picked Up", color: "bg-primary/10 text-primary" },
  in_transit: { label: "In Transit", color: "bg-healthcare-sky/20 text-healthcare-sky" },
  delivered: { label: "Delivered", color: "bg-healthcare-green/20 text-healthcare-green" },
};

export const Route = createFileRoute("/dashboard/driver")({
  head: () => ({ meta: [{ title: "Driver Dashboard — HEALTHREACH" }] }),
  component: DriverDashboard,
});

// Fallback deterministic estimate (1.5–8.5 km) when Mapbox is unavailable
function estimateDistanceKm(orderId: string): number {
  let h = 0;
  for (let i = 0; i < orderId.length; i++) h = (h * 31 + orderId.charCodeAt(i)) >>> 0;
  return Math.round(((h % 700) / 100 + 1.5) * 10) / 10;
}
function estimateEarnings(km: number): number {
  return Math.round(25 + km * 6); // R25 base + R6/km
}

function DriverDashboard() {
  const { user, profile, approvalStatus, signOut } = useAuth();
  const [liveDeliveries, setLiveDeliveries] = useState<LiveDelivery[]>([]);
  const [completed, setCompleted] = useState<CompletedDelivery[]>([]);
  const [updating, setUpdating] = useState<string | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);

  // 1s tick for countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-remove expired offers locally
  useEffect(() => {
    setOffers((prev) => prev.filter((o) => new Date(o.expires_at).getTime() > now));
  }, [now]);

  useEffect(() => {
    if (!user) return;

    async function loadDeliveries() {
      const { data } = await supabase
        .from("deliveries")
        .select("id, order_id, status, pickup_address, delivery_address, estimated_time, created_at, updated_at")
        .eq("driver_id", user!.id)
        .order("updated_at", { ascending: false });
      const all = (data ?? []) as LiveDelivery[];
      setLiveDeliveries(all.filter((d) => d.status !== "delivered"));

      const done = all.filter((d) => d.status === "delivered");
      // Hydrate patient names and earnings from orders
      if (done.length > 0) {
        const orderIds = done.map((d) => d.order_id);
        const { data: orders } = await supabase
          .from("orders")
          .select("id, patient_id, delivery_fee")
          .in("id", orderIds);
        const orderMap = new Map((orders ?? []).map((o) => [o.id, o]));
        const patientIds = Array.from(new Set((orders ?? []).map((o) => o.patient_id)));
        const { data: profiles } = patientIds.length > 0
          ? await supabase.from("profiles").select("user_id, full_name").in("user_id", patientIds)
          : { data: [] as { user_id: string; full_name: string }[] };
        const nameMap = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name]));
        setCompleted(done.map((d) => {
          const order = orderMap.get(d.order_id);
          const fee = Number(order?.delivery_fee ?? 0);
          return {
            id: d.id,
            order_id: d.order_id,
            updated_at: d.updated_at,
            patient_name: order ? (nameMap.get(order.patient_id) || "Patient") : "Patient",
            earnings: fee > 0 ? fee : estimateEarnings(estimateDistanceKm(d.order_id)),
          };
        }));
      } else {
        setCompleted([]);
      }
    }

    async function loadOffers() {
      const { data } = await supabase
        .from("delivery_offers")
        .select("id, order_id, message, created_at, declined_by, expires_at")
        .eq("status", "open")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      const visible = (data ?? []).filter((o) => !(o.declined_by ?? []).includes(user!.id));
      const orderIds = visible.map((o) => o.order_id);
      const addressMap = new Map<string, { pickup: string | null; dropoff: string | null }>();
      if (orderIds.length > 0) {
        const [{ data: dels }, { data: ords }] = await Promise.all([
          supabase.from("deliveries").select("order_id, pickup_address, delivery_address").in("order_id", orderIds),
          supabase.from("orders").select("id, delivery_address").in("id", orderIds),
        ]);
        (dels ?? []).forEach((d) => {
          addressMap.set(d.order_id, { pickup: d.pickup_address, dropoff: d.delivery_address });
        });
        (ords ?? []).forEach((o) => {
          const existing = addressMap.get(o.id);
          if (!existing?.dropoff) {
            addressMap.set(o.id, { pickup: existing?.pickup ?? null, dropoff: o.delivery_address });
          }
        });
      }
      const enriched: Offer[] = await Promise.all(
        visible.map(async (o) => {
          const addr = addressMap.get(o.order_id);
          let distance_km = estimateDistanceKm(o.order_id);
          if (addr?.pickup && addr?.dropoff) {
            try {
              const result = await getMapboxDistance({ data: { pickup: addr.pickup, dropoff: addr.dropoff } });
              if (result.distance_km != null) distance_km = result.distance_km;
            } catch { /* keep fallback */ }
          }
          return {
            id: o.id,
            order_id: o.order_id,
            message: o.message,
            created_at: o.created_at,
            declined_by: o.declined_by,
            expires_at: o.expires_at,
            pickup_address: addr?.pickup ?? null,
            delivery_address: addr?.dropoff ?? null,
            distance_km,
            earnings: estimateEarnings(distance_km),
          };
        })
      );
      setOffers(enriched);
    }

    Promise.all([loadDeliveries(), loadOffers()]).finally(() => setLoading(false));

    const channel = supabase
      .channel(`driver-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries", filter: `driver_id=eq.${user.id}` }, (payload) => {
        if (payload.eventType === "INSERT") {
          const d = payload.new as LiveDelivery;
          toast.success("New delivery assigned!", {
            description: d.pickup_address ? `Pickup: ${d.pickup_address}` : `Order ${d.order_id.slice(0, 8)}`,
          });
        }
        loadDeliveries();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_offers" }, () => loadOffers())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  async function acceptOffer(offer: Offer) {
    if (!user) return;
    setRespondingId(offer.id);
    // Race-safe: only update if still open
    const { data: claimed, error } = await supabase
      .from("delivery_offers")
      .update({ status: "accepted", accepted_by: user.id })
      .eq("id", offer.id)
      .eq("status", "open")
      .select()
      .maybeSingle();
    if (error || !claimed) {
      setRespondingId(null);
      toast.error("Too late — another driver took it.");
      setOffers((prev) => prev.filter((o) => o.id !== offer.id));
      return;
    }

    // Auto-create delivery row if not present, otherwise assign existing
    const { data: existing } = await supabase
      .from("deliveries")
      .select("id")
      .eq("order_id", offer.order_id)
      .maybeSingle();

    const opts = [
      existing
        ? supabase.from("deliveries").update({ driver_id: user.id, status: "assigned" }).eq("order_id", offer.order_id)
        : supabase.from("deliveries").insert({
            order_id: offer.order_id,
            driver_id: user.id,
            status: "assigned",
            pickup_address: offer.pickup_address ?? "",
            delivery_address: offer.delivery_address ?? "",
          }),
      supabase.from("orders").update({ status: "ready" }).eq("id", offer.order_id),
    ];
    await Promise.all(opts);

    setRespondingId(null);
    setOffers((prev) => prev.filter((o) => o.id !== offer.id));
    toast.success("Delivery accepted!");
  }

  async function declineOffer(offer: Offer) {
    if (!user) return;
    setRespondingId(offer.id);
    const newDeclined = [...(offer.declined_by ?? []), user.id];
    await supabase.from("delivery_offers").update({ declined_by: newDeclined }).eq("id", offer.id);
    setOffers((prev) => prev.filter((o) => o.id !== offer.id));
    setRespondingId(null);
  }

  async function advance(d: LiveDelivery) {
    const next = nextStatus[d.status];
    if (!next) return;
    setUpdating(d.id);
    const { error } = await supabase.from("deliveries").update({ status: next }).eq("id", d.id);
    // Sync the order status so patient sees progress
    const orderStatusMap: Record<DStatus, "out_for_delivery" | "delivered" | null> = {
      assigned: null, picked_up: "out_for_delivery", in_transit: "out_for_delivery", delivered: "delivered",
    };
    const orderStatus = orderStatusMap[next];
    if (orderStatus) {
      await supabase.from("orders").update({ status: orderStatus }).eq("id", d.order_id);
    }
    setUpdating(null);
    if (error) toast.error(error.message);
    else toast.success(`Marked ${next.replace(/_/g, " ")}`);
  }

  // Today's earnings & count from real completed deliveries
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const completedToday = completed.filter((c) => new Date(c.updated_at) >= today);
  const todayEarnings = completedToday.reduce((s, c) => s + c.earnings, 0);
  const totalEarnings = completed.reduce((s, c) => s + c.earnings, 0);

  const stats = useMemo(() => [
    { icon: Truck, label: "Active Deliveries", value: String(liveDeliveries.length), color: "text-primary" },
    { icon: CheckCircle, label: "Completed Today", value: String(completedToday.length), color: "text-healthcare-green" },
    { icon: DollarSign, label: "Today's Earnings", value: `R ${todayEarnings.toFixed(0)}`, color: "text-healthcare-teal" },
    { icon: Navigation, label: "Total Earnings", value: `R ${totalEarnings.toFixed(0)}`, color: "text-healthcare-sky" },
  ], [liveDeliveries.length, completedToday.length, todayEarnings, totalEarnings]);

  if (approvalStatus === "pending") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="healthcare-card p-8 max-w-md text-center">
          <Clock className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-bold text-foreground">Pending Approval</h2>
          <p className="mt-2 text-sm text-muted-foreground">Your driver account is awaiting admin approval.</p>
          <Button variant="outline" className="mt-6" onClick={signOut}>Sign Out</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container-narrow px-4 sm:px-6 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Driver Dashboard</h1>
          <p className="text-sm text-muted-foreground">Welcome, {profile?.full_name || "Driver"}</p>
        </div>
        <Button variant="outline" size="sm" onClick={signOut}>Sign Out</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="healthcare-card p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-xl font-bold text-foreground">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Incoming Requests (Uber-style broadcast) */}
      {offers.length > 0 && (
        <div className="mb-8 rounded-xl border-2 border-primary/40 bg-primary/5 p-5">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
            <Radio className="h-5 w-5 text-primary animate-pulse" />
            Incoming Delivery Requests
            <span className="ml-auto text-xs font-normal text-muted-foreground">{offers.length} available</span>
          </h2>
          <div className="space-y-3">
            {offers.map((offer) => {
              const msLeft = Math.max(0, new Date(offer.expires_at).getTime() - now);
              const totalSec = Math.floor(msLeft / 1000);
              const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
              const ss = String(totalSec % 60).padStart(2, "0");
              const urgent = msLeft < 60_000;
              return (
                <div key={offer.id} className="rounded-lg bg-background border border-border p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-muted-foreground">Order {offer.order_id.slice(0, 8)}</span>
                    <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${urgent ? "bg-destructive/10 text-destructive" : "bg-accent text-accent-foreground"}`}>
                      ⏱ {mm}:{ss}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground mb-3">{offer.message || "New delivery request"}</p>

                  <div className="space-y-1.5 text-xs mb-3">
                    <div className="flex items-start gap-2">
                      <Package className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                      <div><span className="text-muted-foreground">Pickup: </span><span className="text-foreground">{offer.pickup_address || "—"}</span></div>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="h-3.5 w-3.5 text-healthcare-green mt-0.5 shrink-0" />
                      <div><span className="text-muted-foreground">Dropoff: </span><span className="text-foreground">{offer.delivery_address || "—"}</span></div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mb-3 text-xs">
                    <span className="inline-flex items-center gap-1 rounded-full bg-healthcare-sky/15 text-healthcare-sky px-2 py-0.5">
                      <Navigation className="h-3 w-3" /> ~{offer.distance_km} km
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-healthcare-green/15 text-healthcare-green px-2 py-0.5">
                      <DollarSign className="h-3 w-3" /> R {offer.earnings}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 gap-1" disabled={respondingId === offer.id} onClick={() => acceptOffer(offer)}>
                      <CheckCircle className="h-3 w-3" /> {respondingId === offer.id ? "Accepting..." : "Accept"}
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 gap-1" disabled={respondingId === offer.id} onClick={() => declineOffer(offer)}>
                      <X className="h-3 w-3" /> Decline
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            Active Deliveries
            <span className="inline-flex h-2 w-2 rounded-full bg-healthcare-green animate-pulse" />
            <span className="text-xs font-normal text-muted-foreground">Live</span>
          </h2>

          {loading && (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          )}

          {!loading && liveDeliveries.length === 0 && offers.length === 0 && (
            <div className="healthcare-card p-8 text-center">
              <Truck className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-foreground font-medium">No active deliveries</p>
              <p className="text-xs text-muted-foreground mt-1">New requests from pharmacies will appear above when broadcast.</p>
            </div>
          )}

          {liveDeliveries.map((delivery) => {
            const statusInfo = deliveryStatusLabels[delivery.status];
            return (
              <div key={delivery.id} className="healthcare-card p-5 ring-1 ring-primary/20">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-mono text-muted-foreground">{delivery.id.slice(0, 8)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.color}`}>{statusInfo.label}</span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex items-start gap-2">
                    <Package className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                    <div><span className="text-muted-foreground">Pickup:</span><p className="text-foreground">{delivery.pickup_address || "—"}</p></div>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin className="h-3.5 w-3.5 text-healthcare-green mt-0.5 shrink-0" />
                    <div><span className="text-muted-foreground">Dropoff:</span><p className="text-foreground">{delivery.delivery_address || "—"}</p></div>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-4">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> ETA: {delivery.estimated_time || "—"}
                  </span>
                  {nextStatus[delivery.status] && (
                    <Button size="sm" variant="default" disabled={updating === delivery.id} onClick={() => advance(delivery)}>
                      {updating === delivery.id ? "Updating..." : nextLabel[delivery.status]}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="lg:col-span-2">
          <div className="healthcare-card p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Completed Deliveries</h2>
            {completed.length === 0 ? (
              <p className="text-sm text-muted-foreground">No completed deliveries yet.</p>
            ) : (
              <div className="space-y-3">
                {completed.slice(0, 8).map((d) => (
                  <div key={d.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{d.patient_name}</p>
                      <p className="text-xs text-muted-foreground">{new Date(d.updated_at).toLocaleDateString()}</p>
                    </div>
                    <span className="text-sm font-semibold text-healthcare-green">R {d.earnings.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
