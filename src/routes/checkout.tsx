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
import { validateCartPrescriptions, consumePrescription, claimPrescriptionForPharmacy } from "@/lib/prescription.functions";
import { placeOrderWithRouting } from "@/lib/dispatch.functions";
import { AddressPicker, type PickedAddress } from "@/components/AddressPicker";

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ title: "Checkout — HEALTHREACH" }] }),
  component: () => <RoleGuard allow="patient"><CheckoutPage /></RoleGuard>,
});

function CheckoutPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { items, clear, setQty, remove } = useCart();
  const validateRx = useServerFn(validateCartPrescriptions);
  const placeOrder = useServerFn(placeOrderWithRouting);
  const [delivery, setDelivery] = useState<PickedAddress | null>(null);
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [cardName, setCardName] = useState("");
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [rxIssues, setRxIssues] = useState<{ medId: string; message: string }[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from("user_addresses").select("street, lat, lng, is_default").eq("user_id", user.id).order("is_default", { ascending: false }).limit(1)
      .then(({ data }) => {
        const a = data?.[0];
        if (a?.lat && a?.lng) setDelivery({ address: a.street, lat: a.lat, lng: a.lng });
      });
  }, [user]);

  const subtotal = items.reduce((s, i) => s + customerPrice(i.price) * i.qty, 0);
  const deliveryFee = customerDeliveryFee(BASE_DELIVERY_FEE);
  const total = subtotal + deliveryFee;


  const handlePay = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) { navigate({ to: "/login" }); return; }
    if (items.length === 0) { toast.error("Your cart is empty."); return; }
    if (!delivery || !delivery.lat || !delivery.lng) { toast.error("Pick a delivery address."); return; }

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
      const digits = cardNumber.replace(/\D/g, "");
      if (!digits.startsWith("4242")) {
        toast.error("Test mode: card declined. Use 4242…");
        setProcessing(false);
        return;
      }

      // Auto-route order to nearest pharmacy (10→20→30→45→60km tiers)
      const res = await placeOrder({
        data: {
          items: items.map((i) => ({
            medicationId: i.medId,
            medicationName: i.name,
            quantity: i.qty,
            pharmacyIdHint: i.pharmacyId,
          })),
          delivery: { address: delivery.address, lat: delivery.lat, lng: delivery.lng },
          notes: "Paid via card",
        },
      });

      const matched = res.orders.filter((o) => o.matched).length;
      if (matched === 0) {
        toast.error("No pharmacies available within 60 km. Please try again later.");
        setProcessing(false);
        return;
      }
      clear();
      setSuccess(true);
      toast.success(`${matched} order(s) sent to nearby pharmacies — awaiting acceptance…`);
      setTimeout(() => navigate({ to: "/track" }), 1500);
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
          {rxIssues.length > 0 && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-1">
              <p className="text-sm font-semibold text-destructive">Prescription issues</p>
              <ul className="text-xs text-destructive list-disc pl-5">
                {rxIssues.map((i, idx) => <li key={idx}>{i.message}</li>)}
              </ul>
              <p className="text-xs text-muted-foreground pt-1">
                Upload or refresh a prescription from the <Link to="/dashboard/patient/prescriptions" className="underline">Prescriptions</Link> page, then retry.
              </p>
            </div>
          )}
          {items.length >= 2 && (
            <DrugInteractionPanel medications={items.map(i => i.name)} />
          )}
          <div className="healthcare-card p-6">
            <h2 className="text-lg font-semibold mb-4">Delivery address</h2>
            <p className="text-xs text-muted-foreground mb-2">We'll auto-route your order to the closest pharmacy (10 → 60 km).</p>
            <AddressPicker value={delivery} onChange={setDelivery} placeholder="Street, suburb, city…" />
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
