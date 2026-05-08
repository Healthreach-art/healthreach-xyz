import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Package, Truck, MapPin, Clock, Phone, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { DeliveryMap } from "@/components/DeliveryMap";

export const Route = createFileRoute("/track")({
  head: () => ({
    meta: [
      { title: "Track Order — HEALTHREACH" },
      { name: "description", content: "Track your medication delivery in real time." },
    ],
  }),
  component: TrackPage,
});

type DeliveryStatus = "assigned" | "picked_up" | "in_transit" | "delivered";

interface Delivery {
  id: string;
  order_id: string;
  status: DeliveryStatus;
  pickup_address: string | null;
  delivery_address: string | null;
  estimated_time: string | null;
  updated_at: string;
}

const stepDef: { key: DeliveryStatus | "placed" | "preparing"; label: string; icon: typeof CheckCircle2 }[] = [
  { key: "placed", label: "Order Placed", icon: CheckCircle2 },
  { key: "preparing", label: "Pharmacy Preparing", icon: Package },
  { key: "assigned", label: "Driver Assigned", icon: Package },
  { key: "picked_up", label: "Picked Up from Pharmacy", icon: Package },
  { key: "in_transit", label: "On the Way", icon: Truck },
  { key: "delivered", label: "Delivered", icon: MapPin },
];

const statusOrder: Record<DeliveryStatus | "placed" | "preparing", number> = {
  placed: 0, preparing: 1, assigned: 2, picked_up: 3, in_transit: 4, delivered: 5,
};

function TrackPage() {
  const { user } = useAuth();
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [loading, setLoading] = useState(true);
  const [pulse, setPulse] = useState(false);
  const [driverLoc, setDriverLoc] = useState<{ lat: number; lng: number; speed: number | null; updated_at: string } | null>(null);

  useEffect(() => {
    if (!user) { setLoading(false); return; }

    async function load() {
      const { data: orders } = await supabase
        .from("orders").select("id").eq("patient_id", user!.id)
        .order("created_at", { ascending: false }).limit(1);
      if (!orders || orders.length === 0) { setDelivery(null); setLoading(false); return; }

      const { data: del } = await supabase
        .from("deliveries").select("*").eq("order_id", orders[0].id).maybeSingle();
      setDelivery(del as Delivery | null);

      const { data: loc } = await supabase
        .from("driver_locations").select("lat, lng, speed, updated_at")
        .eq("order_id", orders[0].id).maybeSingle();
      if (loc) setDriverLoc(loc as any);

      setLoading(false);
    }
    load();

    const statusLabels: Record<string, string> = {
      picked_up: "Driver picked up your order 📦",
      in_transit: "Your order is on the way! 🚗",
      delivered: "Your order has been delivered ✅",
    };
    const channel = supabase
      .channel("track-deliveries")
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, (payload) => {
        const next = payload.new as Delivery;
        const prevStatus = (payload.old as { status?: string })?.status;
        setDelivery((prev) => {
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

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const currentStep = delivery ? statusOrder[delivery.status] : 0;

  return (
    <div className="container-narrow px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            Track Your Order
            <span className={`inline-flex h-2 w-2 rounded-full bg-healthcare-green transition-all ${pulse ? "scale-150 shadow-[0_0_12px_currentColor]" : ""}`} />
            <span className="text-xs font-normal text-muted-foreground">Live</span>
          </h1>
          {delivery && <p className="text-sm text-muted-foreground">Order <span className="font-mono">{delivery.order_id.slice(0, 8)}</span></p>}
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/dashboard/patient">← Dashboard</Link>
        </Button>
      </div>

      {loading && (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      )}

      {!loading && !delivery && (
        <div className="healthcare-card p-8 text-center">
          <Package className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
          <h2 className="text-lg font-semibold">No active deliveries</h2>
          <p className="text-sm text-muted-foreground mt-1">Place an order to see live tracking here.</p>
          <Button className="mt-4" asChild><Link to="/dashboard/patient">Browse Medications</Link></Button>
        </div>
      )}

      {!loading && delivery && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
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
                            <Clock className="h-3 w-3" /> Updated {new Date(delivery.updated_at).toLocaleTimeString()}
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
            <h2 className="text-lg font-semibold">Delivery Details</h2>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Pickup</p>
              <p className="text-sm">{delivery.pickup_address || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Drop-off</p>
              <p className="text-sm">{delivery.delivery_address || "—"}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
