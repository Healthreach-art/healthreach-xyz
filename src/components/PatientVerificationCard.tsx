import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { BadgeCheck, IdCard, Camera, Loader2, ShieldAlert, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { CameraCapture } from "@/components/CameraCapture";

export interface PatientVerification {
  user_id: string;
  id_document_path: string | null;
  selfie_path: string | null;
  status: "pending" | "approved" | "rejected";
  notes: string | null;
}

export async function fetchVerification(userId: string): Promise<PatientVerification | null> {
  const { data } = await supabase.from("patient_verifications").select("*").eq("user_id", userId).maybeSingle();
  return (data as PatientVerification | null) ?? null;
}

/** True when the patient has uploaded BOTH an ID document and a selfie. */
export function isVerificationComplete(v: PatientVerification | null) {
  return !!(v && v.id_document_path && v.selfie_path);
}

interface Props {
  compact?: boolean;
  onChanged?: (v: PatientVerification | null) => void;
}

export function PatientVerificationCard({ compact, onChanged }: Props) {
  const { user } = useAuth();
  const [v, setV] = useState<PatientVerification | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"id" | "selfie" | null>(null);
  const [liveSelfieOpen, setLiveSelfieOpen] = useState(false);

  async function reload() {
    if (!user) return;
    const row = await fetchVerification(user.id);
    setV(row);
    onChanged?.(row);
  }

  useEffect(() => {
    if (!user) return;
    (async () => { await reload(); setLoading(false); })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function uploadDoc(kind: "id" | "selfie", file: File) {
    if (!user) return;
    if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) {
      toast.error("Use JPG, PNG, WEBP or PDF"); return;
    }
    if (file.size > 8 * 1024 * 1024) { toast.error("Max file size 8 MB"); return; }
    setBusy(kind);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${user.id}/verify-${kind}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("prescriptions").upload(path, file, { contentType: file.type, upsert: true });
      if (upErr) throw upErr;
      const patch: any = { user_id: user.id };
      if (kind === "id") patch.id_document_path = path;
      else patch.selfie_path = path;
      const { error } = await supabase.from("patient_verifications").upsert(patch, { onConflict: "user_id" });
      if (error) throw error;
      toast.success(kind === "id" ? "ID document uploaded" : "Selfie uploaded");
      await reload();
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading verification…</div>;
  }

  const complete = isVerificationComplete(v);
  const hasId = !!v?.id_document_path;
  const hasSelfie = !!v?.selfie_path;

  return (
    <div className={`rounded-2xl border ${complete ? "border-healthcare-green/40 bg-healthcare-green/5" : "border-amber-500/40 bg-amber-500/5"} p-4 ${compact ? "" : "sm:p-5"}`}>
      <div className="flex items-start gap-3">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${complete ? "bg-healthcare-green/15 text-healthcare-green" : "bg-amber-500/20 text-amber-700 dark:text-amber-400"}`}>
          {complete ? <ShieldCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-foreground">Identity verification</h3>
            {complete ? (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-healthcare-green/15 text-healthcare-green inline-flex items-center gap-1">
                <BadgeCheck className="h-3 w-3" /> Ready for Rx orders
              </span>
            ) : (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400">Required to order prescription medication</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Upload a clear photo of your ID and a selfie. Without these, you can only order over-the-counter medication.
          </p>

          <div className="grid sm:grid-cols-2 gap-2 mt-3">
            <DocSlot
              label="ID Document"
              icon={<IdCard className="h-4 w-4" />}
              done={hasId}
              busy={busy === "id"}
              accept="image/*,application/pdf"
              onFile={(f) => uploadDoc("id", f)}
            />
            <DocSlot
              label="Selfie"
              icon={<Camera className="h-4 w-4" />}
              done={hasSelfie}
              busy={busy === "selfie"}
              accept="image/*"
              capture="user"
              onFile={(f) => uploadDoc("selfie", f)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function DocSlot({
  label, icon, done, busy, accept, capture, onFile,
}: {
  label: string; icon: React.ReactNode; done: boolean; busy: boolean;
  accept: string; capture?: "user" | "environment"; onFile: (file: File) => void;
}) {
  return (
    <label className={`group rounded-xl border ${done ? "border-healthcare-green/40 bg-healthcare-green/10" : "border-dashed border-border bg-card"} px-3 py-2.5 cursor-pointer flex items-center gap-2 hover:border-primary transition-colors`}>
      <span className={`h-7 w-7 rounded-md flex items-center justify-center ${done ? "bg-healthcare-green/20 text-healthcare-green" : "bg-muted text-muted-foreground"}`}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : done ? <BadgeCheck className="h-4 w-4" /> : icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground">{label}</p>
        <p className="text-[11px] text-muted-foreground truncate">{done ? "Uploaded — replace" : "Tap to upload"}</p>
      </div>
      <Upload className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
      <input
        type="file"
        accept={accept}
        capture={capture as any}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.currentTarget.value = ""; }}
      />
    </label>
  );
}
