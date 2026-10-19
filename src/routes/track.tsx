import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Package, Truck, MapPin, Clock, Phone, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { firestoreClient } from "@/lib/firestore-client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { DeliveryMap } from "@/components/DeliveryMap";
import { deliveryBelongsToOrder } from "@/lib/delivery-policy";

export const Route = createFileRoute("/track")({
  head: () => ({
    meta: [
      { title: "Track Order — HealthReachCare" },
      { name: "description", content: "Track your medication delivery in real time." },
      { property: "og:title", content: "Track Order — HealthReachCare" },
      { property: "og:description", content: "Follow your medication package from pharmacy to delivery." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TrackPage,
});

type DeliveryStatus = "assigned" | "picked_up" | "in_transit" | "delivered";

interface Delivery {
  id: string;
  order_id: string;
  order_group_id?: string | null;
  status: DeliveryStatus;
  pickup_address: string | null;
  delivery_address: string | null;
  estimated_time: string | null;
  updated_at: string;
}

interface OrderRow {
  id: string;
  order_group_id: string | null;
  status: string;
  medication_name: string;
  quantity: number;
  total_amount: number;
  delivery_address: string | null;
  updated_at: string;
}

interface GroupInfo {
  id: string;
  delivery_code: string | null;
  status: string;
  total_amount: number;
}

const stepDef: { key: string; label: string; icon: typeof CheckCircle2 }[] = [
  { key: "placed", label: "Order Placed", icon: CheckCircle2 },
  { key: "preparing", label: "Pharmacy Preparing", icon: Package },
  { key: "ready", label: "Ready — Finding Driver", icon: Package },
  { key: "assigned", label: "Driver Assigned", icon: Package },
  { key: "picked_up", label: "Picked Up from Pharmacy", icon: Package },
  { key: "in_transit", label: "On the Way", icon: Truck },
  { key: "delivered", label: "Delivered", icon: MapPin },
];

// Maps order/delivery status → step index in stepDef
function stepFromState(orderStatus: string | null, deliveryStatus: DeliveryStatus | null): number {
  if (deliveryStatus === "delivered") return 6;
  if (deliveryStatus === "in_transit") return 5;
  if (deliveryStatus === "picked_up") return 4;
  if (deliveryStatus === "assigned") return 3;
  if (orderStatus === "ready") return 2;
  if (orderStatus === "preparing" || orderStatus === "accepted") return 1;
  return 0;
}

function TrackPage() {
  const { user } = useAuth();
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [groupItems, setGroupItems] = useState<OrderRow[]>([]);
  const [groupInfo, setGroupInfo] = useState<GroupInfo | null>(null);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [loading, setLoading] = useState(true);
  const [pulse, setPulse] = useState(false);
  const [driverLoc, setDriverLoc] = useState<{ lat: number; lng: number; speed: number | null; updated_at: string } | null>(null);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const userId = user.id;

    async function load() {
      // Most recent non-cancelled order — but we want the GROUP it belongs to
      const { data: orders } = await firestoreClient
        .from("orders")
        .select("id, order_group_id, status, medication_name, quantity, total_amount, delivery_address, updated_at")
        .eq("patient_id", userId)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(1);
      if (!orders || orders.length === 0) {
        setOrder(null); setGroupItems([]); setGroupInfo(null); setDelivery(null); setLoading(false); return;
      }
      const o = orders[0] as OrderRow;
      setOrder(o);

      // Pull every sibling in the same group + the group row itself
      if (o.order_group_id) {
        const [{ data: siblings }, { data: gRow }] = await Promise.all([
          firestoreClient.from("orders")
            .select("id, order_group_id, status, medication_name, quantity, total_amount, delivery_address, updated_at")
            .eq("order_group_id", o.order_group_id)
            .order("created_at", { ascending: true }),
          firestoreClient.from("order_groups" as never)
            .select("id, delivery_code, status, total_amount")
            .eq("id", o.order_group_id).maybeSingle(),
        ]);
        setGroupItems(((siblings ?? []) as OrderRow[]));
        setGroupInfo((gRow as GroupInfo | null) ?? null);
        // Delivery is keyed by group when grouped
        const { data: del } = await firestoreClient
          .from("deliveries").select("*").eq("order_group_id", o.order_group_id).maybeSingle();
        setDelivery((del ?? null) as Delivery | null);
      } else {
        setGroupItems([o]);
        setGroupInfo(null);
        const { data: del } = await firestoreClient
          .from("deliveries").select("*").eq("order_id", o.id).maybeSingle();
        setDelivery((del ?? null) as Delivery | null);
      }

      const { data: loc } = await firestoreClient
        .from("driver_locations").select("lat, lng, speed, updated_at")
        .eq("order_id", o.id).maybeSingle();
      if (loc) setDriverLoc(loc as { lat: number; lng: number; speed: number | null; updated_at: string });

      setLoading(false);
    }
    load();

    const statusLabels: Record<string, string> = {
      picked_up: "Driver picked up your order 📦",
      in_transit: "Your order is on the way! 🚗",
      delivered: "Your order has been delivered ✅",
    };
    const channel = firestoreClient
      .channel("track-deliveries")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `patient_id=eq.${user.id}` }, () => {
        // Order moved (e.g. preparing → ready) — refetch both
        load();
        setPulse(true);
        setTimeout(() => setPulse(false), 1200);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, (payload) => {
        const next = payload.new as Delivery;
        const prevStatus = (payload.old as { status?: string })?.status;
        setDelivery((prev) => {
          // Adopt newly created delivery for the active order
          if (!prev && order && deliveryBelongsToOrder(next, order)) {
            if (statusLabels[next.status]) toast.success(statusLabels[next.status]);
            return next;
          }
          if (!prev || prev.id !== next.id) return prev;
          if (next.status !== prevStatus) {
            const msg = statusLabels[next.status];
            if (msg) toast.success(msg);
          }
          return next;
        });
        setPulse(true);
        setTimeout(() => setPulse(false), 1200);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_locations" }, (payload) => {
        const next = payload.new as { order_id: string | null; lat: number; lng: number; speed: number | null; updated_at: string };
        setDelivery((prev) => {
          if (prev && next.order_id === prev.order_id) {
            setDriverLoc({ lat: next.lat, lng: next.lng, speed: next.speed, updated_at: next.updated_at });
            setPulse(true);
            setTimeout(() => setPulse(false), 1200);
          }
          return prev;
        });
      })
      .subscribe();

    return () => { firestoreClient.removeChannel(channel); };
  }, [user, order?.id]);

  const currentStep = stepFromState(order?.status ?? null, delivery?.status ?? null);

  return (
    <div className="container-narrow px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2 flex-wrap">
            Track Your Order
            <span className={`inline-flex h-2 w-2 rounded-full bg-healthcare-green transition-all ${pulse ? "scale-150 shadow-[0_0_12px_currentColor]" : ""}`} />
            <span className="text-xs font-normal text-muted-foreground">Live</span>
            {groupInfo?.delivery_code && (
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                CODE {groupInfo.delivery_code}
              </span>
            )}
          </h1>
          {order && (
            <p className="text-sm text-muted-foreground">
              Package <span className="font-mono">{(order.order_group_id ?? order.id).slice(0, 8)}</span> · {groupItems.length} item{groupItems.length === 1 ? "" : "s"}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/dashboard/patient">← Dashboard</Link>
          </Button>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      )}

      {!loading && !order && (
        <div className="healthcare-card p-8 text-center">
          <Package className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
          <h2 className="text-lg font-semibold">No active orders</h2>
          <p className="text-sm text-muted-foreground mt-1">Place an order to see live tracking here.</p>
          <Button className="mt-4" asChild><Link to="/dashboard/patient">Browse Medications</Link></Button>
        </div>
      )}

      {!loading && order && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            {delivery ? (
              <div className="healthcare-card overflow-hidden">
                <div className="aspect-video relative">
                  <DeliveryMap
                    orderId={delivery.order_id}
                    pickup={delivery.pickup_address}
                    dropoff={delivery.delivery_address}
                    status={delivery.status}
                    className="absolute inset-0 h-full w-full"
                  />
                  <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2 rounded-full bg-background/90 backdrop-blur px-3 py-1.5 shadow-md">
                    <Truck className="h-4 w-4 text-primary animate-pulse" />
                    <span className="text-xs font-medium capitalize">{delivery.status.replace(/_/g, " ")}</span>
                  </div>
                </div>
                <div className="p-4 flex items-center justify-between border-t border-border">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                      <Truck className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Your Driver</p>
                      <p className="text-xs text-muted-foreground">
                        ETA: {driverLoc
                          ? `${Math.max(1, Math.round(((driverLoc.speed ?? 0) > 1 ? 30 : 25) ))}–${Math.max(2, Math.round(((driverLoc.speed ?? 0) > 1 ? 30 : 25) + 10))} min`
                          : (delivery.estimated_time || "calculating...")}
                        {driverLoc && (
                          <span className="ml-2 text-healthcare-green">● Live · updated {new Date(driverLoc.updated_at).toLocaleTimeString()}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline"><Phone className="h-4 w-4" /> Call</Button>
                </div>
              </div>
            ) : (
              <div className="healthcare-card p-8 text-center bg-gradient-to-br from-primary/5 to-healthcare-sky/5">
                <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <Package className="h-8 w-8 text-primary animate-pulse" />
                </div>
                <h2 className="text-lg font-semibold capitalize">{order.status === "ready" ? "Finding a driver…" : "Pharmacy is preparing your order"}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {order.status === "ready"
                    ? "We've sent your order to nearby drivers. A driver will accept shortly."
                    : "The pharmacy will mark it ready as soon as it's packed."}
                </p>
              </div>
            )}

            <div className="healthcare-card p-6">
              <h2 className="text-lg font-semibold mb-4">Delivery Progress</h2>
              <div className="space-y-4">
                {stepDef.map((step, i) => {
                  const done = i <= currentStep;
                  const current = i === currentStep;
                  return (
                    <div key={step.key} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-full transition-all ${
                          done ? "bg-healthcare-green/20 text-healthcare-green" : "bg-muted text-muted-foreground"
                        } ${current ? "ring-2 ring-primary ring-offset-2" : ""}`}>
                          <step.icon className="h-4 w-4" />
                        </div>
                        {i < stepDef.length - 1 && (
                          <div className={`w-0.5 h-8 ${i < currentStep ? "bg-healthcare-green/40" : "bg-border"}`} />
                        )}
                      </div>
                      <div className="flex-1 pb-2">
                        <p className={`text-sm font-medium ${done ? "text-foreground" : "text-muted-foreground"}`}>
                          {step.label}
                        </p>
                        {current && (
                          <p className="text-xs text-primary flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Updated {new Date((delivery?.updated_at) ?? order.updated_at).toLocaleTimeString()}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="healthcare-card p-6 h-fit space-y-4">
            <h2 className="text-lg font-semibold">Package Contents</h2>
            <ul className="space-y-1.5">
              {groupItems.map((it) => (
                <li key={it.id} className="flex justify-between gap-2 text-sm">
                  <span className="font-medium">{it.medication_name} <span className="text-muted-foreground font-normal">× {it.quantity}</span></span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">R {Number(it.total_amount).toFixed(2)}</span>
                </li>
              ))}
            </ul>
            {groupInfo && (
              <div className="pt-2 border-t border-border/60 flex justify-between text-sm">
                <span className="text-muted-foreground">Total paid</span>
                <span className="font-semibold">R {Number(groupInfo.total_amount).toFixed(2)}</span>
              </div>
            )}
            <div className="pt-2 border-t border-border/60">
              <p className="text-xs text-muted-foreground mb-1">Pickup</p>
              <p className="text-sm">{delivery?.pickup_address || "Pharmacy will set this when ready"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Drop-off</p>
              <p className="text-sm">{delivery?.delivery_address || order.delivery_address || "—"}</p>
            </div>
            {groupInfo?.delivery_code && (
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Delivery code</p>
                <p className="text-xl font-mono font-bold text-primary mt-1">{groupInfo.delivery_code}</p>
                <p className="text-[11px] text-muted-foreground mt-1">Share this with the driver on arrival.</p>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
