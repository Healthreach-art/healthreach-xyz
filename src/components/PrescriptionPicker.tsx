import { useEffect, useState } from "react";
import { firestoreClient } from "@/lib/firestore-client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { PrescriptionUploader, PrescriptionStatusBadge, type PrescriptionUpload } from "@/components/PrescriptionVerification";
import { PatientVerificationCard, fetchVerification, isVerificationComplete, type PatientVerification } from "@/components/PatientVerificationCard";
import { FileCheck2, Plus, Loader2, AlertCircle, ChevronLeft, ShieldCheck, ShieldAlert } from "lucide-react";


interface Props {
  /** Optional — pharmacy currently being ordered from. Used only to filter out
   *  prescriptions already claimed by a *different* pharmacy. */
  pharmacyId?: string | null;
  pharmacyName?: string;
  medicationId?: string | null;
  medicationName?: string | null;
  /** Optional — when set, scope library + new uploads to a specific family member. */
  familyMemberId?: string | null;
  onPicked: (uploadId: string) => void;
  onUploadedPending?: (upload: PrescriptionUpload) => void;
}

/**
 * Personal-library prescription picker. Shows ALL of the patient's approved
 * prescriptions (regardless of pharmacy). The selected prescription is later
 * claimed to the current pharmacy at checkout.
 */
export function PrescriptionPicker({
  pharmacyId,
  pharmacyName,
  medicationId,
  medicationName,
  familyMemberId,
  onPicked,
  onUploadedPending,
}: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [uploads, setUploads] = useState<PrescriptionUpload[]>([]);
  const [verification, setVerification] = useState<PatientVerification | null>(null);
  const [mode, setMode] = useState<"list" | "upload" | "verify">("list");


  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      let q = firestoreClient.from("prescription_uploads").select("*").eq("patient_id", user.id);
      // Scope library by recipient: when ordering for a family member, only show their
      // prescriptions; when ordering for self, exclude family-member-tagged ones.
      if (familyMemberId) q = q.eq("family_member_id" as never, familyMemberId);
      else q = q.is("family_member_id" as never, null);
      const [{ data }, v] = await Promise.all([
        q.order("created_at", { ascending: false }).limit(30),
        fetchVerification(user.id),
      ]);
      if (cancelled) return;
      setUploads((data ?? []) as PrescriptionUpload[]);
      setVerification(v);
      setLoading(false);
      if (!isVerificationComplete(v)) setMode("verify");
      else if (!data || data.length === 0) setMode("upload");
    })();
    return () => { cancelled = true; };
  }, [user, familyMemberId]);


  const now = Date.now();
  // Reusable = approved, not expired, repeats remaining, and not locked to another pharmacy.
  const approved = uploads.filter((u) => {
    if (u.status !== "approved") return false;
    if (u.expires_at && new Date(u.expires_at).getTime() <= now) return false;
    if (pharmacyId && u.pharmacy_id && u.pharmacy_id !== pharmacyId) return false;
    return true;
  });
  const others = uploads.filter((u) => !approved.includes(u));

  if (mode === "verify" || !isVerificationComplete(verification)) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
          <ShieldAlert className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <p>To order prescription medication you must first upload a clear photo of your <strong>ID</strong> and a <strong>selfie</strong>. Over-the-counter medication can still be ordered without this.</p>
        </div>
        <PatientVerificationCard
          onChanged={(v) => {
            setVerification(v);
            if (isVerificationComplete(v)) setMode(uploads.length === 0 ? "upload" : "list");
          }}
        />
      </div>
    );
  }

  if (mode === "upload") {

    return (
      <div className="space-y-3">
        {uploads.length > 0 && (
          <button
            type="button"
            onClick={() => setMode("list")}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ChevronLeft className="h-3 w-3" /> Back to my prescriptions
          </button>
        )}
        <p className="text-xs text-muted-foreground">
          {medicationName ? `${medicationName} — ` : ""}Add a prescription to your personal library. Our AI verifies it
          automatically and you can re-use it at any pharmacy{pharmacyName ? ` (including ${pharmacyName})` : ""}.
        </p>
        <PrescriptionUploader
          medicationId={medicationId ?? null}
          familyMemberId={familyMemberId ?? null}
          onUploaded={(row) => onUploadedPending?.(row)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {approved.length > 0 ? (
            <>
              <p className="text-xs font-medium text-muted-foreground">
                Pick from your prescription library
              </p>
              <ul className="space-y-2">
                {approved.map((u) => {
                  const remaining = (u.repeats_total ?? 0) - (u.repeats_used ?? 0);
                  const noRepeats = (u.repeats_total ?? 0) > 0 && remaining <= 0;
                  return (
                    <li key={u.id}>
                      <button
                        type="button"
                        disabled={noRepeats}
                        onClick={() => onPicked(u.id)}
                        className="w-full text-left rounded-lg border border-border bg-card hover:bg-accent/40 disabled:opacity-50 disabled:cursor-not-allowed p-3 flex items-start gap-3 transition-colors"
                      >
                        <div className="h-8 w-8 rounded-md bg-healthcare-green/15 text-healthcare-green flex items-center justify-center shrink-0">
                          <FileCheck2 className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <PrescriptionStatusBadge status={u.status} />
                            {(u.fraud_score ?? 0) < 40 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-healthcare-green/15 text-healthcare-green inline-flex items-center gap-1">
                                <ShieldCheck className="h-2.5 w-2.5" /> AI verified
                              </span>
                            )}
                            {(u.repeats_total ?? 0) > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                {remaining}/{u.repeats_total} repeats left
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Uploaded {new Date(u.created_at).toLocaleDateString()}
                            {u.expires_at && ` · expires ${new Date(u.expires_at).toLocaleDateString()}`}
                          </p>
                          {noRepeats && (
                            <p className="text-[11px] text-destructive mt-1 inline-flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" /> No repeats remaining — doctor renewal required
                            </p>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center">
              <p className="text-sm font-medium">Your prescription library is empty</p>
              <p className="text-xs text-muted-foreground mt-1">
                Upload one — our AI will verify it and keep it ready for every pharmacy visit.
              </p>
            </div>
          )}

          {others.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                Show {others.length} pending / past prescriptions
              </summary>
              <ul className="mt-2 space-y-1.5">
                {others.map((u) => (
                  <li key={u.id} className="flex items-center justify-between rounded border border-border bg-muted/20 px-2 py-1.5">
                    <PrescriptionStatusBadge status={u.status} />
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setMode("upload")}
          >
            <Plus className="h-4 w-4" /> Upload a new prescription
          </Button>
        </>
      )}
    </div>
  );
}
