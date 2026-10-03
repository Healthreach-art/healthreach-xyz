import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { firestoreClient } from "@/lib/firestore-client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { CreditCard, Lock, ShieldCheck } from "lucide-react";

interface Props { open: boolean; onClose: () => void; onAdded?: () => void; }

async function sha256(str: string) {
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function detectBrand(num: string): string {
  const n = num.replace(/\s+/g, "");
  if (/^4/.test(n)) return "visa";
  if (/^(5[1-5]|2[2-7])/.test(n)) return "mastercard";
  if (/^3[47]/.test(n)) return "amex";
  if (/^6/.test(n)) return "discover";
  return "card";
}

export function AddCardDialog({ open, onClose, onAdded }: Props) {
  const { user } = useAuth();
  const [stage, setStage] = useState<"loading" | "setup_pin" | "unlock" | "card">("loading");
  const [hasPin, setHasPin] = useState(false);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [exp, setExp] = useState("");
  const [cvv, setCvv] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setPin(""); setPin2(""); setNumber(""); setName(""); setExp(""); setCvv("");
    setStage("loading");
    firestoreClient.from("card_pins").select("pin_hash").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data?.pin_hash) { setHasPin(true); setStage("unlock"); }
        else { setHasPin(false); setStage("setup_pin"); }
      });
  }, [open, user]);

  async function savePin() {
    if (!/^\d{4,6}$/.test(pin)) { toast.error("PIN must be 4–6 digits"); return; }
    if (pin !== pin2) { toast.error("PINs do not match"); return; }
    if (!user) return;
    setBusy(true);
    const hash = await sha256(pin + ":" + user.id);
    const { error } = await firestoreClient.from("card_pins").upsert({ user_id: user.id, pin_hash: hash, updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Card lock PIN set");
    setHasPin(true);
    setStage("card");
  }

  async function unlock() {
    if (!user || !pin) return;
    setBusy(true);
    const hash = await sha256(pin + ":" + user.id);
    const { data } = await firestoreClient.from("card_pins").select("pin_hash").eq("user_id", user.id).maybeSingle();
    setBusy(false);
    if (data?.pin_hash !== hash) { toast.error("Wrong PIN"); return; }
    setStage("card");
  }

  async function saveCard() {
    if (!user) return;
    const digits = number.replace(/\s+/g, "");
    if (!/^\d{13,19}$/.test(digits)) return toast.error("Invalid card number");
    if (!/^\d{2}\/\d{2}$/.test(exp)) return toast.error("Expiry must be MM/YY");
    if (!/^\d{3,4}$/.test(cvv)) return toast.error("Invalid CVV");
    const [mm, yy] = exp.split("/");
    setBusy(true);
    const { error } = await firestoreClient.from("saved_payment_methods").insert({
      user_id: user.id,
      brand: detectBrand(digits),
      last4: digits.slice(-4),
      exp_month: Number(mm),
      exp_year: 2000 + Number(yy),
      is_default: false,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Card saved securely");
    onAdded?.();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {stage === "card" ? <CreditCard className="h-5 w-5 text-primary" /> : <Lock className="h-5 w-5 text-primary" />}
            {stage === "setup_pin" ? "Set your card lock PIN" : stage === "unlock" ? "Unlock cards" : stage === "card" ? "Add a new card" : "Loading…"}
          </DialogTitle>
          <DialogDescription>
            {stage === "setup_pin" && "Choose a 4–6 digit PIN. You'll need it every time you add or manage a card."}
            {stage === "unlock" && "Enter your PIN to add a new card."}
            {stage === "card" && "Card details are stored securely — we only keep the last 4 digits."}
          </DialogDescription>
        </DialogHeader>

        {stage === "setup_pin" && (
          <div className="space-y-3">
            <div><Label>New PIN</Label><Input inputMode="numeric" type="password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="••••" /></div>
            <div><Label>Confirm PIN</Label><Input inputMode="numeric" type="password" maxLength={6} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} placeholder="••••" /></div>
            <DialogFooter>
              <Button onClick={savePin} disabled={busy}><ShieldCheck className="h-4 w-4 mr-1" />Set PIN & continue</Button>
            </DialogFooter>
          </div>
        )}
        {stage === "unlock" && (
          <div className="space-y-3">
            <div><Label>PIN</Label><Input inputMode="numeric" type="password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="••••" autoFocus /></div>
            <DialogFooter>
              <Button onClick={unlock} disabled={busy}>Unlock</Button>
            </DialogFooter>
          </div>
        )}
        {stage === "card" && (
          <div className="space-y-3">
            <div><Label>Card number</Label><Input inputMode="numeric" placeholder="4242 4242 4242 4242" value={number} onChange={(e) => setNumber(e.target.value.replace(/[^\d\s]/g, "").replace(/(\d{4})(?=\d)/g, "$1 ").slice(0, 23))} /></div>
            <div><Label>Cardholder name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="As on card" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Expiry (MM/YY)</Label><Input maxLength={5} value={exp} onChange={(e) => {
                let v = e.target.value.replace(/\D/g, "").slice(0, 4);
                if (v.length >= 3) v = v.slice(0, 2) + "/" + v.slice(2);
                setExp(v);
              }} placeholder="12/28" /></div>
              <div><Label>CVV</Label><Input inputMode="numeric" type="password" maxLength={4} value={cvv} onChange={(e) => setCvv(e.target.value.replace(/\D/g, ""))} placeholder="•••" /></div>
            </div>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Lock className="h-3 w-3" /> Protected by your card PIN.</p>
            <DialogFooter>
              <Button onClick={saveCard} disabled={busy}>{busy ? "Saving…" : "Save card"}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
