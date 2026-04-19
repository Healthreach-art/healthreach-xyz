import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Package, AlertTriangle, ShoppingCart, DollarSign,
  CheckCircle, XCircle, Clock, Pill, TrendingDown, Loader2,
  Pencil, Trash2, Plus, Minus, Truck,
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

  // Add / Edit medication
  const [medDialogOpen, setMedDialogOpen] = useState(false);
  const [editingMed, setEditingMed] = useState<Medication | null>(null);
  const [savingMed, setSavingMed] = useState(false);
  const [form, setForm] = useState({ name: "", price: "", stock: "", category: "" });

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Medication | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Driver assignment
  const [drivers, setDrivers] = useState<{ user_id: string; full_name: string; active: number }[]>([]);
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
    const [{ data: profs }, { data: activeDeliveries }] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, approval_status").in("user_id", ids).eq("approval_status", "approved"),
      supabase.from("deliveries").select("driver_id, status").in("driver_id", ids).in("status", ["assigned", "picked_up", "in_transit"]),
    ]);
    const counts = new Map<string, number>();
    (activeDeliveries ?? []).forEach((d) => {
      if (d.driver_id) counts.set(d.driver_id, (counts.get(d.driver_id) ?? 0) + 1);
    });
    setDrivers((profs ?? []).map((p) => ({
      user_id: p.user_id,
      full_name: p.full_name || "Driver",
      active: counts.get(p.user_id) ?? 0,
    })));
  }

  useEffect(() => {
    loadData();
    loadDrivers();
    if (!user) return;
    const channel = supabase
      .channel("pharmacy-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `pharmacy_id=eq.${user.id}` }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function openAddMedication() {
    setEditingMed(null);
    setForm({ name: "", price: "", stock: "", category: "" });
    setMedDialogOpen(true);
  }

  function openEditMedication(med: Medication) {
    if (med.id.startsWith("m")) { toast.info("Demo item — add a real one to edit."); return; }
    setEditingMed(med);
    setForm({
      name: med.name,
      price: String(med.price),
      stock: String(med.stock_quantity),
      category: med.category ?? "",
    });
    setMedDialogOpen(true);
  }

  async function handleSaveMedication(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSavingMed(true);
    const payload = {
      pharmacy_id: user.id,
      name: form.name,
      price: Number(form.price) || 0,
      stock_quantity: Number(form.stock) || 0,
      category: form.category || null,
    };
    const { error } = editingMed
      ? await supabase.from("medications").update(payload).eq("id", editingMed.id)
      : await supabase.from("medications").insert(payload);
    setSavingMed(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editingMed ? "Medication updated" : "Medication added");
    setMedDialogOpen(false);
    setEditingMed(null);
    loadData();
  }

  async function adjustStock(med: Medication, delta: number) {
    if (med.id.startsWith("m")) { toast.info("Demo item — cannot adjust."); return; }
    const next = Math.max(0, med.stock_quantity + delta);
    const { error } = await supabase.from("medications").update({ stock_quantity: next }).eq("id", med.id);
    if (error) { toast.error(error.message); return; }
    setInventory((prev) => prev.map((m) => (m.id === med.id ? { ...m, stock_quantity: next } : m)));
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("medications").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Medication deleted");
    setDeleteTarget(null);
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

  // Auto-assigns the least-busy approved driver, then sets order → ready and delivery → assigned
  async function markReadyAndAutoAssign(orderId: string) {
    if (orderId.startsWith("demo-")) { toast.info("Demo order — cannot persist."); return; }
    await loadDrivers();
    if (drivers.length === 0) {
      toast.error("No approved drivers available. Ask the admin to approve a driver.");
      return;
    }
    const best = [...drivers].sort((a, b) => a.active - b.active)[0];
    const { error: orderErr } = await supabase.from("orders").update({ status: "ready" }).eq("id", orderId);
    const { error: delErr } = await supabase
      .from("deliveries")
      .update({ driver_id: best.user_id, status: "assigned" })
      .eq("order_id", orderId);
    if (orderErr || delErr) { toast.error((orderErr ?? delErr)!.message); return; }
    toast.success(`Order ready — assigned to ${best.full_name}`);
    loadData();
    loadDrivers();
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
    loadDrivers();
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
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Button size="sm" variant="default" className="gap-1" onClick={() => setAssignOrder(order)}>
                      <CheckCircle className="h-3 w-3" /> Accept & Assign
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1 text-destructive" onClick={() => rejectOrder(order.id)}>
                      <XCircle className="h-3 w-3" /> Reject
                    </Button>
                  </div>
                )}

                {order.status === "accepted" && (
                  <Button size="sm" variant="secondary" className="mt-3" onClick={() => markPreparing(order.id)}>
                    <Pill className="h-3 w-3 mr-1" /> Mark as Preparing
                  </Button>
                )}

                {order.status === "preparing" && (
                  <Button size="sm" variant="default" className="mt-3 gap-1" onClick={() => markReadyAndAutoAssign(order.id)}>
                    <Truck className="h-3 w-3" /> Mark Ready (Auto-assign Driver)
                  </Button>
                )}

                {!["pending", "accepted", "preparing"].includes(order.status) && (
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
            <Button size="sm" variant="outline" onClick={openAddMedication}>+ Add Item</Button>
          </div>
          <div className="space-y-2">
            {displayInventory.map((item) => {
              const low = item.stock_quantity <= LOW_STOCK_THRESHOLD;
              const isDemo = item.id.startsWith("m");
              return (
                <div key={item.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.category || "—"} • R {Number(item.price).toFixed(2)}</p>
                    </div>
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${
                      low ? "bg-destructive/10 text-destructive" : "bg-healthcare-green/20 text-healthcare-green"
                    }`}>
                      {item.stock_quantity} units
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="outline" className="h-7 w-7" disabled={isDemo} onClick={() => adjustStock(item, -1)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="outline" className="h-7 w-7" disabled={isDemo} onClick={() => adjustStock(item, +1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" className="h-7 gap-1" disabled={isDemo} onClick={() => openEditMedication(item)}>
                        <Pencil className="h-3 w-3" /> Edit
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 gap-1 text-destructive hover:text-destructive" disabled={isDemo} onClick={() => setDeleteTarget(item)}>
                        <Trash2 className="h-3 w-3" /> Delete
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Add / Edit Medication Dialog */}
      <Dialog open={medDialogOpen} onOpenChange={(o) => { setMedDialogOpen(o); if (!o) setEditingMed(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingMed ? "Edit Medication" : "Add Medication"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveMedication} className="space-y-4">
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
              <Button type="submit" disabled={savingMed}>
                {savingMed ? "Saving..." : editingMed ? "Save Changes" : "Add Medication"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete medication?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <span className="font-medium text-foreground">{deleteTarget?.name}</span> from your inventory. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assign Driver Dialog */}
      <Dialog open={!!assignOrder} onOpenChange={(o) => !o && setAssignOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Driver</DialogTitle>
          </DialogHeader>
          {assignOrder && (
            <div className="text-sm text-muted-foreground mb-2">
              Order <span className="font-mono">{assignOrder.id.slice(0, 8)}</span> — {assignOrder.medication_name}
            </div>
          )}
          {drivers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No approved drivers available. Ask the admin to approve drivers first.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {[...drivers].sort((a, b) => a.active - b.active).map((d) => (
                <button
                  key={d.user_id}
                  type="button"
                  disabled={assigning}
                  onClick={() => assignDriver(d.user_id)}
                  className="flex w-full items-center justify-between rounded-lg border border-border p-3 text-left hover:bg-accent transition-colors disabled:opacity-50"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{d.full_name}</p>
                    <p className="text-xs text-muted-foreground">{d.active} active deliveries</p>
                  </div>
                  <CheckCircle className="h-4 w-4 text-primary" />
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
