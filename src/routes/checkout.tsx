import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CreditCard, Lock, CheckCircle2, ShoppingCart, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { customerPrice, customerDeliveryFee, BASE_DELIVERY_FEE, paymentBreakdown } from "@/lib/pricing";
import { DrugInteractionPanel } from "@/components/DrugInteractionPanel";
import { useServerFn } from "@tanstack/react-start";
import { checkDrugInteractions } from "@/utils/ai.functions";
import { validateCartPrescriptions } from "@/lib/prescription.functions";

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ title: "Checkout — HEALTHREACH" }] }),
  component: () => <RoleGuard allow="patient"><CheckoutPage /></RoleGuard>,
});

function CheckoutPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { items, clear, setQty, remove } = useCart();
  const validateRx = useServerFn(validateCartPrescriptions);
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [cardName, setCardName] = useState("");
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [rxIssues, setRxIssues] = useState<{ medId: string; message: string }[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("address").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data?.address) setDeliveryAddress(data.address); });
  }, [user]);

  const subtotal = items.reduce((s, i) => s + customerPrice(i.price) * i.qty, 0);
  const deliveryFee = customerDeliveryFee(BASE_DELIVERY_FEE);
  const total = subtotal + deliveryFee;

  const handlePay = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) { navigate({ to: "/login" }); return; }
    if (items.length === 0) { toast.error("Your cart is empty."); return; }
    if (!deliveryAddress.trim()) { toast.error("Enter a delivery address."); return; }

    setProcessing(true);
    setRxIssues([]);

    // Backend Rx validity + refill eligibility enforcement
    try {
      const result = await validateRx({
        data: {
          items: items.map((i) => ({
            medId: i.medId,
            pharmacyId: i.pharmacyId,
            prescriptionUploadId: i.prescriptionUploadId ?? null,
          })),
        },
      });
      if (!result.valid) {
        setRxIssues(result.issues.map((i: any) => ({ medId: i.medId, message: i.message })));
        toast.error("Prescription check failed — see issues above.");
        setProcessing(false);
        return;
      }
    } catch (err: any) {
      toast.error(err?.message || "Could not verify prescriptions.");
      setProcessing(false);
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const digits = cardNumber.replace(/\D/g, "");
      const forcedOutcome: "completed" | "failed" | undefined =
        digits.startsWith("4242") ? "completed" :
        digits.startsWith("4000") ? "failed" : undefined;

      let firstOrderId: string | null = null;
      let lastError: string | null = null;

      for (const item of items) {
        try {
          const breakdown = paymentBreakdown(item.price, item.qty, BASE_DELIVERY_FEE);

          const { data: order, error: orderErr } = await supabase.from("orders").insert({
            patient_id: user.id, pharmacy_id: item.pharmacyId,
            medication_id: item.medId, medication_name: item.name,
            quantity: item.qty, delivery_fee: BASE_DELIVERY_FEE,
            total_amount: breakdown.total_paid, status: "pending",
            delivery_address: deliveryAddress, notes: "Paid via card",
          }).select().single();
          if (orderErr || !order) throw orderErr ?? new Error("Order creation failed");
          if (!firstOrderId) firstOrderId = order.id;

          const reference = `TXN-${Date.now().toString().slice(-8)}-${Math.random().toString(36).slice(2, 5)}`;

          const { data: payment, error: payErr } = await supabase.from("payments").insert({
            order_id: order.id, patient_id: user.id, pharmacy_id: item.pharmacyId,
            amount: breakdown.total_paid, subtotal: breakdown.subtotal,
            delivery_fee: breakdown.delivery_fee, platform_fee: breakdown.platform_fee,
            total_paid: breakdown.total_paid, pharmacy_amount: breakdown.pharmacy_amount,
            driver_amount: breakdown.driver_amount, payment_method: "card",
            provider: "mock", status: "pending", transaction_ref: reference,
          }).select().single();
          if (payErr || !payment) throw payErr ?? new Error("Payment row failed");

          const payRes = await fetch("/api/mock-pay", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
            body: JSON.stringify({ payment_id: payment.id, outcome: forcedOutcome }),
          });
          const payJson = await payRes.json().catch(() => ({} as { status?: string }));
          if (!payRes.ok || payJson.status !== "completed") {
            lastError = "Payment declined by gateway";
            continue;
          }

          // NOTE: do NOT create a deliveries row here. The pharmacy creates it
          // when they "Mark Ready & Broadcast" (the create_delivery_on_ready
          // DB trigger handles it server-side). Creating it now would show a
          // phantom "Driver Assigned" state to the patient and a no-driver
          // active delivery to the pharmacy.

          // Decrement stock
          const { data: med } = await supabase.from("medications").select("stock_quantity").eq("id", item.medId).maybeSingle();
          if (med && typeof med.stock_quantity === "number") {
            await supabase.from("medications").update({
              stock_quantity: Math.max(0, med.stock_quantity - item.qty)
            }).eq("id", item.medId);
          }
        } catch (err: any) {
          lastError = err?.message || "Unknown error";
        }
      }

      if (firstOrderId) {
        clear();
        setSuccess(true);
        toast.success("Order placed! Redirecting to live tracking…");
        setTimeout(() => navigate({ to: "/track" }), 1200);
      } else {
        toast.error(lastError || "Checkout failed.");
      }
    } finally {
      setProcessing(false);
    }
  };

  if (items.length === 0 && !success) {
    return (
      <div className="container-narrow px-4 sm:px-6 py-16 text-center">
        <ShoppingCart className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
        <h1 className="text-xl font-semibold">Your cart is empty</h1>
        <p className="text-sm text-muted-foreground mt-1">Browse pharmacies to add medicines.</p>
        <Button asChild className="mt-4"><Link to="/dashboard/patient">Browse pharmacies</Link></Button>
      </div>
    );
  }

  if (success) {
    return (
      <div className="container-narrow px-4 sm:px-6 py-16 text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-healthcare-green mb-3" />
        <h1 className="text-2xl font-bold">Order placed!</h1>
        <p className="text-sm text-muted-foreground mt-1">Redirecting to live tracking…</p>
      </div>
    );
  }

  return (
    <div className="container-narrow px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold mb-6">Checkout</h1>
      <div className="grid gap-6 lg:grid-cols-5">
        <form onSubmit={handlePay} className="lg:col-span-3 space-y-6">
          <CheckoutAIStatus
            hasRx={items.some((i) => i.requiresPrescription)}
            medications={items.map((i) => i.name)}
          />
          {items.length >= 2 && (
            <DrugInteractionPanel medications={items.map(i => i.name)} />
          )}
          <div className="healthcare-card p-6">
            <h2 className="text-lg font-semibold mb-4">Delivery address</h2>
            <Label htmlFor="delivery-address" className="sr-only">Delivery address</Label>
            <Textarea id="delivery-address" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Street, suburb, city" rows={2} required />
          </div>

          <div className="healthcare-card p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" /> Card details
            </h2>
            <div className="space-y-3">
              <div>
                <Label htmlFor="cn">Card number</Label>
                <Input id="cn" value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} placeholder="4242 4242 4242 4242" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label htmlFor="ex">Expiry</Label><Input id="ex" value={expiry} onChange={(e) => setExpiry(e.target.value)} placeholder="MM/YY" required /></div>
                <div><Label htmlFor="cv">CVV</Label><Input id="cv" value={cvv} onChange={(e) => setCvv(e.target.value)} placeholder="123" required /></div>
              </div>
              <div><Label htmlFor="cnm">Name on card</Label><Input id="cnm" value={cardName} onChange={(e) => setCardName(e.target.value)} placeholder="John Doe" required /></div>
              <p className="text-[11px] text-muted-foreground">
                Test mode — <span className="font-mono">4242…</span> approves, <span className="font-mono">4000…</span> declines.
              </p>
            </div>
          </div>

          <Button type="submit" size="lg" className="w-full rounded-xl" disabled={processing}>
            {processing ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</> : <><Lock className="h-4 w-4" /> Pay R{total.toFixed(2)}</>}
          </Button>
        </form>

        <div className="lg:col-span-2">
          <div className="healthcare-card p-6 sticky top-16">
            <h2 className="text-lg font-semibold mb-4">Order summary</h2>
            <div className="space-y-3 mb-4">
              {items.map((it) => (
                <div key={it.medId} className="flex items-start gap-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium line-clamp-1">{it.name}</p>
                    <p className="text-xs text-muted-foreground">{it.pharmacyName}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <label htmlFor={`qty-${it.medId}`} className="sr-only">Quantity for {it.name}</label>
                      <select id={`qty-${it.medId}`} value={it.qty} onChange={(e) => setQty(it.medId, Number(e.target.value))} className="text-xs rounded border border-border bg-background px-1 py-0.5">
                        {[1,2,3,4,5,6,7,8,9,10].map((n) => <option key={n} value={n}>Qty {n}</option>)}
                      </select>
                      <button type="button" aria-label={`Remove ${it.name} from cart`} onClick={() => remove(it.medId)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <span className="font-semibold">R{(customerPrice(it.price) * it.qty).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-border pt-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>R{subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Delivery</span><span>R{deliveryFee.toFixed(2)}</span></div>
              <div className="flex justify-between text-base font-bold pt-1.5 border-t border-border"><span>Total</span><span>R{total.toFixed(2)}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckoutAIStatus({ hasRx, medications }: { hasRx: boolean; medications: string[] }) {
  const check = useServerFn(checkDrugInteractions);
  const [intState, setIntState] = useState<"idle" | "loading" | "ok" | "warn" | "error">("idle");
  const [intMsg, setIntMsg] = useState<string>("");

  const key = medications.slice().sort().join("|").toLowerCase();
  useEffect(() => {
    let cancelled = false;
    if (medications.length < 2) { setIntState("idle"); setIntMsg("Add 2+ items to run check"); return; }
    setIntState("loading"); setIntMsg("Scanning for interactions…");
    check({ data: { medications } })
      .then((r: any) => {
        if (cancelled) return;
        if (r?.error) { setIntState("error"); setIntMsg(r.error); return; }
        const major = r?.interactions?.some((i: any) => i.severity === "major");
        const any = r?.interactions?.length > 0;
        if (major) { setIntState("warn"); setIntMsg("Major interaction detected — review below"); }
        else if (any) { setIntState("warn"); setIntMsg(`${r.interactions.length} minor/moderate flagged`); }
        else { setIntState("ok"); setIntMsg("No known interactions"); }
      })
      .catch(() => { if (!cancelled) { setIntState("error"); setIntMsg("Couldn't reach AI service"); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const rxState: "ok" | "warn" | "idle" = !hasRx ? "ok" : "warn";
  const rxMsg = !hasRx
    ? "No prescription required for cart items"
    : "Prescription required — upload & verify before paying";

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
          <Loader2 className="h-3.5 w-3.5 text-primary" />
        </div>
        <h2 className="text-sm font-bold text-foreground">AI Safety Assistant</h2>
        <span className="text-[10px] text-muted-foreground">Live safety checks</span>
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        <StatusRow label="Prescription Check" state={rxState} message={rxMsg} />
        <StatusRow label="Interaction Safety" state={intState} message={intMsg} />
      </div>
    </div>
  );
}

function StatusRow({ label, state, message }: { label: string; state: "idle" | "loading" | "ok" | "warn" | "error"; message: string }) {
  const styles: Record<string, string> = {
    idle: "border-border bg-muted/30 text-muted-foreground",
    loading: "border-healthcare-sky/30 bg-healthcare-sky/10 text-healthcare-sky",
    ok: "border-healthcare-green/30 bg-healthcare-green/10 text-healthcare-green",
    warn: "border-orange-200 bg-orange-50 text-orange-700",
    error: "border-destructive/30 bg-destructive/5 text-destructive",
  };
  const Dot = state === "loading" ? Loader2 : state === "ok" ? CheckCircle2 : state === "error" ? Lock : ShoppingCart;
  return (
    <div className={`rounded-xl border p-2.5 ${styles[state]}`}>
      <div className="flex items-center gap-2">
        <Dot className={`h-3.5 w-3.5 ${state === "loading" ? "animate-spin" : ""}`} />
        <p className="text-[11px] font-bold uppercase tracking-wide">{label}</p>
      </div>
      {state === "loading" ? (
        <div className="mt-1.5 h-3 w-3/4 rounded animate-pulse bg-current/20" />
      ) : (
        <p className="text-xs mt-1 text-foreground/80">{message}</p>
      )}
    </div>
  );
}
