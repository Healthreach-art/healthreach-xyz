import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { AddCardDialog } from "@/components/AddCardDialog";
import { CardPinDialog } from "@/components/CardPinDialog";
import { TransactionHistory } from "@/components/TransactionHistory";
import { Wallet, CreditCard, Plus, Star, Trash2, Lock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/patient/payment-methods")({
  head: () => ({ meta: [{ title: "Wallet & Payments — HEALTHREACH" }] }),
  component: () => <RoleGuard allow="patient"><Page /></RoleGuard>,
});

interface Card { id: string; brand: string; last4: string; exp_month: number; exp_year: number; is_default: boolean }

function Page() {
  const { user } = useAuth();
  const [cards, setCards] = useState<Card[]>([]);
  const [stats, setStats] = useState({ totalSpent: 0, completed: 0 });
  const [open, setOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [pinDialog, setPinDialog] = useState<{ action: null | (() => void) }>({ action: null });

  async function load() {
    if (!user) return;
    const [c, p] = await Promise.all([
      supabase.from("saved_payment_methods").select("*").eq("user_id", user.id).order("is_default", { ascending: false }),
      supabase.from("payments").select("amount, status").eq("patient_id", user.id),
    ]);
    setCards((c.data ?? []) as Card[]);
    const completed = (p.data ?? []).filter((x: any) => x.status === "completed");
    setStats({
      totalSpent: completed.reduce((a: number, x: any) => a + Number(x.amount || 0), 0),
      completed: completed.length,
    });
  }
  useEffect(() => { load(); }, [user, open]);

  function withPin(action: () => void) {
    if (unlocked) { action(); return; }
    setPinDialog({ action });
  }

  async function setDefault(id: string) {
    if (!user) return;
    await supabase.from("saved_payment_methods").update({ is_default: false }).eq("user_id", user.id);
    await supabase.from("saved_payment_methods").update({ is_default: true }).eq("id", id);
    toast.success("Default card updated");
    load();
  }
  async function remove(id: string) {
    await supabase.from("saved_payment_methods").delete().eq("id", id);
    toast.success("Card removed");
    load();
  }

  function brandColor(brand: string) {
    const b = brand.toLowerCase();
    if (b === "visa") return "from-blue-600 to-indigo-700";
    if (b === "mastercard") return "from-orange-500 to-red-600";
    if (b === "amex") return "from-cyan-500 to-blue-700";
    if (b === "discover") return "from-amber-500 to-orange-600";
    return "from-primary to-healthcare-teal";
  }

  return (
    <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Wallet className="h-6 w-6 text-primary" /> Wallet & Payments
        </h1>
        <p className="text-sm text-muted-foreground">Manage cards and review every transaction. Cards are PIN-protected.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-2xl bg-gradient-to-br from-primary to-healthcare-teal text-white p-5">
          <p className="text-xs uppercase tracking-wide opacity-80">Total spent</p>
          <p className="text-3xl font-bold mt-1">R {stats.totalSpent.toFixed(2)}</p>
          <p className="text-xs opacity-80 mt-2">{stats.completed} successful payments</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="h-4 w-4 text-primary" />
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Saved cards</p>
          </div>
          <p className="text-2xl font-bold text-foreground">{cards.length}</p>
          <p className="text-[11px] text-muted-foreground mt-1">{unlocked ? "Vault unlocked" : "Vault locked — PIN required to modify"}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" /> Saved cards</h2>
          <div className="flex items-center gap-2">
            {!unlocked && cards.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => setPinDialog({ action: () => setUnlocked(true) })}>
                <Lock className="h-4 w-4 mr-1" /> Unlock vault
              </Button>
            )}
            <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add card</Button>
          </div>
        </div>

        {cards.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No cards on file yet. Add one for one-tap checkout.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {cards.map((c) => (
              <div key={c.id} className={`relative rounded-2xl bg-gradient-to-br ${brandColor(c.brand)} text-white p-4 shadow-md overflow-hidden`}>
                <div className="absolute -top-8 -right-8 h-32 w-32 rounded-full bg-white/10" />
                <div className="absolute -bottom-10 -left-10 h-28 w-28 rounded-full bg-white/5" />
                <div className="relative">
                  <div className="flex items-start justify-between">
                    <span className="text-[11px] uppercase tracking-widest opacity-80">{c.brand}</span>
                    {c.is_default && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/25 inline-flex items-center gap-1">
                        <Star className="h-2.5 w-2.5 fill-current" /> Default
                      </span>
                    )}
                  </div>
                  <p className="mt-6 font-mono text-lg tracking-widest">•••• •••• •••• {c.last4}</p>
                  <div className="mt-3 flex items-end justify-between">
                    <div>
                      <p className="text-[10px] uppercase opacity-70">Expires</p>
                      <p className="text-xs font-semibold">{String(c.exp_month).padStart(2, "0")}/{String(c.exp_year).slice(-2)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {!c.is_default && (
                        <Button size="sm" variant="secondary" className="h-7 text-[11px] px-2 bg-white/90 hover:bg-white text-foreground" onClick={() => withPin(() => setDefault(c.id))}>
                          Make default
                        </Button>
                      )}
                      <Button size="icon" variant="secondary" className="h-7 w-7 bg-white/90 hover:bg-white text-destructive" onClick={() => withPin(() => remove(c.id))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-foreground">Transaction history</h2>
          <Link to="/dashboard/patient/transactions" className="text-xs text-primary font-semibold hover:underline">Full history →</Link>
        </div>
        <TransactionHistory role="patient" />
      </div>

      <AddCardDialog open={open} onClose={() => setOpen(false)} onAdded={load} />
      <CardPinDialog
        open={!!pinDialog.action}
        title="Unlock card vault"
        description="Enter your PIN to change or remove saved cards."
        onClose={() => setPinDialog({ action: null })}
        onUnlocked={() => { setUnlocked(true); pinDialog.action?.(); }}
      />
    </div>
  );
}
