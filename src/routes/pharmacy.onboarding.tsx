import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { RoleGuard } from "@/components/RoleGuard";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, Upload, ShieldCheck, FileText, Building2, Receipt, MapPin,
  Landmark, CheckCircle2, Clock, UserCheck,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/pharmacy/onboarding")({
  head: () => ({ meta: [{ title: "Pharmacy Verification — HealthReachCare" }] }),
  component: () => <RoleGuard allow="pharmacy"><Onboarding /></RoleGuard>,
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
  { key: "license_path", label: "Pharmacy operating license", icon: ShieldCheck, hint: "Current SAPC pharmacy licence (PDF or photo)." },
  { key: "pharmacist_cert_path", label: "Pharmacist registration certificate", icon: UserCheck, hint: "Responsible pharmacist's SAPC certificate." },
  { key: "business_reg_path", label: "Business registration", icon: Building2, hint: "CIPC / company registration document." },
  { key: "tax_cert_path", label: "Tax registration", icon: Receipt, hint: "SARS tax clearance or VAT registration.", optional: true },
  { key: "proof_of_address_path", label: "Proof of physical address", icon: MapPin, hint: "Utility bill or lease less than 3 months old." },
  { key: "bank_confirmation_path", label: "Bank account confirmation", icon: Landmark, hint: "Bank letter showing account name & number." },
];

interface PharmacyDocs {
  id?: string;
  license_path?: string | null;
  pharmacist_cert_path?: string | null;
  business_reg_path?: string | null;
  tax_cert_path?: string | null;
  proof_of_address_path?: string | null;
  bank_confirmation_path?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
}

interface PharmacyProfileFields {
  organization_name?: string | null;
  address?: string | null;
  phone?: string | null;
  license_number?: string | null;
  pharmacist_name?: string | null;
  pharmacist_council_number?: string | null;
  business_reg_number?: string | null;
  tax_number?: string | null;
  responsible_pharmacist_phone?: string | null;
  license_expires_at?: string | null;
}

function Onboarding() {
  const { user, approvalStatus } = useAuth();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<PharmacyDocs>({});
  const [fields, setFields] = useState<PharmacyProfileFields>({});
  const [loading, setLoading] = useState(true);
  const [uploadingKey, setUploadingKey] = useState<DocKey | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: d }, { data: prof }] = await Promise.all([
        supabase.from("pharmacy_documents" as never).select("*").eq("pharmacy_id", user.id).maybeSingle(),
        supabase.from("profiles").select("organization_name,address,phone,license_number,pharmacist_name,pharmacist_council_number,business_reg_number,tax_number,responsible_pharmacist_phone,license_expires_at").eq("user_id", user.id).maybeSingle(),
      ]);
      if (prof) setFields(prof as PharmacyProfileFields);
      if (d) {
        const data = d as unknown as PharmacyDocs;
        setDocs(data);
        const keys = DOCS.map((s) => s.key);
        const urls: Record<string, string> = {};
        await Promise.all(keys.map(async (k) => {
          const path = (data as Record<string, string | null | undefined>)[k];
          if (path) {
            const { data: signed } = await supabase.storage.from("pharmacy-docs").createSignedUrl(path, 3600);
            if (signed?.signedUrl) urls[k] = signed.signedUrl;
          }
        }));
        setPreviews(urls);
      }
      setLoading(false);
    })();
  }, [user]);

  async function handleUpload(key: DocKey, file: File) {
    if (!user) return;
    setUploadingKey(key);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/${key}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("pharmacy-docs").upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw new Error(error.message);

      const { error: dbError } = await supabase
        .from("pharmacy_documents" as never)
        .upsert({ pharmacy_id: user.id, [key]: path } as never, { onConflict: "pharmacy_id" });
      if (dbError) throw new Error(dbError.message);

      const { data: signed } = await supabase.storage.from("pharmacy-docs").createSignedUrl(path, 3600);
      setDocs((p) => ({ ...p, [key]: path }));
      if (signed?.signedUrl) setPreviews((p) => ({ ...p, [key]: signed.signedUrl }));
      toast.success("Uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingKey(null);
    }
  }

  function setField<K extends keyof PharmacyProfileFields>(k: K, v: PharmacyProfileFields[K]) {
    setFields((p) => ({ ...p, [k]: v }));
  }

  async function submitForReview() {
    if (!user) return;
    const missingDoc = DOCS.find((d) => !d.optional && !(docs as Record<string, string | null | undefined>)[d.key]);
    if (missingDoc) { toast.error(`Upload "${missingDoc.label}" first.`); return; }
    const required: Array<[keyof PharmacyProfileFields, string]> = [
      ["organization_name", "Pharmacy name"],
      ["address", "Physical address"],
      ["phone", "Contact number"],
      ["license_number", "Licence number"],
      ["license_expires_at", "Licence expiry"],
      ["pharmacist_name", "Responsible pharmacist name"],
      ["pharmacist_council_number", "SAPC pharmacist council number"],
      ["business_reg_number", "Business registration number"],
    ];
    for (const [k, label] of required) {
      const v = fields[k];
      if (!v || String(v).trim() === "") { toast.error(`${label} is required.`); return; }
    }

    setSubmitting(true);
    const { error: profErr } = await supabase.from("profiles").update({
      organization_name: fields.organization_name,
      address: fields.address,
      phone: fields.phone,
      license_number: fields.license_number,
      license_expires_at: fields.license_expires_at,
      pharmacist_name: fields.pharmacist_name,
      pharmacist_council_number: fields.pharmacist_council_number,
      business_reg_number: fields.business_reg_number,
      tax_number: fields.tax_number || null,
      responsible_pharmacist_phone: fields.responsible_pharmacist_phone || null,
      approval_status: "under_review",
    } as never).eq("user_id", user.id);
    if (profErr) { setSubmitting(false); toast.error(profErr.message); return; }

    const { error: docErr } = await supabase.from("pharmacy_documents" as never).upsert({
      pharmacy_id: user.id,
      submitted_at: new Date().toISOString(),
    } as never, { onConflict: "pharmacy_id" });
    setSubmitting(false);
    if (docErr) { toast.error(docErr.message); return; }
    toast.success("Submitted for verification");
    navigate({ to: "/dashboard/pharmacy" });
  }

  const completed = DOCS.filter((d) => (docs as Record<string, string | null | undefined>)[d.key]).length;
  const submitted = !!docs.submitted_at;
  const reviewed = !!docs.reviewed_at;

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="container-narrow px-4 sm:px-6 py-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link to="/dashboard/pharmacy" className="text-xs text-muted-foreground hover:underline">← Back to dashboard</Link>
        <h1 className="text-2xl font-bold mt-2 flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-primary" /> Pharmacy Verification</h1>
        <p className="text-sm text-muted-foreground mt-1">Submit your licence, pharmacist credentials and supporting documents so admins can approve your pharmacy.</p>
      </div>

      {(submitted || approvalStatus === "approved" || approvalStatus === "under_review") && (
        <div className={`healthcare-card p-4 mb-6 flex items-start gap-3 ${approvalStatus === "approved" ? "ring-1 ring-healthcare-green/40" : "ring-1 ring-primary/30"}`}>
          {approvalStatus === "approved" ? <CheckCircle2 className="h-5 w-5 text-healthcare-green shrink-0 mt-0.5" /> : <Clock className="h-5 w-5 text-primary shrink-0 mt-0.5" />}
          <div className="text-sm">
            <p className="font-semibold">
              {approvalStatus === "approved" ? "Verified pharmacy" : reviewed ? "Reviewed" : "Submitted — awaiting admin review"}
            </p>
            {docs.review_notes && <p className="text-muted-foreground mt-1">Reviewer notes: {docs.review_notes}</p>}
          </div>
        </div>
      )}

      {/* Business details */}
      <div className="healthcare-card p-5 mb-6">
        <h2 className="font-semibold mb-3 flex items-center gap-2"><Building2 className="h-4 w-4" /> Pharmacy details</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Pharmacy / trading name" value={fields.organization_name ?? ""} onChange={(v) => setField("organization_name", v)} onBlur={() => user && void supabase.from("profiles").update({ organization_name: fields.organization_name }).eq("user_id", user.id)} />
          <Field label="Contact phone" value={fields.phone ?? ""} onChange={(v) => setField("phone", v)} onBlur={() => user && void supabase.from("profiles").update({ phone: fields.phone }).eq("user_id", user.id)} />
          <div className="sm:col-span-2">
            <Field label="Physical address" value={fields.address ?? ""} onChange={(v) => setField("address", v)} onBlur={() => user && void supabase.from("profiles").update({ address: fields.address }).eq("user_id", user.id)} />
          </div>
          <Field label="Business registration number (CIPC)" value={fields.business_reg_number ?? ""} onChange={(v) => setField("business_reg_number", v)} onBlur={() => user && void supabase.from("profiles").update({ business_reg_number: fields.business_reg_number }).eq("user_id", user.id)} />
          <Field label="Tax / VAT number (optional)" value={fields.tax_number ?? ""} onChange={(v) => setField("tax_number", v)} />
        </div>
      </div>

      {/* Licence */}
      <div className="healthcare-card p-5 mb-6">
        <h2 className="font-semibold mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Licence</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Pharmacy licence number (SAPC)" value={fields.license_number ?? ""} onChange={(v) => setField("license_number", v)} onBlur={() => user && void supabase.from("profiles").update({ license_number: fields.license_number }).eq("user_id", user.id)} />
          <div>
            <Label className="text-xs">Licence expires</Label>
            <Input type="date" value={fields.license_expires_at ?? ""} onChange={(e) => setField("license_expires_at", e.target.value)} className="mt-1" />
          </div>
        </div>
      </div>

      {/* Responsible pharmacist */}
      <div className="healthcare-card p-5 mb-6">
        <h2 className="font-semibold mb-3 flex items-center gap-2"><UserCheck className="h-4 w-4" /> Responsible pharmacist</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Full name" value={fields.pharmacist_name ?? ""} onChange={(v) => setField("pharmacist_name", v)} onBlur={() => supabase.from("profiles").update({ pharmacist_name: fields.pharmacist_name }).eq("user_id", user.id)} />
          <Field label="SAPC council number" value={fields.pharmacist_council_number ?? ""} onChange={(v) => setField("pharmacist_council_number", v)} onBlur={() => supabase.from("profiles").update({ pharmacist_council_number: fields.pharmacist_council_number }).eq("user_id", user.id)} />
          <Field label="Pharmacist phone (optional)" value={fields.responsible_pharmacist_phone ?? ""} onChange={(v) => setField("responsible_pharmacist_phone", v)} />
        </div>
      </div>

      {/* Documents */}
      <div className="space-y-4 mb-6">
        {DOCS.map((spec) => {
          const uploaded = !!(docs as Record<string, string | null | undefined>)[spec.key];
          const preview = previews[spec.key];
          return (
            <div key={spec.key} className="healthcare-card p-5">
              <div className="flex items-start gap-4">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${uploaded ? "bg-healthcare-green/15 text-healthcare-green" : "bg-muted text-muted-foreground"}`}>
                  {uploaded ? <CheckCircle2 className="h-5 w-5" /> : <spec.icon className="h-5 w-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="font-semibold text-foreground">
                      {spec.label} {spec.optional && <span className="text-[10px] uppercase text-muted-foreground ml-1">optional</span>}
                    </p>
                    {uploaded && <span className="text-xs text-healthcare-green">Uploaded</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{spec.hint}</p>
                  {preview && (
                    preview.match(/\.pdf(\?|$)/i)
                      ? <a href={preview} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline mt-2 inline-block">View PDF</a>
                      : <img src={preview} alt={spec.label} className="mt-3 h-24 w-24 object-cover rounded-md border border-border" />
                  )}
                  <div className="mt-3">
                    <FileButton spec={spec} uploading={uploadingKey === spec.key} onFile={(f) => handleUpload(spec.key, f)} hasFile={uploaded} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 sticky bottom-4 bg-background/80 backdrop-blur p-3 rounded-lg border border-border">
        <span className="text-xs text-muted-foreground">{completed}/{DOCS.length} documents uploaded</span>
        <Button onClick={submitForReview} disabled={submitting} className="gap-2">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {submitted ? "Re-submit for Review" : "Submit for Review"}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, onBlur }: { label: string; value: string; onChange: (v: string) => void; onBlur?: () => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} className="mt-1" />
    </div>
  );
}

function FileButton({ spec, uploading, onFile, hasFile }: { spec: DocSpec; uploading: boolean; onFile: (f: File) => void; hasFile: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref} type="file" accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}
      />
      <Button size="sm" variant="outline" onClick={() => ref.current?.click()} disabled={uploading} className="gap-2">
        {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
        {hasFile ? "Replace file" : "Upload file"}
      </Button>
    </>
  );
}
