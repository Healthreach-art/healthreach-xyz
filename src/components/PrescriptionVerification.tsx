import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, FileCheck2, FileX2, Clock, AlertCircle, RefreshCw, Loader2, ZoomIn, ZoomOut, Flag, History, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export type PrescriptionStatus = "pending" | "approved" | "rejected" | "expired" | "reupload_requested";

export interface FraudSignal { label: string; detail: string; }

export interface PrescriptionUpload {
  id: string;
  patient_id: string;
  pharmacy_id: string;
  order_id: string | null;
  medication_id: string | null;
  file_path: string;
  mime_type: string;
  status: PrescriptionStatus;
  pharmacist_notes: string | null;
  expires_at: string | null;
  created_at: string;
  flagged?: boolean | null;
  repeats_total?: number | null;
  repeats_used?: number | null;
  fraud_score?: number | null;
  fraud_signals?: FraudSignal[] | null;
  dispense_token?: string | null;
  last_dispensed_at?: string | null;
}

interface AuditEntry { id: string; action: string; notes: string; created_at: string; actor_id: string; }

const STATUS_META: Record<PrescriptionStatus, { label: string; icon: any; cls: string }> = {
  pending: { label: "Pending review", icon: Clock, cls: "bg-accent text-accent-foreground" },
  approved: { label: "Approved", icon: FileCheck2, cls: "bg-healthcare-green/20 text-healthcare-green" },
  rejected: { label: "Rejected", icon: FileX2, cls: "bg-destructive/10 text-destructive" },
  expired: { label: "Expired", icon: AlertCircle, cls: "bg-muted text-muted-foreground" },
  reupload_requested: { label: "Re-upload requested", icon: RefreshCw, cls: "bg-healthcare-sky/20 text-healthcare-sky" },
};

export function PrescriptionStatusBadge({ status }: { status: PrescriptionStatus }) {
  const m = STATUS_META[status];
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${m.cls}`}>
      <Icon className="h-3 w-3" />
      {m.label}
    </span>
  );
}

interface UploadProps {
  /** Optional — when omitted the prescription is added to the patient's personal library
   *  and gets attached to a pharmacy automatically when used at checkout. */
  pharmacyId?: string | null;
  medicationId?: string | null;
  orderId?: string | null;
  /** Optional — when set, the upload is tagged to a specific family member's library. */
  familyMemberId?: string | null;
  onUploaded?: (row: PrescriptionUpload) => void;
}



/** Upload a prescription image/PDF into private bucket and create a verification row. */
export function PrescriptionUploader({ pharmacyId, medicationId, orderId, familyMemberId, onUploaded }: UploadProps) {
  const { user } = useAuth();
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ file: File; url: string; id: string }[]>([]);
  const [dragOver, setDragOver] = useState(false);

  function addFiles(files: FileList | File[]) {
    const next: { file: File; url: string; id: string }[] = [];
    for (const file of Array.from(files)) {
      const okType = ["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type);
      if (!okType) { toast.error(`${file.name}: use JPG, PNG, WEBP or PDF`); continue; }
      if (file.size > 8 * 1024 * 1024) { toast.error(`${file.name}: max 8 MB`); continue; }
      next.push({ file, url: URL.createObjectURL(file), id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });
    }
    if (next.length) setPending((p) => [...p, ...next]);
  }

  function removePending(id: string) {
    setPending((p) => {
      const target = p.find((x) => x.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return p.filter((x) => x.id !== id);
    });
  }

  async function uploadAll() {
    if (!user || pending.length === 0) { toast.error("Please add at least one file"); return; }
    setBusy(true);
    setProgress(5);
    let done = 0;
    let lastRow: PrescriptionUpload | null = null;
    try {
      for (const item of pending) {
        const file = item.file;
        const ext = file.name.split(".").pop() || "bin";
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("prescriptions")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        const { data, error } = await supabase
          .from("prescription_uploads")
          .insert({
            patient_id: user.id,
            pharmacy_id: pharmacyId ?? null,
            medication_id: medicationId ?? null,
            order_id: orderId ?? null,
            family_member_id: familyMemberId ?? null,
            file_path: path,
            mime_type: file.type,
            status: "pending",
          } as never)
          .select()
          .single();
        if (error) throw error;
        lastRow = data as PrescriptionUpload;
        if (lastRow) onUploaded?.(lastRow);
        done += 1;
        setProgress(Math.round((done / pending.length) * 100));
      }
      toast.success(
        pending.length > 1
          ? `${pending.length} prescriptions uploaded — AI is verifying them`
          : pharmacyId
            ? "Prescription uploaded — awaiting pharmacy review"
            : "Prescription saved to your library — AI is verifying it now"
      );
      pending.forEach((p) => URL.revokeObjectURL(p.url));
      setPending([]);
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(0), 800);
    }
  }

  return (
    <div className="space-y-3">
      <label
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragOver(false);
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center cursor-pointer transition-colors ${dragOver ? "border-primary bg-primary/10" : "border-border bg-muted/30 hover:bg-muted/50"}`}
      >
        <Upload className="h-6 w-6 text-primary" />
        <span className="text-sm font-medium">Drag &amp; drop, or click to upload</span>
        <span className="text-xs text-muted-foreground">Add one or many at once · JPG, PNG, or PDF (max 8 MB each)</span>
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.currentTarget.value = ""; }}
        />
      </label>

      {pending.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            {pending.length} file{pending.length === 1 ? "" : "s"} ready to upload
          </p>
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {pending.map((p) => {
              const isPdf = p.file.type === "application/pdf";
              return (
                <li key={p.id} className="relative rounded-md border border-border bg-muted/30 overflow-hidden group">
                  {isPdf ? (
                    <div className="h-24 flex items-center justify-center text-[11px] text-muted-foreground p-2 text-center">
                      📄 {p.file.name}
                    </div>
                  ) : (
                    <img src={p.url} alt="" className="h-24 w-full object-cover" />
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => removePending(p.id)}
                    className="absolute top-1 right-1 h-6 w-6 rounded-full bg-background/90 border border-border text-xs flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground"
                    aria-label="Remove"
                  >
                    ×
                  </button>
                  <p className="text-[10px] text-muted-foreground truncate px-1 pb-1">{(p.file.size / 1024).toFixed(0)} KB</p>
                </li>
              );
            })}
          </ul>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={uploadAll} disabled={busy}>
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</> : `Submit ${pending.length} prescription${pending.length === 1 ? "" : "s"}`}
            </Button>
            <label className="inline-flex items-center justify-center gap-1 rounded-md border border-input bg-background h-8 px-3 text-xs font-medium cursor-pointer hover:bg-accent">
              <Upload className="h-3.5 w-3.5" /> Add more
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden"
                disabled={busy}
                onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.currentTarget.value = ""; }}
              />
            </label>
          </div>
        </div>
      )}

      {progress > 0 && <Progress value={progress} />}
      <p className="text-[11px] text-muted-foreground text-center">
        ⏱ Estimated verification time: ~15 minutes during pharmacy hours
      </p>
    </div>
  );
}

/** Generate a short-lived signed URL for viewing a prescription file. */
export async function getPrescriptionFileUrl(filePath: string) {
  const { data, error } = await supabase.storage
    .from("prescriptions")
    .createSignedUrl(filePath, 60 * 5);
  if (error) throw error;
  return data.signedUrl;
}

interface ReviewProps {
  row: PrescriptionUpload;
  onChanged?: () => void;
}

export function PharmacyReviewActions({ row, onChanged }: ReviewProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState(row.pharmacist_notes ?? "");
  const [url, setUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [showAudit, setShowAudit] = useState(false);
  const { user } = useAuth();

  async function logAction(action: string, extra?: string) {
    if (!user) return;
    await supabase.from("prescription_audit_log").insert({
      prescription_upload_id: row.id,
      actor_id: user.id,
      action,
      notes: extra ?? notes ?? "",
    });
  }

  async function loadAudit() {
    const { data } = await supabase
      .from("prescription_audit_log")
      .select("*")
      .eq("prescription_upload_id", row.id)
      .order("created_at", { ascending: false });
    setAudit((data ?? []) as AuditEntry[]);
  }

  useEffect(() => {
    let mounted = true;
    getPrescriptionFileUrl(row.file_path).then((u) => {
      if (mounted) { setUrl(u); logAction("viewed", "opened secure preview"); }
    }).catch(() => {});
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.file_path]);

  const [repeats, setRepeats] = useState<number>(row.repeats_total ?? 5);

  async function setStatus(status: PrescriptionStatus) {
    setBusy(status);
    const patch: any = { status, pharmacist_notes: notes, reviewed_by: user?.id ?? null };
    if (status === "approved") patch.repeats_total = Math.max(1, Math.min(12, repeats || 5));
    const { error } = await supabase.from("prescription_uploads").update(patch).eq("id", row.id);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    await logAction(status, notes);
    toast.success(`Marked as ${status.replace("_", " ")}`);
    onChanged?.();
  }

  async function toggleFlag() {
    setBusy("flag");
    const next = !row.flagged;
    const { error } = await supabase.from("prescription_uploads").update({ flagged: next }).eq("id", row.id);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    await logAction(next ? "flagged" : "unflagged", notes);
    toast.success(next ? "Flagged as suspicious" : "Flag removed");
    onChanged?.();
  }

  const isPdf = row.mime_type === "application/pdf";
  return (
    <div className="space-y-3">
      {row.flagged && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <Flag className="h-3 w-3" /> This prescription is flagged as suspicious.
        </div>
      )}
      <div className="rounded-lg overflow-hidden border border-border bg-muted/30 relative">
        {url ? (
          isPdf ? (
            <iframe src={url} className="w-full h-72" title="Prescription PDF" />
          ) : (
            <div className="overflow-auto max-h-96 bg-background">
              <img
                src={url}
                alt="Prescription"
                className="block mx-auto transition-transform origin-top"
                style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
              />
            </div>
          )
        ) : (
          <div className="h-32 flex items-center justify-center text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading secure preview…
          </div>
        )}
        {!isPdf && url && (
          <div className="absolute bottom-2 right-2 flex gap-1 bg-background/90 backdrop-blur rounded-md border border-border p-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}><ZoomOut className="h-3 w-3" /></Button>
            <span className="text-[10px] self-center px-1 tabular-nums">{Math.round(zoom * 100)}%</span>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom(z => Math.min(3, z + 0.25))}><ZoomIn className="h-3 w-3" /></Button>
          </div>
        )}
      </div>
      <FraudPanel row={row} />
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
        <span className="text-xs text-muted-foreground">Repeats granted on approval</span>
        <div className="flex items-center gap-2">
          <input
            type="number" min={1} max={12}
            value={repeats}
            onChange={(e) => setRepeats(Number(e.target.value))}
            className="h-7 w-16 rounded border border-input bg-background px-2 text-xs"
          />
          <span className="text-[11px] text-muted-foreground">
            {(row.repeats_used ?? 0)} used · {(row.repeats_total ?? 0)} total
          </span>
        </div>
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Pharmacist notes (visible to patient on rejection / re-upload)…"
        rows={2}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setStatus("approved")} disabled={!!busy}>
          <FileCheck2 className="h-4 w-4" /> Approve
        </Button>
        <Button size="sm" variant="destructive" onClick={() => setStatus("rejected")} disabled={!!busy}>
          <FileX2 className="h-4 w-4" /> Reject
        </Button>
        <Button size="sm" variant="outline" onClick={() => setStatus("reupload_requested")} disabled={!!busy}>
          <RefreshCw className="h-4 w-4" /> Request re-upload
        </Button>
        <Button size="sm" variant={row.flagged ? "secondary" : "outline"} onClick={toggleFlag} disabled={!!busy}>
          <Flag className="h-4 w-4" /> {row.flagged ? "Unflag" : "Flag suspicious"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setShowAudit(s => !s); if (!showAudit) loadAudit(); }}>
          <History className="h-4 w-4" /> Audit log
        </Button>
      </div>
      {showAudit && (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-xs space-y-1 max-h-40 overflow-y-auto">
          {audit.length === 0 ? <p className="text-muted-foreground">No actions recorded yet.</p> :
            audit.map(a => (
              <div key={a.id} className="flex items-start justify-between gap-2 border-b border-border last:border-0 pb-1">
                <span><span className="font-medium capitalize">{a.action.replace(/_/g, " ")}</span>{a.notes ? ` — ${a.notes}` : ""}</span>
                <span className="text-muted-foreground whitespace-nowrap">{new Date(a.created_at).toLocaleString()}</span>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}

export function FraudPanel({ row }: { row: PrescriptionUpload }) {
  const score = row.fraud_score ?? 0;
  const signals = (row.fraud_signals ?? []) as FraudSignal[];
  const level = score >= 75 ? "high" : score >= 40 ? "medium" : "low";
  const meta = {
    low: { cls: "border-healthcare-green/30 bg-healthcare-green/10 text-healthcare-green", label: "Low risk", Icon: ShieldCheck },
    medium: { cls: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400", label: "Medium risk — review", Icon: ShieldAlert },
    high: { cls: "border-destructive/40 bg-destructive/10 text-destructive", label: "High risk — block dispense", Icon: ShieldAlert },
  }[level];
  const Icon = meta.Icon;
  return (
    <div className={`rounded-md border px-3 py-2 ${meta.cls}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Icon className="h-3.5 w-3.5" /> Fraud score {score}/100 · {meta.label}
        </div>
      </div>
      {signals.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-[11px] opacity-90">
          {signals.map((s, i) => (
            <li key={i}>• <span className="font-medium capitalize">{s.label.replace(/_/g, " ")}</span> — {s.detail}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
