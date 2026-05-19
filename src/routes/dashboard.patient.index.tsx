import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { RoleGuard } from "@/components/RoleGuard";
import { supabase } from "@/integrations/supabase/client";
import { MedicationReminderWidget } from "@/components/MedicationReminderWidget";
import { OrderTimeline } from "@/components/OrderTimeline";
import { DeliveryMap } from "@/components/DeliveryMap";
import { customerPrice } from "@/lib/pricing";
import {
  ShoppingBag, Upload, Truck, ArrowRight, Bot,
  Package, Bike, Star, Siren, Pill,
  CalendarCheck, FileText, MessageSquare, PhoneCall,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/patient/")({
  head: () => ({ meta: [{ title: "Dashboard — Healthreach" }] }),
  component: () => (
    <RoleGuard allow="patient">
      <PatientDashboard />
    </RoleGuard>
  ),
});

interface OrderRow {
  id: string;
  status: string;
  total_amount: number | string;
  created_at: string;
  pharmacy_id: string;
}

const ACTION_CARDS = [
  { title: "Order Medication", icon: ShoppingBag, to: "/dashboard/patient/pharmacies", bg: "bg-healthcare-green/10", iconBg: "bg-healthcare-green/20", iconColor: "text-healthcare-green" },
  { title: "Upload Prescription", icon: Upload, to: "/dashboard/patient/prescriptions", bg: "bg-healthcare-mint/20", iconBg: "bg-healthcare-mint/40", iconColor: "text-healthcare-teal" },
  { title: "Track Delivery", icon: Truck, to: "/track", bg: "bg-healthcare-light", iconBg: "bg-healthcare-sky/30", iconColor: "text-healthcare-sky" },
  { title: "Book Appointment", icon: CalendarCheck, to: "/dashboard/patient/appointments", bg: "bg-purple-50", iconBg: "bg-purple-100", iconColor: "text-purple-600" },
  { title: "AI Medicine Assistant", icon: Bot, to: "/dashboard/patient/assistant", bg: "bg-healthcare-mint/20", iconBg: "bg-healthcare-green/20", iconColor: "text-healthcare-green" },
];


function PatientDashboard() {
  const { user, profile } = useAuth();
  const firstName = profile?.full_name?.split(" ")[0] || "";
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [pharmaciesById, setPharmaciesById] = useState<Record<string, string>>({});
  const [driverName, setDriverName] = useState<string>("");
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [activePrescriptionsCount, setActivePrescriptionsCount] = useState(0);
  const [upcomingAppointmentsCount, setUpcomingAppointmentsCount] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("orders")
        .select("id, status, total_amount, created_at, pharmacy_id")
        .eq("patient_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(5);
      if (cancelled) return;
      const list = (data ?? []) as unknown as OrderRow[];
      setOrders(list);
      const active = list.find((o) => !["delivered", "cancelled"].includes(o.status));
      setActiveOrderId(active?.id ?? null);

      const ids = Array.from(new Set(list.map((o) => o.pharmacy_id))).filter(Boolean);
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, organization_name, full_name")
          .in("user_id", ids);
        if (cancelled) return;
        const map: Record<string, string> = {};
        (profs ?? []).forEach((p: any) => {
          map[p.user_id] = p.organization_name || p.full_name || "Pharmacy";
        });
        setPharmaciesById(map);
      }

      // Driver name for active order
      if (active?.id) {
        const { data: del } = await supabase
          .from("deliveries")
          .select("driver_id")
          .eq("order_id", active.id)
          .maybeSingle();
        if (del?.driver_id) {
          const { data: dp } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", del.driver_id)
            .maybeSingle();
          if (!cancelled) setDriverName(dp?.full_name ?? "");
        } else if (!cancelled) {
          setDriverName("");
        }
      } else if (!cancelled) {
        setDriverName("");
      }
    }
    load();

    // Realtime — orders + deliveries
    const ch = supabase
      .channel(`patient-dash-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `patient_id=eq.${user.id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, load)
      .subscribe();

    // Side stats
    (async () => {
      const [{ count: rxCount }, { count: apptCount }] = await Promise.all([
        supabase.from("prescription_uploads").select("id", { count: "exact", head: true })
          .eq("patient_id", user.id).eq("status", "approved"),
        supabase.from("pharmacy_appointments").select("id", { count: "exact", head: true })
          .eq("patient_id", user.id).gte("preferred_at", new Date().toISOString()),
      ]).catch(() => [{ count: 0 } as any, { count: 0 } as any]);
      if (cancelled) return;
      setActivePrescriptionsCount(rxCount ?? 0);
      setUpcomingAppointmentsCount(apptCount ?? 0);
    })();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [user?.id]);

  const driverInitial = (driverName || "?").charAt(0).toUpperCase();
  const activeOrdersCount = orders.filter((o) => !["delivered", "cancelled"].includes(o.status)).length;

  // Map latest active order status → tracker index
  const STATUS_STEP: Record<string, number> = {
    pending: 0, accepted: 1, preparing: 1, ready: 2, out_for_delivery: 3, delivered: 4,
  };
  const latestActive = orders.find((o) => !["delivered", "cancelled"].includes(o.status));
  const latestDelivered = orders.find((o) => o.status === "delivered");
  const activeStepIdx = latestActive
    ? (STATUS_STEP[latestActive.status] ?? 0)
    : latestDelivered ? 4 : -1;

  return (
    <div className="bg-background min-h-screen">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
          {/* MAIN COLUMN */}
          <div className="space-y-6">
            {/* Greeting */}
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
                Welcome{firstName ? `, ${firstName}` : ""} <span className="inline-block">👋</span>
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Your health is our priority. Let's take care of it today.
              </p>
            </div>

            {/* Action cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
              {ACTION_CARDS.map((c) => (
                <Link
                  key={c.title}
                  to={c.to}
                  className={`group rounded-3xl ${c.bg} p-4 sm:p-5 border border-border/40 hover:shadow-lg hover:-translate-y-1 transition-all duration-200`}
                >
                  <div className={`h-12 w-12 rounded-2xl ${c.iconBg} flex items-center justify-center mb-3`}>
                    <c.icon className={`h-6 w-6 ${c.iconColor}`} />
                  </div>
                  <p className="text-sm font-bold text-foreground leading-tight pr-4">{c.title}</p>
                  <ArrowRight className="h-4 w-4 text-muted-foreground mt-2 group-hover:translate-x-1 transition-transform" />
                </Link>
              ))}
            </div>

            {/* Delivery Tracker */}
            <div className="rounded-3xl bg-card border border-border p-5 sm:p-6 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-foreground">Delivery Tracker</h2>
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                    activeStepIdx < 0 ? "bg-muted text-muted-foreground" :
                    activeStepIdx === 4 ? "bg-healthcare-green/15 text-healthcare-green" :
                    "bg-healthcare-sky/20 text-healthcare-sky"
                  }`}>
                    {activeStepIdx < 0 ? "No active order" : activeStepIdx === 4 ? "Delivered" : "In Progress"}
                  </span>
                </div>
                <Link to="/track" className="text-xs text-healthcare-green font-semibold hover:underline">
                  View all deliveries →
                </Link>
              </div>

              <div className="grid lg:grid-cols-[1fr_280px] gap-6">
                {/* Unified real-time timeline */}
                <div>
                  {activeOrderId ? (
                    <OrderTimeline orderId={activeOrderId} initialOrderStatus={latestActive?.status ?? null} />
                  ) : latestDelivered ? (
                    <OrderTimeline orderId={latestDelivered.id} initialOrderStatus="delivered" />
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      No active order yet. Place one to see live tracking.
                    </div>
                  )}
                </div>


                {/* Real live map */}
                <div className="rounded-2xl border border-border overflow-hidden bg-muted/30">
                  <DeliveryMap
                    orderId={activeOrderId}
                    pickup={mapPickup}
                    dropoff={mapDropoff}
                    status={latestActive?.status}
                    className="h-44 w-full"
                  />
                  <div className="p-3 bg-card flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-healthcare-green/20 flex items-center justify-center text-sm font-bold text-healthcare-green">
                      {driverInitial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-muted-foreground">Your Driver</p>
                      <p className="text-sm font-bold text-foreground leading-tight truncate">{driverName || "Awaiting assignment"}</p>
                      {driverName && (
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" /> 5.0
                        </p>
                      )}
                    </div>
                    {activeOrderId && (
                      <Link
                        to="/dashboard/patient/orders"
                        aria-label="Open order chat"
                        className="h-9 w-9 rounded-full bg-healthcare-green/15 hover:bg-healthcare-green/25 flex items-center justify-center transition"
                      >
                        <MessageSquare className="h-4 w-4 text-healthcare-green" />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Orders */}
            <div className="rounded-3xl bg-card border border-border p-5 sm:p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-foreground">Recent Orders</h2>
                <Link to="/dashboard/patient/orders" className="text-xs text-healthcare-green font-semibold hover:underline">
                  View all orders →
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-muted-foreground border-b border-border">
                      <th className="py-3 pr-4 font-semibold">Medication</th>
                      <th className="py-3 pr-4 font-semibold">Pharmacy</th>
                      <th className="py-3 pr-4 font-semibold">Date</th>
                      <th className="py-3 pr-4 font-semibold">Status</th>
                      <th className="py-3 pr-4 font-semibold">Total</th>
                      <th className="py-3 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.length === 0 && (
                      <tr><td colSpan={6} className="py-6 text-center text-muted-foreground text-sm">No recent orders yet.</td></tr>
                    )}
                    {orders.map((o) => {
                      const medName = "Medication";
                      const qty = 1;
                      const date = new Date(o.created_at).toLocaleDateString("en-ZA", { month: "short", day: "2-digit", year: "numeric" });
                      const isOnWay = ["out_for_delivery", "ready", "preparing", "accepted"].includes(o.status);
                      const isDelivered = o.status === "delivered";
                      return (
                        <tr key={o.id} className="border-b border-border/60 hover:bg-muted/30 transition">
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-lg bg-healthcare-green/10 flex items-center justify-center">
                                <Pill className="h-5 w-5 text-healthcare-green" />
                              </div>
                              <div>
                                <p className="font-semibold text-foreground line-clamp-1">{medName}</p>
                                <p className="text-[11px] text-muted-foreground">{qty} {qty === 1 ? "unit" : "units"}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-muted-foreground">{pharmaciesById[o.pharmacy_id] || "Pharmacy"}</td>
                          <td className="py-3 pr-4 text-muted-foreground">{date}</td>
                          <td className="py-3 pr-4">
                            <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                              isDelivered ? "bg-healthcare-green/15 text-healthcare-green" :
                              isOnWay ? "bg-healthcare-sky/20 text-healthcare-sky" :
                              o.status === "cancelled" ? "bg-destructive/15 text-destructive" :
                              "bg-muted text-muted-foreground"
                            }`}>
                              {isOnWay ? "On The Way" : isDelivered ? "Delivered" : o.status}
                            </span>
                          </td>
                          <td className="py-3 pr-4 font-semibold text-foreground">R{customerPrice(Number(o.total_amount || 0)).toFixed(2)}</td>
                          <td className="py-3 text-right">
                            <Link
                              to="/dashboard/patient/orders"
                              className="inline-flex items-center justify-center px-3 py-1.5 rounded-full border border-healthcare-green text-healthcare-green text-xs font-semibold hover:bg-healthcare-green/10 transition"
                            >
                              Reorder
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* RIGHT PANEL */}
          <aside className="space-y-5">
            {/* Medication Reminders */}
            <MedicationReminderWidget />

            {/* Emergency */}
            <div className="rounded-3xl bg-card border-2 border-red-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-8 w-8 rounded-lg bg-red-100 flex items-center justify-center">
                  <Siren className="h-4 w-4 text-red-600" />
                </div>
                <span className="text-xs font-extrabold tracking-widest text-red-600">EMERGENCY</span>
              </div>
              <h3 className="text-lg font-bold text-foreground">Ambulance Assistance</h3>
              <p className="text-xs text-muted-foreground mb-4">24/7 Emergency Support</p>

              <div className="rounded-2xl border-2 border-dashed border-red-200 bg-red-50/50 p-4 mb-3 flex items-center gap-3">
                <div className="h-11 w-11 rounded-full bg-red-100 flex items-center justify-center">
                  <PhoneCall className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Call Emergency Ambulance</p>
                  <p className="text-xl font-extrabold text-red-600 leading-tight">107 / 112</p>
                </div>
              </div>

              <a href="tel:107" className="flex items-center justify-center gap-2 w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-2xl transition shadow-md">
                <PhoneCall className="h-4 w-4" /> Call Now
              </a>
              <p className="text-[11px] text-center text-muted-foreground mt-2">Your safety is our priority</p>
            </div>

            {/* Health Summary */}
            <div className="rounded-3xl bg-card border border-border p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-foreground">Health Summary</h3>
                <span className="text-[11px] text-muted-foreground border border-border px-2 py-1 rounded-lg">This Month ▾</span>
              </div>
              <div className="space-y-3">
                {[
                  { icon: Pill, color: "text-healthcare-green", bg: "bg-healthcare-green/10", label: "Active Prescriptions", value: String(activePrescriptionsCount) },
                  { icon: CalendarCheck, color: "text-healthcare-sky", bg: "bg-healthcare-sky/15", label: "Upcoming Appointments", value: String(upcomingAppointmentsCount) },
                  { icon: FileText, color: "text-orange-600", bg: "bg-orange-100", label: "Active Orders", value: String(activeOrdersCount) },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-3">
                    <div className={`h-9 w-9 rounded-xl ${row.bg} flex items-center justify-center`}>
                      <row.icon className={`h-4 w-4 ${row.color}`} />
                    </div>
                    <p className="flex-1 text-sm text-foreground">{row.label}</p>
                    <p className="text-sm font-bold text-foreground">{row.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Need help */}
            <div className="rounded-3xl bg-card border border-border p-5 shadow-sm">
              <h3 className="font-bold text-foreground">Need Help?</h3>
              <p className="text-xs text-muted-foreground mb-4">Chat with our team in real time.</p>
              <Link
                to="/dashboard/patient/support"
                className="flex items-center gap-3 p-3 rounded-2xl bg-healthcare-green/10 hover:bg-healthcare-green/15 transition"
              >
                <div className="h-12 w-12 rounded-full bg-healthcare-green/20 flex items-center justify-center">
                  <MessageSquare className="h-5 w-5 text-healthcare-green" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">Live Chat Support</p>
                  <p className="text-[11px] text-muted-foreground">Typically replies in minutes</p>
                </div>
                <ArrowRight className="h-4 w-4 text-healthcare-green" />
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
