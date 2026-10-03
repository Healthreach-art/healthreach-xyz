import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { firestoreClient } from "@/lib/firestore-client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Lock, ShieldCheck } from "lucide-react";

interface Props {
  open: boolean;
  title?: string;
  description?: string;
  onClose: () => void;
  onUnlocked: () => void;
}

async function sha256(str: string) {
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Reusable PIN gate. If the user has no PIN yet, lets them set one. */
export function CardPinDialog({ open, title, description, onClose, onUnlocked }: Props) {
  const { user } = useAuth();
  const [stage, setStage] = useState<"loading" | "setup" | "unlock">("loading");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setPin(""); setPin2(""); setStage("loading");
    firestoreClient.from("card_pins").select("pin_hash").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => setStage(data?.pin_hash ? "unlock" : "setup"));
  }, [open, user]);

  async function setupPin() {
    if (!/^\d{4,6}$/.test(pin)) return toast.error("PIN must be 4–6 digits");
    if (pin !== pin2) return toast.error("PINs do not match");
    if (!user) return;
    setBusy(true);
    const hash = await sha256(pin + ":" + user.id);
    const { error } = await firestoreClient.from("card_pins").upsert({ user_id: user.id, pin_hash: hash, updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Card lock PIN set");
    onUnlocked();
    onClose();
  }

  async function unlock() {
    if (!user || !pin) return;
    setBusy(true);
    const hash = await sha256(pin + ":" + user.id);
    const { data } = await firestoreClient.from("card_pins").select("pin_hash").eq("user_id", user.id).maybeSingle();
    setBusy(false);
    if (data?.pin_hash !== hash) return toast.error("Wrong PIN");
    onUnlocked();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Lock className="h-5 w-5 text-primary" /> {title || "Unlock cards"}</DialogTitle>
          <DialogDescription>
            {stage === "setup" ? "Set a 4–6 digit PIN to protect your saved cards." : (description || "Enter your card lock PIN to continue.")}
          </DialogDescription>
        </DialogHeader>
        {stage === "setup" && (
          <div className="space-y-3">
            <div><Label>New PIN</Label><Input inputMode="numeric" type="password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="••••" /></div>
            <div><Label>Confirm PIN</Label><Input inputMode="numeric" type="password" maxLength={6} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} placeholder="••••" /></div>
            <DialogFooter><Button onClick={setupPin} disabled={busy}><ShieldCheck className="h-4 w-4 mr-1" /> Set PIN</Button></DialogFooter>
          </div>
        )}
        {stage === "unlock" && (
          <div className="space-y-3">
            <div><Label>PIN</Label><Input inputMode="numeric" type="password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="••••" autoFocus /></div>
            <DialogFooter><Button onClick={unlock} disabled={busy}>Unlock</Button></DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
