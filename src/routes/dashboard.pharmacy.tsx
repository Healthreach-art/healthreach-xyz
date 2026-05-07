import { createFileRoute } from "@tanstack/react-router";
import pharmacyHero from "@/assets/pharmacy-1.jpg";
import medGeneric from "@/assets/med-generic.jpg";
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
  Pencil, Trash2, Plus, Minus, Truck, Radio, MessageCircle, Settings,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { OrderChatDialog } from "@/components/OrderChatDialog";
import { SettingsDialog } from "@/components/SettingsDialog";
import { TransactionHistory } from "@/components/TransactionHistory";
import { PharmacyReviewActions, PrescriptionStatusBadge, type PrescriptionUpload } from "@/components/PrescriptionVerification";
import { customerPrice } from "@/lib/pricing";
import { PharmacyAnalytics } from "@/components/PharmacyAnalytics";
import { PharmacyFinance } from "@/components/PharmacyFinance";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { RoleGuard } from "@/components/RoleGuard";

export const Route = createFileRoute("/dashboard/pharmacy")({
  head: () => ({ meta: [{ title: "Pharmacy Dashboard — HEALTHREACH" }] }),
  component: () => <RoleGuard allow="pharmacy"><PharmacyDashboard /></RoleGuard>,
});

interface Medication {
  id: string;
  name: string;
  stock_quantity: number;
  price: number;
  category: string | null;
  requires_prescription?: boolean | null;
  image_url?: string | null;
  expiry_date?: string | null;
  batch_number?: string | null;
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

interface LiveDelivery {
  id: string;
  order_id: string;
  status: string;
  driver_name: string | null;
  medication_name: string;
  delivery_address: string | null;
  updated_at: string;
  pickup_code: string | null;
}

function PharmacyDashboard() {
  const { user, profile, approvalStatus, signOut } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inventory, setInventory] = useState<Medication[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [liveDeliveries, setLiveDeliveries] = useState<LiveDelivery[]>([]);
  const [loading, setLoading] = useState(true);

  // Add / Edit medication
  const [medDialogOpen, setMedDialogOpen] = useState(false);
  const [editingMed, setEditingMed] = useState<Medication | null>(null);
  const [savingMed, setSavingMed] = useState(false);
  const [form, setForm] = useState({ name: "", price: "", stock: "", category: "", requires_prescription: false, image_url: "", expiry_date: "", batch_number: "" });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [pxQueue, setPxQueue] = useState<PrescriptionUpload[]>([]);
  const [pxFilter, setPxFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Medication | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Driver assignment
  const [drivers, setDrivers] = useState<{ user_id: string; full_name: string; active: number }[]>([]);
  const [assignOrder, setAssignOrder] = useState<Order | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [chatOrderId, setChatOrderId] = useState<string | null>(null);

  async function loadData() {
    if (!user) return;
    setLoading(true);
    const [medsRes, ordersRes] = await Promise.all([
      supabase.from("medications").select("*").eq("pharmacy_id", user.id).order("created_at", { ascending: false }),
      supabase.from("orders").select("*").eq("pharmacy_id", user.id).order("created_at", { ascending: false }),
    ]);
    setInventory((medsRes.data ?? []) as Medication[]);
    setOrders((ordersRes.data ?? []) as Order[]);

    // Load live deliveries (in-progress) for this pharmacy's orders
    const myOrderIds = (ordersRes.data ?? []).map((o) => o.id);
    if (myOrderIds.length > 0) {
      const { data: dels } = await supabase
        .from("deliveries")
        .select("id, order_id, status, driver_id, delivery_address, updated_at, pickup_code")
        .in("order_id", myOrderIds)
        .in("status", ["assigned", "picked_up", "in_transit"])
        .order("updated_at", { ascending: false });
      const driverIds = Array.from(new Set((dels ?? []).map((d) => d.driver_id).filter(Boolean) as string[]));
      const { data: driverProfs } = driverIds.length > 0
        ? await supabase.from("profiles").select("user_id, full_name").in("user_id", driverIds)
        : { data: [] as { user_id: string; full_name: string }[] };
      const nameMap = new Map((driverProfs ?? []).map((p) => [p.user_id, p.full_name]));
      const orderNameMap = new Map((ordersRes.data ?? []).map((o) => [o.id, o.medication_name]));
      setLiveDeliveries((dels ?? []).map((d) => ({
        id: d.id,
        order_id: d.order_id,
        status: d.status,
        driver_name: d.driver_id ? (nameMap.get(d.driver_id) || "Driver") : null,
        medication_name: orderNameMap.get(d.order_id) || "Order",
        delivery_address: d.delivery_address,
        updated_at: d.updated_at,
        pickup_code: (d as { pickup_code?: string | null }).pickup_code ?? null,
      })));
    } else {
      setLiveDeliveries([]);
    }
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

  async function loadPxQueue() {
    if (!user) return;
    const { data } = await supabase
      .from("prescription_uploads")
      .select("*")
      .eq("pharmacy_id", user.id)
      .order("created_at", { ascending: false });
    setPxQueue((data ?? []) as PrescriptionUpload[]);
  }

  // Restore scroll to URL hash on load / refresh
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace("#", "");
    if (!hash) return;
    const t = setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "start" });
    }, 300);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    loadData();
    loadDrivers();
    loadPxQueue();
    if (!user) return;
    const channel = supabase
      .channel(`pharmacy-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `pharmacy_id=eq.${user.id}` }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "prescription_uploads", filter: `pharmacy_id=eq.${user.id}` }, () => loadPxQueue())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function openAddMedication() {
    setEditingMed(null);
    setForm({ name: "", price: "", stock: "", category: "", requires_prescription: false, image_url: "", expiry_date: "", batch_number: "" });
    setMedDialogOpen(true);
  }

  function openEditMedication(med: Medication) {
    setEditingMed(med);
    setForm({
      name: med.name,
      price: String(med.price),
      stock: String(med.stock_quantity),
      category: med.category ?? "",
      requires_prescription: !!med.requires_prescription,
      image_url: med.image_url ?? "",
      expiry_date: med.expiry_date ?? "",
      batch_number: med.batch_number ?? "",
    });
    setMedDialogOpen(true);
  }

  async function handleImageUpload(file: File) {
    if (!user) return;
    if (!file.type.startsWith("image/")) { toast.error("Choose an image file"); return; }
    if (file.size > 4 * 1024 * 1024) { toast.error("Max 4 MB"); return; }
    setUploadingImage(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
      const { error } = await supabase.storage.from("medication-images").upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from("medication-images").getPublicUrl(path);
      setForm((f) => ({ ...f, image_url: data.publicUrl }));
      toast.success("Image uploaded");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingImage(false);
    }
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
      requires_prescription: form.requires_prescription,
      image_url: form.image_url || null,
      expiry_date: form.expiry_date || null,
      batch_number: form.batch_number || null,
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

    const { error } = await supabase.from("orders").update({ status: "cancelled" }).eq("id", orderId);
    if (error) { toast.error(error.message); return; }
    toast.success("Order rejected");
    loadData();
  }

  async function markPreparing(orderId: string) {

    const { error } = await supabase.from("orders").update({ status: "preparing" }).eq("id", orderId);
    if (error) { toast.error(error.message); return; }
    toast.success("Order marked preparing");
    loadData();
  }

  // Ensure a deliveries row exists for the order; returns true on success.
  async function ensureDeliveryRow(orderId: string, driverId: string | null): Promise<boolean> {
    const { data: existing } = await supabase
      .from("deliveries").select("id").eq("order_id", orderId).maybeSingle();
    if (existing) {
      const update: { driver_id?: string; status: "assigned" } = { status: "assigned" };
      if (driverId) update.driver_id = driverId;
      const { error } = await supabase.from("deliveries").update(update).eq("order_id", orderId);
      if (error) { toast.error(error.message); return false; }
      return true;
    }
    // Look up addresses from order + pharmacy profile
    const { data: order } = await supabase
      .from("orders").select("delivery_address").eq("id", orderId).maybeSingle();
    const { data: pharm } = user
      ? await supabase.from("profiles").select("address, organization_name").eq("user_id", user.id).maybeSingle()
      : { data: null };
    const pickup = pharm?.address?.trim() || pharm?.organization_name || "Pharmacy pickup point";
    const { error } = await supabase.from("deliveries").insert({
      order_id: orderId,
      driver_id: driverId,
      status: "assigned",
      pickup_address: pickup,
      delivery_address: order?.delivery_address || "",
      estimated_time: "30-45 minutes",
    });
    if (error) { toast.error(error.message); return false; }
    return true;
  }

  // Auto-assigns the least-busy approved driver, then sets order → ready and delivery → assigned
  async function markReadyAndAutoAssign(orderId: string) {
    await loadDrivers();
    if (drivers.length === 0) {
      toast.error("No approved drivers available. Ask the admin to approve a driver.");
      return;
    }
    const best = [...drivers].sort((a, b) => a.active - b.active)[0];
    const ok = await ensureDeliveryRow(orderId, best.user_id);
    if (!ok) return;
    const { error: orderErr } = await supabase.from("orders").update({ status: "ready" }).eq("id", orderId);
    if (orderErr) { toast.error(orderErr.message); return; }
    toast.success(`Order ready — assigned to ${best.full_name}`);
    loadData();
    loadDrivers();
  }

  async function assignDriver(driverId: string) {
    if (!assignOrder) return;
    setAssigning(true);
    const ok = await ensureDeliveryRow(assignOrder.id, driverId);
    if (!ok) { setAssigning(false); return; }
    const { error: orderErr } = await supabase.from("orders").update({ status: "accepted" }).eq("id", assignOrder.id);
    setAssigning(false);
    if (orderErr) { toast.error(orderErr.message); return; }
    toast.success("Order accepted and driver assigned");
    setAssignOrder(null);
    loadData();
    loadDrivers();
  }

  // Uber-style: broadcast to all approved drivers; first to accept wins
  async function broadcastToDrivers(order: Order) {

    if (!user) return;
    // Avoid duplicate open offers for same order
    const { data: existing } = await supabase
      .from("delivery_offers")
      .select("id")
      .eq("order_id", order.id)
      .eq("status", "open")
      .maybeSingle();
    if (existing) { toast.info("Request already broadcast — waiting for a driver."); return; }
    const { error } = await supabase.from("delivery_offers").insert({
      order_id: order.id,
      pharmacy_id: user.id,
      message: `${order.medication_name} × ${order.quantity}`,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Request sent to all available drivers");
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

  const lowStockItems = inventory.filter((i) => i.stock_quantity <= LOW_STOCK_THRESHOLD);
  const pendingCount = orders.filter((o) => o.status === "pending").length;
  const monthRevenue = orders
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

  return (
    <div className="container-narrow px-4 sm:px-6 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pharmacy Dashboard</h1>
          <p className="text-sm text-muted-foreground">{profile?.organization_name || "My Pharmacy"}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}><Settings className="h-4 w-4" /> Settings</Button>
          <Button variant="outline" size="sm" onClick={signOut}>Sign Out</Button>
        </div>
      </div>

      {/* Hero banner */}
      <div className="relative overflow-hidden rounded-2xl mb-6 h-40 sm:h-52">
        <img src={pharmacyHero} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-healthcare-teal/85 via-primary/60 to-transparent" />
        <div className="relative z-10 h-full flex flex-col justify-center px-6 sm:px-10 text-primary-foreground">
          <p className="text-xs uppercase tracking-wider opacity-90">Your storefront</p>
          <h2 className="text-2xl sm:text-3xl font-bold mt-1">{profile?.organization_name || "My Pharmacy"}</h2>
          <p className="text-sm opacity-90 mt-1">{pendingCount} pending order{pendingCount === 1 ? "" : "s"} · {inventory.length} item{inventory.length === 1 ? "" : "s"} listed</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {[
          { icon: ShoppingCart, label: "Pending Orders", value: String(pendingCount), color: "text-primary", target: "orders-section" },
          { icon: Package, label: "Total Products", value: String(inventory.length), color: "text-healthcare-teal", target: "inventory-section" },
          { icon: AlertTriangle, label: "Low Stock", value: String(lowStockItems.length), color: "text-destructive", target: "inventory-section" },
          { icon: DollarSign, label: "Revenue (Total)", value: `R ${monthRevenue.toFixed(0)}`, color: "text-healthcare-green", target: "orders-section" },
        ].map((stat) => (
          <a
            key={stat.label}
            href={`#${stat.target}`}
            onClick={(e) => {
              e.preventDefault();
              const el = document.getElementById(stat.target);
              if (el) {
                history.replaceState(null, "", `#${stat.target}`);
                el.scrollIntoView({ behavior: "smooth", block: "start" });
              }
            }}
            className="healthcare-card p-5 text-left transition-all hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-xl font-bold text-foreground">{stat.value}</p>
              </div>
            </div>
          </a>
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

      {/* Live Deliveries (in progress) with real-time stage timeline */}
      {liveDeliveries.length > 0 && (
        <div className="mb-6 healthcare-card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" /> Active Deliveries
            <span className="inline-flex items-center gap-1 text-xs font-normal text-healthcare-green">
              <Radio className="h-3 w-3 animate-pulse" /> Live
            </span>
            <span className="ml-auto text-xs font-normal text-muted-foreground">{liveDeliveries.length} in progress</span>
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {liveDeliveries.map((d) => (
              <DeliveryTimelineCard key={d.id} delivery={d} onChat={setChatOrderId} />
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Incoming Orders */}
        <div id="orders-section" className="healthcare-card p-6 scroll-mt-20">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Incoming Orders</h2>
          </div>
          {!loading && orders.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">No orders yet. Add medications to your inventory so patients can order.</p>
          )}
          <div className="space-y-3">
            {orders.map((order) => (
              <div key={order.id} className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-muted-foreground">{order.id.slice(0, 8)}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleDateString()}</span>
                    <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setChatOrderId(order.id)}>
                      <MessageCircle className="h-3 w-3" /> Chat
                    </Button>
                  </div>
                </div>
                <p className="text-sm font-medium text-foreground">{order.medication_name} × {order.quantity}</p>
                <p className="text-xs text-muted-foreground mt-1">Total: R {Number(order.total_amount).toFixed(2)}</p>

                {order.status === "pending" && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Button size="sm" variant="default" className="gap-1" onClick={() => setAssignOrder(order)}>
                      <CheckCircle className="h-3 w-3" /> Accept & Assign
                    </Button>
                    <Button size="sm" variant="secondary" className="gap-1" onClick={() => broadcastToDrivers(order)}>
                      <Radio className="h-3 w-3" /> Broadcast to Drivers
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
        <div id="inventory-section" className="healthcare-card p-6 scroll-mt-20">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Inventory</h2>
            <Button size="sm" variant="outline" onClick={openAddMedication}>+ Add Item</Button>
          </div>
          {!loading && inventory.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">Your inventory is empty. Click "+ Add Item" to add medications.</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {inventory.map((item) => {
              const low = item.stock_quantity <= LOW_STOCK_THRESHOLD;
              const out = item.stock_quantity === 0;
              const expSoon = item.expiry_date && (new Date(item.expiry_date).getTime() - Date.now()) < 1000 * 60 * 60 * 24 * 30;
              const expired = item.expiry_date && new Date(item.expiry_date).getTime() < Date.now();
              return (
                <div key={item.id} className="rounded-xl border border-border bg-card overflow-hidden hover:shadow-md transition-shadow">
                  <div className="relative h-24 overflow-hidden">
                    <img src={item.image_url || medGeneric} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                    <span className={`absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                      out ? "bg-muted text-muted-foreground" : low ? "bg-destructive text-destructive-foreground" : "bg-healthcare-green text-primary-foreground"
                    }`}>
                      {out ? "Hidden — out of stock" : `${item.stock_quantity} units`}
                    </span>
                    {(expired || expSoon) && (
                      <span className={`absolute bottom-2 left-2 text-[10px] px-2 py-0.5 rounded-full font-semibold ${expired ? "bg-destructive text-destructive-foreground" : "bg-healthcare-sky/90 text-primary-foreground"}`}>
                        {expired ? "Expired" : "Expires soon"}
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-semibold text-foreground truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.category || "—"} · R {Number(item.price).toFixed(2)}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Customer sees <span className="font-semibold text-foreground">R {customerPrice(item.price).toFixed(2)}</span></p>
                    {(item.batch_number || item.expiry_date) && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {item.batch_number ? `Batch ${item.batch_number}` : ""}
                        {item.batch_number && item.expiry_date ? " · " : ""}
                        {item.expiry_date ? `Exp ${new Date(item.expiry_date).toLocaleDateString()}` : ""}
                      </p>
                    )}
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => adjustStock(item, -1)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => adjustStock(item, +1)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => openEditMedication(item)}>
                          <Pencil className="h-3 w-3" /> Edit
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 gap-1 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(item)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Prescription Verification Queue */}
      <div id="prescription-queue" className="container-narrow px-4 sm:px-6 mt-6">
        <div className="healthcare-card p-6 scroll-mt-24">
          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Pill className="h-5 w-5 text-primary" /> Prescription Verification Queue
              <span className="text-xs font-normal text-muted-foreground">({pxQueue.filter(p => p.status === "pending").length} pending)</span>
            </h2>
            <div className="flex gap-1 text-xs">
              {(["pending", "approved", "rejected", "all"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setPxFilter(f)}
                  className={`px-2 py-1 rounded-md capitalize ${pxFilter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}
                >{f}</button>
              ))}
            </div>
          </div>
          {pxQueue.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">No prescription uploads yet.</p>
          )}
          <div className="space-y-3">
            {pxQueue
              .filter((u) => pxFilter === "all" || u.status === pxFilter)
              .slice(0, 10)
              .map((u) => (
                <div key={u.id} className="rounded-lg border border-border p-4">
                  <div className="flex items-center justify-between mb-3 gap-2">
                    <div>
                      <p className="text-sm font-medium">Patient {u.patient_id.slice(0, 8)}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(u.created_at).toLocaleString()}
                        {u.medication_id ? ` · Med ${u.medication_id.slice(0, 8)}` : ""}
                      </p>
                    </div>
                    <PrescriptionStatusBadge status={u.status} />
                  </div>
                  {(u.status === "pending" || u.status === "reupload_requested") ? (
                    <PharmacyReviewActions row={u} onChanged={loadPxQueue} />
                  ) : (
                    u.pharmacist_notes && (
                      <p className="text-xs text-muted-foreground">Notes: {u.pharmacist_notes}</p>
                    )
                  )}
                </div>
              ))}
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="batch">Batch number</Label>
                <Input id="batch" value={form.batch_number} onChange={(e) => setForm({ ...form, batch_number: e.target.value })} placeholder="A1234" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expiry">Expiry date</Label>
                <Input id="expiry" type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="image">Medicine image</Label>
              <div className="flex items-center gap-3">
                {form.image_url && <img src={form.image_url} alt="" className="h-14 w-14 rounded-md object-cover border border-border" />}
                <Input id="image" type="file" accept="image/*" disabled={uploadingImage}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.currentTarget.value = ""; }} />
              </div>
              {uploadingImage && <p className="text-xs text-muted-foreground">Uploading…</p>}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.requires_prescription}
                onChange={(e) => setForm({ ...form, requires_prescription: e.target.checked })}
                className="h-4 w-4 rounded border-input"
              />
              Requires a valid prescription (Rx)
            </label>
            <p className="text-[11px] text-muted-foreground">Items with stock = 0 are automatically hidden from patients.</p>
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

      <OrderChatDialog orderId={chatOrderId} orderLabel={chatOrderId ? `Order ${chatOrderId.slice(0, 8)}` : ""} onClose={() => setChatOrderId(null)} />
      <div className="mt-6"><TransactionHistory role="pharmacy" /></div>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

const DELIVERY_STAGES: { key: string; label: string }[] = [
  { key: "assigned", label: "Assigned" },
  { key: "picked_up", label: "Picked Up" },
  { key: "in_transit", label: "In Transit" },
  { key: "delivered", label: "Delivered" },
];

function DeliveryTimelineCard({ delivery, onChat }: { delivery: LiveDelivery; onChat?: (orderId: string) => void }) {
  const currentIndex = DELIVERY_STAGES.findIndex((s) => s.key === delivery.status);
  const activeIndex = currentIndex === -1 ? 0 : currentIndex;
  const updated = new Date(delivery.updated_at);
  const minsAgo = Math.max(0, Math.round((Date.now() - updated.getTime()) / 60000));

  return (
    <div className="rounded-lg border border-border p-4 bg-card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-mono text-muted-foreground">#{delivery.order_id.slice(0, 8)}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary capitalize">
            {delivery.status.replace(/_/g, " ")}
          </span>
          {onChat && (
            <Button size="sm" variant="ghost" className="h-6 gap-1 text-xs px-2" onClick={() => onChat(delivery.order_id)}>
              <MessageCircle className="h-3 w-3" /> Chat
            </Button>
          )}
        </div>
      </div>
      <p className="text-sm font-medium text-foreground">{delivery.medication_name}</p>
      <p className="text-xs text-muted-foreground">Driver: {delivery.driver_name || "Unassigned"}</p>
      {delivery.delivery_address && (
        <p className="text-xs text-muted-foreground truncate mt-0.5">→ {delivery.delivery_address}</p>
      )}
      {delivery.status === "assigned" && delivery.pickup_code && (
        <div className="mt-3 rounded-lg bg-primary/5 border border-primary/30 p-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pickup code</p>
            <p className="text-2xl font-bold font-mono text-primary tracking-[0.4em]">{delivery.pickup_code}</p>
          </div>
          <p className="text-[10px] text-muted-foreground max-w-[120px] text-right leading-tight">Share with the driver to confirm pickup</p>
        </div>
      )}

      {/* Stage Timeline */}
      <div className="mt-4">
        <div className="flex items-center">
          {DELIVERY_STAGES.map((stage, idx) => {
            const reached = idx <= activeIndex;
            const isCurrent = idx === activeIndex;
            return (
              <div key={stage.key} className="flex-1 flex items-center last:flex-none">
                <div className="flex flex-col items-center">
                  <div
                    className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold transition-colors ${
                      reached
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    } ${isCurrent ? "ring-2 ring-primary/30 ring-offset-1 ring-offset-card animate-pulse" : ""}`}
                  >
                    {reached ? "✓" : idx + 1}
                  </div>
                  <span
                    className={`mt-1 text-[10px] text-center leading-tight ${
                      reached ? "text-foreground font-medium" : "text-muted-foreground"
                    }`}
                  >
                    {stage.label}
                  </span>
                </div>
                {idx < DELIVERY_STAGES.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-1 mb-4 transition-colors ${
                      idx < activeIndex ? "bg-primary" : "bg-muted"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2 text-right">
          Updated {minsAgo === 0 ? "just now" : `${minsAgo}m ago`}
        </p>
      </div>
    </div>
  );
}
