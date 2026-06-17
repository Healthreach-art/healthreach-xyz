import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { RoleGuard } from "@/components/RoleGuard";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Upload, ShieldCheck, FileText, Building2, Receipt, MapPin, Landmark,
  CheckCircle2, AlertCircle, Clock, UserCheck, RefreshCcw,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/pharmacy/documents")({
  head: () => ({ meta: [{ title: "My Documents — HEALTHREACH Pharmacy" }] }),
  component: () => <RoleGuard allow="pharmacy"><DocumentsProfile /></RoleGuard>,
});

type DocKey =
  | "license_path"
  | "pharmacist_cert_path"
  | "business_reg_path"
  | "tax_cert_path"
  | "proof_of_address_path"
  | "bank_confirmation_path";

interface DocSpec {
  key: DocKey;
  label: string;
  icon: typeof FileText;
  hint: string;
  optional?: boolean;
}

const DOCS: DocSpec[] = [
  { key: "license_path", label: "Pharmacy operating license", icon: ShieldCheck, hint: "Current SAPC pharmacy licence." },
  { key: "pharmacist_cert_path", label: "Pharmacist registration certificate", icon: UserCheck, hint: "Responsible pharmacist's SAPC certificate." },
  { key: "business_reg_path", label: "Business registration", icon: Building2, hint: "CIPC / company registration document." },
  { key: "tax_cert_path", label: "Tax registration", icon: Receipt, hint: "SARS tax clearance or VAT registration.", optional: true },
  { key: "proof_of_address_path", label: "Proof of physical address", icon: MapPin, hint: "Utility bill or lease less than 3 months old." },
  { key: "bank_confirmation_path", label: "Bank account confirmation", icon: Landmark, hint: "Bank letter showing account name & number." },
];

type DocStatus = "missing" | "pending" | "under_review" | "approved" | "rejected";

interface DocReview {
  status?: "approved" | "rejected" | "under_review";
  notes?: string;
  reviewed_at?: string;
  reviewed_by?: string;
}

interface DocsRow {
  license_path?: string | null;
  pharmacist_cert_path?: string | null;
  business_reg_path?: string | null;
  tax_cert_path?: string | null;
  proof_of_address_path?: string | null;
  bank_confirmation_path?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
  rejection_reason?: string | null;
  document_reviews?: Record<string, DocReview> | null;
}

function statusFor(spec: DocSpec, row: DocsRow): DocStatus {
  const path = (row as Record<string, string | null | undefined>)[spec.key];
  const rev = row.document_reviews?.[spec.key];
  if (rev?.status === "approved") return "approved";
  if (rev?.status === "rejected") return "rejected";
  if (rev?.status === "under_review") return "under_review";
  if (!path) return "missing";
  if (row.submitted_at) return "pending";
  return "pending";
}

function StatusBadge({ status }: { status: DocStatus }) {
  const map: Record<DocStatus, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
    missing: { label: "Missing", className: "bg-muted text-muted-foreground", Icon: AlertCircle },
    pending: { label: "Awaiting review", className: "bg-primary/10 text-primary", Icon: Clock },
    under_review: { label: "Under review", className: "bg-primary/15 text-primary", Icon: Clock },
    approved: { label: "Approved", className: "bg-healthcare-green/15 text-healthcare-green", Icon: CheckCircle2 },
    rejected: { label: "Rejected", className: "bg-destructive/15 text-destructive", Icon: AlertCircle },
  };
  const { label, className, Icon } = map[status];
  return (
    <Badge variant="outline" className={`gap-1 ${className} border-transparent`}>
      <Icon className="h-3 w-3" /> {label}
    </Badge>
  );
}

function DocumentsProfile() {
  const { user } = useAuth();
  const [row, setRow] = useState<DocsRow>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<DocKey | null>(null);

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("pharmacy_documents" as never)
      .select("*")
      .eq("pharmacy_id", user.id)
      .maybeSingle();
    const r = (data as unknown as DocsRow | null) ?? {};
    setRow(r);
    const urls: Record<string, string> = {};
    await Promise.all(DOCS.map(async (s) => {
      const path = (r as Record<string, string | null | undefined>)[s.key];
      if (path) {
        const { data: signed } = await supabase.storage.from("pharmacy-docs").createSignedUrl(path, 3600);
        if (signed?.signedUrl) urls[s.key] = signed.signedUrl;
      }
    }));
    setPreviews(urls);
    setLoading(false);
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user]);

  async function handleReupload(key: DocKey, file: File) {
    if (!user) return;
    setBusyKey(key);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/${key}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("pharmacy-docs").upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw new Error(error.message);

      const { error: dbError } = await supabase
        .from("pharmacy_documents" as never)
        .upsert({ pharmacy_id: user.id, [key]: path } as never, { onConflict: "pharmacy_id" });
      if (dbError) throw new Error(dbError.message);

      // Clear this document's prior review and bump submitted_at via RPC
      const { error: rpcErr } = await supabase.rpc("pharmacy_resubmit_document" as never, { _doc_key: key } as never);
      if (rpcErr) throw new Error(rpcErr.message);

      toast.success("Re-uploaded — sent for review");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const rejectedCount = DOCS.filter((s) => statusFor(s, row) === "rejected").length;

  return (
    <div className="container-narrow px-4 sm:px-6 py-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link to="/dashboard/pharmacy" className="text-xs text-muted-foreground hover:underline">← Back to dashboard</Link>
        <h1 className="text-2xl font-bold mt-2 flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" /> My Documents
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track the status of every verification document. Re-upload only the files admins asked you to fix.
        </p>
      </div>

      {rejectedCount > 0 && (
        <div className="healthcare-card p-4 mb-6 ring-1 ring-destructive/30 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-destructive">{rejectedCount} document{rejectedCount > 1 ? "s" : ""} need re-upload</p>
            <p className="text-muted-foreground mt-0.5">Replace just the rejected files below. Each re-upload sends that document back for review automatically.</p>
          </div>
        </div>
      )}

      {row.review_notes && (
        <div className="healthcare-card p-4 mb-6">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Admin overall notes</p>
          <p className="text-sm mt-1 whitespace-pre-wrap">{row.review_notes}</p>
        </div>
      )}

      <div className="space-y-4">
        {DOCS.map((spec) => {
          const status = statusFor(spec, row);
          const preview = previews[spec.key];
          const rev = row.document_reviews?.[spec.key];
          const isRejected = status === "rejected";
          return (
            <div key={spec.key} className={`healthcare-card p-5 ${isRejected ? "ring-1 ring-destructive/30" : ""}`}>
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0 bg-muted text-muted-foreground">
                  <spec.icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="font-semibold text-foreground">
                      {spec.label}
                      {spec.optional && <span className="text-[10px] uppercase text-muted-foreground ml-2">optional</span>}
                    </p>
                    <StatusBadge status={status} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{spec.hint}</p>

                  {rev?.notes && (
                    <div className={`mt-2 rounded-md border p-2 text-xs ${isRejected ? "border-destructive/30 bg-destructive/5" : "border-border bg-muted/40"}`}>
                      <p className="font-medium mb-0.5">Admin note</p>
                      <p className="whitespace-pre-wrap text-muted-foreground">{rev.notes}</p>
                    </div>
                  )}

                  {preview && (
                    preview.match(/\.pdf(\?|$)/i)
                      ? <a href={preview} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline mt-2 inline-block">View current file</a>
                      : <a href={preview} target="_blank" rel="noreferrer"><img src={preview} alt={spec.label} className="mt-3 h-24 w-24 object-cover rounded-md border border-border" /></a>
                  )}

                  <div className="mt-3">
                    <ReuploadButton
                      uploading={busyKey === spec.key}
                      onFile={(f) => handleReupload(spec.key, f)}
                      label={
                        status === "missing" ? "Upload file" :
                        status === "rejected" ? "Re-upload & resubmit" :
                        "Replace file"
                      }
                      variant={isRejected ? "destructive" : "outline"}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReuploadButton({
  uploading, onFile, label, variant,
}: {
  uploading: boolean;
  onFile: (f: File) => void;
  label: string;
  variant: "outline" | "destructive";
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref} type="file" accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}
      />
      <Button
        size="sm"
        variant={variant === "destructive" ? "default" : "outline"}
        onClick={() => ref.current?.click()}
        disabled={uploading}
        className={`gap-2 ${variant === "destructive" ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground" : ""}`}
      >
        {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : (variant === "destructive" ? <RefreshCcw className="h-3 w-3" /> : <Upload className="h-3 w-3" />)}
        {label}
      </Button>
    </>
  );
}
