import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { RoleGuard } from "@/components/RoleGuard";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wallet, Loader2, ArrowDownToLine, Clock, CheckCircle2, XCircle, TrendingUp, Building2, Plus, Trash2, Star } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/driver/wallet")({
  head: () => ({ meta: [{ title: "Driver Wallet — HEALTHREACH" }] }),
  component: () => <RoleGuard allow="driver"><Wallet_ /></RoleGuard>,
});

interface Payout { id: string; amount: number; status: string; method: string; reference: string; requested_at: string; paid_at: string | null; notes: string }
interface BankAccount { id: string; bank_name: string; account_holder: string; account_number: string; branch_code: string; account_type: string; is_default: boolean }

import { PLATFORM_RULES } from "@/lib/platform-rules";
const MIN_PAYOUT = PLATFORM_RULES.MIN_PAYOUT_ZAR;

function statusBadge(s: string) {
  const map: Record<string, { c: string; i: typeof Clock }> = {
    pending: { c: "bg-accent text-accent-foreground", i: Clock },
    processing: { c: "bg-primary/10 text-primary", i: Loader2 },
    paid: { c: "bg-healthcare-green/15 text-healthcare-green", i: CheckCircle2 },
    failed: { c: "bg-destructive/10 text-destructive", i: XCircle },
  };
  return map[s] || map.pending;
}

function estimateDistanceKm(orderId: string): number {
  let h = 0;
  for (let i = 0; i < orderId.length; i++) h = (h * 31 + orderId.charCodeAt(i)) >>> 0;
  return Math.round(((h % 700) / 100 + 1.5) * 10) / 10;
}
const estimateEarnings = (km: number) => Math.round(25 + km * 6);

function Wallet_() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState<{ id: string; order_id: string; updated_at: string; earnings: number }[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [newBank, setNewBank] = useState({ bank_name: "", account_holder: "", account_number: "", branch_code: "", account_type: "cheque" });
  const [addingBank, setAddingBank] = useState(false);

  async function load() {
    if (!user) return;
    const [{ data: dels }, { data: po }, { data: ba }] = await Promise.all([
      supabase.from("deliveries").select("id, order_id, updated_at, status").eq("driver_id", user.id).eq("status", "delivered"),
      supabase.from("driver_payouts").select("*").eq("driver_id", user.id).order("requested_at", { ascending: false }),
      supabase.from("driver_bank_accounts").select("*").eq("driver_id", user.id).order("created_at", { ascending: false }),
    ]);
    const orderIds = (dels ?? []).map((d) => d.order_id);
    const { data: orders } = orderIds.length > 0
      ? await supabase.from("orders").select("id, delivery_fee").in("id", orderIds)
      : { data: [] as { id: string; delivery_fee: number }[] };
    const feeMap = new Map((orders ?? []).map((o) => [o.id, Number(o.delivery_fee || 0)]));
    setCompleted((dels ?? []).map((d) => {
      const fee = feeMap.get(d.order_id) || 0;
      return { id: d.id, order_id: d.order_id, updated_at: d.updated_at, earnings: fee > 0 ? fee : estimateEarnings(estimateDistanceKm(d.order_id)) };
    }));
    setPayouts((po ?? []) as Payout[]);
    setBanks((ba ?? []) as BankAccount[]);
    setLoading(false);
  }

  useEffect(() => {
    if (!user) return;
    load();
    const ch = supabase
      .channel(`wallet-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_payouts", filter: `driver_id=eq.${user.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_bank_accounts", filter: `driver_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const totalEarned = completed.reduce((s, c) => s + c.earnings, 0);
  const paidOut = payouts.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount), 0);
  const pendingPayout = payouts.filter((p) => ["pending", "processing"].includes(p.status)).reduce((s, p) => s + Number(p.amount), 0);
  const available = Math.max(0, totalEarned - paidOut - pendingPayout);

  // Weekly breakdown (last 4 weeks)
  const weeks = (() => {
    const now = new Date();
    const buckets: { label: string; total: number; count: number }[] = [];
    for (let i = 3; i >= 0; i--) {
      const start = new Date(now); start.setDate(now.getDate() - now.getDay() - i * 7); start.setHours(0, 0, 0, 0);
      const end = new Date(start); end.setDate(start.getDate() + 7);
      const total = completed.filter((c) => { const d = new Date(c.updated_at); return d >= start && d < end; }).reduce((s, c) => s + c.earnings, 0);
      const count = completed.filter((c) => { const d = new Date(c.updated_at); return d >= start && d < end; }).length;
      buckets.push({ label: i === 0 ? "This week" : `${i}w ago`, total, count });
    }
    return buckets;
  })();

  async function requestPayout() {
    if (!user) return;
    const amt = Number(amount);
    if (!amt || amt < MIN_PAYOUT) { toast.error(`Minimum payout is R ${MIN_PAYOUT}`); return; }
    if (amt > available) { toast.error("Amount exceeds available balance"); return; }
    setRequesting(true);
    const { error } = await supabase.from("driver_payouts").insert({
      driver_id: user.id, amount: amt, method, reference: reference.trim(), status: "pending",
    } as any);
    setRequesting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Payout requested");
    setAmount(""); setReference("");
  }

  async function addBank() {
    if (!user) return;
    if (!newBank.bank_name || !newBank.account_holder || !newBank.account_number) {
      toast.error("Bank, holder name and account number are required");
      return;
    }
    setAddingBank(true);
    const { error } = await supabase.from("driver_bank_accounts").insert({
      driver_id: user.id, ...newBank, is_default: banks.length === 0,
    } as never);
    setAddingBank(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Bank account added");
    setNewBank({ bank_name: "", account_holder: "", account_number: "", branch_code: "", account_type: "cheque" });
  }

  async function setDefaultBank(id: string) {
    await supabase.from("driver_bank_accounts").update({ is_default: true } as never).eq("id", id);
  }
  async function removeBank(id: string) {
    await supabase.from("driver_bank_accounts").delete().eq("id", id);
  }

  return (
    <div className="container-narrow px-4 sm:px-6 py-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link to="/dashboard/driver" className="text-xs text-muted-foreground hover:underline">← Back to dashboard</Link>
        <h1 className="text-2xl font-bold mt-2 flex items-center gap-2"><Wallet className="h-6 w-6 text-primary" /> Earnings Wallet</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <div className="healthcare-card p-5 ring-1 ring-healthcare-green/30">
          <p className="text-xs text-muted-foreground">Available</p>
          <p className="text-3xl font-bold text-healthcare-green mt-1">R {available.toFixed(2)}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Withdraw to your bank</p>
        </div>
        <div className="healthcare-card p-5">
          <p className="text-xs text-muted-foreground">Pending Payouts</p>
          <p className="text-3xl font-bold text-primary mt-1">R {pendingPayout.toFixed(2)}</p>
        </div>
        <div className="healthcare-card p-5">
          <p className="text-xs text-muted-foreground">Total Earned</p>
          <p className="text-3xl font-bold text-foreground mt-1">R {totalEarned.toFixed(2)}</p>
          <p className="text-[11px] text-muted-foreground mt-1">{completed.length} deliveries</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 mb-6">
        <div className="healthcare-card p-5">
          <h2 className="font-semibold mb-3 flex items-center gap-2"><ArrowDownToLine className="h-4 w-4" /> Request Payout</h2>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Amount (ZAR)</Label>
              <Input type="number" min={MIN_PAYOUT} max={available} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Min R ${MIN_PAYOUT}`} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Method</Label>
              <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full mt-1 h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="bank_transfer">Bank Transfer (EFT)</option>
                <option value="instant_eft">Instant EFT</option>
                <option value="ewallet">eWallet</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Account / Reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. FNB ••• 4321" className="mt-1" />
            </div>
            <Button onClick={requestPayout} disabled={requesting || available < MIN_PAYOUT} className="w-full">
              {requesting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Request Payout"}
            </Button>
            {available < MIN_PAYOUT && <p className="text-[11px] text-muted-foreground text-center">Earn R {(MIN_PAYOUT - available).toFixed(0)} more to unlock payouts.</p>}
          </div>
        </div>

        <div className="healthcare-card p-5">
          <h2 className="font-semibold mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Weekly Breakdown</h2>
          <div className="space-y-2">
            {weeks.map((w) => (
              <div key={w.label} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{w.label}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{w.count} deliveries</span>
                  <span className="font-semibold">R {w.total.toFixed(0)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="healthcare-card p-5 mb-6">
        <h2 className="font-semibold mb-3 flex items-center gap-2"><Building2 className="h-4 w-4" /> Bank Accounts</h2>
        {banks.length === 0 ? (
          <p className="text-sm text-muted-foreground mb-3">No bank accounts yet. Add one to receive payouts.</p>
        ) : (
          <div className="space-y-2 mb-4">
            {banks.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                <div>
                  <p className="font-semibold flex items-center gap-2">{b.bank_name} {b.is_default && <span className="inline-flex items-center gap-1 text-[10px] text-healthcare-green"><Star className="h-3 w-3 fill-healthcare-green" /> Default</span>}</p>
                  <p className="text-xs text-muted-foreground">{b.account_holder} • •••{b.account_number.slice(-4)} • {b.account_type}</p>
                </div>
                <div className="flex items-center gap-1">
                  {!b.is_default && <Button size="sm" variant="ghost" onClick={() => setDefaultBank(b.id)}>Set default</Button>}
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeBank(b.id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <Input placeholder="Bank name (e.g. FNB)" value={newBank.bank_name} onChange={(e) => setNewBank({ ...newBank, bank_name: e.target.value })} />
          <Input placeholder="Account holder" value={newBank.account_holder} onChange={(e) => setNewBank({ ...newBank, account_holder: e.target.value })} />
          <Input placeholder="Account number" value={newBank.account_number} onChange={(e) => setNewBank({ ...newBank, account_number: e.target.value })} />
          <Input placeholder="Branch code" value={newBank.branch_code} onChange={(e) => setNewBank({ ...newBank, branch_code: e.target.value })} />
        </div>
        <Button onClick={addBank} disabled={addingBank} size="sm" className="mt-2 gap-1"><Plus className="h-3 w-3" /> Add Account</Button>
      </div>

      <div className="healthcare-card p-5">
        <h2 className="font-semibold mb-3">Payout History</h2>
        {payouts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payout requests yet.</p>
        ) : (
          <div className="space-y-2">
            {payouts.map((p) => {
              const b = statusBadge(p.status);
              return (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                  <div>
                    <p className="font-semibold">R {Number(p.amount).toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">{p.method.replace(/_/g, " ")} • {new Date(p.requested_at).toLocaleDateString()}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${b.c}`}>
                    <b.i className={`h-3 w-3 ${p.status === "processing" ? "animate-spin" : ""}`} /> {p.status}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
