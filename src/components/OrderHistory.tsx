import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { History, Repeat, Download, Search, X, Star, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { downloadReceiptPdf } from "@/lib/receipt";
import { toast } from "sonner";
import { OrderTimeline } from "@/components/OrderTimeline";
import { LiveETACard } from "@/components/LiveETACard";
import { useServerFn } from "@tanstack/react-start";
import { cancelOrder } from "@/lib/orders.functions";
import { ReviewDialog } from "@/components/ReviewDialog";


interface OrderRow {
  id: string;
  medication_name: string;
  status: string;
  total_amount: number;
  quantity: number;
  pharmacy_id: string;
  medication_id: string | null;
  created_at: string;
  prescription_upload_id: string | null;
}

const statusColors: Record<string, string> = {
  pending: "bg-accent text-accent-foreground",
  accepted: "bg-healthcare-sky/20 text-healthcare-sky",
  preparing: "bg-accent text-primary",
  ready: "bg-healthcare-mint/30 text-healthcare-green",
  out_for_delivery: "bg-primary/10 text-primary",
  delivered: "bg-healthcare-green/20 text-healthcare-green",
  cancelled: "bg-destructive/10 text-destructive",
  rejected: "bg-destructive/10 text-destructive",
};

const statusLabels: Record<string, string> = {
  pending: "Pending verification",
  accepted: "Pharmacist reviewing",
  preparing: "Approved — preparing",
  ready: "Packed",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

export function OrderHistory() {
  const { user, profile } = useAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [filter, setFilter] = useState<"all" | "active" | "delivered">("all");
  const [q, setQ] = useState("");
  const [pulseId, setPulseId] = useState<string | null>(null);
  const [driverByOrder, setDriverByOrder] = useState<Record<string, string | null>>({});
  const [reviewedOrders, setReviewedOrders] = useState<Set<string>>(new Set());
  const [reviewFor, setReviewFor] = useState<OrderRow | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const cancelFn = useServerFn(cancelOrder);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: ords } = await supabase
        .from("orders")
        .select("id, medication_name, status, total_amount, quantity, pharmacy_id, medication_id, created_at, prescription_upload_id")
        .eq("patient_id", user.id)
        .order("created_at", { ascending: false });
      const rows = (ords ?? []) as OrderRow[];
      setOrders(rows);
      const ids = rows.map((o) => o.id);
      if (ids.length === 0) return;
      const [{ data: dels }, { data: revs }] = await Promise.all([
        supabase.from("deliveries").select("order_id, driver_id").in("order_id", ids),
        supabase.from("ratings").select("order_id").eq("patient_id", user.id).in("order_id", ids),
      ]);
      const dmap: Record<string, string | null> = {};
      for (const d of (dels ?? [])) dmap[d.order_id] = (d as { driver_id: string | null }).driver_id;
      setDriverByOrder(dmap);
      setReviewedOrders(new Set((revs ?? []).map((r) => (r as { order_id: string }).order_id)));
    };
    load();

    const channel = supabase
      .channel(`orders-live-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `patient_id=eq.${user.id}` },
        (payload: any) => {
          const row = payload.new as OrderRow;
          if (payload.eventType === "INSERT") {
            setOrders((prev) => [row, ...prev]);
            toast.success("Order placed", { description: row.medication_name });
          } else if (payload.eventType === "UPDATE") {
            setOrders((prev) => prev.map((o) => (o.id === row.id ? { ...o, ...row } : o)));
            const oldStatus = (payload.old as any)?.status;
            if (oldStatus !== row.status) {
              toast.success(statusLabels[row.status] ?? row.status, { description: row.medication_name });
              setPulseId(row.id);
              setTimeout(() => setPulseId(null), 1500);
              if (row.status === "delivered") load();
            }
          } else if (payload.eventType === "DELETE") {
            setOrders((prev) => prev.filter((o) => o.id !== (payload.old as any).id));
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deliveries" },
        () => load(),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  async function handleCancel(orderId: string) {
    if (!confirm("Cancel this order? You'll be refunded if you've already paid.")) return;
    setCancellingId(orderId);
    try {
      const res = await cancelFn({ data: { orderId } });
      if (!res.ok) {
        if (res.reason === "driver_assigned") toast.error("A driver is on the way — contact support to cancel.");
        else if (res.reason === "stage") toast.error("This order can no longer be cancelled.");
        else toast.error("Could not cancel order");
        return;
      }
      toast.success("Order cancelled");
    } finally { setCancellingId(null); }
  }

  async function downloadInvoice(o: OrderRow) {
    const { data: payment } = await supabase
      .from("payments")
      .select("invoice_number, subtotal, delivery_fee, total_paid, payment_method, transaction_ref, created_at")
      .eq("order_id", o.id).maybeSingle();
    if (!payment?.invoice_number) { toast.error("No invoice yet for this order"); return; }
    const { data: ph } = await supabase.from("pharmacy_directory" as never).select("organization_name, full_name").eq("user_id", o.pharmacy_id).maybeSingle() as { data: { organization_name: string | null; full_name: string | null } | null };
    downloadReceiptPdf({
      invoice_number: payment.invoice_number,
      created_at: payment.created_at,
      patient_name: profile?.full_name,
      medication_name: o.medication_name,
      quantity: o.quantity,
      subtotal: Number(payment.subtotal ?? o.total_amount),
      delivery_fee: Number(payment.delivery_fee ?? 0),
      total_paid: Number(payment.total_paid ?? o.total_amount),
      payment_method: payment.payment_method ?? "card",
      transaction_ref: payment.transaction_ref ?? "",
      pharmacy_name: ph?.organization_name || ph?.full_name || undefined,
    });
  }

  const filtered = orders.filter((o) => {
    if (filter === "active" && ["delivered", "cancelled"].includes(o.status)) return false;
    if (filter === "delivered" && o.status !== "delivered") return false;
    if (q && !o.medication_name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="healthcare-card p-6">
      <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <History className="h-5 w-5 text-primary" /> Order History
        <span className="inline-flex h-2 w-2 rounded-full bg-healthcare-green animate-pulse" aria-hidden />
        <span className="text-[10px] uppercase tracking-wide text-healthcare-green font-semibold">Live</span>
        <span className="ml-auto text-xs font-normal text-muted-foreground">{orders.length} total</span>
      </h2>
      <div className="flex gap-2 mb-3">
        {(["all", "active", "delivered"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-2.5 py-1 rounded-full text-xs border ${filter === f ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:bg-accent"}`}>
            {f === "all" ? "All" : f === "active" ? "Active" : "Delivered"}
          </button>
        ))}
      </div>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input placeholder="Search past orders..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-8 h-9" />
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No orders match.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => {
            const active = !["delivered", "cancelled"].includes(o.status);
            return (
            <div key={o.id} className={`rounded-lg border p-3 transition-all ${pulseId === o.id ? "border-primary shadow-md ring-2 ring-primary/30" : "border-border"}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono text-muted-foreground">{o.id.slice(0, 8)}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${statusColors[o.status] ?? "bg-accent"}`}>
                  {active && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}
                  {statusLabels[o.status] ?? o.status.replace(/_/g, " ")}
                </span>
              </div>
              <p className="text-sm font-medium">{o.medication_name}</p>
              <div className="flex items-center justify-between mt-1 gap-2 flex-wrap">
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span>{new Date(o.created_at).toLocaleDateString()}</span>
                  <span>Qty {o.quantity}</span>
                  <span>R {Number(o.total_amount).toFixed(2)}</span>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {active && (
                    <Button size="sm" variant="default" className="h-7 text-xs gap-1" asChild>
                      <Link to="/track">Track</Link>
                    </Button>
                  )}
                  {active && !driverByOrder[o.id] && o.status !== "out_for_delivery" && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-destructive hover:text-destructive" onClick={() => handleCancel(o.id)} disabled={cancellingId === o.id}>
                      <X className="h-3 w-3" /> {cancellingId === o.id ? "Cancelling…" : "Cancel"}
                    </Button>
                  )}
                  {o.status === "delivered" && !reviewedOrders.has(o.id) && (
                    <Button size="sm" variant="default" className="h-7 text-xs gap-1 bg-amber-500 hover:bg-amber-600 text-white" onClick={() => setReviewFor(o)}>
                      <Star className="h-3 w-3" /> Rate
                    </Button>
                  )}
                  {o.prescription_upload_id && (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" asChild>
                      <Link to="/dashboard/patient/prescriptions">
                        <FileText className="h-3 w-3" /> View Rx
                      </Link>
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => downloadInvoice(o)}>
                    <Download className="h-3 w-3" /> Invoice
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" asChild>
                    <Link to="/payment" search={{ medId: o.medication_id ?? undefined, pharmacyId: o.pharmacy_id, name: o.medication_name, price: Number(o.total_amount) / Math.max(1, o.quantity), qty: o.quantity }}>
                      <Repeat className="h-3 w-3" /> Reorder
                    </Link>
                  </Button>
                </div>
              </div>
              {active && (
                <div className="mt-3 space-y-2 pt-3 border-t border-border/60">
                  <OrderTimeline orderId={o.id} initialOrderStatus={o.status} compact />
                  {["ready", "out_for_delivery"].includes(o.status) && (
                    <LiveETACard orderId={o.id} deliveryStatus={o.status === "ready" ? "assigned" : "in_transit"} />
                  )}
                  {active && !driverByOrder[o.id] && (
                    <p className="text-[11px] text-muted-foreground">You can still cancel this order — no driver has been assigned yet.</p>
                  )}
                  {active && driverByOrder[o.id] && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">Driver assigned — cancellation now requires contacting support.</p>
                  )}
                </div>
              )}
            </div>

            );
          })}
        </div>
      )}
      <ReviewDialog
        orderId={reviewFor?.id ?? null}
        hasDriver={!!(reviewFor && driverByOrder[reviewFor.id])}
        onClose={() => setReviewFor(null)}
        onSubmitted={() => setReviewedOrders((prev) => new Set([...prev, reviewFor!.id]))}
      />
    </div>
  );
}
