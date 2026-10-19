import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { usePatientLocationBroadcaster } from "@/hooks/usePatientLocationBroadcaster";
import { useAuth } from "@/hooks/useAuth";
import { RoleGuard } from "@/components/RoleGuard";
import { firestoreClient } from "@/lib/firestore-client";
import { MedicationReminderWidget } from "@/components/MedicationReminderWidget";
import { OrderTimeline } from "@/components/OrderTimeline";
import { OrderGroupTimeline } from "@/components/OrderGroupTimeline";
import { DeliveryMap } from "@/components/DeliveryMap";
import { PatientAddressHeader } from "@/components/PatientAddressHeader";
import { customerPrice } from "@/lib/pricing";
import {
  ArrowRight, Star, Pill, MessageSquare, Siren, PhoneCall, Search,
  Home, type LucideIcon,
} from "lucide-react";
import tileAppt from "@/assets/tile-book-appointment.png";
import tileMed from "@/assets/tile-order-medicine.png";
import tileRx from "@/assets/tile-upload-prescription.png";


export const Route = createFileRoute("/dashboard/patient/")({
  head: () => ({ meta: [{ title: "Dashboard — HealthReachCare" }] }),
  component: () => (
    <RoleGuard allow="patient">
      <PatientDashboard />
    </RoleGuard>
  ),
});

interface OrderRow {
  id: string;
  order_group_id: string | null;
  status: string;
  total_amount: number | string;
  created_at: string;
  pharmacy_id: string;
  medication_name: string;
  quantity: number;
}

const ACTION_CARDS: Array<{ title: string; subtitle?: string; img?: string; icon?: LucideIcon; to: string; bg: string }> = [
  { title: "Order Medication", subtitle: "Get your prescriptions filled and delivered to your location.", img: tileMed, to: "/dashboard/patient/medications", bg: "bg-emerald-50 text-emerald-950 border-emerald-100" },
  { title: "Book Doctor Appointment", subtitle: "Find verified doctors and book your consultation.", img: tileAppt, to: "/dashboard/patient/find", bg: "bg-blue-50 text-blue-950 border-blue-100" },
  { title: "Request Homecare Services", subtitle: "Get professional homecare support for you or your loved ones.", icon: Home, to: "/dashboard/patient/homecare", bg: "bg-purple-50 text-purple-950 border-purple-100" },
  { title: "View Prescriptions", subtitle: "Access and manage your prescriptions.", img: tileRx, to: "/dashboard/patient/prescriptions", bg: "bg-amber-50 text-amber-950 border-amber-100" },
];


function PatientDashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const userId = user?.id;
  const firstName = profile?.full_name?.split(" ")[0] || "";
  usePatientLocationBroadcaster({ userId });
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [pharmaciesById, setPharmaciesById] = useState<Record<string, string>>({});
  const [driverName, setDriverName] = useState<string>("");
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [mapPickup, setMapPickup] = useState<string | null>(null);
  const [mapDropoff, setMapDropoff] = useState<string | null>(null);
  const [pickupCode, setPickupCode] = useState<string | null>(null);
  const [deliveryCode, setDeliveryCode] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    async function load() {
      const { data } = await firestoreClient
        .from("orders")
        .select("id, order_group_id, status, total_amount, created_at, pharmacy_id, medication_name, quantity")
        .eq("patient_id", userId)
        .eq("is_demo", false)
        .order("created_at", { ascending: false })
        .limit(5);
      if (cancelled) return;
      const list = (data ?? []) as OrderRow[];
      setOrders(list);
      const active = list.find((o) => !["delivered", "cancelled"].includes(o.status));
      setActiveOrderId(active?.id ?? null);
      setActiveGroupId(active?.order_group_id ?? null);

      const ids = Array.from(new Set(list.map((o) => o.pharmacy_id))).filter(Boolean);
      if (ids.length) {
        const { data: profs } = await firestoreClient
          .from("profiles")
          .select("user_id, organization_name, full_name")
          .in("user_id", ids);
        if (cancelled) return;
        const map: Record<string, string> = {};
        ((profs ?? []) as Array<{ user_id: string; organization_name: string | null; full_name: string | null }>)
          .forEach((pharmacy) => { map[pharmacy.user_id] = pharmacy.organization_name || pharmacy.full_name || "Pharmacy"; });
        setPharmaciesById(map);
      }

      // Driver name + map endpoints for active order
      if (active?.id) {
        const [{ data: del }, { data: ordRow }] = await Promise.all([
          firestoreClient.from("deliveries").select("driver_id, delivery_address, pickup_code, delivery_code").eq("order_id", active.id).maybeSingle(),
          firestoreClient.from("orders").select("delivery_address, pharmacy_id").eq("id", active.id).maybeSingle(),
        ]);
        if (cancelled) return;
        setMapDropoff((ordRow?.delivery_address as string) || (del?.delivery_address as string) || null);
        setPickupCode((del as { pickup_code?: string | null } | null)?.pickup_code ?? null);
        setDeliveryCode((del as { delivery_code?: string | null } | null)?.delivery_code ?? null);
        if (ordRow?.pharmacy_id) {
          const { data: pharm } = await firestoreClient.from("pharmacy_directory" as never).select("address").eq("user_id", ordRow.pharmacy_id).maybeSingle() as { data: { address: string | null } | null };
          if (!cancelled) setMapPickup((pharm?.address as string) || null);
        }
        if (del?.driver_id) {
          const { data: dp } = await firestoreClient.from("profiles").select("full_name").eq("user_id", del.driver_id).maybeSingle();
          if (!cancelled) setDriverName(dp?.full_name ?? "");
        } else if (!cancelled) {
          setDriverName("");
        }
      } else if (!cancelled) {
        setDriverName(""); setMapPickup(null); setMapDropoff(null); setPickupCode(null); setDeliveryCode(null);
      }
    }
    load();

    // Realtime — orders + deliveries
    const ch = firestoreClient
      .channel(`patient-dash-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `patient_id=eq.${userId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, load)
      .subscribe();

    return () => { cancelled = true; firestoreClient.removeChannel(ch); };
  }, [userId]);

  const driverInitial = (driverName || "?").charAt(0).toUpperCase();

  // Map latest active order status → tracker index
  const STATUS_STEP: Record<string, number> = {
    pending: 0, accepted: 1, preparing: 1, ready: 2, out_for_delivery: 3, delivered: 4,
  };
  const latestActive = orders.find((o) => !["delivered", "cancelled"].includes(o.status));
  const activeStepIdx = latestActive ? (STATUS_STEP[latestActive.status] ?? 0) : -1;


  return (
    <div className="bg-background min-h-screen overflow-x-hidden">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        <div className="space-y-6">
            <section className="rounded-3xl bg-emerald-800 p-5 text-white shadow-sm sm:p-8">
              <div className="flex flex-col items-start gap-5">
                <div className="w-full">
                  <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                    Welcome, {firstName || "Patient"} <span aria-hidden="true">👋</span>
                  </h1>
                  <p className="mt-2 max-w-lg text-sm text-white/90">Your health is our priority. Let's take care of it today.</p>
                </div>
                <PatientAddressHeader embedded />
              </div>
            </section>

            {/* Action cards */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {ACTION_CARDS.map((c) => (
                <Link
                  key={c.title}
                  to={c.to}
                  className={`group rounded-3xl ${c.bg} p-3 sm:p-5 border min-w-0 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 flex flex-col`}
                >
                  {c.img ? (
                    <img src={c.img} alt="" width={96} height={96} loading="lazy" className="h-16 w-16 sm:h-24 sm:w-24 object-contain mb-2 self-center" />
                  ) : c.icon ? (
                    <div className="h-16 w-16 sm:h-24 sm:w-24 rounded-2xl bg-white/60 mb-2 self-center flex items-center justify-center">
                      <c.icon className="h-10 w-10 sm:h-12 sm:w-12 text-current" strokeWidth={1.5} />
                    </div>
                  ) : null}
                  <p className="text-sm font-bold leading-tight break-words">{c.title}</p>
                  {c.subtitle && (
                    <p className="text-[11px] text-current/70 mt-0.5">{c.subtitle}</p>
                  )}
                  <ArrowRight className="h-4 w-4 text-current/70 mt-2 group-hover:translate-x-1 transition-transform" />
                </Link>
              ))}
            </div>

            <MedicationReminderWidget />

            {/* Delivery Tracker */}
            <div className="rounded-3xl bg-card border border-border p-4 sm:p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
                <div className="flex min-w-0 items-center gap-3">
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
                    activeGroupId ? (
                      <OrderGroupTimeline orderGroupId={activeGroupId} deliveryCode={deliveryCode} />
                    ) : (
                      <OrderTimeline orderId={activeOrderId} initialOrderStatus={latestActive?.status ?? null} />
                    )
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      No active order. Waiting for your next order to start tracking.
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

              {activeOrderId && (pickupCode || deliveryCode) && (
                <div className="mt-5 grid sm:grid-cols-2 gap-3">
                  {pickupCode && (
                    <div className="rounded-2xl border border-healthcare-sky/30 bg-healthcare-sky/10 p-4">
                      <p className="text-[10px] uppercase tracking-widest font-bold text-healthcare-sky">Pharmacy Pickup Code</p>
                      <p className="text-2xl sm:text-3xl font-bold font-mono text-foreground tracking-[0.2em] sm:tracking-[0.4em] break-all mt-1">{pickupCode}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">Share with the driver at pickup.</p>
                    </div>
                  )}
                  {deliveryCode && (
                    <div className="rounded-2xl border border-healthcare-green/30 bg-healthcare-green/10 p-4">
                      <p className="text-[10px] uppercase tracking-widest font-bold text-healthcare-green">Your Delivery Code</p>
                      <p className="text-2xl sm:text-3xl font-bold font-mono text-foreground tracking-[0.2em] sm:tracking-[0.4em] break-all mt-1">{deliveryCode}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">Give this to the driver on arrival.</p>
                    </div>
                  )}
                </div>
              )}
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
                      const medName = o.medication_name;
                      const qty = o.quantity;
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
            {/* Emergency and support */}
            <section className="grid gap-5 lg:grid-cols-2">
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
            </section>
        </div>
      </div>
    </div>
  );
}
