import { useEffect, useMemo, useState } from "react";
import { firestoreClient } from "@/lib/firestore-client";
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
  const { user, profile } = useAuth();
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const monthStart = (() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); })();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      setLoading(true);
      // payments belonging to this pharmacy's orders (Firestore "in" allows max 30 values per query)
      const { data: ord } = await firestoreClient.from("orders").select("id").eq("pharmacy_id", user.id);
      const ids = (ord ?? []).map(o => o.id);
      if (!ids.length) { if (alive) { setRows([]); setLoading(false); } return; }
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
      const results = await Promise.all(chunks.map((c) => firestoreClient
        .from("payments")
        .select("id, order_id, amount, status, created_at, pharmacy_amount, platform_fee, delivery_fee, total_paid, transaction_ref, invoice_number")
        .in("order_id", c)));
      if (!alive) return;
      const all = results.flatMap((r) => (r.data ?? []) as PaymentRow[])
        .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
      setRows(all);
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
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); d.setMonth(d.getMonth() - (5 - i));
      const end = new Date(d); end.setMonth(end.getMonth() + 1);
      const inMonth = completed.filter(r => { const c = new Date(r.created_at); return c >= d && c < end; });
      return { label: d.toLocaleDateString("en-ZA", { month: "short" }), value: inMonth.reduce((s, r) => s + pharmacyEarned(r), 0), count: inMonth.length };
    });
    const avgOrder = completed.length ? completed.reduce((s, r) => s + Number(r.amount), 0) / completed.length : 0;
    return { total, platform, today: t, week: w, pending, refunded, pharmacyEarned, months, avgOrder, completedCount: completed.length };
  }, [rows]);
  const maxMonth = Math.max(1, ...summary.months.map(m => m.value));

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
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">Net earnings — last 6 months</h3>
          <span className="text-xs text-muted-foreground">{summary.completedCount} paid orders · avg basket R {summary.avgOrder.toFixed(2)}</span>
        </div>
        <div className="flex h-36 items-end gap-2">
          {summary.months.map((m) => (
            <div key={m.label} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] text-muted-foreground">{m.value > 0 ? `R${Math.round(m.value)}` : ""}</span>
              <div className="w-full rounded-t bg-primary/80" style={{ height: `${Math.max(2, (m.value / maxMonth) * 100)}%` }} title={`${m.count} orders`} />
              <span className="text-[11px] text-muted-foreground">{m.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="healthcare-card p-6 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2"><FileDown className="h-4 w-4 text-primary"/> Tax statement (PDF)</h3>
            <p className="text-xs text-muted-foreground">Per-transaction line items with VAT (15%) breakdown for SARS / accountant.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end">
          <div className="min-w-0">
            <Label htmlFor="tax-from" className="text-xs">From</Label>
            <Input id="tax-from" type="date" value={from} onChange={e=>setFrom(e.target.value)} />
          </div>
          <div className="min-w-0">
            <Label htmlFor="tax-to" className="text-xs">To</Label>
            <Input id="tax-to" type="date" value={to} onChange={e=>setTo(e.target.value)} />
          </div>
          <Button
            disabled={exporting}
            onClick={async () => {
              if (!user) return;
              setExporting(true);
              try {
                const fromIso = new Date(from + "T00:00:00").toISOString();
                const toIso = new Date(to + "T23:59:59").toISOString();
                const { data: ord } = await firestoreClient.from("orders").select("id, medication_name").eq("pharmacy_id", user.id);
                const idMap = new Map((ord ?? []).map(o => [o.id, o.medication_name as string]));
                const ids = Array.from(idMap.keys());
                if (!ids.length) { toast.info("No transactions in this period."); return; }
                const { data: pays } = await firestoreClient
                  .from("payments")
                  .select("id, order_id, amount, status, created_at, pharmacy_amount, platform_fee, delivery_fee, total_paid, invoice_number")
                  .in("order_id", ids)
                  .gte("created_at", fromIso)
                  .lte("created_at", toIso)
                  .eq("status", "completed")
                  .order("created_at", { ascending: true });
                const taxRows: TaxStatementRow[] = (pays ?? []).map((p: any) => {
                  const gross = Number(p.total_paid ?? p.amount ?? 0);
                  const platform_fee = Number(p.platform_fee ?? gross * FEE_PCT);
                  const delivery_fee = Number(p.delivery_fee ?? 0);
                  const net_earned = Number(p.pharmacy_amount ?? (gross - platform_fee - delivery_fee));
                  return {
                    invoice_number: p.invoice_number || p.id.slice(0,8),
                    created_at: p.created_at,
                    medication_name: idMap.get(p.order_id) ?? "Order",
                    gross, platform_fee, delivery_fee, net_earned,
                    status: p.status,
                  };
                });
                if (!taxRows.length) { toast.info("No completed transactions in this period."); return; }
                downloadPharmacyTaxStatementPdf({
                  pharmacy_name: profile?.organization_name || profile?.full_name || "Pharmacy",
                  vat_number: (profile as any)?.vat_number || undefined,
                  address: (profile as any)?.address || undefined,
                  period_from: fromIso,
                  period_to: toIso,
                  rows: taxRows,
                });
                toast.success("Tax statement downloaded");
              } catch (e: any) {
                toast.error(e?.message ?? "Export failed");
              } finally { setExporting(false); }
            }}
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin"/> : <FileDown className="h-4 w-4"/>}
            <span className="ml-2">Download PDF</span>
          </Button>
        </div>
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
                  <th className="text-left px-2 py-2">Paystack reference</th>
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
                    <td className="px-2 py-2 font-mono text-xs text-muted-foreground">{r.transaction_ref || "—"}</td>
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
