import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Users, ShieldCheck, DollarSign, Activity, CheckCircle, XCircle,
  Building2, Truck, Pill, BarChart3, FileText, AlertTriangle, Settings,
  Loader2, Crown, ShieldOff, TrendingUp, MessageSquare, Star, RotateCcw,
  PackageX, Stethoscope, ShoppingCart, CreditCard, Megaphone, Eye, Send,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { broadcastNotification, seedJohannesburgDemo } from "@/lib/admin.functions";
import { OrderChatDialog } from "@/components/OrderChatDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { RoleGuard } from "@/components/RoleGuard";

export const Route = createFileRoute("/dashboard/admin")({
  head: () => ({ meta: [{ title: "Admin Dashboard — HEALTHREACH" }] }),
  component: () => <RoleGuard allow="admin"><AdminDashboard /></RoleGuard>,
});

type TabId =
  | "overview" | "analytics" | "approvals" | "pharmacies" | "drivers"
  | "orders" | "payments" | "refunds" | "prescriptions" | "complaints" | "users" | "broadcasts" | "reports";
type AppRole = "patient" | "pharmacy" | "hospital" | "driver" | "admin";
type ApprovalStatus = "pending" | "approved" | "rejected" | "suspended" | "under_review" | "expired";

interface UserRow {
  user_id: string;
  full_name: string;
  email: string;
  organization_name: string | null;
  approval_status: ApprovalStatus | null;
  created_at: string;
  role: AppRole | null;
  phone?: string | null;
}

interface OrderRow {
  id: string;
  patient_id: string;
  pharmacy_id: string;
  medication_name: string;
  quantity: number;
  total_amount: number;
  delivery_fee: number;
  status: string;
  created_at: string;
}

interface PaymentRow {
  id: string;
  order_id: string;
  patient_id: string;
  amount: number;
  total_paid: number | null;
  platform_fee: number | null;
  pharmacy_amount: number | null;
  status: string;
  refund_status: string | null;
  refund_amount: number | null;
  invoice_number: string | null;
  payment_method: string;
  created_at: string;
}

interface DeliveryRow {
  id: string;
  order_id: string;
  driver_id: string | null;
  status: string;
  created_at: string;
}

interface ComplaintRow {
  id: string;
  user_id: string;
  order_id: string | null;
  subject: string;
  description: string;
  category: string;
  status: string;
  admin_response: string;
  created_at: string;
}

interface RatingRow {
  id: string;
  target_id: string;
  target_type: "pharmacy" | "driver";
  stars: number;
  comment: string;
  created_at: string;
}

interface PrescriptionRow {
  id: string;
  patient_id: string;
  hospital_id: string;
  medication_name: string;
  doctor_name: string;
  dosage: string;
  is_active: boolean;
  created_at: string;
}

const roleColors: Record<string, string> = {
  patient: "bg-primary/10 text-primary",
  pharmacy: "bg-healthcare-teal/20 text-healthcare-teal",
  hospital: "bg-healthcare-green/20 text-healthcare-green",
  driver: "bg-healthcare-sky/20 text-healthcare-sky",
  admin: "bg-accent text-accent-foreground",
};

const statusColor = (s: string) => {
  if (["completed", "delivered", "approved", "resolved"].includes(s)) return "bg-healthcare-green/20 text-healthcare-green";
  if (["failed", "rejected", "cancelled"].includes(s)) return "bg-destructive/10 text-destructive";
  if (["refunded", "closed"].includes(s)) return "bg-muted text-muted-foreground";
  return "bg-accent text-primary";
};

function AdminDashboard() {
  const { profile, role, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [complaints, setComplaints] = useState<ComplaintRow[]>([]);
  const [ratings, setRatings] = useState<RatingRow[]>([]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoApprove, setAutoApprove] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("admin:autoApprove") === "1";
  });
  const [confirmRole, setConfirmRole] = useState<{ user: UserRow; action: "promote" | "demote" } | null>(null);
  const [refundConfirm, setRefundConfirm] = useState<PaymentRow | null>(null);
  const [complaintReply, setComplaintReply] = useState<ComplaintRow | null>(null);
  const [replyText, setReplyText] = useState("");
  const [chatOrderId, setChatOrderId] = useState<string | null>(null);
  const [broadcastAudience, setBroadcastAudience] = useState<"all" | "patient" | "pharmacy" | "driver" | "hospital">("all");
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [broadcastSending, setBroadcastSending] = useState(false);
  const broadcastFn = useServerFn(broadcastNotification);
  const seedFn = useServerFn(seedJohannesburgDemo);
  const [seeding, setSeeding] = useState(false);

  async function runSeed() {
    setSeeding(true);
    try {
      const res = await seedFn({} as never);
      toast.success(`Seeded ${res.pharmacies} pharmacies, ${res.drivers} drivers, +${res.medications} medications. Demo password: ${res.password}`);
      await loadAll();
    } catch (e: any) {
      toast.error(e?.message || "Seed failed");
    } finally { setSeeding(false); }
  }

  useEffect(() => {
    if (authLoading) return;
    if (role && role !== "admin") {
      toast.error("Admin access required");
      navigate({ to: `/dashboard/${role}` as any });
    } else if (!role) {
      navigate({ to: "/login", search: { denied: "admin" } as any });
    }
  }, [role, authLoading, navigate]);

  async function loadAll() {
    const [
      { data: profs }, { data: roleRows }, { data: ords }, { data: pays },
      { data: dels }, { data: comps }, { data: rates }, { data: pres },
    ] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("deliveries").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("complaints").select("*").order("created_at", { ascending: false }),
      supabase.from("ratings").select("*").order("created_at", { ascending: false }),
      supabase.from("prescriptions").select("*").order("created_at", { ascending: false }).limit(500),
    ]);
    const roleMap = new Map((roleRows ?? []).map((r) => [r.user_id, r.role as AppRole]));
    setUsers((profs ?? []).map((p: any) => ({
      user_id: p.user_id, full_name: p.full_name, email: p.email,
      organization_name: p.organization_name, approval_status: p.approval_status,
      created_at: p.created_at, role: roleMap.get(p.user_id) ?? null, phone: p.phone,
    })));
    setOrders((ords ?? []) as any);
    setPayments((pays ?? []) as any);
    setDeliveries((dels ?? []) as any);
    setComplaints((comps ?? []) as any);
    setRatings((rates ?? []) as any);
    setPrescriptions((pres ?? []) as any);
  }

  useEffect(() => {
    setLoading(true);
    loadAll().finally(() => setLoading(false));
    const channel = supabase
      .channel("admin-realtime")
      .on("postgres_changes", { event: "*", schema: "public" }, () => loadAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const userMap = useMemo(() => new Map(users.map((u) => [u.user_id, u])), [users]);
  const nameOf = (id: string) => userMap.get(id)?.full_name || userMap.get(id)?.organization_name || id.slice(0, 8);

  async function updateApproval(userId: string, status: ApprovalStatus) {
    setUpdatingId(userId);
    const { error } = await supabase.from("profiles").update({ approval_status: status }).eq("user_id", userId);
    setUpdatingId(null);
    if (error) return toast.error(error.message);
    toast.success(`User ${status}`);
  }

  async function promoteToAdmin(userId: string) {
    setUpdatingId(userId);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
    setUpdatingId(null);
    if (error) return toast.error(error.message);
    toast.success("Promoted to admin");
  }

  async function demoteFromAdmin(userId: string) {
    setUpdatingId(userId);
    const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
    setUpdatingId(null);
    if (error) return toast.error(error.message);
    toast.success("Admin revoked");
  }

  async function processRefund(p: PaymentRow) {
    const { error } = await supabase.from("payments")
      .update({ refund_status: "refunded", refund_amount: p.total_paid ?? p.amount, status: "refunded" } as any)
      .eq("id", p.id);
    if (error) return toast.error(error.message);
    await supabase.from("orders").update({ status: "cancelled" } as any).eq("id", p.order_id);
    toast.success("Refund processed");
    setRefundConfirm(null);
  }

  async function updateComplaintStatus(id: string, status: string, response?: string) {
    const patch: any = { status };
    if (response !== undefined) patch.admin_response = response;
    const { error } = await supabase.from("complaints").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Complaint ${status}`);
    setComplaintReply(null);
    setReplyText("");
  }

  function toggleAutoApprove(next: boolean) {
    setAutoApprove(next);
    localStorage.setItem("admin:autoApprove", next ? "1" : "0");
    toast.success(next ? "Auto-approve on" : "Auto-approve off");
  }

  useEffect(() => {
    if (!autoApprove) return;
    users.filter((u) => u.approval_status === "pending" && u.role && ["pharmacy", "hospital", "driver"].includes(u.role))
      .forEach((u) => updateApproval(u.user_id, "approved"));
  }, [autoApprove, users.length]);

  // ===== Derived analytics =====
  const pharmacies = users.filter((u) => u.role === "pharmacy");
  const drivers = users.filter((u) => u.role === "driver");
  const patients = users.filter((u) => u.role === "patient");
  const pending = users.filter((u) => u.approval_status === "pending" && u.role && ["pharmacy", "hospital", "driver"].includes(u.role));

  const completedPays = payments.filter((p) => p.status === "completed");
  const gmv = completedPays.reduce((s, p) => s + Number(p.total_paid ?? p.amount), 0);
  const platformRevenue = completedPays.reduce((s, p) => s + Number(p.platform_fee ?? 0), 0);
  const refunds = payments.filter((p) => p.refund_status === "refunded");
  const refundTotal = refunds.reduce((s, p) => s + Number(p.refund_amount ?? 0), 0);
  const failedDeliveries = deliveries.filter((d) => ["failed", "cancelled"].includes(d.status)).length;
  const activeOrders = orders.filter((o) => !["delivered", "cancelled", "completed", "refunded"].includes(o.status)).length;

  const since = Date.now() - 7 * 86400000;
  const activeUsers = new Set(orders.filter((o) => new Date(o.created_at).getTime() > since).map((o) => o.patient_id)).size;

  // Driver performance
  const driverStats = drivers.map((d) => {
    const myDels = deliveries.filter((x) => x.driver_id === d.user_id);
    const completed = myDels.filter((x) => x.status === "delivered").length;
    const failed = myDels.filter((x) => ["failed", "cancelled"].includes(x.status)).length;
    const dRatings = ratings.filter((r) => r.target_type === "driver" && r.target_id === d.user_id);
    const avg = dRatings.length ? dRatings.reduce((s, r) => s + r.stars, 0) / dRatings.length : 0;
    return { driver: d, total: myDels.length, completed, failed, avgRating: avg, ratingCount: dRatings.length };
  });

  // Pharmacy ratings
  const pharmacyStats = pharmacies.map((p) => {
    const pRatings = ratings.filter((r) => r.target_type === "pharmacy" && r.target_id === p.user_id);
    const avg = pRatings.length ? pRatings.reduce((s, r) => s + r.stars, 0) / pRatings.length : 0;
    const ordersFulfilled = orders.filter((o) => o.pharmacy_id === p.user_id && o.status === "delivered").length;
    return { pharmacy: p, avgRating: avg, ratingCount: pRatings.length, ordersFulfilled };
  });

  const tabs: { id: TabId; label: string; icon: typeof Users; badge?: number }[] = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "analytics", label: "Analytics", icon: TrendingUp },
    { id: "approvals", label: "Approvals", icon: CheckCircle, badge: pending.length },
    { id: "pharmacies", label: "Pharmacies", icon: Pill },
    { id: "drivers", label: "Drivers", icon: Truck },
    { id: "orders", label: "Orders", icon: ShoppingCart },
    { id: "payments", label: "Payments", icon: CreditCard },
    { id: "refunds", label: "Refunds", icon: RotateCcw, badge: refunds.length },
    { id: "prescriptions", label: "Prescriptions", icon: Stethoscope },
    { id: "complaints", label: "Complaints", icon: MessageSquare, badge: complaints.filter((c) => c.status === "open").length },
    { id: "users", label: "Users", icon: Users },
    { id: "broadcasts", label: "Broadcasts", icon: Megaphone },
    { id: "reports", label: "Reports", icon: FileText },
  ];

  function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
    const esc = (v: string | number) => /[",\n]/.test(String(v ?? "")) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? "");
    const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    toast.success(`${filename} downloaded`);
  }

  if (authLoading || loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="container-narrow px-4 sm:px-6 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Admin Master Control</h1>
          <p className="text-sm text-muted-foreground">Welcome, {profile?.full_name || "Administrator"}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => navigate({ to: "/dashboard/admin/live" as any })}>
            <Activity className="h-4 w-4 mr-1" /> Live map
          </Button>
          <Button variant="outline" size="sm" onClick={runSeed} disabled={seeding}>
            {seeding ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Pill className="h-4 w-4 mr-1" />}
            {seeding ? "Seeding…" : "Seed JHB demo"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}><Settings className="h-4 w-4 mr-1" /> Settings</Button>
          <Button variant="outline" size="sm" onClick={signOut}>Sign Out</Button>
        </div>
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
            {tab.badge ? (
              <span className="ml-1 flex h-5 min-w-5 px-1 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
                {tab.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {activeTab === "overview" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: DollarSign, label: "Total GMV", value: `R ${gmv.toFixed(0)}`, color: "text-healthcare-green" },
            { icon: TrendingUp, label: "Platform Revenue", value: `R ${platformRevenue.toFixed(0)}`, color: "text-primary" },
            { icon: Activity, label: "Active Orders", value: activeOrders, color: "text-healthcare-teal" },
            { icon: Users, label: "Active Users (7d)", value: activeUsers, color: "text-primary" },
            { icon: Pill, label: "Pharmacies", value: pharmacies.length, color: "text-healthcare-teal" },
            { icon: Truck, label: "Drivers", value: drivers.length, color: "text-healthcare-sky" },
            { icon: PackageX, label: "Failed Deliveries", value: failedDeliveries, color: "text-destructive" },
            { icon: RotateCcw, label: "Refunds", value: `R ${refundTotal.toFixed(0)}`, color: "text-destructive" },
          ].map((s) => (
            <div key={s.label} className="healthcare-card p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-xl font-bold text-foreground">{s.value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ANALYTICS */}
      {activeTab === "analytics" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="healthcare-card p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Truck className="h-5 w-5" /> Driver Performance</h2>
            <div className="space-y-3">
              {driverStats.length === 0 && <p className="text-sm text-muted-foreground">No drivers yet.</p>}
              {driverStats.map((d) => (
                <div key={d.driver.user_id} className="rounded-lg border border-border p-3">
                  <div className="flex justify-between items-start">
                    <p className="font-medium text-foreground">{d.driver.full_name || d.driver.email}</p>
                    <span className="flex items-center gap-1 text-sm">
                      <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                      {d.avgRating.toFixed(1)} ({d.ratingCount})
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                    <div><span className="text-muted-foreground">Total: </span>{d.total}</div>
                    <div className="text-healthcare-green">Done: {d.completed}</div>
                    <div className="text-destructive">Failed: {d.failed}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="healthcare-card p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Pill className="h-5 w-5" /> Pharmacy Ratings</h2>
            <div className="space-y-3">
              {pharmacyStats.length === 0 && <p className="text-sm text-muted-foreground">No pharmacies yet.</p>}
              {pharmacyStats.map((p) => (
                <div key={p.pharmacy.user_id} className="rounded-lg border border-border p-3">
                  <div className="flex justify-between items-start">
                    <p className="font-medium text-foreground">{p.pharmacy.organization_name || p.pharmacy.full_name}</p>
                    <span className="flex items-center gap-1 text-sm">
                      <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                      {p.avgRating.toFixed(1)} ({p.ratingCount})
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Orders fulfilled: {p.ordersFulfilled}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* APPROVALS */}
      {activeTab === "approvals" && (
        <div className="healthcare-card p-6">
          <h2 className="text-lg font-semibold mb-4">Pending Approvals ({pending.length})</h2>
          {pending.length === 0 && <p className="text-sm text-muted-foreground">No pending approvals.</p>}
          <div className="space-y-3">
            {pending.map((u) => (
              <div key={u.user_id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="font-medium">{u.full_name || u.email}</p>
                  <p className="text-xs text-muted-foreground capitalize">{u.role} • {u.email}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={updatingId === u.user_id} onClick={() => updateApproval(u.user_id, "approved")}>
                    <CheckCircle className="h-3 w-3" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" className="text-destructive" onClick={() => updateApproval(u.user_id, "rejected")}>
                    <XCircle className="h-3 w-3" /> Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PHARMACIES */}
      {activeTab === "pharmacies" && (
        <div className="healthcare-card p-6">
          <h2 className="text-lg font-semibold mb-4">Pharmacies ({pharmacies.length})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground">
                <th className="pb-2">Pharmacy</th><th className="pb-2">Email</th><th className="pb-2">Status</th>
                <th className="pb-2">Rating</th><th className="pb-2">Orders</th><th className="pb-2">Actions</th>
              </tr></thead>
              <tbody>
                {pharmacies.map((p) => {
                  const stats = pharmacyStats.find((s) => s.pharmacy.user_id === p.user_id);
                  return (
                    <tr key={p.user_id} className="border-b last:border-0">
                      <td className="py-2 font-medium">{p.organization_name || p.full_name}</td>
                      <td className="py-2 text-muted-foreground">{p.email}</td>
                      <td className="py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(p.approval_status || "")}`}>{p.approval_status}</span></td>
                      <td className="py-2">{stats?.avgRating.toFixed(1)} ({stats?.ratingCount})</td>
                      <td className="py-2">{stats?.ordersFulfilled}</td>
                      <td className="py-2">
                        <PharmacyReviewDialog
                          pharmacyId={p.user_id}
                          pharmacyName={p.organization_name || p.full_name}
                          currentStatus={(p.approval_status as ApprovalStatus) || "pending"}
                          onChanged={(status) => updateApproval(p.user_id, status)}
                          updating={updatingId === p.user_id}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DRIVERS */}
      {activeTab === "drivers" && (
        <div className="healthcare-card p-6">
          <h2 className="text-lg font-semibold mb-4">Drivers ({drivers.length})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground">
                <th className="pb-2">Driver</th><th className="pb-2">Status</th><th className="pb-2">Deliveries</th>
                <th className="pb-2">Completed</th><th className="pb-2">Failed</th><th className="pb-2">Rating</th><th className="pb-2">Actions</th>
              </tr></thead>
              <tbody>
                {driverStats.map((d) => (
                  <tr key={d.driver.user_id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{d.driver.full_name || d.driver.email}</td>
                    <td className="py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(d.driver.approval_status || "")}`}>{d.driver.approval_status}</span></td>
                    <td className="py-2">{d.total}</td>
                    <td className="py-2 text-healthcare-green">{d.completed}</td>
                    <td className="py-2 text-destructive">{d.failed}</td>
                    <td className="py-2">⭐ {d.avgRating.toFixed(1)}</td>
                    <td className="py-2 flex gap-1">
                      {d.driver.approval_status !== "approved" && <Button size="sm" variant="outline" className="h-7" onClick={() => updateApproval(d.driver.user_id, "approved")}>Approve</Button>}
                      {d.driver.approval_status === "approved" && <Button size="sm" variant="outline" className="h-7 text-destructive" onClick={() => updateApproval(d.driver.user_id, "rejected")}>Suspend</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ORDERS */}
      {activeTab === "orders" && (
        <div className="healthcare-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">All Orders ({orders.length})</h2>
            <Button size="sm" variant="outline" onClick={() => downloadCsv("orders.csv",
              ["ID","Patient","Pharmacy","Medication","Qty","Total","Status","Date"],
              orders.map((o) => [o.id, nameOf(o.patient_id), nameOf(o.pharmacy_id), o.medication_name, o.quantity, o.total_amount, o.status, o.created_at]))}>
              Export CSV
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground">
                <th className="pb-2">Order</th><th className="pb-2">Patient</th><th className="pb-2">Pharmacy</th>
                <th className="pb-2">Medication</th><th className="pb-2">Total</th><th className="pb-2">Status</th><th className="pb-2">Date</th><th className="pb-2"></th>
              </tr></thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b last:border-0">
                    <td className="py-2 font-mono text-xs">{o.id.slice(0, 8)}</td>
                    <td className="py-2">{nameOf(o.patient_id)}</td>
                    <td className="py-2">{nameOf(o.pharmacy_id)}</td>
                    <td className="py-2">{o.medication_name} ×{o.quantity}</td>
                    <td className="py-2 font-semibold">R {Number(o.total_amount).toFixed(2)}</td>
                    <td className="py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(o.status)}`}>{o.status.replace(/_/g, " ")}</span></td>
                    <td className="py-2 text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</td>
                    <td className="py-2">
                      <Button size="sm" variant="outline" className="h-7" onClick={() => setChatOrderId(o.id)}>
                        <Eye className="h-3 w-3" /> Chat
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PAYMENTS */}
      {activeTab === "payments" && (
        <div className="healthcare-card p-6">
          <h2 className="text-lg font-semibold mb-4">Payments ({payments.length})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground">
                <th className="pb-2">Invoice</th><th className="pb-2">Patient</th><th className="pb-2">Amount</th>
                <th className="pb-2">Platform Fee</th><th className="pb-2">Method</th><th className="pb-2">Status</th><th className="pb-2">Actions</th>
              </tr></thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2 font-mono text-xs">{p.invoice_number || p.id.slice(0, 8)}</td>
                    <td className="py-2">{nameOf(p.patient_id)}</td>
                    <td className="py-2 font-semibold">R {Number(p.total_paid ?? p.amount).toFixed(2)}</td>
                    <td className="py-2 text-muted-foreground">R {Number(p.platform_fee ?? 0).toFixed(2)}</td>
                    <td className="py-2 capitalize">{p.payment_method}</td>
                    <td className="py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(p.status)}`}>{p.status}</span></td>
                    <td className="py-2">
                      {p.status === "completed" && p.refund_status !== "refunded" && (
                        <Button size="sm" variant="outline" className="h-7 text-destructive" onClick={() => setRefundConfirm(p)}>Refund</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* REFUNDS */}
      {activeTab === "refunds" && (
        <div className="healthcare-card p-6">
          <h2 className="text-lg font-semibold mb-4">Refunds ({refunds.length}) — Total: R {refundTotal.toFixed(2)}</h2>
          <div className="space-y-2">
            {refunds.length === 0 && <p className="text-sm text-muted-foreground">No refunds yet.</p>}
            {refunds.map((p) => (
              <div key={p.id} className="flex justify-between items-center rounded-lg border p-3">
                <div>
                  <p className="font-medium">{p.invoice_number || p.id.slice(0, 8)}</p>
                  <p className="text-xs text-muted-foreground">{nameOf(p.patient_id)} • {new Date(p.created_at).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">R {Number(p.refund_amount ?? 0).toFixed(2)}</p>
                  <span className="text-xs text-destructive">refunded</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PRESCRIPTIONS */}
      {activeTab === "prescriptions" && (
        <div className="healthcare-card p-6">
          <h2 className="text-lg font-semibold mb-4">Prescriptions ({prescriptions.length})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground">
                <th className="pb-2">Patient</th><th className="pb-2">Hospital</th><th className="pb-2">Medication</th>
                <th className="pb-2">Doctor</th><th className="pb-2">Dosage</th><th className="pb-2">Active</th><th className="pb-2">Date</th>
              </tr></thead>
              <tbody>
                {prescriptions.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2">{nameOf(p.patient_id)}</td>
                    <td className="py-2">{nameOf(p.hospital_id)}</td>
                    <td className="py-2 font-medium">{p.medication_name}</td>
                    <td className="py-2">{p.doctor_name}</td>
                    <td className="py-2">{p.dosage}</td>
                    <td className="py-2">{p.is_active ? "✅" : "❌"}</td>
                    <td className="py-2 text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* COMPLAINTS */}
      {activeTab === "complaints" && (
        <div className="healthcare-card p-6">
          <h2 className="text-lg font-semibold mb-4">Complaints ({complaints.length})</h2>
          {complaints.length === 0 && <p className="text-sm text-muted-foreground">No complaints filed.</p>}
          <div className="space-y-3">
            {complaints.map((c) => (
              <div key={c.id} className="rounded-lg border border-border p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold">{c.subject}</p>
                    <p className="text-xs text-muted-foreground">From {nameOf(c.user_id)} • {c.category} • {new Date(c.created_at).toLocaleDateString()}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(c.status)}`}>{c.status}</span>
                </div>
                <p className="text-sm mt-2">{c.description}</p>
                {c.admin_response && <p className="text-sm mt-2 p-2 bg-muted rounded">↳ {c.admin_response}</p>}
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="outline" className="h-7" onClick={() => { setComplaintReply(c); setReplyText(c.admin_response || ""); }}>Reply</Button>
                  {c.status !== "resolved" && <Button size="sm" variant="outline" className="h-7" onClick={() => updateComplaintStatus(c.id, "resolved")}>Mark Resolved</Button>}
                  {c.status !== "closed" && <Button size="sm" variant="outline" className="h-7 text-muted-foreground" onClick={() => updateComplaintStatus(c.id, "closed")}>Close</Button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* USERS */}
      {activeTab === "users" && (
        <div className="healthcare-card p-6">
          <h2 className="text-lg font-semibold mb-4">All Users ({users.length})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground">
                <th className="pb-2">User</th><th className="pb-2">Role</th><th className="pb-2">Status</th><th className="pb-2">Actions</th>
              </tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.user_id} className="border-b last:border-0">
                    <td className="py-2"><p className="font-medium">{u.full_name || "—"}</p><p className="text-xs text-muted-foreground">{u.email}</p></td>
                    <td className="py-2">{u.role && <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${roleColors[u.role]}`}>{u.role}</span>}</td>
                    <td className="py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(u.approval_status || "")}`}>{u.approval_status}</span></td>
                    <td className="py-2 flex flex-wrap gap-1">
                      {u.role !== "admin" && <Button size="sm" variant="outline" className="h-7" onClick={() => setConfirmRole({ user: u, action: "promote" })}><Crown className="h-3 w-3" /> Make Admin</Button>}
                      {u.role === "admin" && <Button size="sm" variant="outline" className="h-7 text-destructive" onClick={() => setConfirmRole({ user: u, action: "demote" })}><ShieldOff className="h-3 w-3" /> Demote</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* BROADCASTS */}
      {activeTab === "broadcasts" && (
        <div className="healthcare-card p-6 max-w-2xl">
          <h2 className="text-lg font-semibold mb-1 flex items-center gap-2"><Megaphone className="h-5 w-5 text-primary" /> Broadcast notification</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Sends an in-app notification (and triggers any push/email channels users have enabled) to every account in the selected audience.
          </p>
          <div className="space-y-4">
            <div>
              <Label>Audience</Label>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-2">
                {(["all","patient","pharmacy","driver","hospital"] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setBroadcastAudience(a)}
                    className={`rounded-lg border px-3 py-2 text-sm capitalize transition-colors ${
                      broadcastAudience === a ? "border-primary bg-primary/5 text-primary font-medium" : "border-border hover:border-primary/30"
                    }`}
                  >
                    {a === "all" ? "Everyone" : `${a}s`}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="bcast-title">Title</Label>
              <Input id="bcast-title" value={broadcastTitle} onChange={(e) => setBroadcastTitle(e.target.value)} maxLength={120} placeholder="Scheduled maintenance tonight" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bcast-body">Message</Label>
              <Textarea id="bcast-body" value={broadcastBody} onChange={(e) => setBroadcastBody(e.target.value)} maxLength={1000} rows={4} placeholder="Type your announcement..." />
              <p className="text-[11px] text-muted-foreground text-right">{broadcastBody.length}/1000</p>
            </div>
            <Button
              disabled={broadcastSending || !broadcastTitle.trim() || !broadcastBody.trim()}
              onClick={async () => {
                setBroadcastSending(true);
                try {
                  const res = await broadcastFn({ data: {
                    audience: broadcastAudience,
                    title: broadcastTitle.trim(),
                    body: broadcastBody.trim(),
                  } });
                  toast.success(`Sent to ${res.count} user${res.count === 1 ? "" : "s"}`);
                  setBroadcastTitle("");
                  setBroadcastBody("");
                } catch (e: any) {
                  toast.error(e?.message ?? "Broadcast failed");
                } finally {
                  setBroadcastSending(false);
                }
              }}
            >
              {broadcastSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send broadcast
            </Button>
          </div>
        </div>
      )}


      {/* REPORTS */}
      {activeTab === "reports" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="healthcare-card p-6">
            <h2 className="text-lg font-semibold mb-4">Live Summary</h2>
            <div className="space-y-3">
              {[
                { label: "Total GMV", value: `R ${gmv.toFixed(0)}` },
                { label: "Platform Revenue", value: `R ${platformRevenue.toFixed(0)}` },
                { label: "Refund Total", value: `R ${refundTotal.toFixed(0)}` },
                { label: "Total Orders", value: orders.length },
                { label: "Failed Deliveries", value: failedDeliveries },
                { label: "Open Complaints", value: complaints.filter((c) => c.status === "open").length },
              ].map((m) => (
                <div key={m.label} className="flex justify-between"><span className="text-muted-foreground text-sm">{m.label}</span><span className="font-semibold text-sm">{m.value}</span></div>
              ))}
            </div>
          </div>
          <div className="healthcare-card p-6">
            <h2 className="text-lg font-semibold mb-4">Export</h2>
            <div className="space-y-2">
              <Button variant="outline" className="w-full justify-start" onClick={() => downloadCsv("payments.csv",
                ["Invoice","Patient","Amount","Fee","Status","Date"],
                payments.map((p) => [p.invoice_number || p.id, nameOf(p.patient_id), p.total_paid ?? p.amount, p.platform_fee ?? 0, p.status, p.created_at]))}>
                Financial Report
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => downloadCsv("users.csv",
                ["Name","Email","Role","Status","Joined"],
                users.map((u) => [u.full_name, u.email, u.role ?? "", u.approval_status ?? "", u.created_at]))}>
                Users Report
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => downloadCsv("complaints.csv",
                ["Subject","User","Category","Status","Date"],
                complaints.map((c) => [c.subject, nameOf(c.user_id), c.category, c.status, c.created_at]))}>
                Complaints Report
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Settings */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Admin Settings</DialogTitle><DialogDescription>Platform preferences.</DialogDescription></DialogHeader>
          <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
            <input type="checkbox" checked={autoApprove} onChange={(e) => toggleAutoApprove(e.target.checked)} className="mt-1 h-4 w-4 accent-primary" />
            <div>
              <p className="text-sm font-medium">Auto-approve new partners</p>
              <p className="text-xs text-muted-foreground">Auto-approve pharmacy/hospital/driver signups.</p>
            </div>
          </label>
          <DialogFooter><Button variant="outline" onClick={() => setSettingsOpen(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refund confirmation */}
      <AlertDialog open={!!refundConfirm} onOpenChange={(o) => !o && setRefundConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Issue refund?</AlertDialogTitle>
            <AlertDialogDescription>
              Refund R {Number(refundConfirm?.total_paid ?? refundConfirm?.amount ?? 0).toFixed(2)} for invoice {refundConfirm?.invoice_number || refundConfirm?.id.slice(0, 8)}? This cancels the order.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => refundConfirm && processRefund(refundConfirm)}>Refund</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Complaint reply */}
      <Dialog open={!!complaintReply} onOpenChange={(o) => !o && setComplaintReply(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reply to complaint</DialogTitle><DialogDescription>{complaintReply?.subject}</DialogDescription></DialogHeader>
          <Textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={5} placeholder="Type your response..." />
          <DialogFooter>
            <Button variant="outline" onClick={() => setComplaintReply(null)}>Cancel</Button>
            <Button onClick={() => complaintReply && updateComplaintStatus(complaintReply.id, "in_progress", replyText)}>Send Reply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role change */}
      <AlertDialog open={!!confirmRole} onOpenChange={(o) => !o && setConfirmRole(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmRole?.action === "promote" ? "Promote to admin?" : "Demote admin?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRole?.action === "promote"
                ? `Grant ${confirmRole.user.full_name || confirmRole.user.email} full admin access?`
                : `Remove admin privileges from ${confirmRole?.user.full_name || confirmRole?.user.email}?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (!confirmRole) return;
              confirmRole.action === "promote" ? promoteToAdmin(confirmRole.user.user_id) : demoteFromAdmin(confirmRole.user.user_id);
              setConfirmRole(null);
            }}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Read-only order chat (admin can monitor patient↔pharmacy↔driver conversation) */}
      <OrderChatDialog
        orderId={chatOrderId}
        orderLabel={chatOrderId ? `Order ${chatOrderId.slice(0, 8)}` : undefined}
        onClose={() => setChatOrderId(null)}
      />
    </div>
  );
}
