import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { initializeMarketplacePayment, verifyMarketplacePayment } from "@/lib/marketplace-payments.functions";
import { toast } from "sonner";

export function MarketplacePayment({ kind, targetId, reference, paid, onPaid }: { kind: "homecare" | "medication"; targetId: string; reference?: string | null; paid?: boolean; onPaid: () => void }) {
  const initialize = useServerFn(initializeMarketplacePayment);
  const verify = useServerFn(verifyMarketplacePayment);
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState<{ reference: string; url?: string; amount?: number } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  async function prepare() {
    setBusy(true);
    try {
      const result = await initialize({ data: { kind, targetId } });
      if (result.paid) { setConfirmed(true); onPaid(); }
      else setPrepared(result);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not prepare payment."); }
    finally { setBusy(false); }
  }
  async function confirm() {
    const paymentReference = prepared?.reference || reference;
    if (!paymentReference) return;
    setBusy(true);
    try {
      const result = await verify({ data: { kind, targetId, reference: paymentReference } });
      if (result.paid) { setConfirmed(true); onPaid(); toast.success("Paystack payment confirmed."); }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Payment not confirmed yet."); }
    finally { setBusy(false); }
  }
  if (paid || confirmed) return <div className="space-y-1 border-t border-border pt-3 text-sm text-primary"><p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" />Payment confirmed</p>{(prepared?.reference || reference) && <p className="break-all font-mono text-xs">{prepared?.reference || reference}</p>}</div>;
  return <div className="space-y-3 border-t border-border pt-3">
    {prepared?.amount != null && <p className="flex justify-between text-sm font-semibold"><span>Total due</span><span>R{(prepared.amount / 100).toFixed(2)}</span></p>}
    {prepared?.url ? <Button asChild className="w-full"><a href={prepared.url} target="_blank" rel="noopener noreferrer"><CreditCard className="h-4 w-4" />Pay with Paystack</a></Button> : <Button className="w-full" disabled={busy} onClick={() => void prepare()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}Continue to payment</Button>}
    {(prepared?.reference || reference) && <Button variant="outline" className="w-full" disabled={busy} onClick={() => void confirm()}><ShieldCheck className="h-4 w-4" />{busy ? "Checking payment…" : "Verify payment"}</Button>}
  </div>;
}