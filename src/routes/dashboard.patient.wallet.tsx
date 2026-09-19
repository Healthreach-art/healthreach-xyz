import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Wallet as WalletIcon, ArrowDown, ArrowUp, Plus, Lock, CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { getWalletSummary, topUpWithSavedCard, confirmWalletTopUp } from "@/lib/wallet.functions";
import { supabase } from "@/integrations/supabase/client";

const PAYSTACK_PUBLIC_KEY = "pk_test_d1b55c54edcc82e952942340a77d0ca85cda7d9a";

type PaystackSetupFn = NonNullable<Window["PaystackPop"]>["setup"];
type PaystackSetupArg = Parameters<PaystackSetupFn>[0] & { metadata?: Record<string, unknown> };

function loadPaystack(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve();
    if (window.PaystackPop) return resolve();
    const existing = document.querySelector<HTMLScriptElement>('script[data-paystack="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Paystack")), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = "https://js.paystack.co/v1/inline.js";
    s.async = true;
    s.dataset.paystack = "1";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Paystack"));
    document.head.appendChild(s);
  });
}

export const Route = createFileRoute("/dashboard/patient/wallet")({
  head: () => ({ meta: [{ title: "Wallet — HealthReachCareCare" }] }),
  component: () => <RoleGuard allow="patient"><WalletPage /></RoleGuard>,
});

interface SavedCard { id: string; brand: string; last4: string; is_default: boolean; authorization_code: string | null }
interface Txn {
  id: string; direction: "credit" | "debit"; amount_cents: number; reason: string;
  paystack_reference: string | null; balance_after_cents: number; note: string | null; created_at: string;
}

function WalletPage() {
  const { user } = useAuth();
  const fetchWallet = useServerFn(getWalletSummary);
  const topUpSaved = useServerFn(topUpWithSavedCard);
  const confirmTopUp = useServerFn(confirmWalletTopUp);

  const [balance, setBalance] = useState(0);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [amount, setAmount] = useState("100");
  const [selectedCard, setSelectedCard] = useState<string>("new");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const w = await fetchWallet();
      setBalance(w.balanceCents);
      setTxns(w.transactions as Txn[]);
    } catch (e) { toast.error((e as Error).message); }

    if (user) {
      const { data } = await supabase.from("saved_payment_methods")
        .select("id, brand, last4, is_default, authorization_code")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false });
      const list = (data ?? []) as SavedCard[];
      setCards(list);
      const reusable = list.find((c) => c.authorization_code);
      if (reusable) setSelectedCard(reusable.id);
    }
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [user]);

  useEffect(() => { loadPaystack().catch(() => {}); }, []);

  async function handleTopUp(e: FormEvent) {
    e.preventDefault();
    if (!user?.email) { toast.error("Account email required."); return; }
    const rand = Number(amount);
    if (!Number.isFinite(rand) || rand < 20 || rand > 20_000) {
      toast.error("Enter an amount between R20 and R20,000.");
      return;
    }
    const cents = Math.round(rand * 100);
    setBusy(true);

    const savedCard = cards.find((c) => c.id === selectedCard && c.authorization_code);
    if (savedCard) {
      try {
        await topUpSaved({ data: { cardId: savedCard.id, amountCents: cents } });
        toast.success(`Wallet topped up R${rand.toFixed(2)}`);
        await refresh();
      } catch (err) {
        toast.error((err as Error)?.message || "Top-up failed");
      } finally {
        setBusy(false);
      }
      return;
    }

    // New card via Paystack popup
    try { await loadPaystack(); } catch { toast.error("Could not load Paystack."); setBusy(false); return; }
    if (!window.PaystackPop) { toast.error("Paystack not available."); setBusy(false); return; }
    const handler = window.PaystackPop.setup({
      key: PAYSTACK_PUBLIC_KEY,
      email: user.email,
      amount: cents,
      currency: "ZAR",
      ref: `WT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      callback: (resp) => {
        (async () => {
          try {
            await confirmTopUp({ data: { reference: resp.reference } });
            toast.success(`Wallet topped up R${rand.toFixed(2)}`);
            await refresh();
          } catch (err) { toast.error((err as Error)?.message || "Top-up verification failed"); }
          finally { setBusy(false); }
        })();
      },
      onClose: () => { toast.info("Top-up cancelled."); setBusy(false); },
    } as PaystackSetupArg);
    handler.openIframe();
  }

  const quickAmounts = [50, 100, 250, 500];

  return (
    <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <WalletIcon className="h-6 w-6 text-primary" /> Wallet
        </h1>
        <p className="text-sm text-muted-foreground">
          Pre-load funds for faster checkout. Card details stay with Paystack — never stored here.
        </p>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-primary to-healthcare-teal text-white p-6 shadow-md">
        <p className="text-xs uppercase tracking-wide opacity-80">Available balance</p>
        <p className="text-4xl font-bold mt-1 tabular-nums">R {(balance / 100).toFixed(2)}</p>
        <p className="text-xs opacity-80 mt-2">Use at checkout for instant, fee-free payments.</p>
      </div>

      <form onSubmit={handleTopUp} className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-4">
        <h2 className="text-lg font-bold flex items-center gap-2"><Plus className="h-4 w-4 text-primary" /> Top up</h2>

        <div className="flex flex-wrap gap-2">
          {quickAmounts.map((v) => (
            <button key={v} type="button" onClick={() => setAmount(String(v))}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${Number(amount) === v ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:border-primary/40"}`}>
              R{v}
            </button>
          ))}
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground">Amount (ZAR)</label>
          <Input type="number" min={20} max={20000} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1" />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">Pay with</p>
          {cards.filter((c) => c.authorization_code).map((c) => (
            <label key={c.id} className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition ${selectedCard === c.id ? "border-primary bg-primary/5" : "border-border"}`}>
              <input type="radio" name="card" checked={selectedCard === c.id} onChange={() => setSelectedCard(c.id)} className="accent-primary" />
              <CreditCard className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold capitalize">{c.brand} •••• {c.last4}</span>
              {c.is_default && <span className="text-[10px] uppercase tracking-wide text-primary">Default</span>}
            </label>
          ))}
          <label className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition ${selectedCard === "new" ? "border-primary bg-primary/5" : "border-border"}`}>
            <input type="radio" name="card" checked={selectedCard === "new"} onChange={() => setSelectedCard("new")} className="accent-primary" />
            <Lock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">{cards.some((c) => c.authorization_code) ? "Use a different card (Paystack)" : "Pay with a card (Paystack)"}</span>
          </label>
        </div>

        <Button type="submit" disabled={busy} className="w-full h-11 rounded-xl">
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</> : <>Top up R{amount || "0"}</>}
        </Button>
        <p className="text-[11px] text-muted-foreground">Wallet is store credit only — used for HealthReachCareCare orders. Refunds go back to wallet by default.</p>
      </form>

      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="text-lg font-bold mb-3">Recent activity</h2>
        {txns.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No transactions yet. Top up to get started.</p>
        ) : (
          <ul className="divide-y divide-border">
            {txns.map((t) => (
              <li key={t.id} className="py-3 flex items-center gap-3">
                <span className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${t.direction === "credit" ? "bg-healthcare-mint/40 text-healthcare-green" : "bg-destructive/10 text-destructive"}`}>
                  {t.direction === "credit" ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold capitalize truncate">{t.reason.replace(/_/g, " ")}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(t.created_at).toLocaleString()}
                    {t.note ? <> · {t.note}</> : null}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-bold tabular-nums ${t.direction === "credit" ? "text-healthcare-green" : "text-destructive"}`}>
                    {t.direction === "credit" ? "+" : "−"}R {(t.amount_cents / 100).toFixed(2)}
                  </p>
                  <p className="text-[10px] text-muted-foreground tabular-nums">Bal R {(t.balance_after_cents / 100).toFixed(2)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="text-center">
        <Link to="/dashboard/patient/payment-methods" className="text-xs text-primary hover:underline">Manage saved cards →</Link>
      </div>
    </div>
  );
}
