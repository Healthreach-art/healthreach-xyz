import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Package, AlertTriangle, ShoppingCart, DollarSign,
  CheckCircle, XCircle, Clock, Pill, TrendingDown, Loader2,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/pharmacy")({
  head: () => ({ meta: [{ title: "Pharmacy Dashboard — HEALTHREACH" }] }),
  component: PharmacyDashboard,
});

interface Medication {
  id: string;
  name: string;
  stock_quantity: number;
  price: number;
  category: string | null;
}

interface Order {
  id: string;
  patient_id: string;
  medication_name: string;
  quantity: number;
  status: string;
  total_amount: number;
  created_at: string;
}

const LOW_STOCK_THRESHOLD = 10;

// Mock fallback (used when no real data exists yet)
const mockInventory: Medication[] = [
  { id: "m1", name: "Amoxicillin 500mg", stock_quantity: 45, price: 120, category: "Antibiotics" },
  { id: "m2", name: "Ibuprofen 400mg", stock_quantity: 8, price: 55, category: "Pain Relief" },
  { id: "m3", name: "Paracetamol 500mg", stock_quantity: 3, price: 35, category: "Pain Relief" },
];
const mockOrders: Order[] = [
  { id: "demo-1", patient_id: "x", medication_name: "Amoxicillin 500mg", quantity: 2, status: "pending", total_amount: 240, created_at: new Date().toISOString() },
  { id: "demo-2", patient_id: "y", medication_name: "Metformin 850mg", quantity: 1, status: "pending", total_amount: 180, created_at: new Date().toISOString() },
];

function PharmacyDashboard() {
  const { user, profile, approvalStatus, signOut } = useAuth();
  const [inventory, setInventory] = useState<Medication[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", price: "", stock: "", category: "" });

  // Driver assignment
  const [drivers, setDrivers] = useState<{ user_id: string; full_name: string }[]>([]);
  const [assignOrder, setAssignOrder] = useState<Order | null>(null);
  const [assigning, setAssigning] = useState(false);

  async function loadData() {
    if (!user) return;
    setLoading(true);
    const [medsRes, ordersRes] = await Promise.all([
      supabase.from("medications").select("*").eq("pharmacy_id", user.id).order("created_at", { ascending: false }),
      supabase.from("orders").select("*").eq("pharmacy_id", user.id).order("created_at", { ascending: false }),
    ]);
    setInventory((medsRes.data ?? []) as Medication[]);
    setOrders((ordersRes.data ?? []) as Order[]);
    setLoading(false);
  }

  async function loadDrivers() {
    const { data: roleRows } = await supabase.from("user_roles").select("user_id").eq("role", "driver");
    const ids = (roleRows ?? []).map((r) => r.user_id);
    if (ids.length === 0) { setDrivers([]); return; }
    const { data: profs } = await supabase
      .from("profiles")
      .select("user_id, full_name, approval_status")
      .in("user_id", ids)
      .eq("approval_status", "approved");
    setDrivers((profs ?? []).map((p) => ({ user_id: p.user_id, full_name: p.full_name || "Driver" })));
  }

  useEffect(() => {
    loadData();
    loadDrivers();

    if (!user) return;
    const channel = supabase
      .channel("pharmacy-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `pharmacy_id=eq.${user.id}` }, () => {
        loadData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleAddMedication(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setAdding(true);
    const { error } = await supabase.from("medications").insert({
      pharmacy_id: user.id,
      name: form.name,
      price: Number(form.price) || 0,
      stock_quantity: Number(form.stock) || 0,
      category: form.category || null,
    });
    setAdding(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Medication added");
    setForm({ name: "", price: "", stock: "", category: "" });
    setAddOpen(false);
    loadData();
  }

  async function rejectOrder(orderId: string) {
    if (orderId.startsWith("demo-")) { toast.info("Demo order — cannot persist."); return; }
    const { error } = await supabase.from("orders").update({ status: "cancelled" }).eq("id", orderId);
    if (error) { toast.error(error.message); return; }
    toast.success("Order rejected");
    loadData();
  }

  async function markPreparing(orderId: string) {
    if (orderId.startsWith("demo-")) { toast.info("Demo order — cannot persist."); return; }
    const { error } = await supabase.from("orders").update({ status: "preparing" }).eq("id", orderId);
    if (error) { toast.error(error.message); return; }
    toast.success("Order marked preparing");
    loadData();
  }

  async function assignDriver(driverId: string) {
    if (!assignOrder) return;
    if (assignOrder.id.startsWith("demo-")) { toast.info("Demo order — cannot assign."); setAssignOrder(null); return; }
    setAssigning(true);
    const { error: orderErr } = await supabase.from("orders").update({ status: "accepted" }).eq("id", assignOrder.id);
    const { error: delErr } = await supabase.from("deliveries").update({ driver_id: driverId }).eq("order_id", assignOrder.id);
    setAssigning(false);
    if (orderErr || delErr) { toast.error((orderErr ?? delErr)!.message); return; }
    toast.success("Order accepted and driver assigned");
    setAssignOrder(null);
    loadData();
  }

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

  // Use real data when available; otherwise show demo placeholders
  const displayInventory = inventory.length > 0 ? inventory : mockInventory;
  const displayOrders = orders.length > 0 ? orders : mockOrders;
  const usingMockInventory = inventory.length === 0;
  const usingMockOrders = orders.length === 0;

  const lowStockItems = displayInventory.filter((i) => i.stock_quantity <= LOW_STOCK_THRESHOLD);
  const pendingCount = displayOrders.filter((o) => o.status === "pending").length;
  const monthRevenue = displayOrders
    .filter((o) => o.status !== "cancelled" && !o.id.startsWith("demo-"))
    .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

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
          { icon: ShoppingCart, label: "Pending Orders", value: String(pendingCount), color: "text-primary" },
          { icon: Package, label: "Total Products", value: String(displayInventory.length), color: "text-healthcare-teal" },
          { icon: AlertTriangle, label: "Low Stock", value: String(lowStockItems.length), color: "text-destructive" },
          { icon: DollarSign, label: "Revenue (Total)", value: `R ${monthRevenue.toFixed(0)}`, color: "text-healthcare-green" },
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

      {lowStockItems.length > 0 && (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm font-semibold text-destructive">Low Stock Alerts</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStockItems.map((item) => (
              <span key={item.id} className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-3 py-1 text-xs text-destructive">
                <TrendingDown className="h-3 w-3" /> {item.name} ({item.stock_quantity} left)
              </span>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Incoming Orders */}
        <div className="healthcare-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Incoming Orders</h2>
            {usingMockOrders && <span className="text-xs text-muted-foreground">Demo data</span>}
          </div>
          <div className="space-y-3">
            {displayOrders.map((order) => (
              <div key={order.id} className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-muted-foreground">{order.id.slice(0, 8)}</span>
                  <span className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleDateString()}</span>
                </div>
                <p className="text-sm font-medium text-foreground">{order.medication_name} × {order.quantity}</p>
                <p className="text-xs text-muted-foreground mt-1">Total: R {Number(order.total_amount).toFixed(2)}</p>
                {order.status === "pending" && (
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="default" className="gap-1" onClick={() => updateOrderStatus(order.id, "accepted")}>
                      <CheckCircle className="h-3 w-3" /> Accept
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1 text-destructive" onClick={() => updateOrderStatus(order.id, "cancelled")}>
                      <XCircle className="h-3 w-3" /> Reject
                    </Button>
                  </div>
                )}
                {order.status === "accepted" && (
                  <Button size="sm" variant="secondary" className="mt-3" onClick={() => updateOrderStatus(order.id, "preparing")}>
                    <Pill className="h-3 w-3 mr-1" /> Mark as Preparing
                  </Button>
                )}
                {!["pending", "accepted"].includes(order.status) && (
                  <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full bg-accent capitalize">{order.status.replace(/_/g, " ")}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Inventory */}
        <div className="healthcare-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">
              Inventory {usingMockInventory && <span className="ml-2 text-xs font-normal text-muted-foreground">(Demo)</span>}
            </h2>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">+ Add Item</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Medication</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddMedication} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="price">Price (R)</Label>
                      <Input id="price" type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="stock">Stock</Label>
                      <Input id="stock" type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Input id="category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Antibiotics" />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={adding}>{adding ? "Adding..." : "Add Medication"}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <div className="space-y-2">
            {displayInventory.map((item) => {
              const low = item.stock_quantity <= LOW_STOCK_THRESHOLD;
              return (
                <div key={item.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.category || "—"} • R {Number(item.price).toFixed(2)}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    low ? "bg-destructive/10 text-destructive" : "bg-healthcare-green/20 text-healthcare-green"
                  }`}>
                    {item.stock_quantity} units
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
