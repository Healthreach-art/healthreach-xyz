import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { PrescriptionUploader, PrescriptionStatusBadge, type PrescriptionUpload } from "@/components/PrescriptionVerification";
import { FileCheck2, Plus, Loader2, AlertCircle, ChevronLeft } from "lucide-react";

interface Props {
  pharmacyId: string;
  pharmacyName?: string;
  medicationId?: string | null;
  medicationName?: string | null;
  /** Called when user selects an existing approved prescription. */
  onPicked: (uploadId: string) => void;
  /** Called when a brand-new upload is submitted (still pending review). */
  onUploadedPending?: (upload: PrescriptionUpload) => void;
}

/**
 * Shows the patient's existing prescriptions for this pharmacy so they can re-use
 * an approved one instead of re-uploading. Falls back to a fresh upload flow.
 */
export function PrescriptionPicker({
  pharmacyId,
  pharmacyName,
  medicationId,
  medicationName,
  onPicked,
  onUploadedPending,
}: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [uploads, setUploads] = useState<PrescriptionUpload[]>([]);
  const [mode, setMode] = useState<"list" | "upload">("list");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("prescription_uploads")
        .select("*")
        .eq("patient_id", user.id)
        .eq("pharmacy_id", pharmacyId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (cancelled) return;
      setUploads((data ?? []) as PrescriptionUpload[]);
      setLoading(false);
      // Auto-jump to upload if there are none at all.
      if (!data || data.length === 0) setMode("upload");
    })();
    return () => { cancelled = true; };
  }, [user, pharmacyId]);

  const now = Date.now();
  const approved = uploads.filter(
    (u) => u.status === "approved" && (!u.expires_at || new Date(u.expires_at).getTime() > now)
  );
  const others = uploads.filter((u) => !approved.includes(u));

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
          {medicationName ? `${medicationName} — upload a new prescription` : "Upload a new prescription"} for{" "}
          <span className="font-medium text-foreground">{pharmacyName ?? "this pharmacy"}</span>.
        </p>
        <PrescriptionUploader
          pharmacyId={pharmacyId}
          medicationId={medicationId ?? null}
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
                Use an existing approved prescription
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
              <p className="text-sm font-medium">No approved prescription yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Upload one — your pharmacist will review it within minutes.
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
