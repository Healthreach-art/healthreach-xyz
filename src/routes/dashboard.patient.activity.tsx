import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { firestoreClient } from "@/lib/firestore-client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft,  ClipboardList, Pill, FileText, Activity, Heart, Calendar, ShoppingBag } from "lucide-react";

export const Route = createFileRoute("/dashboard/patient/activity")({
  head: () => ({ meta: [{ title: "Health Records — HealthReachCare" }] }),
  component: () => <RoleGuard allow="patient"><Page /></RoleGuard>,
});

interface Rx { id: string; medication_name: string; doctor_name: string; dosage: string; created_at: string; is_active: boolean }
interface Order { id: string; medication_name: string; quantity: number; status: string; created_at: string }
interface Reminder { id: string; medication_name: string; dosage: string; frequency: string; is_chronic: boolean }

function Page() {
  const { user } = useAuth();
  const [rx, setRx] = useState<Rx[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [r1, r2, r3] = await Promise.all([
        firestoreClient.from("prescriptions").select("id, medication_name, doctor_name, dosage, created_at, is_active").eq("patient_id", user.id).order("created_at", { ascending: false }),
        firestoreClient.from("orders").select("id, medication_name, quantity, status, created_at").eq("patient_id", user.id).order("created_at", { ascending: false }).limit(20),
        firestoreClient.from("medication_reminders").select("id, medication_name, dosage, frequency, is_chronic").eq("user_id", user.id).eq("active", true),
      ]);
      setRx((r1.data ?? []) as Rx[]);
      setOrders((r2.data ?? []) as Order[]);
      setReminders((r3.data ?? []) as Reminder[]);
    })();
  }, [user]);

  const chronic = reminders.filter((r) => r.is_chronic);
  const deliveredCount = orders.filter((o) => o.status === "delivered").length;

  const stats = [
    { label: "Active prescriptions", value: rx.filter((r) => r.is_active).length, icon: FileText, color: "text-primary", bg: "bg-primary/10" },
    { label: "Chronic medications", value: chronic.length, icon: Heart, color: "text-rose-600", bg: "bg-rose-100" },
    { label: "Medication reminders", value: reminders.length, icon: Calendar, color: "text-healthcare-teal", bg: "bg-healthcare-mint/40" },
    { label: "Lifetime orders", value: deliveredCount, icon: ShoppingBag, color: "text-healthcare-green", bg: "bg-healthcare-green/15" },
  ];

  return (
    <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
      <Link to="/dashboard/patient" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to Dashboard
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-primary" /> Health Records
        </h1>
        <p className="text-sm text-muted-foreground">Your prescriptions, chronic medications, and order history at a glance.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-card p-4">
            <div className={`h-9 w-9 rounded-xl ${s.bg} flex items-center justify-center mb-2`}>
              <s.icon className={`h-4 w-4 ${s.color}`} />
            </div>
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-2xl font-bold text-foreground">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> Prescriptions</h2>
          <Link to="/dashboard/patient/prescriptions" className="text-xs text-primary font-semibold hover:underline">Manage →</Link>
        </div>
        {rx.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No prescriptions on file yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {rx.slice(0, 6).map((r) => (
              <div key={r.id} className="py-3 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center"><Pill className="h-4 w-4 text-primary" /></div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground">{r.medication_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.dosage || "—"} • Dr {r.doctor_name || "Unknown"} • {new Date(r.created_at).toLocaleDateString("en-ZA", { dateStyle: "medium" })}
                  </p>
                </div>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${r.is_active ? "bg-healthcare-green/15 text-healthcare-green" : "bg-muted text-muted-foreground"}`}>
                  {r.is_active ? "Active" : "Inactive"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Heart className="h-5 w-5 text-rose-600" /> Chronic medication</h2>
          <Link to="/dashboard/patient/reminders" className="text-xs text-primary font-semibold hover:underline">Reminders →</Link>
        </div>
        {chronic.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No chronic medications tracked.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {chronic.map((c) => (
              <div key={c.id} className="rounded-xl border border-border p-3">
                <p className="font-semibold text-sm">{c.medication_name}</p>
                <p className="text-xs text-muted-foreground">{c.dosage} • {c.frequency}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Activity className="h-5 w-5 text-healthcare-green" /> Order history</h2>
          <Link to="/dashboard/patient/orders" className="text-xs text-primary font-semibold hover:underline">All orders →</Link>
        </div>
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No orders yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {orders.slice(0, 8).map((o) => (
              <div key={o.id} className="py-3 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">{o.medication_name}</p>
                  <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString("en-ZA", { dateStyle: "medium" })} • Qty {o.quantity}</p>
                </div>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{o.status.replace(/_/g, " ")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
