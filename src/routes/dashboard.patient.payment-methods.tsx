import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { SettingsDialog } from "@/components/SettingsDialog";
import { TransactionHistory } from "@/components/TransactionHistory";
import { Wallet, CreditCard, Plus, Star, Trash2, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/patient/payment-methods")({
  head: () => ({ meta: [{ title: "Wallet & Payments — HEALTHREACH" }] }),
  component: () => <RoleGuard allow="patient"><Page /></RoleGuard>,
});

interface Card { id: string; brand: string; last4: string; exp_month: number; exp_year: number; is_default: boolean }

function Page() {
  const { user } = useAuth();
  const [cards, setCards] = useState<Card[]>([]);
  const [stats, setStats] = useState({ totalSpent: 0, monthSpent: 0, completed: 0 });
  const [open, setOpen] = useState(false);

  async function load() {
    if (!user) return;
    const [c, p] = await Promise.all([
      supabase.from("saved_payment_methods").select("*").eq("user_id", user.id).order("is_default", { ascending: false }),
      supabase.from("payments").select("amount, status, created_at").eq("patient_id", user.id),
    ]);
    setCards((c.data ?? []) as Card[]);
    const pays = (p.data ?? []) as any[];
    const completed = pays.filter((x) => x.status === "completed");
    const startMonth = new Date(); startMonth.setDate(1); startMonth.setHours(0, 0, 0, 0);
    setStats({
      totalSpent: completed.reduce((a, x) => a + Number(x.amount || 0), 0),
      monthSpent: completed.filter((x) => new Date(x.created_at) >= startMonth).reduce((a, x) => a + Number(x.amount || 0), 0),
      completed: completed.length,
    });
  }
  useEffect(() => { load(); }, [user, open]);

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

  return (
    <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Wallet className="h-6 w-6 text-primary" /> Wallet & Payments
        </h1>
        <p className="text-sm text-muted-foreground">Manage cards, view spending and review every transaction.</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="rounded-2xl bg-gradient-to-br from-primary to-healthcare-teal text-white p-5">
          <p className="text-xs uppercase tracking-wide opacity-80">Total spent</p>
          <p className="text-3xl font-bold mt-1">R {stats.totalSpent.toFixed(2)}</p>
          <p className="text-xs opacity-80 mt-2">{stats.completed} successful payments</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-2">
            <ArrowUpRight className="h-4 w-4 text-healthcare-green" />
            <p className="text-xs uppercase tracking-wide text-muted-foreground">This month</p>
          </div>
          <p className="text-2xl font-bold text-foreground">R {stats.monthSpent.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-2">
            <ArrowDownLeft className="h-4 w-4 text-healthcare-sky" />
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Saved cards</p>
          </div>
          <p className="text-2xl font-bold text-foreground">{cards.length}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" /> Saved cards</h2>
          <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add card</Button>
        </div>
        {cards.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No cards on file yet. Add one for one-tap checkout.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {cards.map((c) => (
              <div key={c.id} className="rounded-xl border border-border p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-foreground capitalize">{c.brand} •••• {c.last4}</p>
                  <p className="text-xs text-muted-foreground">Expires {String(c.exp_month).padStart(2, "0")}/{c.exp_year}</p>
                </div>
                <div className="flex items-center gap-1">
                  {c.is_default ? (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-healthcare-green/15 text-healthcare-green flex items-center gap-1">
                      <Star className="h-3 w-3 fill-current" /> Default
                    </span>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setDefault(c.id)}>Make default</Button>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => remove(c.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
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

      <SettingsDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
