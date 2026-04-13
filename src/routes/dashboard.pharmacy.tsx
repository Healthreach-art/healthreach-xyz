import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Package, AlertTriangle, ShoppingCart, DollarSign,
  CheckCircle, XCircle, Clock, Pill, TrendingDown
} from "lucide-react";

export const Route = createFileRoute("/dashboard/pharmacy")({
  head: () => ({ meta: [{ title: "Pharmacy Dashboard — HEALTHREACH" }] }),
  component: PharmacyDashboard,
});

const mockInventory = [
  { id: "1", name: "Amoxicillin 500mg", stock: 45, price: "R 120.00", category: "Antibiotics", low: false },
  { id: "2", name: "Ibuprofen 400mg", stock: 8, price: "R 55.00", category: "Pain Relief", low: true },
  { id: "3", name: "Metformin 850mg", stock: 30, price: "R 180.00", category: "Diabetes", low: false },
  { id: "4", name: "Paracetamol 500mg", stock: 3, price: "R 35.00", category: "Pain Relief", low: true },
  { id: "5", name: "Omeprazole 20mg", stock: 60, price: "R 95.00", category: "Gastrointestinal", low: false },
];

const mockIncomingOrders = [
  { id: "ORD-101", patient: "Thabo Mokoena", medication: "Amoxicillin 500mg", qty: 2, status: "pending", date: "2026-04-13" },
  { id: "ORD-102", patient: "Naledi Khumalo", medication: "Metformin 850mg", qty: 1, status: "pending", date: "2026-04-13" },
  { id: "ORD-103", patient: "Sipho Dlamini", medication: "Ibuprofen 400mg", qty: 3, status: "accepted", date: "2026-04-12" },
];

function PharmacyDashboard() {
  const { profile, approvalStatus, signOut } = useAuth();

  if (approvalStatus === "pending") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="healthcare-card p-8 max-w-md text-center">
          <Clock className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-bold text-foreground">Pending Approval</h2>
          <p className="mt-2 text-sm text-muted-foreground">Your pharmacy account is awaiting admin approval. You'll be notified once approved.</p>
          <Button variant="outline" className="mt-6" onClick={signOut}>Sign Out</Button>
        </div>
      </div>
    );
  }

  const lowStockItems = mockInventory.filter((i) => i.low);

  return (
    <div className="container-narrow px-4 sm:px-6 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pharmacy Dashboard</h1>
          <p className="text-sm text-muted-foreground">{profile?.organization_name || "My Pharmacy"}</p>
        </div>
        <Button variant="outline" size="sm" onClick={signOut}>Sign Out</Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {[
          { icon: ShoppingCart, label: "Pending Orders", value: "2", color: "text-primary" },
          { icon: Package, label: "Total Products", value: "156", color: "text-healthcare-teal" },
          { icon: AlertTriangle, label: "Low Stock", value: String(lowStockItems.length), color: "text-destructive" },
          { icon: DollarSign, label: "Revenue (Month)", value: "R 24,500", color: "text-healthcare-green" },
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

      {/* Low Stock Alert */}
      {lowStockItems.length > 0 && (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm font-semibold text-destructive">Low Stock Alerts</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStockItems.map((item) => (
              <span key={item.id} className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-3 py-1 text-xs text-destructive">
                <TrendingDown className="h-3 w-3" /> {item.name} ({item.stock} left)
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Incoming Orders */}
        <div className="healthcare-card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Incoming Orders</h2>
          <div className="space-y-3">
            {mockIncomingOrders.map((order) => (
              <div key={order.id} className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-muted-foreground">{order.id}</span>
                  <span className="text-xs text-muted-foreground">{order.date}</span>
                </div>
                <p className="text-sm font-medium text-foreground">{order.medication} × {order.qty}</p>
                <p className="text-xs text-muted-foreground mt-1">Patient: {order.patient}</p>
                {order.status === "pending" && (
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="default" className="gap-1">
                      <CheckCircle className="h-3 w-3" /> Accept
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1 text-destructive">
                      <XCircle className="h-3 w-3" /> Reject
                    </Button>
                  </div>
                )}
                {order.status === "accepted" && (
                  <Button size="sm" variant="secondary" className="mt-3">
                    <Pill className="h-3 w-3 mr-1" /> Mark as Preparing
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Inventory */}
        <div className="healthcare-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Inventory</h2>
            <Button size="sm" variant="outline">+ Add Item</Button>
          </div>
          <div className="space-y-2">
            {mockInventory.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.category} • {item.price}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    item.low ? "bg-destructive/10 text-destructive" : "bg-healthcare-green/20 text-healthcare-green"
                  }`}>
                    {item.stock} units
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
