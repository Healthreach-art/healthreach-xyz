import { useEffect, useRef, useState } from "react";
import { firestoreClient } from "@/lib/firestore-client";
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
import { isIdentityVerified, isValidIdentityNumber, isVerificationComplete, type PatientVerification } from "@/lib/patient-verification";
import { fetchVerification } from "@/lib/patient-verification-data";

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
  const [idNumberError, setIdNumberError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const idFileInput = useRef<HTMLInputElement>(null);

  async function reload() {
    if (!user) return;
    const row = await fetchVerification(user.id);
    setV(row);
    setIdNumber(row?.id_number ?? "");
    setLoadError(null);
    onChanged?.(row);
  }

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        await reload();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not load identity verification.";
        setLoadError(message);
        toast.error(message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function uploadDoc(kind: "id" | "selfie" | "selfie_id", file: File) {
    if (!user) return;
    const acceptedTypes = kind === "id"
      ? ["image/jpeg", "image/png", "application/pdf"]
      : ["image/jpeg", "image/png"];
    if (!acceptedTypes.includes(file.type)) {
      toast.error(kind === "id" ? "Use a JPG, PNG, or PDF file." : "Use a JPG or PNG photo.");
      return false;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Max file size 8 MB");
      return false;
    }
    setBusy(kind);
    try {
      const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
      const path = `${user.id}/identity/${kind}-${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await firestoreClient.storage
        .from("prescriptions")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const patch: Record<string, unknown> = {
        user_id: user.id,
        status: "pending",
        updated_at: new Date().toISOString(),
      };
      if (kind === "id") patch.id_document_path = path;
      else if (kind === "selfie") patch.selfie_path = path;
      else patch.selfie_with_id_path = path;
      const { error } = await firestoreClient
        .from("patient_verifications")
        .upsert(patch as never, { onConflict: "user_id" });
      if (error) {
        const { error: cleanupError } = await firestoreClient.storage.from("prescriptions").remove([path]);
        if (cleanupError) {
          throw new Error(`Could not save your verification record, and the uploaded file could not be removed. Please contact support.`);
        }
        throw error;
      }
      toast.success(
        kind === "id" ? "ID photo uploaded" :
        kind === "selfie" ? "Selfie captured" :
        "Selfie with ID captured"
      );
      await reload();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function saveIdNumber() {
    if (!user) return;
    const cleaned = idNumber.trim().toUpperCase();
    if (!isValidIdentityNumber(cleaned)) {
      setIdNumberError("Enter a valid 13-digit South African ID number or passport number.");
      return;
    }
    setIdNumberError(null);
    setBusy("save");
    try {
      const { error } = await firestoreClient
        .from("patient_verifications")
        .upsert({
          user_id: user.id,
          id_number: cleaned,
          status: "pending",
          updated_at: new Date().toISOString(),
        } as never, { onConflict: "user_id" });
      if (error) throw error;
      toast.success("Identity number saved for review.");
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save identity number.");
    } finally {
      setBusy(null);
    }
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
  const hasIdNumber = !!(v?.id_number && isValidIdentityNumber(v.id_number));
  const completedSteps = [hasSelfie, hasId, hasSelfieId, hasIdNumber].filter(Boolean).length;
  const verified = isIdentityVerified(v);
  const underReview = complete && v?.status === "pending";
  const statusLabel = verified ? "Verified" : v?.status === "rejected" ? "Rejected" : underReview ? "Under review" : "In progress";

  return (
    <div
      className={`rounded-2xl border border-border bg-card p-4 shadow-sm ${compact ? "" : "sm:p-6"}`}
    >
      <div className="flex items-start gap-3 mb-4">
        <div
          className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${
            verified ? "bg-healthcare-green/15 text-healthcare-green" : "bg-primary/10 text-primary"
          }`}
        >
          {verified ? <ShieldCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-foreground">Identity verification</h3>
            <span className={`text-[11px] px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
              verified ? "bg-healthcare-green/15 text-healthcare-green" :
                v?.status === "rejected" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
            }`}>
              {verified && <BadgeCheck className="h-3 w-3" />}
              {statusLabel}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {completedSteps}/4 steps submitted
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Submit the required details and documents for review. Submitting them does not itself verify your identity.
          </p>
          {v?.status === "rejected" && v.notes && (
            <p className="mt-2 text-xs text-destructive" role="alert">Review note: {v.notes}</p>
          )}
          {loadError && (
            <div className="mt-2 flex items-center gap-2 text-xs text-destructive" role="alert">
              <span>{loadError}</span>
              <Button size="sm" variant="outline" className="h-7" onClick={() => {
                setLoading(true);
                void reload().catch((error: unknown) => {
                  const message = error instanceof Error ? error.message : "Could not load identity verification.";
                  setLoadError(message);
                  toast.error(message);
                }).finally(() => setLoading(false));
              }}>Retry</Button>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <StepRow
          n={1}
          title="Live selfie"
          hint={hasSelfie ? "Photo saved" : "Take a live photo using your camera"}
          done={hasSelfie}
          rejected={v?.status === "rejected" && hasSelfie}
          verified={verified && hasSelfie}
          underReview={underReview && hasSelfie}
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
          hint={hasId ? "Document saved" : "Upload a clear, readable photo or PDF"}
          done={hasId}
          rejected={v?.status === "rejected" && hasId}
          verified={verified && hasId}
          underReview={underReview && hasId}
          busy={busy === "id"}
          icon={<IdCard className="h-4 w-4" />}
          action={
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => setIdCameraOpen(true)}>
                <Camera className="h-3.5 w-3.5" /> {hasId ? "Retake" : "Start camera"}
              </Button>
              <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => idFileInput.current?.click()}>
                Upload file
              </Button>
              <input
                ref={idFileInput}
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                className="hidden"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file) void uploadDoc("id", file);
                }}
              />
            </div>
          }
        />

        <StepRow
          n={3}
          title="Selfie holding your ID"
          hint={hasSelfieId ? "Photo saved" : "Keep your face and ID clearly visible"}
          done={hasSelfieId}
          rejected={v?.status === "rejected" && hasSelfieId}
          verified={verified && hasSelfieId}
          underReview={underReview && hasSelfieId}
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
          rejected={v?.status === "rejected" && hasIdNumber}
          verified={verified && hasIdNumber}
          underReview={underReview && hasIdNumber}
          busy={busy === "save"}
          icon={<IdCard className="h-4 w-4" />}
          action={null}
        >
          <div className="flex gap-2 mt-2">
            <Input
              value={idNumber}
              onChange={(e) => {
                setIdNumber(e.target.value.replace(/[^0-9A-Za-z]/g, "").slice(0, 20).toUpperCase());
                setIdNumberError(null);
              }}
              placeholder="e.g. 9001015800087"
              autoComplete="off"
              aria-label="South African ID or passport number"
              aria-invalid={!!idNumberError}
              className="h-9 text-sm"
            />
            <Button size="sm" onClick={saveIdNumber} disabled={busy === "save" || idNumber === (v?.id_number ?? "")} className="h-9">
              {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
            </Button>
          </div>
          {idNumberError && <p className="mt-1 text-xs text-destructive" role="alert">{idNumberError}</p>}
          <p className="mt-1 text-[11px] text-muted-foreground">Format checks do not prove identity.</p>
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
        allowFileFallback={false}
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
        allowFileFallback={false}
      />
    </div>
  );
}

function StepRow({
  n, title, hint, done, rejected, verified, underReview, busy, icon, action, children,
}: {
  n: number;
  title: string;
  hint: string;
  done: boolean;
  rejected: boolean;
  verified: boolean;
  underReview: boolean;
  busy: boolean;
  icon: React.ReactNode;
  action: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-start gap-3">
        <span
          className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
            verified ? "bg-healthcare-green/15 text-healthcare-green" : "bg-primary/10 text-primary"
          }`}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : verified ? <CheckCircle2 className="h-4 w-4" /> : n}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <span className="text-muted-foreground">{icon}</span> {title}
            </p>
            {action}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>
          <p className={`mt-1 text-[11px] font-medium ${
            rejected ? "text-destructive" : verified ? "text-healthcare-green" : done ? "text-primary" : "text-muted-foreground"
          }`}>
            {rejected ? "Rejected" : verified ? "Verified" : underReview ? "Under review" : done ? "Submitted" : "Not started"}
          </p>
          {children}
        </div>
      </div>
    </div>
  );
}
