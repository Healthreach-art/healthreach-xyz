import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  ShoppingCart, Package, Clock, CreditCard, Search, Pill,
  TrendingUp, CalendarDays, FileText, MapPin
} from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/dashboard/patient")({
  head: () => ({ meta: [{ title: "Patient Dashboard — HEALTHREACH" }] }),
  component: PatientDashboard,
});

// Mock data
const mockOrders = [
  { id: "ORD-001", medication: "Amoxicillin 500mg", pharmacy: "City Pharmacy", status: "delivered", date: "2026-04-10", total: "R 145.00" },
  { id: "ORD-002", medication: "Ibuprofen 400mg", pharmacy: "MedPlus Pharmacy", status: "out_for_delivery", date: "2026-04-12", total: "R 68.50" },
  { id: "ORD-003", medication: "Metformin 850mg", pharmacy: "City Pharmacy", status: "preparing", date: "2026-04-13", total: "R 210.00" },
];

const mockMedications = [
  { id: "1", name: "Amoxicillin 500mg", pharmacy: "City Pharmacy", price: "R 120.00", stock: 45 },
  { id: "2", name: "Ibuprofen 400mg", pharmacy: "MedPlus Pharmacy", price: "R 55.00", stock: 120 },
  { id: "3", name: "Metformin 850mg", pharmacy: "City Pharmacy", price: "R 180.00", stock: 30 },
  { id: "4", name: "Paracetamol 500mg", pharmacy: "Health Hub", price: "R 35.00", stock: 200 },
];

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
  const { profile, signOut } = useAuth();
  const [search, setSearch] = useState("");

  const filteredMeds = mockMedications.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  );

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
          { icon: ShoppingCart, label: "Total Orders", value: "12", color: "text-primary" },
          { icon: Package, label: "Active Orders", value: "2", color: "text-healthcare-teal" },
          { icon: Clock, label: "Pending Delivery", value: "1", color: "text-healthcare-sky" },
          { icon: CreditCard, label: "Total Spent", value: "R 2,450", color: "text-healthcare-green" },
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
        <div className="lg:col-span-3">
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
            <div className="space-y-3">
              {filteredMeds.map((med) => (
                <div key={med.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <Pill className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{med.name}</p>
                      <p className="text-xs text-muted-foreground">{med.pharmacy} • {med.stock} in stock</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-foreground">{med.price}</span>
                    <Button size="sm" variant="default" asChild>
                      <Link to="/payment">Order</Link>
                    </Button>
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
            <div className="space-y-3">
              {mockOrders.map((order) => (
                <div key={order.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono text-muted-foreground">{order.id}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[order.status]}`}>
                      {order.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground">{order.medication}</p>
                  <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                    <span>{order.pharmacy}</span>
                    <span>{order.total}</span>
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
                { icon: Pill, label: "New Order", to: "/payment" },
                { icon: MapPin, label: "Track Delivery", to: "/track" },
                { icon: CreditCard, label: "Payments", to: "/payment" },
                { icon: CalendarDays, label: "Prescriptions", to: "/dashboard/patient" },
              ].map((action) => (
                <Link key={action.label} to={action.to as any} className="flex flex-col items-center gap-2 rounded-lg border border-border p-4 transition-colors hover:bg-accent">
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
