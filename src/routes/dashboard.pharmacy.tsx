import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import pharmacyHero from "@/assets/pharmacy-1.jpg";
import medGeneric from "@/assets/med-generic.jpg";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Pencil, Trash2, Plus, Minus, Truck, Radio, MessageCircle, Settings, Phone,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
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
import { OrderTimeline } from "@/components/OrderTimeline";
import { OrderGroupTimeline } from "@/components/OrderGroupTimeline";
import { PharmacyOffersInbox } from "@/components/PharmacyOffersInbox";
import { PharmacyLocationCard } from "@/components/PharmacyLocationCard";
import { PharmacyBranchesManager } from "@/components/PharmacyBranchesManager";
import { BulkMedicineImportDialog } from "@/components/BulkMedicineImportDialog";
import { PharmacyAppointments } from "@/components/PharmacyAppointments";
import { PharmacyBookingSettings } from "@/components/PharmacyBookingSettings";
import { LiveETACard } from "@/components/LiveETACard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MEDICINE_CATEGORIES } from "@/lib/categories";
import { dispatchOrderToNearbyDrivers } from "@/lib/driver-dispatch.functions";
import { groupAndHydrate, type GroupedOrder } from "@/lib/orderGroups";


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
  order_group_id: string | null;
  patient_id: string;
  medication_name: string;
  quantity: number;
  status: string;
  total_amount: number;
  created_at: string;
  priority?: boolean | null;
  scheduled_for?: string | null;
}

const LOW_STOCK_THRESHOLD = 10;

interface LiveDelivery {
  id: string;
  order_id: string;
  order_group_id: string | null;
  status: string;
  driver_id: string | null;
  driver_name: string | null;
  driver_avatar: string | null;
  driver_phone: string | null;
  medication_name: string;
  delivery_address: string | null;
  updated_at: string;
  pickup_code: string | null;
}

function PharmacyDashboard() {
  const { user, profile, approvalStatus, isDemo, signOut } = useAuth();
  const dispatchDrivers = useServerFn(dispatchOrderToNearbyDrivers);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inventory, setInventory] = useState<Medication[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderGroups, setOrderGroups] = useState<GroupedOrder<Order>[]>([]);
  const [liveDeliveries, setLiveDeliveries] = useState<LiveDelivery[]>([]);
  const [loading, setLoading] = useState(true);

  // Add / Edit medication
  const [medDialogOpen, setMedDialogOpen] = useState(false);
  const [editingMed, setEditingMed] = useState<Medication | null>(null);
  const [savingMed, setSavingMed] = useState(false);
  const [form, setForm] = useState({ name: "", price: "", stock: "", category: "", requires_prescription: false, image_url: "", expiry_date: "", batch_number: "", description: "" });
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

  // 🔔 Play a ticking beep while pending orders exist (1s interval).
  // Mirrors the driver dashboard exactly — Web Audio only, no vibration, no alarm UI.
  const pendingOrders = orders.filter((o) => o.status === "pending");
  const pendingOrdersCount = pendingOrders.length;
  useEffect(() => {
    if (pendingOrdersCount === 0) return;
    let ctx: AudioContext | null = null;
    function beep() {
      try {
        if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = 880;
        g.gain.value = 0.0001;
        o.connect(g); g.connect(ctx.destination);
        const t = ctx.currentTime;
        g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
        o.start(t); o.stop(t + 0.18);
      } catch { /* ignore */ }
    }
    beep();
    const id = setInterval(beep, 1000);
    return () => { clearInterval(id); ctx?.close().catch(() => {}); };
  }, [pendingOrdersCount]);

  async function loadData() {
    if (!user) return;
    setLoading(true);
    const medsQ = supabase.from("medications").select("*").eq("pharmacy_id", user.id);
    const ordersQ = supabase.from("orders").select("*").eq("pharmacy_id", user.id);
    const [medsRes, ordersRes] = await Promise.all([
      (isDemo ? medsQ : medsQ.eq("is_demo", false)).order("created_at", { ascending: false }),
      (isDemo ? ordersQ : ordersQ.eq("is_demo", false)).order("created_at", { ascending: false }),
    ]);
    setInventory((medsRes.data ?? []) as Medication[]);
    const ordersList = (ordersRes.data ?? []) as Order[];
    setOrders(ordersList);
    setOrderGroups(await groupAndHydrate<Order>(ordersList));

    // Load live deliveries (in-progress) for this pharmacy's orders
    const myOrderIds = (ordersRes.data ?? []).map((o) => o.id);
    if (myOrderIds.length > 0) {
      const { data: dels } = await supabase
        .from("deliveries")
        .select("id, order_id, order_group_id, status, driver_id, delivery_address, updated_at, pickup_code")
        .in("order_id", myOrderIds)
        .in("status", ["assigned", "picked_up", "in_transit"])
        .order("updated_at", { ascending: false });
      const orderNameMap = new Map((ordersRes.data ?? []).map((o) => [o.id, o.medication_name]));
      // Fetch driver contact info (name/avatar/phone) for each order via secure RPC
      const contacts = await Promise.all(
        (dels ?? []).map(async (d) => {
          if (!d.driver_id) return null;
          const { data: c } = await supabase.rpc("get_order_driver_contact", { _order_id: d.order_id });
          const row = Array.isArray(c) ? c[0] : null;
          return row as { user_id: string; full_name: string; avatar_url: string; phone: string } | null;
        })
      );
      setLiveDeliveries((dels ?? []).map((d, i) => {
        const c = contacts[i];
        return {
          id: d.id,
          order_id: d.order_id,
          order_group_id: (d as { order_group_id?: string | null }).order_group_id ?? null,
          status: d.status,
          driver_id: d.driver_id ?? null,
          driver_name: c?.full_name || (d.driver_id ? "Driver" : null),
          driver_avatar: c?.avatar_url || null,
          driver_phone: c?.phone || null,
          medication_name: orderNameMap.get(d.order_id) || "Order",
          delivery_address: d.delivery_address,
          updated_at: d.updated_at,
          pickup_code: (d as { pickup_code?: string | null }).pickup_code ?? null,
        };
      }));
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
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders", filter: `pharmacy_id=eq.${user.id}` }, (payload) => {
        loadData();
        const ord = payload.new as { medication_name?: string; quantity?: number; priority?: boolean; status?: string };
        if (ord?.status === "scheduled") return; // hold scheduled — no beep yet
        toast.success(ord?.priority ? "🚨 PRIORITY new order" : "🔔 New incoming order", {
          description: `${ord?.medication_name ?? "Order"} × ${ord?.quantity ?? 1}`,
          duration: 30_000,
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `pharmacy_id=eq.${user.id}` }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, async (payload) => {
        loadData();
        const newRow = payload.new as { order_id?: string; status?: string };
        const oldRow = payload.old as { status?: string };
        if (newRow?.status === "delivered" && oldRow?.status !== "delivered" && newRow.order_id) {
          const { data: ord } = await supabase.from("orders").select("pharmacy_id, medication_name").eq("id", newRow.order_id).maybeSingle();
          if (ord?.pharmacy_id === user.id) {
            const { data: pay } = await supabase.from("payments").select("invoice_number").eq("order_id", newRow.order_id).maybeSingle();
            toast.success("Order delivered ✅", { description: `${ord.medication_name} — Invoice ${pay?.invoice_number || "pending"}` });
          }
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "prescription_uploads", filter: `pharmacy_id=eq.${user.id}` }, () => loadPxQueue())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function openAddMedication() {
    setEditingMed(null);
    setForm({ name: "", price: "", stock: "", category: "", requires_prescription: false, image_url: "", expiry_date: "", batch_number: "", description: "" });
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
      description: (med as any).description ?? "",
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
    const desc = form.description.trim();
    if (desc.length < 30) {
      toast.error("A full medicine description is required by law (min 30 characters). Include indications, dosage, ingredients, side effects, and warnings.");
      return;
    }
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
      description: desc,
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

  // ---- Group-aware bulk actions (apply to ALL items in the package) ----
  async function setGroupStatus(g: GroupedOrder<Order>, status: "cancelled" | "accepted" | "preparing" | "ready") {
    const ids = g.items.map((i) => i.id);
    const { error } = await supabase.from("orders").update({ status }).in("id", ids);
    if (error) { toast.error(error.message); return false; }
    if (g.group?.id) {
      await supabase.from("order_groups" as never).update({ status } as never).eq("id", g.group.id);
    }
    return true;
  }

  async function rejectGroup(g: GroupedOrder<Order>) {
    if (!(await setGroupStatus(g, "cancelled"))) return;
    toast.success("Order rejected");
    loadData();
  }

  async function acceptGroup(g: GroupedOrder<Order>) {
    if (!(await setGroupStatus(g, "accepted"))) return;
    toast.success("Order accepted — prepare it when ready");
    loadData();
  }

  async function markGroupPreparing(g: GroupedOrder<Order>) {
    if (!(await setGroupStatus(g, "preparing"))) return;
    toast.success("Package marked preparing");
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

  // Marks ALL items in a group as ready and broadcasts ONE driver offer keyed
  // off the first order id (the delivery is created per-group by the DB trigger).
  async function markGroupReadyAndBroadcast(g: GroupedOrder<Order>) {
    if (!user) return;
    if (!(await setGroupStatus(g, "ready"))) return;
    const first = g.items[0];
    if (first) await broadcastToDrivers(first);
    loadData();
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
    try {
      const result = await dispatchDrivers({ data: { orderId: order.id } });
      if (result.assigned) toast.info("A driver is already assigned to this order.");
      else if (result.waiting) toast.info("Request already broadcast — waiting for a driver.");
      else if ((result.inserted ?? 0) > 0) toast.success(`Request sent to ${result.inserted} nearby driver${result.inserted === 1 ? "" : "s"}`);
      else toast.warning("No online drivers within 20 km yet. It will rebroadcast when drivers come online.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Driver broadcast failed");
    }
  }

  if (!isDemo && (approvalStatus === "pending" || approvalStatus === "rejected" || approvalStatus === "suspended" || approvalStatus === "expired")) {
    const titleMap: Record<string, string> = {
      pending: "Complete your pharmacy verification",
      rejected: "Application rejected",
      suspended: "Account suspended",
      expired: "Licence expired",
    };
    const descMap: Record<string, string> = {
      pending: "Submit your licence, pharmacist credentials and supporting documents. Admins will review and approve your pharmacy.",
      rejected: "Your application was rejected. Please update your documents and re-submit for review.",
      suspended: "Your pharmacy is currently suspended. Contact support or update your documents.",
      expired: "Your pharmacy licence has expired. Re-upload a valid licence to continue receiving orders.",
    };
    const status = approvalStatus ?? "pending";
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="healthcare-card p-8 max-w-md text-center">
          <Clock className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-bold text-foreground">{titleMap[status]}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{descMap[status]}</p>
          <div className="mt-6 flex flex-col gap-2">
            <Button asChild><a href="/pharmacy/onboarding">Open verification wizard</a></Button>
            <Button variant="outline" onClick={signOut}>Sign Out</Button>
          </div>
        </div>
      </div>
    );
  }

  if (!isDemo && approvalStatus === "under_review") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="healthcare-card p-8 max-w-md text-center">
          <Clock className="mx-auto h-12 w-12 text-primary mb-4" />
          <h2 className="text-xl font-bold text-foreground">Under review</h2>
          <p className="mt-2 text-sm text-muted-foreground">Thanks — your documents are with our admin team. We'll notify you as soon as you're approved.</p>
          <div className="mt-6 flex flex-col gap-2">
            <Button asChild variant="outline"><a href="/pharmacy/onboarding">Review my submission</a></Button>
            <Button variant="outline" onClick={signOut}>Sign Out</Button>
          </div>
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
        <div className="flex flex-wrap gap-2">
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        {[
          { icon: ShoppingCart, label: "Pending Orders", value: String(pendingCount), color: "text-primary", to: null, target: "orders-section" },
          { icon: Package, label: "Total Products", value: String(inventory.length), color: "text-healthcare-teal", to: "/dashboard/pharmacy/inventory", target: null },
          { icon: AlertTriangle, label: "Low Stock", value: String(lowStockItems.length), color: "text-destructive", to: "/dashboard/pharmacy/low-stock", target: null },
          { icon: DollarSign, label: "Revenue (Total)", value: `R ${monthRevenue.toFixed(0)}`, color: "text-healthcare-green", to: null, target: "orders-section" },
        ].map((stat) => {
          const body = (
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-xl font-bold text-foreground">{stat.value}</p>
              </div>
            </div>
          );
          const className = "healthcare-card p-5 text-left transition-all hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary block";
          if (stat.to) {
            return <Link key={stat.label} to={stat.to} className={className}>{body}</Link>;
          }
          return (
            <a
              key={stat.label}
              href={`#${stat.target}`}
              onClick={(e) => {
                e.preventDefault();
                const el = document.getElementById(stat.target!);
                if (el) {
                  history.replaceState(null, "", `#${stat.target}`);
                  el.scrollIntoView({ behavior: "smooth", block: "start" });
                }
              }}
              className={className}
            >{body}</a>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <PharmacyOffersInbox />
        <PharmacyLocationCard />
        <PharmacyBranchesManager />
      </div>

      {lowStockItems.length > 0 && (
        <Link
          to="/dashboard/pharmacy/low-stock"
          className="mb-6 block rounded-lg border border-destructive/30 bg-destructive/5 p-4 hover:bg-destructive/10 transition-colors"
        >
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm font-semibold text-destructive">Low Stock Alerts</span>
            <span className="ml-auto text-[11px] text-destructive/80 font-medium">Open Low Stock →</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStockItems.slice(0, 8).map((item) => (
              <span key={item.id} className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-3 py-1 text-xs text-destructive">
                <TrendingDown className="h-3 w-3" /> {item.name} ({item.stock_quantity} left)
              </span>
            ))}
            {lowStockItems.length > 8 && (
              <span className="text-xs text-destructive/80 self-center">+{lowStockItems.length - 8} more</span>
            )}
          </div>
        </Link>
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
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid gap-4 sm:grid-cols-2">
              {liveDeliveries.map((d) => (
                <DeliveryTimelineCard key={d.id} delivery={d} onChat={setChatOrderId} />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Incoming Orders */}
        <div id="orders-section" className="healthcare-card p-6 scroll-mt-20">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Incoming Orders</h2>
            <Button size="sm" variant="outline" onClick={loadData} disabled={loading}>
              {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Refresh
            </Button>
          </div>
          {!loading && orderGroups.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">No orders yet. Add medications to your inventory so patients can find and order from you.</p>
          )}
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            {orderGroups.map((g) => {
              const itemCount = g.items.reduce((s, i) => s + i.quantity, 0);
              return (
                <div key={g.key} className="rounded-lg border border-border p-4">
                  <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground">{g.key.slice(0, 8)}</span>
                      {g.delivery_code && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                          CODE {g.delivery_code}
                        </span>
                      )}
                      {g.priority && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/15 text-destructive font-semibold">PRIORITY</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{new Date(g.created_at).toLocaleDateString()}</span>
                      <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setChatOrderId(g.primaryOrderId)}>
                        <MessageCircle className="h-3 w-3" /> Chat
                      </Button>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground mb-1">
                    {g.items.length} item{g.items.length === 1 ? "" : "s"} · {itemCount} unit{itemCount === 1 ? "" : "s"} · one package
                  </p>
                  <ul className="text-sm space-y-0.5 mb-2">
                    {g.items.map((it) => (
                      <li key={it.id} className="flex justify-between gap-2">
                        <span className="text-foreground">{it.medication_name} <span className="text-muted-foreground">× {it.quantity}</span></span>
                        <span className="text-muted-foreground">R {Number(it.total_amount).toFixed(2)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">Package total: <span className="font-semibold text-foreground">R {g.total.toFixed(2)}</span></p>

                  {g.status === "pending" && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Button size="sm" variant="default" className="gap-1" onClick={() => acceptGroup(g)}>
                        <CheckCircle className="h-3 w-3" /> Accept Order
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1 text-destructive" onClick={() => rejectGroup(g)}>
                        <XCircle className="h-3 w-3" /> Reject
                      </Button>
                    </div>
                  )}

                  {g.status === "accepted" && (
                    <Button size="sm" variant="secondary" className="mt-3" onClick={() => markGroupPreparing(g)}>
                      <Pill className="h-3 w-3 mr-1" /> Mark as Preparing
                    </Button>
                  )}

                  {g.status === "preparing" && (
                    <Button size="sm" variant="default" className="mt-3 gap-1" onClick={() => markGroupReadyAndBroadcast(g)}>
                      <Truck className="h-3 w-3" /> Mark Ready & Broadcast to Drivers
                    </Button>
                  )}

                  {!["pending", "accepted", "preparing"].includes(g.status) && (
                    <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full bg-accent capitalize">{g.status.replace(/_/g, " ")}</span>
                  )}
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
                    <div className="flex items-center gap-2">
                      {u.flagged && <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-destructive/15 text-destructive font-semibold">⚑ Flagged</span>}
                      <PrescriptionStatusBadge status={u.status} />
                    </div>
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
            <div className="space-y-2">
              <Label htmlFor="description">
                Full description <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                required
                minLength={30}
                maxLength={4000}
                rows={6}
                placeholder="Active ingredient(s), strength, indications (what it treats), dosage & directions, contraindications, common side effects, warnings, storage. Regulated by the SAHPRA Medicines Act."
              />
              <p className="text-[11px] text-muted-foreground">
                Required by law (Medicines & Related Substances Act). Include active ingredient, strength, indications, dosage, side effects, warnings & storage. Min 30 characters.
              </p>
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
              <Select value={form.category || "Other"} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger id="category"><SelectValue placeholder="Choose a category" /></SelectTrigger>
                <SelectContent>
                  {MEDICINE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
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

      <div className="mt-8">
        <Tabs defaultValue="analytics" className="w-full">
          <div className="-mx-4 sm:mx-0 overflow-x-auto scrollbar-none">
            <TabsList className="inline-flex w-max min-w-full px-4 sm:px-0">
              <TabsTrigger value="analytics" className="whitespace-nowrap">Analytics</TabsTrigger>
              <TabsTrigger value="appointments" className="whitespace-nowrap">Appointments</TabsTrigger>
              <TabsTrigger value="booking" className="whitespace-nowrap">Booking setup</TabsTrigger>
              <TabsTrigger value="finance" className="whitespace-nowrap">Finance</TabsTrigger>
              <TabsTrigger value="transactions" className="whitespace-nowrap">Transactions</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="analytics" className="mt-4"><PharmacyAnalytics /></TabsContent>
          <TabsContent value="appointments" className="mt-4"><PharmacyAppointments /></TabsContent>
          <TabsContent value="booking" className="mt-4"><PharmacyBookingSettings /></TabsContent>
          <TabsContent value="finance" className="mt-4"><PharmacyFinance /></TabsContent>
          <TabsContent value="transactions" className="mt-4"><TransactionHistory role="pharmacy" /></TabsContent>
        </Tabs>
      </div>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

function DeliveryTimelineCard({ delivery, onChat }: { delivery: LiveDelivery; onChat?: (orderId: string) => void }) {
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
      <div className="flex items-center gap-2 mt-2">
        {delivery.driver_avatar ? (
          <img src={delivery.driver_avatar} alt={delivery.driver_name || "Driver"} className="h-9 w-9 rounded-full object-cover ring-1 ring-border" />
        ) : (
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">{(delivery.driver_name || "D").slice(0,1)}</div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground truncate">{delivery.driver_name || "Unassigned"}</p>
          {delivery.driver_phone && <p className="text-[10px] text-muted-foreground truncate">{delivery.driver_phone}</p>}
        </div>
        {delivery.driver_phone && (
          <Button asChild size="sm" variant="outline" className="h-7 gap-1 text-xs">
            <a href={`tel:${delivery.driver_phone}`}><Phone className="h-3 w-3" /> Call</a>
          </Button>
        )}
      </div>
      {delivery.delivery_address && (
        <p className="text-xs text-muted-foreground truncate mt-2">→ {delivery.delivery_address}</p>
      )}
      {delivery.pickup_code && !["delivered", "cancelled", "failed"].includes(delivery.status) && (
        <div className="mt-3 rounded-lg bg-primary/5 border border-primary/30 p-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pickup code</p>
            <p className="text-2xl font-bold font-mono text-primary tracking-[0.4em]">{delivery.pickup_code}</p>
          </div>
          <p className="text-[10px] text-muted-foreground max-w-[120px] text-right leading-tight">
            {delivery.status === "picked_up" || delivery.status === "out_for_delivery"
              ? "Driver has picked up — code stays visible until delivery is complete"
              : "Share with the driver to confirm pickup"}
          </p>
        </div>
      )}

      {/* Auto-updating ETA from driver's live location */}
      {delivery.driver_id && delivery.status !== "delivered" && (
        <div className="mt-3">
          <LiveETACard orderId={delivery.order_id} deliveryStatus={delivery.status} />
        </div>
      )}

      {/* Unified real-time timeline */}
      <div className="mt-4">
        {delivery.order_group_id ? (
          <OrderGroupTimeline orderGroupId={delivery.order_group_id} deliveryCode={delivery.pickup_code} />
        ) : (
          <OrderTimeline orderId={delivery.order_id} initialDeliveryStatus={delivery.status} compact />
        )}
        <p className="text-[10px] text-muted-foreground mt-2 text-right">
          Last change {minsAgo === 0 ? "just now" : `${minsAgo}m ago`}
        </p>
      </div>

    </div>
  );
}
