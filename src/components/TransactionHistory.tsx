import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Receipt as ReceiptIcon } from "lucide-react";
import { downloadReceiptPdf } from "@/lib/receipt";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  /** "patient" sees full breakdown; "pharmacy" sees only their share. */
  role: "patient" | "pharmacy";
}

const statusColor: Record<string, string> = {
  completed: "bg-healthcare-green/15 text-healthcare-green",
  pending: "bg-accent text-accent-foreground",
  failed: "bg-destructive/10 text-destructive",
  refunded: "bg-muted text-muted-foreground",
};

export function TransactionHistory({ role }: Props) {
  const { user, profile } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      // RLS scopes results: patient sees own, pharmacy sees orders for them
      const { data } = await supabase
        .from("payments")
        .select("id, invoice_number, amount, status, payment_method, transaction_ref, created_at, subtotal, delivery_fee, total_paid, pharmacy_amount, refund_status, order_id, orders(medication_name, quantity, patient_id, pharmacy_id)")
        .order("created_at", { ascending: false })
        .limit(25);
      setRows(data ?? []);
      setLoading(false);
    })();
  }, [user]);

  function handleDownload(p: any) {
    downloadReceiptPdf({
      invoice_number: p.invoice_number || `TXN-${p.id.slice(0, 8)}`,
      created_at: p.created_at,
      patient_name: profile?.full_name,
      medication_name: p.orders?.medication_name ?? "Order",
      quantity: p.orders?.quantity ?? 1,
      subtotal: Number(p.subtotal ?? p.amount ?? 0),
      delivery_fee: Number(p.delivery_fee ?? 0),
      total_paid: Number(p.total_paid ?? p.amount ?? 0),
      payment_method: p.payment_method ?? "card",
      transaction_ref: p.transaction_ref,
    });
  }

  return (
    <div className="healthcare-card p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <ReceiptIcon className="h-5 w-5 text-primary" /> Transaction History
      </h2>
      {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
      {!loading && rows.length === 0 && <p className="text-sm text-muted-foreground">No transactions yet.</p>}
      <div className="space-y-2">
        {rows.map((p) => {
          // Pharmacy sees only their base medicine earnings — never platform fee or delivery markup.
          const display = role === "pharmacy" ? Number(p.pharmacy_amount ?? 0) : Number(p.total_paid ?? p.amount ?? 0);
          return (
            <div key={p.id} className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground">{p.invoice_number || p.id.slice(0, 8)}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusColor[p.status] ?? "bg-muted"}`}>{p.status}</span>
                  {p.refund_status && p.refund_status !== "none" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700">refund: {p.refund_status}</span>
                  )}
                </div>
                <p className="text-sm font-medium truncate">{p.orders?.medication_name ?? "Order"}</p>
                <p className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString("en-ZA")}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">R {display.toFixed(2)}</span>
                {role === "patient" && p.status === "completed" && (
                  <Button size="icon" variant="ghost" onClick={() => handleDownload(p)} title="Download receipt">
                    <Download className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
