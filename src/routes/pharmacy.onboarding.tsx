import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { RoleGuard } from "@/components/RoleGuard";
import { AddressPicker, type PickedAddress } from "@/components/AddressPicker";
import { firestoreClient } from "@/lib/firestore-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, Building2, Check, CheckCircle2, Clock, FileCheck2, FileText,
  IdCard, Image, Loader2, LogOut, MapPin, ShieldCheck, Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Brand } from "@/components/Brand";

export const Route = createFileRoute("/pharmacy/onboarding")({
  head: () => ({ meta: [{ title: "Pharmacy Verification — HealthReachCare" }] }),
  component: () => <RoleGuard allow="pharmacy"><Onboarding /></RoleGuard>,
});

type DocKey = "license_path" | "pharmacist_cert_path" | "proof_of_address_path" | "business_reg_path";

const DOCS: { key: DocKey; label: string; icon: typeof FileText; hint: string }[] = [
  { key: "license_path", label: "SAPC Pharmacy License", icon: ShieldCheck, hint: "Current pharmacy license. PDF, JPG or PNG." },
  { key: "pharmacist_cert_path", label: "Owner / Pharmacist ID", icon: IdCard, hint: "Identity or responsible-pharmacist document. PDF, JPG or PNG." },
  { key: "proof_of_address_path", label: "Storefront / Premises Photo", icon: Image, hint: "A clear photo of the pharmacy premises. JPG or PNG." },
  { key: "business_reg_path", label: "CIPC Business Registration", icon: Building2, hint: "Company registration document. PDF, JPG or PNG." },
];

interface PharmacyDocs {
  license_path?: string | null;
  pharmacist_cert_path?: string | null;
  proof_of_address_path?: string | null;
  business_reg_path?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
}

interface PharmacyProfileFields {
  organization_name?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  phone?: string | null;
  license_number?: string | null;
  license_expires_at?: string | null;
  opening_hours?: string | null;
  pharmacist_name?: string | null;
  pharmacist_council_number?: string | null;
  business_reg_number?: string | null;
  tax_number?: string | null;
  responsible_pharmacist_phone?: string | null;
}

function Onboarding() {
  const { user, approvalStatus, signOut } = useAuth();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<PharmacyDocs>({});
  const [fields, setFields] = useState<PharmacyProfileFields>({});
  const [address, setAddress] = useState<PickedAddress | null>(null);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [uploadingKey, setUploadingKey] = useState<DocKey | null>(null);
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previews, setPreviews] = useState<Partial<Record<DocKey, string>>>({});

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const [{ data: documentData, error: documentError }, { data: profileData, error: profileError }] = await Promise.all([
        firestoreClient.from("pharmacy_documents" as never).select("*").eq("pharmacy_id", user.id).maybeSingle(),
        firestoreClient.from("profiles")
          .select("organization_name,address,latitude,longitude,phone,license_number,license_expires_at,opening_hours,pharmacist_name,pharmacist_council_number,business_reg_number,tax_number,responsible_pharmacist_phone")
          .eq("user_id", user.id).maybeSingle(),
      ]);
      if (!active) return;
      if (documentError) toast.error(`Could not load pharmacy documents: ${documentError.message}`);
      if (profileError) toast.error(`Could not load pharmacy details: ${profileError.message}`);
      if (profileData) {
        const profileFields = profileData as PharmacyProfileFields;
        setFields(profileFields);
        if (profileFields.address && profileFields.latitude != null && profileFields.longitude != null) {
          setAddress({ address: profileFields.address, lat: profileFields.latitude, lng: profileFields.longitude });
        }
      }
      if (documentData) {
        const loadedDocs = documentData as unknown as PharmacyDocs;
        setDocs(loadedDocs);
        const urls: Partial<Record<DocKey, string>> = {};
        await Promise.all(DOCS.map(async ({ key }) => {
          const path = loadedDocs[key];
          if (!path) return;
          const { data: signed, error } = await firestoreClient.storage.from("pharmacy-docs").createSignedUrl(path, 3600);
          if (error) toast.error(`Could not load ${DOCS.find((item) => item.key === key)?.label} preview: ${error.message}`);
          if (signed?.signedUrl) urls[key] = signed.signedUrl;
        }));
        if (!active) return;
        setPreviews(urls);
        if (loadedDocs.submitted_at || approvalStatus === "under_review" || approvalStatus === "approved") setStep(3);
        else if (DOCS.every(({ key }) => !!loadedDocs[key])) setStep(3);
        else if (DOCS.some(({ key }) => !!loadedDocs[key])) setStep(2);
      }
      setLoading(false);
    })().catch((error: unknown) => {
      if (!active) return;
      toast.error(error instanceof Error ? error.message : "Could not load pharmacy verification details.");
      setLoading(false);
    });
    return () => { active = false; };
  }, [user, approvalStatus]);

  function setField<K extends keyof PharmacyProfileFields>(key: K, value: PharmacyProfileFields[K]) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  async function saveBusinessInfo() {
    if (!user) return;
    const required: Array<[keyof PharmacyProfileFields, string]> = [
      ["organization_name", "Pharmacy name"],
      ["license_number", "SAPC pharmacy license number"],
      ["address", "Physical address"],
      ["phone", "Contact number"],
      ["opening_hours", "Operating hours"],
      ["license_expires_at", "License expiry date"],
      ["pharmacist_name", "Responsible pharmacist name"],
      ["pharmacist_council_number", "SAPC pharmacist council number"],
      ["business_reg_number", "CIPC registration number"],
    ];
    for (const [key, label] of required) {
      if (!fields[key] || String(fields[key]).trim() === "") {
        toast.error(`${label} is required.`);
        return;
      }
    }
    const pharmacyAddress = fields.address?.trim();
    if (!address || !pharmacyAddress || fields.latitude == null || fields.longitude == null) {
      toast.error("Choose the physical address from the address suggestions so its verified map location can be saved.");
      return;
    }
    setSavingBusiness(true);
    const { error } = await firestoreClient.from("profiles").update({
      organization_name: fields.organization_name?.trim(),
      license_number: fields.license_number?.trim(),
      address: pharmacyAddress,
      latitude: fields.latitude,
      longitude: fields.longitude,
      phone: fields.phone?.trim(),
      opening_hours: fields.opening_hours?.trim(),
      license_expires_at: fields.license_expires_at,
      pharmacist_name: fields.pharmacist_name?.trim(),
      pharmacist_council_number: fields.pharmacist_council_number?.trim(),
      business_reg_number: fields.business_reg_number?.trim(),
      responsible_pharmacist_phone: fields.responsible_pharmacist_phone?.trim() || null,
      tax_number: fields.tax_number?.trim() || null,
    } as never).eq("user_id", user.id);
    if (error) {
      setSavingBusiness(false);
      toast.error(`Could not save pharmacy details: ${error.message}`);
      return;
    }
    try {
      const { ensurePrimaryPharmacyBranch } = await import("@/lib/firestore-sync");
      await ensurePrimaryPharmacyBranch({
        pharmacyId: user.id,
        name: fields.organization_name!.trim(),
        address: pharmacyAddress,
        phone: fields.phone?.trim(),
        latitude: fields.latitude,
        longitude: fields.longitude,
      });
    } catch (error) {
      setSavingBusiness(false);
      toast.error(error instanceof Error ? `Pharmacy details saved, but the primary branch could not be saved: ${error.message}` : "Pharmacy details saved, but the primary branch could not be saved.");
      return;
    }
    setSavingBusiness(false);
    toast.success("Pharmacy details and primary branch saved.");
    setStep(2);
  }

  async function handleUpload(key: DocKey, file: File) {
    if (!user) return;
    const supportedType = ["application/pdf", "image/jpeg", "image/png"].includes(file.type);
    if (!supportedType) {
      toast.error("Choose a PDF, JPG or PNG file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Documents must be 10 MB or smaller.");
      return;
    }
    setUploadingKey(key);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || (file.type === "application/pdf" ? "pdf" : "jpg");
      const path = `${user.id}/${key}-${Date.now()}.${extension}`;
      const { error: uploadError } = await firestoreClient.storage.from("pharmacy-docs").upload(path, file, {
        upsert: true,
        contentType: file.type,
      });
      if (uploadError) throw new Error(uploadError.message);
      const { error: saveError } = await firestoreClient.from("pharmacy_documents" as never)
        .upsert({ pharmacy_id: user.id, [key]: path } as never, { onConflict: "pharmacy_id" });
      if (saveError) throw new Error(saveError.message);
      const { data: signed, error: signedError } = await firestoreClient.storage.from("pharmacy-docs").createSignedUrl(path, 3600);
      if (signedError) toast.error(`Document saved, but preview could not be generated: ${signedError.message}`);
      setDocs((current) => ({ ...current, [key]: path }));
      if (signed?.signedUrl) setPreviews((current) => ({ ...current, [key]: signed.signedUrl }));
      toast.success("Document uploaded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Document upload failed.");
    } finally {
      setUploadingKey(null);
    }
  }

  async function submitForReview() {
    if (!user) return;
    const missing = DOCS.find(({ key }) => !docs[key]);
    if (missing) {
      toast.error(`Upload "${missing.label}" before submitting.`);
      return;
    }
    if (!fields.organization_name?.trim() || !fields.address?.trim() || !fields.phone?.trim() || !fields.opening_hours?.trim()) {
      toast.error("Complete and save the pharmacy business details first.");
      setStep(1);
      return;
    }
    setSubmitting(true);
    const { error: profileError } = await firestoreClient.from("profiles")
      .update({ approval_status: "under_review" } as never).eq("user_id", user.id);
    if (profileError) {
      setSubmitting(false);
      toast.error(`Could not submit the verification status: ${profileError.message}`);
      return;
    }
    const { error: docsError } = await firestoreClient.from("pharmacy_documents" as never).upsert({
      pharmacy_id: user.id,
      submitted_at: new Date().toISOString(),
    } as never, { onConflict: "pharmacy_id" });
    setSubmitting(false);
    if (docsError) {
      toast.error(`Verification status was updated, but the document submission could not be recorded: ${docsError.message}`);
      return;
    }
    setDocs((current) => ({ ...current, submitted_at: new Date().toISOString() }));
    setStep(3);
    toast.success("Verification submitted for review.");
  }

  const completeDocs = DOCS.filter(({ key }) => !!docs[key]).length;
  const submitted = !!docs.submitted_at || approvalStatus === "under_review" || approvalStatus === "approved";
  const verified = approvalStatus === "approved";

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>;

  return (
    <main className="min-h-screen bg-slate-50/50 px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-center justify-between border-b border-border/60 bg-white pb-4">
          <Link to="/dashboard/pharmacy" className="flex items-center gap-3" aria-label="HealthReachCare pharmacy dashboard">
            <Brand />
            <span className="hidden text-sm font-semibold text-slate-900 sm:inline">Pharmacy onboarding</span>
          </Link>
          {step !== 3 && <Link to="/dashboard/pharmacy" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Dashboard</Link>}
        </header>

        {step < 3 && (
          <>
            <section>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Pharmacy verification</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Set up your pharmacy</h1>
              <p className="mt-2 text-sm text-slate-600">Provide your business details and compliance documents for HealthReachCare review.</p>
            </section>
            <ol className="grid grid-cols-3 gap-2 rounded-2xl border border-border/60 bg-white p-4 shadow-sm sm:p-5" aria-label="Onboarding steps">
              {["Business Info", "Documents", "Review & Status"].map((label, index) => {
                const number = index + 1;
                const complete = number < step;
                return (
                  <li key={label} aria-current={number === step ? "step" : undefined} className={`flex items-center gap-2 text-xs font-semibold sm:text-sm ${number === step ? "text-emerald-700" : complete ? "text-emerald-700" : "text-muted-foreground"}`}>
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${number <= step ? "border-emerald-600 bg-emerald-600 text-white" : "border-border bg-white"}`}>{complete ? <Check className="h-4 w-4" /> : number}</span>
                    <span>{label}</span>
                  </li>
                );
              })}
            </ol>
          </>
        )}

        {step === 1 && (
          <section className="space-y-5 rounded-2xl border border-border/60 bg-white p-5 shadow-sm sm:p-6">
            <div><h2 className="text-lg font-semibold text-slate-900">Business information</h2><p className="mt-1 text-sm text-muted-foreground">This information is used for your pharmacy profile and primary branch.</p></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Pharmacy Name" value={fields.organization_name ?? ""} onChange={(value) => setField("organization_name", value)} />
              <Field label="Registration / SAPC Number" value={fields.license_number ?? ""} onChange={(value) => setField("license_number", value)} />
              <div className="space-y-2 sm:col-span-2">
                <Label>Physical Address</Label>
                <AddressPicker value={address} onChange={(picked) => {
                  setAddress(picked);
                  setFields((current) => ({ ...current, address: picked.address, latitude: picked.lat, longitude: picked.lng }));
                }} placeholder="Search and select your pharmacy address" />
              </div>
              <Field label="Contact Number" value={fields.phone ?? ""} onChange={(value) => setField("phone", value)} type="tel" />
              <Field label="Operating Hours" value={fields.opening_hours ?? ""} onChange={(value) => setField("opening_hours", value)} placeholder="Enter your actual operating hours" />
            </div>
            <details className="rounded-xl border border-border/70 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">Additional SAPC compliance details</summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Responsible Pharmacist" value={fields.pharmacist_name ?? ""} onChange={(value) => setField("pharmacist_name", value)} />
                <Field label="Pharmacist SAPC Council Number" value={fields.pharmacist_council_number ?? ""} onChange={(value) => setField("pharmacist_council_number", value)} />
                <Field label="CIPC Registration Number" value={fields.business_reg_number ?? ""} onChange={(value) => setField("business_reg_number", value)} />
                <Field label="Pharmacy License Expiry" value={fields.license_expires_at ?? ""} onChange={(value) => setField("license_expires_at", value)} type="date" />
              </div>
            </details>
            <div className="flex justify-end border-t border-border/60 pt-4">
              <Button onClick={saveBusinessInfo} disabled={savingBusiness} className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700">
                {savingBusiness ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : "Save & Continue"}
              </Button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="space-y-5 rounded-2xl border border-border/60 bg-white p-5 shadow-sm sm:p-6">
            <div><h2 className="text-lg font-semibold text-slate-900">Compliance documents</h2><p className="mt-1 text-sm text-muted-foreground">Upload clear, current documents. PDF, JPG and PNG files up to 10 MB are accepted.</p></div>
            <div className="space-y-3">
              {DOCS.map((document) => (
                <DocumentCard key={document.key} document={document} uploaded={!!docs[document.key]} preview={previews[document.key]}
                  uploading={uploadingKey === document.key} onUpload={(file) => void handleUpload(document.key, file)} />
              ))}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-4">
              <Button variant="outline" className="rounded-xl" onClick={() => setStep(1)}>Back</Button>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">{completeDocs}/{DOCS.length} uploaded</span>
                <Button onClick={submitForReview} disabled={submitting} className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700">
                  {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</> : "Submit for Review"}
                </Button>
              </div>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="rounded-2xl border border-border/60 bg-white px-5 py-10 text-center shadow-sm sm:px-10">
            <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${verified ? "bg-emerald-100" : "bg-emerald-50"}`}>
              {verified ? <CheckCircle2 className="h-11 w-11 text-emerald-600" /> : submitted ? <CheckCircle2 className="h-11 w-11 text-emerald-600" /> : <FileCheck2 className="h-10 w-10 text-emerald-600" />}
            </div>
            <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-emerald-700">{verified ? "Approved" : submitted ? "Submitted for review" : "Review your application"}</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">{verified ? "Pharmacy Verified" : submitted ? "Verification Submitted!" : "Ready to submit?"}</h1>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">
              {verified
                ? "Your pharmacy has been verified and can manage its live orders and inventory."
                : submitted
                  ? "Your documents and pharmacy details have been submitted. Our team will review them for SAPC compliance before enabling pharmacy services."
                  : "Your saved business details and uploaded documents will be reviewed by our team under SAPC compliance requirements."}
            </p>
            {docs.review_notes && <p className="mx-auto mt-4 max-w-lg rounded-xl bg-slate-50 p-3 text-left text-sm text-slate-700"><span className="font-semibold">Review notes:</span> {docs.review_notes}</p>}
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              {submitted || verified ? (
                <Button onClick={() => void navigate({ to: "/dashboard/pharmacy" })} className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700">Go to Dashboard</Button>
              ) : (
                <Button onClick={() => setStep(2)} className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700">Return to Documents</Button>
              )}
              <Button variant="outline" onClick={() => void signOut()} className="rounded-xl"><LogOut className="mr-2 h-4 w-4" />Log Out</Button>
            </div>
            {!submitted && !verified && <p className="mt-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" />Submission is required before admin review begins.</p>}
          </section>
        )}
      </div>
    </main>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="rounded-xl" />
    </div>
  );
}

function DocumentCard({
  document,
  uploaded,
  preview,
  uploading,
  onUpload,
}: {
  document: (typeof DOCS)[number];
  uploaded: boolean;
  preview?: string;
  uploading: boolean;
  onUpload: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const Icon = document.icon;
  return (
    <article className="flex flex-col gap-4 rounded-xl border border-border/70 p-4 sm:flex-row sm:items-center">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${uploaded ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
        {uploaded ? <CheckCircle2 className="h-6 w-6" /> : <Icon className="h-6 w-6" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900">{document.label}</h3>
          {uploaded && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">Uploaded</span>}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{document.hint}</p>
        {preview && <a href={preview} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-medium text-emerald-700 hover:underline">View uploaded document</a>}
      </div>
      <input ref={inputRef} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) onUpload(file);
        event.currentTarget.value = "";
      }} />
      <Button type="button" variant={uploaded ? "outline" : "default"} disabled={uploading} onClick={() => inputRef.current?.click()}
        className={uploaded ? "shrink-0 rounded-xl" : "shrink-0 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"}>
        {uploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading…</> : <><Upload className="mr-2 h-4 w-4" />{uploaded ? "Replace" : "Upload"}</>}
      </Button>
    </article>
  );
}
