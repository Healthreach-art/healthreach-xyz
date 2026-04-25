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
import {
  Users, ShieldCheck, DollarSign, Activity,
  CheckCircle, XCircle, Clock, Building2, Truck, Pill,
  BarChart3, FileText, AlertTriangle, Settings, Loader2,
  Crown, ShieldOff, TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/admin")({
  head: () => ({ meta: [{ title: "Admin Dashboard — HEALTHREACH" }] }),
  component: AdminDashboard,
});

type TabId = "overview" | "approvals" | "users" | "transactions" | "reports";
type AppRole = "patient" | "pharmacy" | "hospital" | "driver" | "admin";
type ApprovalStatus = "pending" | "approved" | "rejected";

interface UserRow {
  user_id: string;
  full_name: string;
  email: string;
  organization_name: string | null;
  approval_status: ApprovalStatus | null;
  created_at: string;
  role: AppRole | null;
}

interface TxnRow {
  id: string;          // order id
  patient: string;
  medication: string;
  amount: number;
  method: string;      // payment method or "—"
  status: string;      // payment status, fallback to order status
  date: string;        // ISO order created_at
}

const roleIcons: Record<string, typeof Users> = {
  patient: Users, pharmacy: Pill, hospital: Building2, driver: Truck, admin: ShieldCheck,
};
const roleColors: Record<string, string> = {
  patient: "bg-primary/10 text-primary",
  pharmacy: "bg-healthcare-teal/20 text-healthcare-teal",
  hospital: "bg-healthcare-green/20 text-healthcare-green",
  driver: "bg-healthcare-sky/20 text-healthcare-sky",
  admin: "bg-accent text-accent-foreground",
};
const txnStatusColors: Record<string, string> = {
  completed: "bg-healthcare-green/20 text-healthcare-green",
  pending: "bg-accent text-primary",
  failed: "bg-destructive/10 text-destructive",
  refunded: "bg-muted text-muted-foreground",
};

function AdminDashboard() {
  const { profile, role, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [transactions, setTransactions] = useState<TxnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoApprove, setAutoApprove] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("admin:autoApprove") === "1";
  });
  const [confirmRole, setConfirmRole] = useState<{ user: UserRow; action: "promote" | "demote" } | null>(null);
  const [generatingInventory, setGeneratingInventory] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (role && role !== "admin") {
      toast.error("Admin access required", {
        description: `Your account role is "${role}". Redirecting to your dashboard.`,
      });
      navigate({ to: `/dashboard/${role}` as any });
    } else if (!role) {
      navigate({ to: "/login", search: { denied: "admin" } as any });
    }
  }, [role, authLoading, navigate]);

  async function loadUsers() {
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, email, organization_name, approval_status, created_at").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    const roleMap = new Map((roles ?? []).map((r) => [r.user_id, r.role as AppRole]));
    const merged: UserRow[] = (profiles ?? []).map((p) => ({
      user_id: p.user_id,
      full_name: p.full_name,
      email: p.email,
      organization_name: p.organization_name,
      approval_status: p.approval_status as ApprovalStatus | null,
      created_at: p.created_at,
      role: roleMap.get(p.user_id) ?? null,
    }));
    setUsers(merged);
  }

  async function loadTransactions() {
    const { data: orders } = await supabase
      .from("orders")
      .select("id, patient_id, medication_name, total_amount, status, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    const orderRows = orders ?? [];
    const orderIds = orderRows.map((o) => o.id);
    const patientIds = Array.from(new Set(orderRows.map((o) => o.patient_id)));

    const [{ data: payments }, { data: profs }] = await Promise.all([
      orderIds.length > 0
        ? supabase.from("payments").select("order_id, payment_method, status").in("order_id", orderIds)
        : Promise.resolve({ data: [] as { order_id: string; payment_method: string; status: string }[] }),
      patientIds.length > 0
        ? supabase.from("profiles").select("user_id, full_name").in("user_id", patientIds)
        : Promise.resolve({ data: [] as { user_id: string; full_name: string }[] }),
    ]);

    const paymentMap = new Map((payments ?? []).map((p) => [p.order_id, p]));
    const nameMap = new Map((profs ?? []).map((p) => [p.user_id, p.full_name]));

    const rows: TxnRow[] = orderRows.map((o) => {
      const pay = paymentMap.get(o.id);
      return {
        id: o.id,
        patient: nameMap.get(o.patient_id) || o.patient_id.slice(0, 8),
        medication: o.medication_name,
        amount: Number(o.total_amount),
        method: pay?.payment_method || "—",
        status: pay?.status || o.status,
        date: o.created_at,
      };
    });
    setTransactions(rows);
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([loadUsers(), loadTransactions()]).finally(() => setLoading(false));
    const channel = supabase
      .channel("admin-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => loadUsers())
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, () => loadUsers())
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => loadTransactions())
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => loadTransactions())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function updateApproval(userId: string, status: ApprovalStatus) {
    setUpdatingId(userId);
    const { error } = await supabase
      .from("profiles")
      .update({ approval_status: status })
      .eq("user_id", userId);
    setUpdatingId(null);
    if (error) {
      toast.error(`Failed: ${error.message}`);
      return;
    }
    toast.success(`User ${status}`);
    setUsers((prev) => prev.map((u) => u.user_id === userId ? { ...u, approval_status: status } : u));
  }

  // Promote a user to admin (insert user_roles row)
  async function promoteToAdmin(userId: string) {
    setUpdatingId(userId);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
    setUpdatingId(null);
    if (error) { toast.error(`Failed: ${error.message}`); return; }
    toast.success("User promoted to admin");
    loadUsers();
  }

  // Demote: delete the admin role row for this user
  async function demoteFromAdmin(userId: string) {
    setUpdatingId(userId);
    const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
    setUpdatingId(null);
    if (error) { toast.error(`Failed: ${error.message}`); return; }
    toast.success("Admin privileges revoked");
    loadUsers();
  }

  function toggleAutoApprove(next: boolean) {
    setAutoApprove(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("admin:autoApprove", next ? "1" : "0");
    }
    toast.success(next ? "Auto-approve enabled" : "Auto-approve disabled");
  }

  // Auto-approve newly pending partners when the toggle is on
  useEffect(() => {
    if (!autoApprove) return;
    const toApprove = users.filter(
      (u) => u.approval_status === "pending" && u.role && ["pharmacy", "hospital", "driver"].includes(u.role)
    );
    toApprove.forEach((u) => updateApproval(u.user_id, "approved"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoApprove, users.length]);

  const pending = users.filter((u) => u.approval_status === "pending" && u.role && ["pharmacy", "hospital", "driver"].includes(u.role));

  // Real-data metrics derived from transactions
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthlyTxns = transactions.filter((t) => new Date(t.date) >= startOfMonth);
  const monthlyRevenue = monthlyTxns
    .filter((t) => t.status === "completed" || t.status === "delivered")
    .reduce((s, t) => s + t.amount, 0);
  const totalRevenue = transactions
    .filter((t) => t.status === "completed" || t.status === "delivered")
    .reduce((s, t) => s + t.amount, 0);
  const activeOrdersCount = transactions.filter((t) =>
    !["delivered", "cancelled", "completed", "refunded", "failed"].includes(t.status)
  ).length;
  const deliveredCount = transactions.filter((t) => t.status === "delivered").length;
  const avgOrderValue = transactions.length > 0
    ? transactions.reduce((s, t) => s + t.amount, 0) / transactions.length
    : 0;
  const newUsersThisMonth = users.filter((u) => new Date(u.created_at) >= startOfMonth).length;

  // Last-7-days revenue series for sparkline
  const revenueSeries = useMemo(() => {
    const days: { label: string; revenue: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      const total = transactions
        .filter((t) => {
          const td = new Date(t.date);
          return td >= d && td < next && (t.status === "completed" || t.status === "delivered");
        })
        .reduce((s, t) => s + t.amount, 0);
      days.push({ label: d.toLocaleDateString(undefined, { weekday: "short" }), revenue: total });
    }
    return days;
  }, [transactions]);
  const maxRevenue = Math.max(1, ...revenueSeries.map((d) => d.revenue));

  function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
    const escape = (v: string | number) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers, ...rows].map((r) => r.map(escape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    toast.success(`${filename} downloaded`);
  }

  async function generateReport(kind: "financial" | "users" | "orders" | "inventory") {
    if (kind === "financial") {
      downloadCsv(
        "financial-report.csv",
        ["Order ID", "Patient", "Medication", "Amount (ZAR)", "Method", "Status", "Date"],
        transactions.map((t) => [t.id, t.patient, t.medication, t.amount.toFixed(2), t.method, t.status, t.date]),
      );
    } else if (kind === "users") {
      downloadCsv(
        "user-activity-report.csv",
        ["User ID", "Name", "Email", "Role", "Approval", "Joined"],
        users.map((u) => [u.user_id, u.full_name, u.email, u.role ?? "", u.approval_status ?? "", u.created_at]),
      );
    } else if (kind === "orders") {
      downloadCsv(
        "order-report.csv",
        ["Order ID", "Patient", "Medication", "Amount (ZAR)", "Status", "Date"],
        transactions.map((t) => [t.id, t.patient, t.medication, t.amount.toFixed(2), t.status, t.date]),
      );
    } else {
      // Real inventory report: join medications with their pharmacy profile
      setGeneratingInventory(true);
      const { data: meds, error } = await supabase
        .from("medications")
        .select("id, pharmacy_id, name, category, price, stock_quantity, requires_prescription, created_at")
        .order("name");
      if (error || !meds) {
        setGeneratingInventory(false);
        toast.error(error?.message || "Failed to load inventory");
        return;
      }
      const pharmacyIds = Array.from(new Set(meds.map((m) => m.pharmacy_id)));
      const { data: profs } = pharmacyIds.length > 0
        ? await supabase.from("profiles").select("user_id, organization_name, full_name").in("user_id", pharmacyIds)
        : { data: [] as { user_id: string; organization_name: string | null; full_name: string }[] };
      const pharmMap = new Map((profs ?? []).map((p) => [p.user_id, p.organization_name || p.full_name || "Pharmacy"]));
      downloadCsv(
        "inventory-report.csv",
        ["Pharmacy", "Medication", "Category", "Price (ZAR)", "Stock", "Prescription Required", "Added"],
        meds.map((m) => [
          pharmMap.get(m.pharmacy_id) || m.pharmacy_id.slice(0, 8),
          m.name,
          m.category || "",
          Number(m.price).toFixed(2),
          m.stock_quantity,
          m.requires_prescription ? "Yes" : "No",
          m.created_at,
        ]),
      );
      setGeneratingInventory(false);
    }
  }

  const tabs: { id: TabId; label: string; icon: typeof Users }[] = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "approvals", label: "Approvals", icon: CheckCircle },
    { id: "users", label: "Users", icon: Users },
    { id: "transactions", label: "Transactions", icon: DollarSign },
    { id: "reports", label: "Reports", icon: FileText },
  ];

  return (
    <div className="container-narrow px-4 sm:px-6 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">Welcome, {profile?.full_name || "Administrator"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm"><Settings className="h-4 w-4 mr-1" /> Settings</Button>
          <Button variant="outline" size="sm" onClick={signOut}>Sign Out</Button>
        </div>
      </div>

      <div className="mb-8 flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
            {tab.id === "approvals" && pending.length > 0 && (
              <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
                {pending.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
            {[
              { icon: Users, label: "Total Users", value: String(users.length), color: "text-primary" },
              { icon: ShieldCheck, label: "Pending Approvals", value: String(pending.length), color: "text-destructive" },
              { icon: DollarSign, label: "Revenue (Month)", value: `R ${monthlyRevenue.toFixed(0)}`, color: "text-healthcare-green" },
              { icon: Activity, label: "Active Orders", value: String(activeOrdersCount), color: "text-healthcare-teal" },
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

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="healthcare-card p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">User Distribution</h2>
              <div className="space-y-3">
                {(["patient", "pharmacy", "hospital", "driver", "admin"] as AppRole[]).map((r) => {
                  const count = users.filter((u) => u.role === r).length;
                  const pct = users.length ? Math.round((count / users.length) * 100) : 0;
                  return (
                    <div key={r} className="flex items-center gap-3">
                      <span className="w-20 text-sm text-muted-foreground capitalize">{r}s</span>
                      <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full healthcare-gradient" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-medium text-foreground w-12 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="healthcare-card p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" /> Pending Approvals
              </h2>
              <div className="space-y-3">
                {pending.length === 0 && <p className="text-sm text-muted-foreground">No pending approvals.</p>}
                {pending.slice(0, 3).map((item) => {
                  const RoleIcon = roleIcons[item.role!] || Users;
                  return (
                    <div key={item.user_id} className="flex items-center justify-between rounded-lg border border-border p-3">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${roleColors[item.role!]}`}>
                          <RoleIcon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{item.full_name || item.email}</p>
                          <p className="text-xs text-muted-foreground capitalize">{item.role}</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="default" className="h-7 px-2" disabled={updatingId === item.user_id} onClick={() => updateApproval(item.user_id, "approved")}>
                          <CheckCircle className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-destructive" disabled={updatingId === item.user_id} onClick={() => updateApproval(item.user_id, "rejected")}>
                          <XCircle className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {pending.length > 0 && (
                  <Button variant="ghost" size="sm" className="w-full" onClick={() => setActiveTab("approvals")}>
                    View all approvals →
                  </Button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === "approvals" && (
        <div className="healthcare-card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Pending Approvals ({pending.length})</h2>
          {loading && <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
          {!loading && pending.length === 0 && <p className="text-sm text-muted-foreground">No accounts awaiting approval.</p>}
          <div className="space-y-4">
            {pending.map((item) => {
              const RoleIcon = roleIcons[item.role!] || Users;
              return (
                <div key={item.user_id} className="rounded-lg border border-border p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${roleColors[item.role!]}`}>
                        <RoleIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{item.full_name || "Unnamed"}</p>
                        <p className="text-xs text-muted-foreground capitalize">{item.role} • {item.email}</p>
                        {item.organization_name && <p className="text-xs text-muted-foreground">Organization: {item.organization_name}</p>}
                        <p className="text-xs text-muted-foreground mt-1">Applied: {new Date(item.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="default" className="gap-1" disabled={updatingId === item.user_id} onClick={() => updateApproval(item.user_id, "approved")}>
                        {updatingId === item.user_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />} Approve
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1 text-destructive" disabled={updatingId === item.user_id} onClick={() => updateApproval(item.user_id, "rejected")}>
                        <XCircle className="h-3 w-3" /> Reject
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === "users" && (
        <div className="healthcare-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">All Users ({users.length})</h2>
          </div>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-3 font-medium text-muted-foreground">User</th>
                    <th className="pb-3 font-medium text-muted-foreground">Role</th>
                    <th className="pb-3 font-medium text-muted-foreground">Status</th>
                    <th className="pb-3 font-medium text-muted-foreground">Joined</th>
                    <th className="pb-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.user_id} className="border-b border-border last:border-0">
                      <td className="py-3">
                        <p className="font-medium text-foreground">{u.full_name || "—"}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </td>
                      <td className="py-3">
                        {u.role && (
                          <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${roleColors[u.role]}`}>
                            {u.role}
                          </span>
                        )}
                      </td>
                      <td className="py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                          u.approval_status === "approved" ? "bg-healthcare-green/20 text-healthcare-green"
                          : u.approval_status === "rejected" ? "bg-destructive/10 text-destructive"
                          : "bg-accent text-primary"
                        }`}>
                          {u.approval_status || "—"}
                        </span>
                      </td>
                      <td className="py-3 text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</td>
                      <td className="py-3">
                        {u.role && ["pharmacy", "hospital", "driver"].includes(u.role) && u.approval_status !== "approved" && (
                          <Button size="sm" variant="outline" className="h-7" disabled={updatingId === u.user_id} onClick={() => updateApproval(u.user_id, "approved")}>
                            Approve
                          </Button>
                        )}
                        {u.role && ["pharmacy", "hospital", "driver"].includes(u.role) && u.approval_status === "approved" && (
                          <Button size="sm" variant="outline" className="h-7 text-destructive" disabled={updatingId === u.user_id} onClick={() => updateApproval(u.user_id, "rejected")}>
                            Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "transactions" && (
        <div className="healthcare-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Transaction History ({transactions.length})</h2>
            <Button size="sm" variant="outline" onClick={() => generateReport("financial")}>Export CSV</Button>
          </div>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions yet. Patient orders will appear here.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-3 font-medium text-muted-foreground">Order</th>
                    <th className="pb-3 font-medium text-muted-foreground">Patient</th>
                    <th className="pb-3 font-medium text-muted-foreground">Medication</th>
                    <th className="pb-3 font-medium text-muted-foreground">Amount</th>
                    <th className="pb-3 font-medium text-muted-foreground">Method</th>
                    <th className="pb-3 font-medium text-muted-foreground">Status</th>
                    <th className="pb-3 font-medium text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((txn) => (
                    <tr key={txn.id} className="border-b border-border last:border-0">
                      <td className="py-3 font-mono text-xs text-muted-foreground">{txn.id.slice(0, 8)}</td>
                      <td className="py-3 font-medium text-foreground">{txn.patient}</td>
                      <td className="py-3 text-foreground">{txn.medication}</td>
                      <td className="py-3 font-semibold text-foreground">R {txn.amount.toFixed(2)}</td>
                      <td className="py-3 text-muted-foreground capitalize">{txn.method}</td>
                      <td className="py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${txnStatusColors[txn.status] ?? "bg-accent text-accent-foreground"}`}>{txn.status.replace(/_/g, " ")}</span>
                      </td>
                      <td className="py-3 text-muted-foreground">{new Date(txn.date).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "reports" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="healthcare-card p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Live Summary</h2>
            <div className="space-y-4">
              {[
                { label: "Total Revenue", value: `R ${totalRevenue.toFixed(0)}` },
                { label: "Revenue (This Month)", value: `R ${monthlyRevenue.toFixed(0)}` },
                { label: "Orders Processed", value: String(transactions.length) },
                { label: "New Users (This Month)", value: String(newUsersThisMonth) },
                { label: "Deliveries Completed", value: String(deliveredCount) },
                { label: "Average Order Value", value: `R ${avgOrderValue.toFixed(0)}` },
              ].map((metric) => (
                <div key={metric.label} className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{metric.label}</span>
                  <span className="text-sm font-semibold text-foreground">{metric.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="healthcare-card p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Generate Reports</h2>
            <div className="space-y-3">
              {([
                { kind: "financial", label: "Financial Report", desc: "Revenue, payments, and refunds" },
                { kind: "users", label: "User Activity Report", desc: "Signups and roles" },
                { kind: "orders", label: "Order Report", desc: "Orders, fulfillment, and status" },
                { kind: "inventory", label: "Inventory Report", desc: "Stock levels across pharmacies" },
              ] as const).map((report) => (
                <div key={report.label} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{report.label}</p>
                    <p className="text-xs text-muted-foreground">{report.desc}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => generateReport(report.kind)}>Generate</Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
