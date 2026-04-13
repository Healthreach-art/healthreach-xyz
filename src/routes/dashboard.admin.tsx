import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Users, ShieldCheck, DollarSign, Activity,
  CheckCircle, XCircle, Clock, Building2, Truck, Pill,
  BarChart3, FileText, AlertTriangle, Settings
} from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/dashboard/admin")({
  head: () => ({ meta: [{ title: "Admin Dashboard — HEALTHREACH" }] }),
  component: AdminDashboard,
});

type TabId = "overview" | "approvals" | "users" | "transactions" | "reports";

const mockPendingApprovals = [
  { id: "1", name: "MediCare Pharmacy", role: "pharmacy", email: "medicare@email.com", date: "2026-04-12", org: "MediCare Holdings" },
  { id: "2", name: "Dr. Patel", role: "hospital", email: "patel@hospital.co.za", date: "2026-04-11", org: "Sunward Park Hospital" },
  { id: "3", name: "James Nkosi", role: "driver", email: "james@email.com", date: "2026-04-13", org: "" },
  { id: "4", name: "PharmaSave", role: "pharmacy", email: "info@pharmasave.co.za", date: "2026-04-10", org: "PharmaSave Group" },
];

const mockAllUsers = [
  { id: "1", name: "Thabo Mokoena", role: "patient", email: "thabo@email.com", status: "approved", joined: "2026-03-01" },
  { id: "2", name: "City Pharmacy", role: "pharmacy", email: "city@pharmacy.co.za", status: "approved", joined: "2026-02-15" },
  { id: "3", name: "Sandton Hospital", role: "hospital", email: "info@sandton.co.za", status: "approved", joined: "2026-01-20" },
  { id: "4", name: "Bongani Driver", role: "driver", email: "bongani@email.com", status: "approved", joined: "2026-03-10" },
  { id: "5", name: "Admin Sarah", role: "admin", email: "sarah@healthreach.co.za", status: "approved", joined: "2026-01-01" },
  { id: "6", name: "MediCare Pharmacy", role: "pharmacy", email: "medicare@email.com", status: "pending", joined: "2026-04-12" },
  { id: "7", name: "Naledi Khumalo", role: "patient", email: "naledi@email.com", status: "approved", joined: "2026-03-20" },
  { id: "8", name: "Admin John", role: "admin", email: "john@healthreach.co.za", status: "approved", joined: "2026-01-01" },
];

const mockTransactions = [
  { id: "TXN-001", patient: "Thabo Mokoena", amount: "R 145.00", method: "Visa", status: "completed", date: "2026-04-13" },
  { id: "TXN-002", patient: "Naledi Khumalo", amount: "R 68.50", method: "EFT", status: "completed", date: "2026-04-12" },
  { id: "TXN-003", patient: "Sipho Dlamini", amount: "R 210.00", method: "Mastercard", status: "pending", date: "2026-04-13" },
  { id: "TXN-004", patient: "Zanele Mthembu", amount: "R 95.00", method: "PayPal", status: "completed", date: "2026-04-11" },
  { id: "TXN-005", patient: "Bongani Ndlovu", amount: "R 320.00", method: "Visa", status: "failed", date: "2026-04-10" },
];

const roleIcons: Record<string, typeof Users> = {
  patient: Users,
  pharmacy: Pill,
  hospital: Building2,
  driver: Truck,
  admin: ShieldCheck,
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
  const { profile, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("overview");

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

      {/* Tabs */}
      <div className="mb-8 flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
            {tab.id === "approvals" && mockPendingApprovals.length > 0 && (
              <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
                {mockPendingApprovals.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
            {[
              { icon: Users, label: "Total Users", value: "1,245", color: "text-primary" },
              { icon: ShieldCheck, label: "Pending Approvals", value: String(mockPendingApprovals.length), color: "text-destructive" },
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
                {[
                  { role: "Patients", count: 890, pct: 71 },
                  { role: "Pharmacies", count: 156, pct: 13 },
                  { role: "Hospitals", count: 45, pct: 4 },
                  { role: "Drivers", count: 144, pct: 12 },
                  { role: "Admins", count: 10, pct: 1 },
                ].map((item) => (
                  <div key={item.role} className="flex items-center gap-3">
                    <span className="w-20 text-sm text-muted-foreground">{item.role}</span>
                    <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full healthcare-gradient" style={{ width: `${item.pct}%` }} />
                    </div>
                    <span className="text-sm font-medium text-foreground w-12 text-right">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="healthcare-card p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" /> Pending Approvals
              </h2>
              <div className="space-y-3">
                {mockPendingApprovals.slice(0, 3).map((item) => {
                  const RoleIcon = roleIcons[item.role] || Users;
                  return (
                    <div key={item.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${roleColors[item.role]}`}>
                          <RoleIcon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{item.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">{item.role}</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="default" className="h-7 px-2">
                          <CheckCircle className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-destructive">
                          <XCircle className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
                <Button variant="ghost" size="sm" className="w-full" onClick={() => setActiveTab("approvals")}>
                  View all approvals →
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Approvals Tab */}
      {activeTab === "approvals" && (
        <div className="healthcare-card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Pending Approvals ({mockPendingApprovals.length})</h2>
          <div className="space-y-4">
            {mockPendingApprovals.map((item) => {
              const RoleIcon = roleIcons[item.role] || Users;
              return (
                <div key={item.id} className="rounded-lg border border-border p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${roleColors[item.role]}`}>
                        <RoleIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{item.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{item.role} • {item.email}</p>
                        {item.org && <p className="text-xs text-muted-foreground">Organization: {item.org}</p>}
                        <p className="text-xs text-muted-foreground mt-1">Applied: {item.date}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="default" className="gap-1">
                        <CheckCircle className="h-3 w-3" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1 text-destructive">
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

      {/* Users Tab */}
      {activeTab === "users" && (
        <div className="healthcare-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">All Users ({mockAllUsers.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-3 font-medium text-muted-foreground">User</th>
                  <th className="pb-3 font-medium text-muted-foreground">Role</th>
                  <th className="pb-3 font-medium text-muted-foreground">Status</th>
                  <th className="pb-3 font-medium text-muted-foreground">Joined</th>
                </tr>
              </thead>
              <tbody>
                {mockAllUsers.map((user) => (
                  <tr key={user.id} className="border-b border-border last:border-0">
                    <td className="py-3">
                      <p className="font-medium text-foreground">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </td>
                    <td className="py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${roleColors[user.role]}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        user.status === "approved" ? "bg-healthcare-green/20 text-healthcare-green" : "bg-accent text-primary"
                      }`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="py-3 text-muted-foreground">{user.joined}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transactions Tab */}
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
                      <span className={`text-xs px-2 py-0.5 rounded-full ${txnStatusColors[txn.status]}`}>
                        {txn.status}
                      </span>
                    </td>
                    <td className="py-3 text-muted-foreground">{txn.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reports Tab */}
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
