import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { firestoreClient } from "@/lib/firestore-client";
import { FAILURE_REASONS, type FailureReason } from "@/lib/platform-rules";
import { AlertTriangle, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

interface Props {
  delivery: { id: string; order_id: string; driver_id?: string | null } | null;
  onClose: () => void;
  onSubmitted?: () => void;
}

export function FailedDeliveryDialog({ delivery, onClose, onSubmitted }: Props) {
  const [reason, setReason] = useState<FailureReason | "">("");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() { setReason(""); setNotes(""); setPhoto(null); }

  async function submit() {
    if (!delivery || !reason) { toast.error("Please pick a reason"); return; }
    setSubmitting(true);
    try {
      let photoPath: string | null = null;
      if (photo) {
        const { data: { user } } = await firestoreClient.auth.getUser();
        if (user) {
          const path = `${user.id}/${delivery.id}-${Date.now()}.${photo.name.split(".").pop() || "jpg"}`;
          const { error: upErr } = await firestoreClient.storage.from("delivery-proofs").upload(path, photo);
          if (upErr) throw upErr;
          photoPath = path;
        }
      }
      const { error } = await firestoreClient.from("deliveries").update({
        status: "failed" as never,
        failure_reason: reason,
        failure_notes: notes.trim(),
        failure_photo_path: photoPath,
        failed_at: new Date().toISOString(),
      } as never).eq("id", delivery.id);
      if (error) throw error;

      // Also reflect on the order so customer + admin see it
      await firestoreClient.from("orders").update({ status: "cancelled" as never } as never).eq("id", delivery.order_id);

      // Notify admin(s)
      const { data: admins } = await firestoreClient.from("user_roles").select("user_id").eq("role", "admin");
      if (admins && admins.length > 0) {
        await firestoreClient.from("notifications").insert(
          admins.map((a) => ({
            user_id: a.user_id,
            category: "delivery",
            title: "Delivery failed",
            body: `Order ${delivery.order_id.slice(0, 8)} failed: ${reason.replace(/_/g, " ")}`,
            link: "/dashboard/admin",
          }))
        );
      }

      toast.success("Delivery marked as failed");
      onSubmitted?.();
      reset();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to submit";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={!!delivery} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" /> Report Failed Delivery
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Reason</Label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as FailureReason)}
              className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select a reason…</option>
              {FAILURE_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add context for the admin and customer…" className="mt-1" rows={3} maxLength={500} />
          </div>
          <div>
            <Label className="text-xs flex items-center gap-1"><Upload className="h-3 w-3" /> Proof photo (optional)</Label>
            <Input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="destructive" onClick={submit} disabled={submitting || !reason}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
