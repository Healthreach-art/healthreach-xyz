import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Wallet, Receipt, TrendingUp, FileDown } from "lucide-react";
import { PLATFORM_RULES } from "@/lib/platform-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { downloadPharmacyTaxStatementPdf, type TaxStatementRow } from "@/lib/receipt";
import { toast } from "sonner";

interface PaymentRow {
  id: string; order_id: string; amount: number; status: string; created_at: string;
  pharmacy_amount: number | null; platform_fee: number | null; delivery_fee: number | null;
  total_paid: number | null; transaction_ref: string | null; invoice_number: string | null;
}

const FEE_PCT = (PLATFORM_RULES as { PLATFORM_FEE_PCT?: number }).PLATFORM_FEE_PCT ?? 0.15;

export function PharmacyFinance() {
  const { user } = useAuth();
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      setLoading(true);
      // payments belonging to this pharmacy's orders
      const { data: ord } = await supabase.from("orders").select("id").eq("pharmacy_id", user.id);
      const ids = (ord ?? []).map(o => o.id);
      if (!ids.length) { if (alive) { setRows([]); setLoading(false); } return; }
      const { data } = await supabase
        .from("payments")
        .select("id, order_id, amount, status, created_at, pharmacy_amount, platform_fee, delivery_fee, total_paid, transaction_ref, invoice_number")
        .in("order_id", ids)
        .order("created_at", { ascending: false })
        .limit(200);
      if (!alive) return;
      setRows((data ?? []) as PaymentRow[]);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [user]);

  const summary = useMemo(() => {
    const completed = rows.filter(r => r.status === "completed");
    const pharmacyEarned = (r: PaymentRow) =>
      Number(r.pharmacy_amount ?? (Number(r.amount) * (1 - FEE_PCT) - Number(r.delivery_fee ?? 0)));
    const total = completed.reduce((s, r) => s + pharmacyEarned(r), 0);
    const platform = completed.reduce((s, r) => s + Number(r.platform_fee ?? Number(r.amount) * FEE_PCT), 0);

    const today = new Date(); today.setHours(0,0,0,0);
    const week = new Date(today); week.setDate(week.getDate() - 6);
    const t = completed.filter(r => new Date(r.created_at) >= today).reduce((s,r)=>s+pharmacyEarned(r),0);
    const w = completed.filter(r => new Date(r.created_at) >= week).reduce((s,r)=>s+pharmacyEarned(r),0);
    const pending = rows.filter(r => r.status === "pending").reduce((s,r)=>s+pharmacyEarned(r),0);
    const refunded = rows.filter(r => r.status === "refunded").length;
    return { total, platform, today: t, week: w, pending, refunded, pharmacyEarned };
  }, [rows]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Wallet} label="Earnings today" value={`R ${summary.today.toFixed(2)}`} accent="text-healthcare-green" />
        <Stat icon={TrendingUp} label="This week" value={`R ${summary.week.toFixed(2)}`} />
        <Stat icon={Receipt} label="All-time net" value={`R ${summary.total.toFixed(2)}`} sub={`Platform fees R ${summary.platform.toFixed(0)}`} />
        <Stat icon={Wallet} label="Pending payouts" value={`R ${summary.pending.toFixed(2)}`} sub={`${summary.refunded} refunded`} accent="text-muted-foreground" />
      </div>

      <div className="healthcare-card p-6">
        <h3 className="text-sm font-semibold mb-4">Recent transactions</h3>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No transactions yet.</p>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="min-w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-2 py-2">Invoice</th>
                  <th className="text-left px-2 py-2">Date</th>
                  <th className="text-right px-2 py-2">Total</th>
                  <th className="text-right px-2 py-2">Platform</th>
                  <th className="text-right px-2 py-2">Delivery</th>
                  <th className="text-right px-2 py-2">You earn</th>
                  <th className="text-left px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 20).map(r => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-2 py-2 font-mono text-xs">{r.invoice_number || r.id.slice(0,8)}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="px-2 py-2 text-right">R {Number(r.amount).toFixed(2)}</td>
                    <td className="px-2 py-2 text-right text-muted-foreground">R {Number(r.platform_fee ?? Number(r.amount) * FEE_PCT).toFixed(2)}</td>
                    <td className="px-2 py-2 text-right text-muted-foreground">R {Number(r.delivery_fee ?? 0).toFixed(2)}</td>
                    <td className="px-2 py-2 text-right font-semibold text-healthcare-green">R {summary.pharmacyEarned(r).toFixed(2)}</td>
                    <td className="px-2 py-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize ${
                        r.status === "completed" ? "bg-healthcare-green/15 text-healthcare-green" :
                        r.status === "pending" ? "bg-accent" :
                        r.status === "refunded" ? "bg-healthcare-sky/15 text-healthcare-sky" :
                        "bg-destructive/10 text-destructive"
                      }`}>{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub, accent = "text-primary" }: { icon: any; label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="healthcare-card p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Icon className={`h-5 w-5 ${accent}`} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold text-foreground">{value}</p>
          {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  );
}
