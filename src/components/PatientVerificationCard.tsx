import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BadgeCheck,
  IdCard,
  Camera,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  ScanFace,
} from "lucide-react";
import { toast } from "sonner";
import { CameraCapture } from "@/components/CameraCapture";

export interface PatientVerification {
  user_id: string;
  id_document_path: string | null;
  selfie_path: string | null;
  selfie_with_id_path: string | null;
  id_number: string | null;
  status: "pending" | "approved" | "rejected";
  notes: string | null;
}

export async function fetchVerification(userId: string): Promise<PatientVerification | null> {
  const { data } = await supabase
    .from("patient_verifications")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as PatientVerification | null) ?? null;
}

/** Complete = selfie + ID photo + selfie-with-ID + valid-looking ID number. */
export function isVerificationComplete(v: PatientVerification | null) {
  return !!(
    v &&
    v.id_document_path &&
    v.selfie_path &&
    v.selfie_with_id_path &&
    v.id_number &&
    v.id_number.replace(/\D/g, "").length >= 6
  );
}

interface Props {
  compact?: boolean;
  onChanged?: (v: PatientVerification | null) => void;
}

export function PatientVerificationCard({ compact, onChanged }: Props) {
  const { user } = useAuth();
  const [v, setV] = useState<PatientVerification | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"id" | "selfie" | "selfie_id" | "save" | null>(null);
  const [liveSelfieOpen, setLiveSelfieOpen] = useState(false);
  const [idCameraOpen, setIdCameraOpen] = useState(false);
  const [selfieIdOpen, setSelfieIdOpen] = useState(false);
  const [idNumber, setIdNumber] = useState("");

  async function reload() {
    if (!user) return;
    const row = await fetchVerification(user.id);
    setV(row);
    setIdNumber(row?.id_number ?? "");
    onChanged?.(row);
  }

  useEffect(() => {
    if (!user) return;
    (async () => {
      await reload();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function uploadDoc(kind: "id" | "selfie" | "selfie_id", file: File) {
    if (!user) return;
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
      const path = `${user.id}/verify-${kind}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("prescriptions")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (upErr) throw upErr;
      const patch: Record<string, unknown> = { user_id: user.id };
      if (kind === "id") patch.id_document_path = path;
      else if (kind === "selfie") patch.selfie_path = path;
      else patch.selfie_with_id_path = path;
      const { error } = await supabase
        .from("patient_verifications")
        .upsert(patch as never, { onConflict: "user_id" });
      if (error) throw error;
      toast.success(
        kind === "id" ? "ID photo uploaded" :
        kind === "selfie" ? "Selfie captured" :
        "Selfie with ID captured"
      );
      await reload();
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function saveIdNumber() {
    if (!user) return;
    const cleaned = idNumber.trim();
    if (cleaned.replace(/\D/g, "").length < 6) {
      toast.error("Enter a valid ID number");
      return;
    }
    setBusy("save");
    const { error } = await supabase
      .from("patient_verifications")
      .upsert({ user_id: user.id, id_number: cleaned } as never, { onConflict: "user_id" });
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("ID number saved");
    await reload();
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading verification…
      </div>
    );
  }

  const complete = isVerificationComplete(v);
  const hasId = !!v?.id_document_path;
  const hasSelfie = !!v?.selfie_path;
  const hasSelfieId = !!v?.selfie_with_id_path;
  const hasIdNumber = !!(v?.id_number && v.id_number.replace(/\D/g, "").length >= 6);
  const completedSteps = [hasSelfie, hasId, hasSelfieId, hasIdNumber].filter(Boolean).length;

  return (
    <div
      className={`rounded-2xl border ${
        complete
          ? "border-healthcare-green/40 bg-healthcare-green/5"
          : "border-amber-500/40 bg-amber-500/5"
      } p-4 ${compact ? "" : "sm:p-5"}`}
    >
      <div className="flex items-start gap-3 mb-4">
        <div
          className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
            complete
              ? "bg-healthcare-green/15 text-healthcare-green"
              : "bg-amber-500/20 text-amber-700 dark:text-amber-400"
          }`}
        >
          {complete ? <ShieldCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-foreground">Identity verification</h3>
            {complete ? (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-healthcare-green/15 text-healthcare-green inline-flex items-center gap-1">
                <BadgeCheck className="h-3 w-3" /> Verified
              </span>
            ) : (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400">
                {completedSteps}/4 steps
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Upload once — these documents will auto-attach to every future prescription order.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <StepRow
          n={1}
          title="Live selfie"
          hint={hasSelfie ? "Captured — retake if needed" : "Open camera and take a live photo"}
          done={hasSelfie}
          busy={busy === "selfie"}
          icon={<Camera className="h-4 w-4" />}
          action={
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => setLiveSelfieOpen(true)}>
              <Camera className="h-3.5 w-3.5" /> {hasSelfie ? "Retake" : "Start camera"}
            </Button>
          }
        />

        <StepRow
          n={2}
          title="ID / Passport photo"
          hint={hasId ? "Uploaded — replace if needed" : "Clear photo of your ID document"}
          done={hasId}
          busy={busy === "id"}
          icon={<IdCard className="h-4 w-4" />}
          action={
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => setIdCameraOpen(true)}>
              <Camera className="h-3.5 w-3.5" /> {hasId ? "Retake" : "Start camera"}
            </Button>
          }
        />

        <StepRow
          n={3}
          title="Selfie holding your ID"
          hint={hasSelfieId ? "Captured — retake if needed" : "Hold your ID next to your face, both clearly visible"}
          done={hasSelfieId}
          busy={busy === "selfie_id"}
          icon={<ScanFace className="h-4 w-4" />}
          action={
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => setSelfieIdOpen(true)}>
              <Camera className="h-3.5 w-3.5" /> {hasSelfieId ? "Retake" : "Start camera"}
            </Button>
          }
        />

        <StepRow
          n={4}
          title="ID number"
          hint="13-digit SA ID number or passport number"
          done={hasIdNumber}
          busy={busy === "save"}
          icon={<IdCard className="h-4 w-4" />}
          action={null}
        >
          <div className="flex gap-2 mt-2">
            <Input
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value.replace(/[^0-9A-Za-z]/g, "").slice(0, 20))}
              placeholder="e.g. 9001015800087"
              inputMode="numeric"
              className="h-9 text-sm"
            />
            <Button size="sm" onClick={saveIdNumber} disabled={busy === "save" || idNumber === (v?.id_number ?? "")} className="h-9">
              {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
            </Button>
          </div>
        </StepRow>
      </div>

      <CameraCapture
        open={liveSelfieOpen}
        onClose={() => setLiveSelfieOpen(false)}
        onCapture={(f) => uploadDoc("selfie", f)}
        title="Live identity selfie"
        hint="Hold your phone at eye level. Make sure your face is clearly lit."
        facing="user"
        filenamePrefix="live-selfie"
      />
      <CameraCapture
        open={idCameraOpen}
        onClose={() => setIdCameraOpen(false)}
        onCapture={(f) => uploadDoc("id", f)}
        title="ID / Passport photo"
        hint="Lay your ID flat with good lighting. All text must be readable."
        facing="environment"
        filenamePrefix="id-doc"
      />
      <CameraCapture
        open={selfieIdOpen}
        onClose={() => setSelfieIdOpen(false)}
        onCapture={(f) => uploadDoc("selfie_id", f)}
        title="Selfie holding your ID"
        hint="Hold your ID next to your face. Both your face and the ID details must be clearly visible."
        facing="user"
        filenamePrefix="selfie-with-id"
      />
    </div>
  );
}

function StepRow({
  n, title, hint, done, busy, icon, action, children,
}: {
  n: number;
  title: string;
  hint: string;
  done: boolean;
  busy: boolean;
  icon: React.ReactNode;
  action: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border ${done ? "border-healthcare-green/40 bg-healthcare-green/5" : "border-border bg-card"} p-3`}>
      <div className="flex items-start gap-3">
        <span
          className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
            done ? "bg-healthcare-green/20 text-healthcare-green" : "bg-muted text-muted-foreground"
          }`}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : done ? <CheckCircle2 className="h-4 w-4" /> : n}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <span className="text-muted-foreground">{icon}</span> {title}
            </p>
            {action}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
