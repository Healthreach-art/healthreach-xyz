import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Star, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { submitReview } from "@/lib/reviews.functions";
import { toast } from "sonner";

interface Props {
  orderId: string | null;
  hasDriver: boolean;
  pharmacyName?: string;
  onClose: () => void;
  onSubmitted?: () => void;
}

function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} className="p-0.5">
          <Star className={`h-7 w-7 ${n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
        </button>
      ))}
    </div>
  );
}

export function ReviewDialog({ orderId, hasDriver, pharmacyName, onClose, onSubmitted }: Props) {
  const send = useServerFn(submitReview);
  const [pStars, setPStars] = useState(5);
  const [dStars, setDStars] = useState(5);
  const [pComment, setPComment] = useState("");
  const [dComment, setDComment] = useState("");
  const [busy, setBusy] = useState(false);

  async function go() {
    if (!orderId) return;
    setBusy(true);
    try {
      const res = await send({
        data: {
          orderId,
          pharmacyStars: pStars,
          pharmacyComment: pComment,
          ...(hasDriver ? { driverStars: dStars, driverComment: dComment } : {}),
        },
      });
      if (!res.ok) toast.error(res.reason ?? "Could not submit review");
      else { toast.success("Thanks for your review!"); onSubmitted?.(); onClose(); }
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={!!orderId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rate your order</DialogTitle>
          <DialogDescription>Your feedback helps the {pharmacyName ?? "pharmacy"} and driver improve.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-1">Pharmacy{pharmacyName ? ` — ${pharmacyName}` : ""}</p>
            <Stars value={pStars} onChange={setPStars} />
            <textarea
              value={pComment} onChange={(e) => setPComment(e.target.value)}
              placeholder="Optional comment about the pharmacy…"
              rows={2}
              className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          {hasDriver && (
            <div>
              <p className="text-sm font-medium mb-1">Driver</p>
              <Stars value={dStars} onChange={setDStars} />
              <textarea
                value={dComment} onChange={(e) => setDComment(e.target.value)}
                placeholder="Optional comment about the driver…"
                rows={2}
                className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          )}
          <Button className="w-full" onClick={go} disabled={busy}>
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</> : "Submit review"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
