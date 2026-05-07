import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  deliveryId: string | null;
  pharmacyName?: string;
  onClose: () => void;
  onVerified: () => void;
}

export function PickupCodeDialog({ deliveryId, pharmacyName, onClose, onVerified }: Props) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expectedCode, setExpectedCode] = useState<string | null>(null);

  useEffect(() => {
    if (!deliveryId) { setCode(""); setExpectedCode(null); return; }
    (async () => {
      const { data } = await supabase.from("deliveries").select("pickup_code").eq("id", deliveryId).maybeSingle();
      setExpectedCode((data as { pickup_code?: string } | null)?.pickup_code ?? null);
    })();
  }, [deliveryId]);

  async function verify() {
    if (!deliveryId) return;
    if (code.length !== 4) { toast.error("Enter the 4-digit code"); return; }
    setSubmitting(true);
    if (expectedCode && code !== expectedCode) {
      setSubmitting(false);
      toast.error("Incorrect code. Please ask the pharmacy.");
      return;
    }
    const { error } = await supabase
      .from("deliveries")
      .update({ status: "picked_up", pickup_verified_at: new Date().toISOString() } as any)
      .eq("id", deliveryId);
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Pickup verified");
    onVerified();
    onClose();
  }

  return (
    <Dialog open={!!deliveryId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" /> Pickup Verification</DialogTitle>
          <DialogDescription>
            Ask {pharmacyName || "the pharmacy"} for the 4-digit pickup code, then enter it below to confirm pickup.
          </DialogDescription>
        </DialogHeader>
        <Input
          inputMode="numeric" maxLength={4} pattern="\d{4}" autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="••••"
          className="text-center text-3xl tracking-[0.6em] h-16 font-mono"
        />
        <Button onClick={verify} disabled={submitting || code.length !== 4} className="w-full">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Pickup"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
