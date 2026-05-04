import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Sparkles, X, ChevronUp, ChevronDown, Loader2 } from "lucide-react";

const DEMO_PATIENT = "11111111-1111-1111-1111-111111111111";
const DEMO_PHARMACY = "22222222-2222-2222-2222-222222222222";
const DEMO_DRIVER = "33333333-3333-3333-3333-333333333333";

const DEMO_IDS = new Set([DEMO_PATIENT, DEMO_PHARMACY, DEMO_DRIVER]);

interface Med { id: string; name: string; price: number; stock_quantity: number }
interface Order { id: string; medication_name: string; quantity: number; status: string; total_amount: number; patient_id: string }
interface Offer { id: string; order_id: string; message: string }
interface Delivery { id: string; order_id: string; status: string }

export function DemoControlPanel() {
  const { user, role } = useAuth();
  const [open, setOpen] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);

  // per-role state
  const [meds, setMeds] = useState<Med[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);

  const isDemo = !!user && DEMO_IDS.has(user.id);

  useEffect(() => {
    if (!isDemo || !user) return;
    let cancelled = false;

    async function refresh() {
      if (role === "patient") {
        const { data } = await supabase
          .from("medications")
          .select("id, name, price, stock_quantity")
          .eq("pharmacy_id", DEMO_PHARMACY)
          .gt("stock_quantity", 0)
          .order("name");
        if (!cancelled) setMeds((data ?? []) as Med[]);
      } else if (role === "pharmacy") {
        const { data } = await supabase
          .from("orders")
          .select("id, medication_name, quantity, status, total_amount, patient_id")
          .eq("pharmacy_id", user!.id)
          .not("status", "in", "(delivered,cancelled)")
          .order("created_at", { ascending: false })
          .limit(5);
        if (!cancelled) setOrders((data ?? []) as Order[]);
      } else if (role === "driver") {
        const [o, d] = await Promise.all([
          supabase.from("delivery_offers").select("id, order_id, message").eq("status", "open").order("created_at", { ascending: false }).limit(5),
          supabase.from("deliveries").select("id, order_id, status").eq("driver_id", user!.id).neq("status", "delivered").order("updated_at", { ascending: false }).limit(5),
        ]);
        if (!cancelled) {
          setOffers((o.data ?? []) as Offer[]);
          setDeliveries((d.data ?? []) as Delivery[]);
        }
      }
    }

    refresh();
    const ch = supabase
      .channel(`demo-panel-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_offers" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "medications" }, refresh)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [isDemo, user, role]);

  if (!isDemo || hidden) return null;

  // ===== PATIENT actions =====
  async function placeDemoOrder() {
    if (busy) return;
    setBusy(true);
    try {
      const med = meds[0];
      if (!med) { toast.error("No medicines in stock at Demo Pharmacy"); return; }
      const total = Number(med.price);
      const { data: order, error } = await supabase.from("orders").insert({
        patient_id: DEMO_PATIENT,
        pharmacy_id: DEMO_PHARMACY,
        medication_id: med.id,
        medication_name: med.name,
        quantity: 1,
        total_amount: total,
        delivery_fee: 0,
        delivery_address: "12 Demo Street, Johannesburg",
        status: "pending",
      }).select("id").single();
      if (error) throw error;
      await supabase.from("payments").insert({
        order_id: order!.id,
        patient_id: DEMO_PATIENT,
        amount: total,
        payment_method: "card",
        status: "completed",
        transaction_ref: `DEMO-${Date.now()}`,
      });
      toast.success(`Demo order placed: ${med.name}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  // ===== PHARMACY actions =====
  async function advanceOrder(o: Order, next: string) {
    if (busy) return;
    setBusy(true);
    const { error } = await supabase.from("orders").update({ status: next }).eq("id", o.id);
    setBusy(false);
    if (error) toast.error(error.message); else toast.success(`Order → ${next.replace(/_/g, " ")}`);
  }

  async function broadcast(o: Order) {
    if (busy) return;
    setBusy(true);
    try {
      const { data: existing } = await supabase.from("delivery_offers").select("id").eq("order_id", o.id).eq("status", "open").maybeSingle();
      if (!existing) {
        const { error } = await supabase.from("delivery_offers").insert({
          order_id: o.id, pharmacy_id: DEMO_PHARMACY, message: `${o.medication_name} × ${o.quantity}`,
        });
        if (error) throw error;
      }
      // Also ensure a delivery row + mark order ready
      const { data: delEx } = await supabase.from("deliveries").select("id").eq("order_id", o.id).maybeSingle();
      if (!delEx) {
        await supabase.from("deliveries").insert({
          order_id: o.id, status: "assigned",
          pickup_address: "Demo Pharmacy Co., Johannesburg",
          delivery_address: "12 Demo Street, Johannesburg",
          estimated_time: "30-45 minutes",
        });
      }
      await supabase.from("orders").update({ status: "ready" }).eq("id", o.id);
      toast.success("Broadcast to drivers");
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  // ===== DRIVER actions =====
  async function acceptOffer(offer: Offer) {
    if (busy || !user) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("delivery_offers")
        .update({ status: "accepted", accepted_by: user.id }).eq("id", offer.id).eq("status", "open");
      if (error) throw error;
      // Assign driver to delivery
      await supabase.from("deliveries").update({ driver_id: user.id, status: "assigned" }).eq("order_id", offer.order_id);
      await supabase.from("orders").update({ status: "out_for_delivery" }).eq("id", offer.order_id);
      toast.success("Offer accepted — delivery assigned");
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  async function advanceDelivery(d: Delivery, next: string) {
    if (busy) return;
    setBusy(true);
    const { error } = await supabase.from("deliveries").update({ status: next }).eq("id", d.id);
    if (!error && next === "delivered") {
      await supabase.from("orders").update({ status: "delivered" }).eq("id", d.order_id);
    } else if (!error) {
      await supabase.from("orders").update({ status: "out_for_delivery" }).eq("id", d.order_id);
    }
    setBusy(false);
    if (error) toast.error(error.message); else toast.success(`Delivery → ${next.replace(/_/g, " ")}`);
  }

  function nextDeliveryStage(s: string): string | null {
    if (s === "assigned") return "picked_up";
    if (s === "picked_up") return "in_transit";
    if (s === "in_transit") return "delivered";
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[320px] max-w-[calc(100vw-2rem)]">
      <div className="rounded-xl border border-primary/30 bg-card shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-2 bg-primary/10 px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            Demo Control · {role}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setOpen((v) => !v)} className="rounded p-1 hover:bg-background" aria-label="Toggle">
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>
            <button onClick={() => setHidden(true)} className="rounded p-1 hover:bg-background" aria-label="Hide">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        {open && (
          <div className="p-3 space-y-3 max-h-[60vh] overflow-y-auto">
            {busy && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Working…</div>}

            {role === "patient" && (
              <>
                <p className="text-xs text-muted-foreground">Step 1: Place a demo order at Demo Pharmacy.</p>
                <Button size="sm" className="w-full" disabled={busy || meds.length === 0} onClick={placeDemoOrder}>
                  Place demo order {meds[0] ? `(${meds[0].name})` : ""}
                </Button>
                <p className="text-[11px] text-muted-foreground">Then sign in as Demo Pharmacy to accept it.</p>
              </>
            )}

            {role === "pharmacy" && (
              <>
                <p className="text-xs text-muted-foreground">Step 2: Advance incoming orders.</p>
                {orders.length === 0 && <p className="text-xs text-muted-foreground">No active orders. Have the demo patient place one.</p>}
                {orders.map((o) => (
                  <div key={o.id} className="rounded-lg border border-border p-2 space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium truncate">{o.medication_name} ×{o.quantity}</span>
                      <span className="text-muted-foreground">{o.status}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {o.status === "pending" && (
                        <>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => advanceOrder(o, "accepted")}>Accept</Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => advanceOrder(o, "cancelled")}>Reject</Button>
                        </>
                      )}
                      {o.status === "accepted" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => advanceOrder(o, "preparing")}>Start preparing</Button>
                      )}
                      {o.status === "preparing" && (
                        <Button size="sm" className="h-7 text-xs" onClick={() => broadcast(o)}>Ready · Broadcast</Button>
                      )}
                      {o.status === "ready" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => broadcast(o)}>Re-broadcast</Button>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}

            {role === "driver" && (
              <>
                <p className="text-xs text-muted-foreground">Step 3: Accept an offer & advance delivery.</p>
                {offers.length === 0 && deliveries.length === 0 && (
                  <p className="text-xs text-muted-foreground">No offers or active deliveries yet.</p>
                )}
                {offers.map((of) => (
                  <div key={of.id} className="rounded-lg border border-border p-2 flex items-center justify-between gap-2">
                    <span className="text-xs truncate">📦 {of.message}</span>
                    <Button size="sm" className="h-7 text-xs" onClick={() => acceptOffer(of)}>Accept</Button>
                  </div>
                ))}
                {deliveries.map((d) => {
                  const nxt = nextDeliveryStage(d.status);
                  return (
                    <div key={d.id} className="rounded-lg border border-border p-2 space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="font-mono">{d.order_id.slice(0, 8)}</span>
                        <span className="text-muted-foreground">{d.status}</span>
                      </div>
                      {nxt && (
                        <Button size="sm" className="h-7 text-xs w-full" onClick={() => advanceDelivery(d, nxt)}>
                          Mark {nxt.replace(/_/g, " ")}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
