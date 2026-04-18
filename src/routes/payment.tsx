import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, type FormEvent } from "react";
import { CreditCard, Lock, CheckCircle2, Smartphone, Building2, Wallet } from "lucide-react";

export const Route = createFileRoute("/payment")({
  head: () => ({
    meta: [
      { title: "Payment — HEALTHREACH" },
      { name: "description", content: "Secure payment for your medication order." },
    ],
  }),
  component: PaymentPage,
});

type Method = "card" | "eft" | "mobile" | "paypal";

const methods: { id: Method; label: string; icon: typeof CreditCard; desc: string }[] = [
  { id: "card", label: "Credit / Debit Card", icon: CreditCard, desc: "Visa, Mastercard, Amex" },
  { id: "eft", label: "Online Banking (EFT)", icon: Building2, desc: "PayFast, Instant EFT" },
  { id: "mobile", label: "Mobile Payment", icon: Smartphone, desc: "Apple Pay, Google Pay" },
  { id: "paypal", label: "PayPal", icon: Wallet, desc: "Pay with PayPal balance" },
];

function PaymentPage() {
  const navigate = useNavigate();
  const [method, setMethod] = useState<Method>("card");
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [name, setName] = useState("");

  const amount = "R 145.00";
  const orderId = "ORD-2026-04-001";

  const handlePay = (e: FormEvent) => {
    e.preventDefault();
    setProcessing(true);
    setTimeout(() => {
      setProcessing(false);
      setSuccess(true);
    }, 1800);
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
            <div className="flex justify-between"><span className="text-muted-foreground">Order ID</span><span className="font-mono">{orderId}</span></div>
            <div className="flex justify-between mt-1"><span className="text-muted-foreground">Method</span><span className="capitalize">{method}</span></div>
            <div className="flex justify-between mt-1"><span className="text-muted-foreground">Reference</span><span className="font-mono">TXN-{Date.now().toString().slice(-8)}</span></div>
          </div>
          <div className="flex flex-col gap-2">
            <Button onClick={() => navigate({ to: "/track" as any })}>Track Order</Button>
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
          {/* Payment methods */}
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

          {/* Card form */}
          {method === "card" && (
            <form onSubmit={handlePay} className="healthcare-card p-6 space-y-4">
              <h2 className="text-lg font-semibold">Card Details</h2>
              <div className="space-y-2">
                <Label htmlFor="cardName">Cardholder Name</Label>
                <Input id="cardName" value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" required />
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

        {/* Order summary */}
        <div className="healthcare-card p-6 h-fit">
          <h2 className="text-lg font-semibold mb-4">Order Summary</h2>
          <div className="space-y-2 text-sm border-b border-border pb-4">
            <div className="flex justify-between"><span className="text-muted-foreground">Order ID</span><span className="font-mono text-xs">{orderId}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Amoxicillin 500mg × 1</span><span>R 120.00</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Delivery fee</span><span>R 25.00</span></div>
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
