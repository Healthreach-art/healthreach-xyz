import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Truck, MapPin, Clock, CheckCircle, Package,
  DollarSign, Navigation
} from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type DStatus = "assigned" | "picked_up" | "in_transit" | "delivered";
interface LiveDelivery {
  id: string; order_id: string; status: DStatus;
  pickup_address: string | null; delivery_address: string | null;
  estimated_time: string | null;
}
const nextStatus: Record<DStatus, DStatus | null> = {
  assigned: "picked_up", picked_up: "in_transit", in_transit: "delivered", delivered: null,
};
const nextLabel: Record<DStatus, string> = {
  assigned: "Mark Picked Up", picked_up: "Start Delivery", in_transit: "Complete Delivery", delivered: "",
};

export const Route = createFileRoute("/dashboard/driver")({
  head: () => ({ meta: [{ title: "Driver Dashboard — HEALTHREACH" }] }),
  component: DriverDashboard,
});

const mockDeliveries = [
  {
    id: "DEL-001", orderId: "ORD-101", medication: "Amoxicillin 500mg",
    pickup: "City Pharmacy, 45 Main Rd, Sandton", dropoff: "12 Oak Ave, Bryanston",
    status: "assigned", eta: "25 min", patient: "Thabo Mokoena"
  },
  {
    id: "DEL-002", orderId: "ORD-098", medication: "Metformin 850mg",
    pickup: "MedPlus Pharmacy, 22 Rivonia Rd", dropoff: "78 Elm St, Fourways",
    status: "picked_up", eta: "15 min", patient: "Naledi Khumalo"
  },
  {
    id: "DEL-003", orderId: "ORD-095", medication: "Paracetamol 500mg",
    pickup: "Health Hub, Rosebank Mall", dropoff: "34 Pine Cres, Randburg",
    status: "in_transit", eta: "8 min", patient: "Sipho Dlamini"
  },
];

const completedDeliveries = [
  { id: "DEL-098", patient: "Zanele Mthembu", date: "2026-04-12", earnings: "R 45.00" },
  { id: "DEL-097", patient: "Bongani Ndlovu", date: "2026-04-12", earnings: "R 55.00" },
  { id: "DEL-096", patient: "Lindiwe Nkosi", date: "2026-04-11", earnings: "R 38.00" },
];

const deliveryStatusLabels: Record<string, { label: string; color: string; nextAction: string }> = {
  assigned: { label: "Assigned", color: "bg-accent text-accent-foreground", nextAction: "Accept Delivery" },
  picked_up: { label: "Picked Up", color: "bg-primary/10 text-primary", nextAction: "Start Delivery" },
  in_transit: { label: "In Transit", color: "bg-healthcare-sky/20 text-healthcare-sky", nextAction: "Complete Delivery" },
  delivered: { label: "Delivered", color: "bg-healthcare-green/20 text-healthcare-green", nextAction: "" },
};

function DriverDashboard() {
  const { user, profile, approvalStatus, signOut } = useAuth();
  const [liveDeliveries, setLiveDeliveries] = useState<LiveDelivery[]>([]);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    async function load() {
      const { data } = await supabase
        .from("deliveries")
        .select("*")
        .eq("driver_id", user!.id)
        .neq("status", "delivered")
        .order("created_at", { ascending: false });
      setLiveDeliveries((data ?? []) as LiveDelivery[]);
    }
    load();
    const channel = supabase
      .channel("driver-deliveries")
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries", filter: `driver_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  async function advance(d: LiveDelivery) {
    const next = nextStatus[d.status];
    if (!next) return;
    setUpdating(d.id);
    const { error } = await supabase.from("deliveries").update({ status: next }).eq("id", d.id);
    setUpdating(null);
    if (error) toast.error(error.message);
    else toast.success(`Marked ${next.replace(/_/g, " ")}`);
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
        {[
          { icon: Truck, label: "Active Deliveries", value: String(liveDeliveries.length || mockDeliveries.length), color: "text-primary" },
          { icon: CheckCircle, label: "Completed Today", value: "5", color: "text-healthcare-green" },
          { icon: DollarSign, label: "Today's Earnings", value: "R 280", color: "text-healthcare-teal" },
          { icon: Navigation, label: "Total Distance", value: "42 km", color: "text-healthcare-sky" },
        ].map((stat) => (
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

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            Active Deliveries
            <span className="inline-flex h-2 w-2 rounded-full bg-healthcare-green animate-pulse" />
            <span className="text-xs font-normal text-muted-foreground">Live</span>
          </h2>

          {/* Live deliveries from DB */}
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

          {/* Demo deliveries (read-only mock) */}
          {liveDeliveries.length === 0 && mockDeliveries.map((delivery) => {
            const statusInfo = deliveryStatusLabels[delivery.status];
            return (
              <div key={delivery.id} className="healthcare-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-mono text-muted-foreground">{delivery.id} <span className="ml-1 text-[10px] text-muted-foreground">(demo)</span></span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.color}`}>{statusInfo.label}</span>
                </div>
                <p className="text-sm font-semibold text-foreground mb-3">{delivery.medication}</p>
                <div className="space-y-2 text-xs">
                  <div className="flex items-start gap-2">
                    <Package className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                    <div><span className="text-muted-foreground">Pickup:</span><p className="text-foreground">{delivery.pickup}</p></div>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin className="h-3.5 w-3.5 text-healthcare-green mt-0.5 shrink-0" />
                    <div><span className="text-muted-foreground">Dropoff:</span><p className="text-foreground">{delivery.dropoff}</p></div>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-4">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> ETA: {delivery.eta}
                  </span>
                  {statusInfo.nextAction && (
                    <Button size="sm" variant="outline" disabled>{statusInfo.nextAction}</Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="lg:col-span-2">
          <div className="healthcare-card p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Completed Deliveries</h2>
            <div className="space-y-3">
              {completedDeliveries.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{d.patient}</p>
                    <p className="text-xs text-muted-foreground">{d.date}</p>
                  </div>
                  <span className="text-sm font-semibold text-healthcare-green">{d.earnings}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
