import { createFileRoute, Link } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { usePatientStats } from "@/hooks/usePatientStats";
import { ShoppingBag, Package, Clock, MapPin } from "lucide-react";

export const Route = createFileRoute("/dashboard/patient/activity")({
  head: () => ({ meta: [{ title: "Your Activity — HEALTHREACH" }] }),
  component: () => (
    <RoleGuard allow="patient">
      <ActivityPage />
    </RoleGuard>
  ),
});

function ActivityPage() {
  const stats = usePatientStats();
  const cards = [
    { label: "Total Orders", value: stats.totalOrders, icon: ShoppingBag, color: "text-primary", to: "/dashboard/patient/orders" },
    { label: "Active", value: stats.activeOrders, icon: Package, color: "text-healthcare-teal", to: "/dashboard/patient/orders" },
    { label: "Pending Delivery", value: stats.pendingDelivery, icon: Clock, color: "text-healthcare-sky", to: "/track" },
  ];
  return (
    <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Your Activity</h1>
        <p className="text-sm text-muted-foreground">A snapshot of your orders and deliveries.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.label} to={c.to} className="rounded-2xl border border-border bg-card p-5 hover:shadow-lg transition-all">
            <c.icon className={`h-6 w-6 ${c.color} mb-2`} />
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</p>
            <p className="text-3xl font-bold text-foreground mt-1">{c.value}</p>
          </Link>
        ))}
      </div>
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold mb-2 flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Quick links</h2>
        <div className="flex flex-wrap gap-2">
          <Link to="/dashboard/patient/orders" className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm hover:bg-primary/20">My Orders</Link>
          <Link to="/dashboard/patient/transactions" className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm hover:bg-primary/20">Transactions</Link>
          <Link to="/track" className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm hover:bg-primary/20">Track Order</Link>
        </div>
      </div>
    </div>
  );
}
