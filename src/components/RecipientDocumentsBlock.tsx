import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, IdCard, ScanFace, Loader2, CheckCircle2, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { CameraCapture } from "@/components/CameraCapture";

interface FamilyMemberDocs {
  id: string;
  full_name: string;
  relationship: string;
  id_number: string | null;
  id_document_path: string | null;
  selfie_with_id_path: string | null;
}

interface Props {
  familyMemberId: string;
  onComplete?: (complete: boolean) => void;
}

/**
 * Inline editor for a family member's ID number, ID document, and selfie-with-ID.
 * Used at checkout when ordering on behalf of someone else.
 */
export function RecipientDocumentsBlock({ familyMemberId, onComplete }: Props) {
  const { user } = useAuth();
  const [m, setM] = useState<FamilyMemberDocs | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"id" | "selfie_id" | "save" | null>(null);
  const [idCameraOpen, setIdCameraOpen] = useState(false);
  const [selfieIdOpen, setSelfieIdOpen] = useState(false);
  const [idNumber, setIdNumber] = useState("");

  async function reload() {
    if (!familyMemberId) return;
    const { data } = await supabase
      .from("family_members")
      .select("id, full_name, relationship, id_number, id_document_path, selfie_with_id_path")
      .eq("id", familyMemberId)
      .maybeSingle();
    const row = (data as FamilyMemberDocs | null) ?? null;
    setM(row);
    setIdNumber(row?.id_number ?? "");
    onComplete?.(
      !!(row?.id_document_path && row?.selfie_with_id_path && row?.id_number && row.id_number.replace(/\D/g, "").length >= 6)
    );
  }

  useEffect(() => {
    setLoading(true);
    reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyMemberId]);

  async function uploadDoc(kind: "id" | "selfie_id", file: File) {
    if (!user || !m) return;
    if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) {
      toast.error("Use JPG, PNG, WEBP or PDF");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Max file size 8 MB");
      return;
    }
    setBusy(kind);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${user.id}/family-${m.id}-${kind}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("prescriptions")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (upErr) throw upErr;
      const patch: Record<string, unknown> = {};
      if (kind === "id") patch.id_document_path = path;
      else patch.selfie_with_id_path = path;
      const { error } = await supabase.from("family_members").update(patch).eq("id", m.id);
      if (error) throw error;
      toast.success(kind === "id" ? "Recipient ID uploaded" : "Selfie with ID uploaded");
      await reload();
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function saveIdNumber() {
    if (!m) return;
    const cleaned = idNumber.trim();
    if (cleaned.replace(/\D/g, "").length < 6) {
      toast.error("Enter a valid ID number");
      return;
    }
    setBusy("save");
    const { error } = await supabase.from("family_members").update({ id_number: cleaned }).eq("id", m.id);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success("ID number saved");
    await reload();
  }

  if (loading || !m) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading recipient documents…
      </div>
    );
  }

  const hasId = !!m.id_document_path;
  const hasSelfieId = !!m.selfie_with_id_path;
  const hasIdNumber = !!(m.id_number && m.id_number.replace(/\D/g, "").length >= 6);
  const complete = hasId && hasSelfieId && hasIdNumber;

  return (
    <div className={`rounded-2xl border ${complete ? "border-healthcare-green/40 bg-healthcare-green/5" : "border-amber-500/40 bg-amber-500/5"} p-4 space-y-3`}>
      <div className="flex items-start gap-2">
        {complete
          ? <ShieldCheck className="h-5 w-5 text-healthcare-green shrink-0" />
          : <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0" />}
        <div className="min-w-0">
          <p className="text-sm font-semibold">Recipient documents — {m.full_name}</p>
          <p className="text-[11px] text-muted-foreground">
            Required when ordering prescription medication on someone else's behalf. Upload once — stored against this family profile for future orders.
          </p>
        </div>
      </div>

      <Row
        title="ID / Passport photo"
        hint={hasId ? "Uploaded" : "Clear photo of their ID document"}
        done={hasId}
        busy={busy === "id"}
        icon={<IdCard className="h-4 w-4" />}
        action={
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => setIdCameraOpen(true)}>
            <Camera className="h-3.5 w-3.5" /> {hasId ? "Retake" : "Start camera"}
          </Button>
        }
      />

      <Row
        title="Selfie of recipient holding their ID"
        hint={hasSelfieId ? "Uploaded" : "Face + ID both clearly visible"}
        done={hasSelfieId}
        busy={busy === "selfie_id"}
        icon={<ScanFace className="h-4 w-4" />}
        action={
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => setSelfieIdOpen(true)}>
            <Camera className="h-3.5 w-3.5" /> {hasSelfieId ? "Retake" : "Start camera"}
          </Button>
        }
      />

      <div className="rounded-xl border border-border bg-card p-3">
        <Label className="text-xs flex items-center gap-1.5">
          <IdCard className="h-3.5 w-3.5 text-muted-foreground" /> Recipient ID number
          {hasIdNumber && <CheckCircle2 className="h-3.5 w-3.5 text-healthcare-green" />}
        </Label>
        <div className="flex gap-2 mt-2">
          <Input
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value.replace(/[^0-9A-Za-z]/g, "").slice(0, 20))}
            placeholder="e.g. 9001015800087"
            inputMode="numeric"
            className="h-9 text-sm"
          />
          <Button size="sm" onClick={saveIdNumber} disabled={busy === "save" || idNumber === (m.id_number ?? "")} className="h-9">
            {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
          </Button>
        </div>
      </div>

      <CameraCapture
        open={idCameraOpen}
        onClose={() => setIdCameraOpen(false)}
        onCapture={(f) => uploadDoc("id", f)}
        title={`${m.full_name} — ID / Passport`}
        hint="Lay the ID flat with good lighting. All text must be readable."
        facing="environment"
        filenamePrefix="recipient-id"
      />
      <CameraCapture
        open={selfieIdOpen}
        onClose={() => setSelfieIdOpen(false)}
        onCapture={(f) => uploadDoc("selfie_id", f)}
        title={`${m.full_name} — selfie with ID`}
        hint="They should hold their ID next to their face. Both must be clearly visible."
        facing="user"
        filenamePrefix="recipient-selfie-id"
      />
    </div>
  );
}

function Row({
  title, hint, done, busy, icon, action,
}: {
  title: string; hint: string; done: boolean; busy: boolean; icon: React.ReactNode; action: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border ${done ? "border-healthcare-green/40 bg-healthcare-green/5" : "border-border bg-card"} p-3`}>
      <div className="flex items-start gap-3">
        <span className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${done ? "bg-healthcare-green/20 text-healthcare-green" : "bg-muted text-muted-foreground"}`}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : done ? <CheckCircle2 className="h-4 w-4" /> : icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            {action}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>
        </div>
      </div>
    </div>
  );
}
