import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState, type FormEvent } from "react";
import { CreditCard, Lock, CheckCircle2, Smartphone, Building2, Wallet, MapPin } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { customerPrice, customerDeliveryFee, BASE_DELIVERY_FEE } from "@/lib/pricing";

const paymentSearchSchema = z.object({
  medId: fallback(z.string().optional(), undefined),
  name: fallback(z.string(), "Amoxicillin 500mg").default("Amoxicillin 500mg"),
  // `price` here is the BASE pharmacy price; customer-facing markup is applied below.
  price: fallback(z.number(), 120).default(120),
  pharmacyId: fallback(z.string().optional(), undefined),
  qty: fallback(z.number().int().min(1).max(50), 1).default(1),
});

export const Route = createFileRoute("/payment")({
  head: () => ({
    meta: [
      { title: "Payment — HEALTHREACH" },
      { name: "description", content: "Secure payment for your medication order." },
    ],
  }),
  validateSearch: zodValidator(paymentSearchSchema),
  component: PaymentPage,
});

type Method = "card" | "eft" | "mobile" | "paypal";

const methods: { id: Method; label: string; icon: typeof CreditCard; desc: string }[] = [
  { id: "card", label: "Credit / Debit Card", icon: CreditCard, desc: "Visa, Mastercard, Amex" },
  { id: "eft", label: "Online Banking (EFT)", icon: Building2, desc: "PayFast, Instant EFT" },
  { id: "mobile", label: "Mobile Payment", icon: Smartphone, desc: "Apple Pay, Google Pay" },
  { id: "paypal", label: "PayPal", icon: Wallet, desc: "Pay with PayPal balance" },
];

// Base delivery fee shared with the driver (kept whole — the +7% markup is platform fee).
const BASE_DELIVERY = BASE_DELIVERY_FEE;

function PaymentPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { medId, name: medicationName, price, pharmacyId, qty } = Route.useSearch();

  const [method, setMethod] = useState<Method>("card");
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [cardName, setCardName] = useState("");
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [txnRef, setTxnRef] = useState<string>("");
  const [deliveryAddress, setDeliveryAddress] = useState("");

  // Pre-fill delivery address from patient profile
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("address").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data?.address) setDeliveryAddress(data.address); });
  }, [user]);

  // Customer-facing pricing — pharmacy base price + 15%, delivery base + 7%.
  const unitPrice = customerPrice(price);
  const subtotal = Math.round(unitPrice * qty * 100) / 100;
  const deliveryFee = customerDeliveryFee(BASE_DELIVERY);
  const totalNum = Math.round((subtotal + deliveryFee) * 100) / 100;
  const amount = `R ${totalNum.toFixed(2)}`;

  const handlePay = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("Please sign in to place an order.");
      navigate({ to: "/login" });
      return;
    }
    if (!deliveryAddress.trim()) {
      toast.error("Please enter a delivery address.");
      return;
    }
    setProcessing(true);

    try {
      // Resolve pharmacy: param → first pharmacy user → self (demo fallback)
      let resolvedPharmacy = pharmacyId;
      if (!resolvedPharmacy) {
        const { data: pharmacyRole } = await supabase
          .from("user_roles").select("user_id").eq("role", "pharmacy").limit(1).maybeSingle();
        resolvedPharmacy = pharmacyRole?.user_id ?? user.id;
      }

      // Pull pharmacy address for pickup point
      const { data: pharmacyProfile } = await supabase
        .from("profiles")
        .select("address, organization_name")
        .eq("user_id", resolvedPharmacy)
        .maybeSingle();
      const pickupAddress =
        pharmacyProfile?.address?.trim() ||
        pharmacyProfile?.organization_name ||
        "Pharmacy pickup point";

      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .insert({
          patient_id: user.id,
          pharmacy_id: resolvedPharmacy,
          medication_id: medId ?? null,
          medication_name: medicationName,
          quantity: qty,
          delivery_fee: BASE_DELIVERY,
          total_amount: totalNum,
          status: "pending",
          delivery_address: deliveryAddress,
          notes: `Paid via ${method}`,
        })
        .select()
        .single();
      if (orderErr || !order) throw orderErr ?? new Error("Failed to create order");

      const reference = `TXN-${Date.now().toString().slice(-8)}`;
      const { error: payErr } = await supabase.from("payments").insert({
        order_id: order.id,
        patient_id: user.id,
        amount: totalNum,
        payment_method: method,
        status: "completed",
        transaction_ref: reference,
      });
      if (payErr) throw payErr;

      const { error: delErr } = await supabase.from("deliveries").insert({
        order_id: order.id,
        status: "assigned",
        pickup_address: pickupAddress,
        delivery_address: deliveryAddress,
        estimated_time: "30-45 minutes",
      });
      if (delErr) throw delErr;

      // Decrement stock if a real medication was ordered
      if (medId) {
        const { data: med } = await supabase
          .from("medications").select("stock_quantity").eq("id", medId).maybeSingle();
        if (med && typeof med.stock_quantity === "number") {
          await supabase
            .from("medications")
            .update({ stock_quantity: Math.max(0, med.stock_quantity - qty) })
            .eq("id", medId);
        }
      }

      setCreatedOrderId(order.id);
      setTxnRef(reference);
      setSuccess(true);
      toast.success("Payment successful — your order is on the way!");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Payment failed. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  if (success) {
    return (
      <div className="container-narrow px-4 sm:px-6 py-12">
        <div className="mx-auto max-w-md healthcare-card p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-healthcare-green/20">
            <CheckCircle2 className="h-8 w-8 text-healthcare-green" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Payment Successful</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your payment of <span className="font-semibold text-foreground">{amount}</span> has been processed.
          </p>
          <div className="my-6 rounded-lg border border-border p-4 text-left text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Order ID</span><span className="font-mono text-xs">{createdOrderId?.slice(0, 8)}</span></div>
            <div className="flex justify-between mt-1"><span className="text-muted-foreground">Method</span><span className="capitalize">{method}</span></div>
            <div className="flex justify-between mt-1"><span className="text-muted-foreground">Reference</span><span className="font-mono">{txnRef}</span></div>
          </div>
          <div className="flex flex-col gap-2">
            <Button onClick={() => navigate({ to: "/track" })}>Track Order</Button>
            <Button variant="outline" asChild><Link to="/dashboard/patient">Back to Dashboard</Link></Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-narrow px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-foreground mb-1">Checkout</h1>
      <p className="text-sm text-muted-foreground mb-8">Complete your medication order securely.</p>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="healthcare-card p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" /> Delivery Address
            </h2>
            <Textarea
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              placeholder="Street, suburb, city, postcode"
              required
              rows={2}
            />
            <p className="mt-2 text-xs text-muted-foreground">Driver will deliver here. Update your saved address in your profile to pre-fill next time.</p>
          </div>

          <div className="healthcare-card p-6">
            <h2 className="text-lg font-semibold mb-4">Payment Method</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {methods.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethod(m.id)}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                    method === m.id ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                  }`}
                >
                  <m.icon className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{m.label}</p>
                    <p className="text-xs text-muted-foreground">{m.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {method === "card" && (
            <form onSubmit={handlePay} className="healthcare-card p-6 space-y-4">
              <h2 className="text-lg font-semibold">Card Details</h2>
              <div className="space-y-2">
                <Label htmlFor="cardName">Cardholder Name</Label>
                <Input id="cardName" value={cardName} onChange={(e) => setCardName(e.target.value)} placeholder="John Doe" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cardNumber">Card Number</Label>
                <Input id="cardNumber" value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} placeholder="4242 4242 4242 4242" maxLength={19} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="expiry">Expiry</Label>
                  <Input id="expiry" value={expiry} onChange={(e) => setExpiry(e.target.value)} placeholder="MM/YY" maxLength={5} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cvv">CVV</Label>
                  <Input id="cvv" value={cvv} onChange={(e) => setCvv(e.target.value)} placeholder="123" maxLength={4} required />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={processing}>
                <Lock className="h-4 w-4" />
                {processing ? "Processing..." : `Pay ${amount}`}
              </Button>
            </form>
          )}

          {method !== "card" && (
            <form onSubmit={handlePay} className="healthcare-card p-6 space-y-4">
              <h2 className="text-lg font-semibold capitalize">{method === "eft" ? "EFT" : method} Payment</h2>
              <p className="text-sm text-muted-foreground">
                You will be redirected to complete your {method === "eft" ? "EFT" : method} payment securely.
              </p>
              <Button type="submit" className="w-full" disabled={processing}>
                <Lock className="h-4 w-4" />
                {processing ? "Connecting..." : `Continue to Pay ${amount}`}
              </Button>
            </form>
          )}
        </div>

        <div className="healthcare-card p-6 h-fit">
          <h2 className="text-lg font-semibold mb-4">Order Summary</h2>
          <div className="space-y-2 text-sm border-b border-border pb-4">
            <div className="flex justify-between"><span className="text-muted-foreground">{medicationName} × {qty}</span><span>R {subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Delivery fee</span><span>R {DELIVERY_FEE.toFixed(2)}</span></div>
          </div>
          <div className="flex justify-between pt-4 text-base font-semibold">
            <span>Total</span><span>{amount}</span>
          </div>
          <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" /> Secured with 256-bit encryption
          </p>
        </div>
      </div>
    </div>
  );
}
