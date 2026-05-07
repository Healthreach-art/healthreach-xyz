import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { History, Repeat, Download, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { downloadReceiptPdf } from "@/lib/receipt";
import { toast } from "sonner";

interface OrderRow {
  id: string;
  medication_name: string;
  status: string;
  total_amount: number;
  quantity: number;
  pharmacy_id: string;
  medication_id: string | null;
  created_at: string;
}

const statusColors: Record<string, string> = {
  pending: "bg-accent text-accent-foreground",
  accepted: "bg-healthcare-sky/20 text-healthcare-sky",
  preparing: "bg-accent text-primary",
  ready: "bg-healthcare-mint/30 text-healthcare-green",
  out_for_delivery: "bg-primary/10 text-primary",
  delivered: "bg-healthcare-green/20 text-healthcare-green",
  cancelled: "bg-destructive/10 text-destructive",
};

export function OrderHistory() {
  const { user, profile } = useAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [filter, setFilter] = useState<"all" | "active" | "delivered">("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("orders")
      .select("id, medication_name, status, total_amount, quantity, pharmacy_id, medication_id, created_at")
      .eq("patient_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setOrders((data ?? []) as OrderRow[]));
  }, [user]);

  async function downloadInvoice(o: OrderRow) {
    const { data: payment } = await supabase
      .from("payments")
      .select("invoice_number, subtotal, delivery_fee, total_paid, payment_method, transaction_ref, created_at")
      .eq("order_id", o.id).maybeSingle();
    if (!payment?.invoice_number) { toast.error("No invoice yet for this order"); return; }
    const { data: ph } = await supabase.from("profiles").select("organization_name, full_name").eq("user_id", o.pharmacy_id).maybeSingle();
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
      pharmacy_name: ph?.organization_name || ph?.full_name,
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
          {filtered.map((o) => (
            <div key={o.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono text-muted-foreground">{o.id.slice(0, 8)}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[o.status] ?? "bg-accent"}`}>
                  {o.status.replace(/_/g, " ")}
                </span>
              </div>
              <p className="text-sm font-medium">{o.medication_name}</p>
              <div className="flex items-center justify-between mt-1 gap-2 flex-wrap">
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span>{new Date(o.created_at).toLocaleDateString()}</span>
                  <span>Qty {o.quantity}</span>
                  <span>R {Number(o.total_amount).toFixed(2)}</span>
                </div>
                <div className="flex gap-1">
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
