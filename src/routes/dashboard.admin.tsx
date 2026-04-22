import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Users, ShieldCheck, DollarSign, Activity,
  CheckCircle, XCircle, Clock, Building2, Truck, Pill,
  BarChart3, FileText, AlertTriangle, Settings, Loader2
} from "lucide-react";
import { useEffect, useState } from "react";
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

const mockTransactions = [
  { id: "TXN-001", patient: "Thabo Mokoena", amount: "R 145.00", method: "Visa", status: "completed", date: "2026-04-13" },
  { id: "TXN-002", patient: "Naledi Khumalo", amount: "R 68.50", method: "EFT", status: "completed", date: "2026-04-12" },
  { id: "TXN-003", patient: "Sipho Dlamini", amount: "R 210.00", method: "Mastercard", status: "pending", date: "2026-04-13" },
  { id: "TXN-004", patient: "Zanele Mthembu", amount: "R 95.00", method: "PayPal", status: "completed", date: "2026-04-11" },
  { id: "TXN-005", patient: "Bongani Ndlovu", amount: "R 320.00", method: "Visa", status: "failed", date: "2026-04-10" },
];

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
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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
    setLoading(true);
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
    setLoading(false);
  }

  useEffect(() => {
    loadUsers();
    const channel = supabase
      .channel("admin-profiles")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => loadUsers())
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, () => loadUsers())
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

  const pending = users.filter((u) => u.approval_status === "pending" && u.role && ["pharmacy", "hospital", "driver"].includes(u.role));

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
              { icon: DollarSign, label: "Revenue (Month)", value: "R 156,000", color: "text-healthcare-green" },
              { icon: Activity, label: "Active Orders", value: "34", color: "text-healthcare-teal" },
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
          <h2 className="text-lg font-semibold text-foreground mb-4">Transaction History</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-3 font-medium text-muted-foreground">ID</th>
                  <th className="pb-3 font-medium text-muted-foreground">Patient</th>
                  <th className="pb-3 font-medium text-muted-foreground">Amount</th>
                  <th className="pb-3 font-medium text-muted-foreground">Method</th>
                  <th className="pb-3 font-medium text-muted-foreground">Status</th>
                  <th className="pb-3 font-medium text-muted-foreground">Date</th>
                </tr>
              </thead>
              <tbody>
                {mockTransactions.map((txn) => (
                  <tr key={txn.id} className="border-b border-border last:border-0">
                    <td className="py-3 font-mono text-xs text-muted-foreground">{txn.id}</td>
                    <td className="py-3 font-medium text-foreground">{txn.patient}</td>
                    <td className="py-3 font-semibold text-foreground">{txn.amount}</td>
                    <td className="py-3 text-muted-foreground">{txn.method}</td>
                    <td className="py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${txnStatusColors[txn.status]}`}>{txn.status}</span>
                    </td>
                    <td className="py-3 text-muted-foreground">{txn.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "reports" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="healthcare-card p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Monthly Summary</h2>
            <div className="space-y-4">
              {[
                { label: "Total Revenue", value: "R 156,000", change: "+12%" },
                { label: "Orders Processed", value: "423", change: "+8%" },
                { label: "New Users", value: "89", change: "+15%" },
                { label: "Deliveries Completed", value: "398", change: "+10%" },
                { label: "Average Order Value", value: "R 368", change: "+3%" },
              ].map((metric) => (
                <div key={metric.label} className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{metric.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{metric.value}</span>
                    <span className="text-xs text-healthcare-green">{metric.change}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="healthcare-card p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Generate Reports</h2>
            <div className="space-y-3">
              {[
                { label: "Financial Report", desc: "Revenue, payments, and refunds" },
                { label: "User Activity Report", desc: "Signups, logins, and engagement" },
                { label: "Order Report", desc: "Orders, fulfillment, and delivery times" },
                { label: "Inventory Report", desc: "Stock levels across pharmacies" },
              ].map((report) => (
                <div key={report.label} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{report.label}</p>
                    <p className="text-xs text-muted-foreground">{report.desc}</p>
                  </div>
                  <Button size="sm" variant="outline">Generate</Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
