import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  ShoppingCart, Package, Clock, CreditCard, Search, Pill,
  CalendarDays, FileText, MapPin, Loader2, Stethoscope,
} from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/patient")({
  head: () => ({ meta: [{ title: "Patient Dashboard — HEALTHREACH" }] }),
  component: PatientDashboard,
});

interface Med {
  id: string;
  pharmacy_id: string;
  name: string;
  price: number;
  stock_quantity: number;
}
interface Order {
  id: string;
  medication_name: string;
  status: string;
  total_amount: number;
  created_at: string;
}
interface Prescription {
  id: string;
  medication_name: string;
  dosage: string | null;
  doctor_name: string;
  is_active: boolean | null;
  created_at: string;
}

const statusColors: Record<string, string> = {
  pending: "bg-accent text-accent-foreground",
  accepted: "bg-healthcare-sky/20 text-healthcare-sky",
  preparing: "bg-accent text-primary",
  ready: "bg-healthcare-mint/30 text-healthcare-green",
  out_for_delivery: "bg-primary/10 text-primary",
  delivered: "bg-healthcare-green/20 text-healthcare-green",
  cancelled: "bg-destructive/10 text-destructive",
};

function PatientDashboard() {
  const { user, profile, signOut } = useAuth();
  const [search, setSearch] = useState("");
  const [meds, setMeds] = useState<Med[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const tasks: Promise<unknown>[] = [
        supabase
          .from("medications")
          .select("id, pharmacy_id, name, price, stock_quantity")
          .gt("stock_quantity", 0)
          .order("name")
          .then(({ data }) => setMeds((data ?? []) as Med[])),
      ];
      if (user) {
        tasks.push(
          supabase
            .from("orders")
            .select("id, medication_name, status, total_amount, created_at")
            .eq("patient_id", user.id)
            .order("created_at", { ascending: false })
            .then(({ data }) => setOrders((data ?? []) as Order[])),
          supabase
            .from("prescriptions")
            .select("id, medication_name, dosage, doctor_name, is_active, created_at")
            .eq("patient_id", user.id)
            .order("created_at", { ascending: false })
            .then(({ data }) => setPrescriptions((data ?? []) as Prescription[]))
        );
      }
      await Promise.all(tasks);
      setLoading(false);
    }
    load();

    if (!user) return;

    async function refreshOrders() {
      const { data } = await supabase
        .from("orders")
        .select("id, medication_name, status, total_amount, created_at")
        .eq("patient_id", user!.id)
        .order("created_at", { ascending: false });
      setOrders((data ?? []) as Order[]);
    }

    const statusLabels: Record<string, string> = {
      picked_up: "Your order has been picked up by the driver 📦",
      in_transit: "Your order is on the way! 🚗",
      delivered: "Your order has been delivered ✅",
    };

    const channel = supabase
      .channel(`patient-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `patient_id=eq.${user.id}` }, () => {
        refreshOrders();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "deliveries" }, async (payload) => {
        const newRow = payload.new as { order_id: string; status: string };
        const oldRow = payload.old as { status?: string };
        if (newRow.status === oldRow.status) return;
        const { data: order } = await supabase
          .from("orders")
          .select("id, patient_id, medication_name")
          .eq("id", newRow.order_id)
          .maybeSingle();
        if (!order || order.patient_id !== user.id) return;
        const msg = statusLabels[newRow.status];
        if (msg) {
          toast.success(msg, { description: order.medication_name });
          refreshOrders();
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "prescriptions", filter: `patient_id=eq.${user.id}` }, async () => {
        const { data } = await supabase
          .from("prescriptions")
          .select("id, medication_name, dosage, doctor_name, is_active, created_at")
          .eq("patient_id", user!.id)
          .order("created_at", { ascending: false });
        setPrescriptions((data ?? []) as Prescription[]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const filteredMeds = meds.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));

  const totalOrders = orders.length;
  const activeOrders = orders.filter((o) => !["delivered", "cancelled"].includes(o.status)).length;
  const pendingDelivery = orders.filter((o) => ["accepted", "preparing", "ready", "out_for_delivery"].includes(o.status)).length;
  const totalSpent = orders.filter((o) => o.status !== "cancelled").reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const activePrescriptions = prescriptions.filter((p) => p.is_active !== false);

  return (
    <div className="container-narrow px-4 sm:px-6 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Patient Dashboard</h1>
          <p className="text-sm text-muted-foreground">Welcome back, {profile?.full_name || "Patient"}</p>
        </div>
        <Button variant="outline" size="sm" onClick={signOut}>Sign Out</Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {[
          { icon: ShoppingCart, label: "Total Orders", value: String(totalOrders), color: "text-primary" },
          { icon: Package, label: "Active Orders", value: String(activeOrders), color: "text-healthcare-teal" },
          { icon: Clock, label: "Pending Delivery", value: String(pendingDelivery), color: "text-healthcare-sky" },
          { icon: CreditCard, label: "Total Spent", value: `R ${totalSpent.toFixed(0)}`, color: "text-healthcare-green" },
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
        {/* Search Medications */}
        <div className="lg:col-span-3 space-y-6">
          <div className="healthcare-card p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" /> Search Medications
            </h2>
            <input
              type="text"
              placeholder="Search medications..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-4 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring mb-4"
            />
            {loading && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
            {!loading && filteredMeds.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6">No medications available yet. Pharmacies need to add inventory.</p>
            )}
            <div className="space-y-3">
              {filteredMeds.map((med) => (
                <div key={med.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <Pill className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{med.name}</p>
                      <p className="text-xs text-muted-foreground">{med.stock_quantity} in stock</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-foreground">R {Number(med.price).toFixed(2)}</span>
                    <Button size="sm" variant="default" asChild>
                      <Link
                        to="/payment"
                        search={{ medId: med.id, name: med.name, price: Number(med.price), pharmacyId: med.pharmacy_id, qty: 1 }}
                      >
                        Order
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Active Prescriptions */}
          <div className="healthcare-card p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-primary" /> My Prescriptions
              {activePrescriptions.length > 0 && (
                <span className="ml-auto text-xs font-normal text-muted-foreground">{activePrescriptions.length} active</span>
              )}
            </h2>
            {loading && <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
            {!loading && prescriptions.length === 0 && (
              <p className="text-sm text-muted-foreground">No prescriptions on file. A hospital can issue one for you.</p>
            )}
            <div className="space-y-3">
              {prescriptions.slice(0, 5).map((p) => (
                <div key={p.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{p.medication_name}</p>
                      {p.dosage && <p className="text-xs text-muted-foreground">{p.dosage}</p>}
                      <p className="text-xs text-muted-foreground mt-0.5">Dr. {p.doctor_name || "—"} • {new Date(p.created_at).toLocaleDateString()}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${p.is_active === false ? "bg-muted text-muted-foreground" : "bg-healthcare-green/20 text-healthcare-green"}`}>
                      {p.is_active === false ? "inactive" : "active"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recent Orders */}
          <div className="healthcare-card p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> Recent Orders
            </h2>
            {orders.length === 0 && !loading && (
              <p className="text-sm text-muted-foreground">You haven't placed any orders yet.</p>
            )}
            <div className="space-y-3">
              {orders.slice(0, 5).map((order) => (
                <div key={order.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono text-muted-foreground">{order.id.slice(0, 8)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[order.status] ?? "bg-accent"}`}>
                      {order.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground">{order.medication_name}</p>
                  <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                    <span>{new Date(order.created_at).toLocaleDateString()}</span>
                    <span>R {Number(order.total_amount).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="healthcare-card p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: MapPin, label: "Track Delivery", to: "/track" },
                { icon: CalendarDays, label: "Contact Us", to: "/contact" },
              ].map((action) => (
                <Link key={action.label} to={action.to} className="flex flex-col items-center gap-2 rounded-lg border border-border p-4 transition-colors hover:bg-accent">
                  <action.icon className="h-5 w-5 text-primary" />
                  <span className="text-xs font-medium text-foreground">{action.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
