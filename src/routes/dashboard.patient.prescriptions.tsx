import { createFileRoute, Link } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { firestoreClient } from "@/lib/firestore-client";
import { useServerFn } from "@tanstack/react-start";
import { verifyPrescription } from "@/utils/ai.functions";
import {
  FileText, Loader2, AlertTriangle, CheckCircle2, Clock, RefreshCw,
  Upload as UploadIcon, ShieldCheck, KeyRound, Sparkles, Download,
  Share2, Link as LinkIcon, Package, ArrowLeft, Pill, BadgeCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrescriptionStatusBadge, PrescriptionUploader, getPrescriptionFileUrl, FraudPanel, type PrescriptionUpload } from "@/components/PrescriptionVerification";
import { PatientVerificationCard } from "@/components/PatientVerificationCard";
import { PrescriptionScanButton } from "@/components/PrescriptionScanButton";
import { DrugInteractionPanel } from "@/components/DrugInteractionPanel";
import { toast } from "sonner";
import { isPrescriptionRefillEligible, prescriptionValidity } from "@/lib/prescription-eligibility";

export const Route = createFileRoute("/dashboard/patient/prescriptions")({
  head: () => ({ meta: [{ title: "Prescriptions — HealthReachCare" }] }),
  component: () => <RoleGuard allow="patient"><Page /></RoleGuard>,
});

interface Prescription {
  id: string;
  medication_name: string;
  dosage: string | null;
  doctor_name: string;
  is_active: boolean | null;
  created_at: string;
}

function Page() {
  const { user } = useAuth();
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [pxUploads, setPxUploads] = useState<PrescriptionUpload[]>([]);
  const [linkedOrders, setLinkedOrders] = useState<Record<string, Array<{
    id: string;
    medication_name: string;
    status: string;
    created_at: string;
    pharmacy_id: string;
    pharmacy_name: string;
  }>>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const verifyRx = useServerFn(verifyPrescription);

  const reloadUploads = async () => {
    if (!user) return;
    const { data, error } = await firestoreClient.from("prescription_uploads")
      .select("*").eq("patient_id", user.id).order("created_at", { ascending: false });
    if (error) throw error;
    setPxUploads((data ?? []) as PrescriptionUpload[]);
  };

  async function loadLinkedOrders(uploadIds: string[]) {
    if (!uploadIds.length) {
      setLinkedOrders({});
      return;
    }
    const { data: orders, error: ordersError } = await firestoreClient.from("orders")
      .select("id, medication_name, status, created_at, pharmacy_id, prescription_upload_id")
      .in("prescription_upload_id", uploadIds)
      .order("created_at", { ascending: false });
    if (ordersError) throw ordersError;
    const rows = (orders ?? []) as Array<{
      id: string;
      medication_name: string;
      status: string;
      created_at: string;
      pharmacy_id: string;
      prescription_upload_id: string;
    }>;
    const pharmacyIds = Array.from(new Set(rows.map((order) => order.pharmacy_id).filter(Boolean)));
    const pharmacyNames: Record<string, string> = {};
    if (pharmacyIds.length) {
      const { data: profiles, error } = await firestoreClient.from("profiles")
        .select("user_id, full_name, organization_name").in("user_id", pharmacyIds);
      if (error) throw error;
      (profiles ?? []).forEach((profile) => {
        pharmacyNames[profile.user_id] = profile.organization_name || profile.full_name || "Pharmacy";
      });
    }
    const grouped: typeof linkedOrders = {};
    rows.forEach((order) => {
      (grouped[order.prescription_upload_id] ||= []).push({
        ...order,
        pharmacy_name: pharmacyNames[order.pharmacy_id] || "Pharmacy",
      });
    });
    setLinkedOrders(grouped);
  }

  async function loadLibrary() {
    if (!user) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [rxResult, uploadsResult] = await Promise.all([
        firestoreClient.from("prescriptions").select("id, medication_name, dosage, doctor_name, is_active, created_at")
          .eq("patient_id", user.id).order("created_at", { ascending: false }),
        firestoreClient.from("prescription_uploads").select("*")
          .eq("patient_id", user.id).order("created_at", { ascending: false }),
      ]);
      if (rxResult.error) throw rxResult.error;
      if (uploadsResult.error) throw uploadsResult.error;
      const rxRows = (rxResult.data ?? []) as Prescription[];
      const uploads = (uploadsResult.data ?? []) as PrescriptionUpload[];
      setPrescriptions(rxRows);
      setPxUploads(uploads);
      await loadLinkedOrders(uploads.map((upload) => upload.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load your prescriptions.";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLibrary();
    // The authenticated UID is the library query key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function downloadPrescription(upload: PrescriptionUpload) {
    try {
      const url = await getPrescriptionFileUrl(upload.file_path);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Could not download prescription (${response.status}).`);
      const blob = await response.blob();
      const ext = (upload.mime_type?.split("/")[1] || "file").replace("jpeg", "jpg");
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `prescription-${upload.id.slice(0, 8)}.${ext}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
      toast.success("Prescription downloaded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not download prescription.");
    }
  }

  async function sharePrescription(upload: PrescriptionUpload) {
    try {
      const url = await getPrescriptionFileUrl(upload.file_path);
      if (new URL(url).hostname === "firebasestorage.googleapis.com") {
        throw new Error("This legacy file has no short-lived share link. Ask the pharmacy to access it through your order.");
      }
      const shareData = { title: "HealthReachCare prescription", text: "Secure prescription link", url };
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share(shareData);
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Secure link copied.", { description: "This link expires shortly." });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error(error instanceof Error ? error.message : "Could not share prescription.");
    }
  }

  const alerts = useMemo(() => {
    const expiring = pxUploads.filter((upload) => prescriptionValidity(upload).state === "expiring");
    const expired = pxUploads.filter((upload) => prescriptionValidity(upload).state === "expired");
    const refillable = pxUploads.filter(isPrescriptionRefillEligible);
    return { expiring, expired, refillable };
  }, [pxUploads]);

  async function runAutoVerify(upload: PrescriptionUpload) {
    if (upload.mime_type === "application/pdf") {
      toast.info("PDF uploaded for pharmacy review.", {
        description: "Automatic image extraction is not available for PDF files.",
      });
      return;
    }
    try {
      const result = await verifyRx({ data: { uploadId: upload.id } });
      if (result.error) {
        toast.warning("Prescription remains pending pharmacy review.", { description: result.error });
      } else {
        toast.success("AI extraction complete.", {
          description: `AI assistance only — pharmacy review is still required. ${result.medications.length} medication(s) detected; ${result.risk_level} risk.`,
        });
      }
    } catch (error) {
      toast.warning("AI extraction is unavailable; the prescription remains pending pharmacy review.", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      try {
        await reloadUploads();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not refresh prescription status.");
      }
    }
  }

  return (
    <main className="container-narrow mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <Link to="/dashboard/patient" className="mb-5 inline-flex items-center rounded text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to Dashboard
      </Link>

      <section className="mb-7 overflow-hidden rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-background to-healthcare-green/[0.08] p-5 shadow-sm sm:p-8" aria-labelledby="prescription-library-title">
        <div className="flex items-center justify-between gap-6">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-background/80 px-3 py-1 text-xs font-medium text-primary">
              <ShieldCheck className="h-3.5 w-3.5" /> Your secure prescription space
            </span>
            <h1 id="prescription-library-title" className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              My Prescription Library
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
              Keep your prescriptions together. AI can assist with document extraction; a pharmacy reviews prescriptions before dispensing.
            </p>
          </div>
          <div aria-hidden="true" className="relative hidden h-36 w-44 shrink-0 items-center justify-center sm:flex">
            <div className="absolute inset-4 rotate-[-7deg] rounded-3xl border border-primary/10 bg-background/80 shadow-lg" />
            <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-xl">
              <Pill className="h-12 w-12" />
            </div>
            <span className="absolute right-1 top-3 flex h-10 w-10 items-center justify-center rounded-2xl border border-healthcare-green/20 bg-background text-healthcare-green shadow-md">
              <BadgeCheck className="h-5 w-5" />
            </span>
            <span className="absolute bottom-1 left-1 flex h-9 w-9 items-center justify-center rounded-xl border border-primary/15 bg-background text-primary shadow-md">
              <FileText className="h-4 w-4" />
            </span>
          </div>
        </div>
      </section>

      <div className="space-y-6">
        <PatientVerificationCard />

        <section id="add-to-library" className="healthcare-card scroll-mt-20 p-5 sm:p-7" aria-labelledby="add-to-library-title">
          <h2 id="add-to-library-title" className="mb-2 flex items-center gap-2 text-lg font-semibold text-foreground">
            <UploadIcon className="h-5 w-5 text-primary" /> Add to my library
          </h2>
          <p className="mb-5 flex items-start gap-2 text-sm leading-6 text-muted-foreground">
            <Sparkles className="mt-1 h-4 w-4 shrink-0 text-primary" />
            <span>
              Upload your prescription and our AI may help capture doctor details, medications, dates, and signature information where legible. When you order Rx medicine, an eligible prescription can be attached automatically. AI extraction does not replace pharmacy review or authorize medicine.
            </span>
          </p>
          <PrescriptionUploader onUploaded={(upload) => {
            void reloadUploads().catch((error: unknown) => {
              toast.error(error instanceof Error ? error.message : "Could not refresh your library.");
            });
            void runAutoVerify(upload);
          }} />
        </section>

        <section className="healthcare-card p-5 sm:p-7" aria-labelledby="library-list-title">
          <h2 id="library-list-title" className="mb-4 flex flex-wrap items-center gap-2 text-lg font-semibold text-foreground">
            <FileText className="h-5 w-5 text-primary" /> My Prescription Library
            <span className="ml-auto text-xs font-normal text-muted-foreground">{alerts.refillable.length} eligible for refill</span>
          </h2>
          {(alerts.expiring.length > 0 || alerts.expired.length > 0) && (
            <div className="mb-4 space-y-2">
              {alerts.expired.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <div className="text-sm">
                    <p className="font-medium text-destructive">{alerts.expired.length} prescription{alerts.expired.length > 1 ? "s" : ""} expired</p>
                    <p className="text-xs text-muted-foreground">Upload a fresh prescription to keep ordering Rx medication.</p>
                  </div>
                </div>
              )}
              {alerts.expiring.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-700 dark:text-amber-400">{alerts.expiring.length} expiring within 14 days</p>
                    <p className="text-xs text-muted-foreground">Refill eligibility is checked again by the server when you order.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {loading && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
          {loadError && !loading && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm" role="alert">
              <span className="text-destructive">{loadError}</span>
              <Button variant="outline" size="sm" onClick={() => void loadLibrary()}>Retry</Button>
            </div>
          )}
          {!loading && !loadError && pxUploads.length === 0 && prescriptions.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-5 py-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <FileText className="h-7 w-7" />
              </div>
              <h3 className="mt-4 font-semibold text-foreground">Nothing here yet</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Upload a prescription above or order Rx medicine to add one automatically.
              </p>
              <Button asChild variant="outline" className="mt-4">
                <a href="#add-to-library">Upload a prescription</a>
              </Button>
            </div>
          )}

          {!loading && !loadError && (pxUploads.length > 0 || prescriptions.length > 0) && (
            <div className="space-y-3">
              {pxUploads.map((upload) => {
                const validity = prescriptionValidity(upload);
                const refillEligible = isPrescriptionRefillEligible(upload);
                const remainingRepeats = Math.max(0, (upload.repeats_total ?? 0) - (upload.repeats_used ?? 0));
                return (
                  <article key={`up-${upload.id}`} className="rounded-xl border border-border bg-background p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">Uploaded</span>
                          Prescription
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Uploaded {new Date(upload.created_at).toLocaleDateString("en-ZA")}
                          {upload.ai_extraction?.doctor_name && ` · Dr. ${upload.ai_extraction.doctor_name}`}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <PrescriptionStatusBadge status={upload.status} />
                        {validity.state === "valid" && validity.days !== null && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-healthcare-green/15 px-2 py-0.5 text-xs text-healthcare-green">
                            <CheckCircle2 className="h-3 w-3" /> Valid · {validity.days}d left
                          </span>
                        )}
                        {validity.state === "expiring" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400">
                            <Clock className="h-3 w-3" /> Expires in {validity.days}d
                          </span>
                        )}
                        {validity.state === "expired" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                            <AlertTriangle className="h-3 w-3" /> Expired
                          </span>
                        )}
                      </div>
                    </div>

                    {upload.ai_extraction && (
                      <div className="mt-3 rounded-lg border border-primary/10 bg-primary/[0.03] p-3">
                        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                          <Sparkles className="h-3.5 w-3.5 text-primary" /> AI-extracted information · not an approval
                          {upload.ai_trust_score != null && <span className="ml-auto text-muted-foreground">Confidence {upload.ai_trust_score}/100</span>}
                        </div>
                        {upload.ai_extraction.medications.length > 0 && (
                          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                            {upload.ai_extraction.medications.map((medication, index) => (
                              <li key={`${upload.id}-med-${index}`}>
                                <span className="font-medium text-foreground">{medication.name}</span>
                                {medication.strength && ` · ${medication.strength}`}
                                {medication.quantity && ` · ${medication.quantity}`}
                                {medication.instructions && ` · ${medication.instructions}`}
                              </li>
                            ))}
                          </ul>
                        )}
                        {upload.ai_extraction.issue_date && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Prescription date: {new Date(upload.ai_extraction.issue_date).toLocaleDateString("en-ZA")}
                          </p>
                        )}
                      </div>
                    )}

                    {(upload.status === "rejected" || upload.status === "reupload_requested") && upload.pharmacist_notes && (
                      <p className="mt-2 text-xs text-destructive">Pharmacy review: {upload.pharmacist_notes}</p>
                    )}
                    {upload.status === "approved" && (
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                        {upload.repeats_total != null && upload.repeats_total > 0 ? (
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
                            <RefreshCw className="h-3 w-3 text-primary" />
                            <strong>{remainingRepeats}</strong> of {upload.repeats_total} repeats remaining
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Repeat limit not recorded</span>
                        )}
                        {upload.dispense_token && (
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-healthcare-green/30 bg-healthcare-green/10 px-2.5 py-1.5 text-healthcare-green">
                            <KeyRound className="h-3 w-3" />
                            <span className="font-mono font-semibold">{upload.dispense_token}</span>
                            <span>last dispense</span>
                          </span>
                        )}
                      </div>
                    )}
                    {(upload.fraud_score ?? 0) >= 40 && <div className="mt-3"><FraudPanel row={upload} /></div>}
                    {(upload.fraud_score ?? 0) < 40 && upload.status === "approved" && (
                      <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-healthcare-green">
                        <ShieldCheck className="h-3 w-3" /> Pharmacy-approved · low risk
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={async () => {
                        try {
                          const url = await getPrescriptionFileUrl(upload.file_path);
                          window.open(url, "_blank", "noopener,noreferrer");
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : "Could not open prescription.");
                        }
                      }}><FileText className="h-3.5 w-3.5" /> View</Button>
                      <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => void downloadPrescription(upload)}>
                        <Download className="h-3.5 w-3.5" /> Download
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => void sharePrescription(upload)}>
                        <Share2 className="h-3.5 w-3.5" /> Share securely
                      </Button>
                      {refillEligible && (
                        <Button size="sm" className="h-8 gap-1.5 text-xs" asChild>
                          <Link to="/dashboard/patient/find" search={{ q: "" }}>
                            <RefreshCw className="h-3.5 w-3.5" /> Refill
                          </Link>
                        </Button>
                      )}
                      {upload.repeats_total != null && upload.repeats_total > 0 && remainingRepeats === 0 && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="h-3 w-3" /> Renewal required
                        </span>
                      )}
                      <PrescriptionScanButton row={upload} onProcessed={() => {
                        void reloadUploads().catch((error: unknown) => {
                          toast.error(error instanceof Error ? error.message : "Could not refresh prescription status.");
                        });
                      }} />
                    </div>

                    {(linkedOrders[upload.id]?.length ?? 0) > 0 && (
                      <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 p-3">
                        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <Package className="h-3 w-3" /> Used on {linkedOrders[upload.id].length} order{linkedOrders[upload.id].length > 1 ? "s" : ""}
                        </p>
                        <ul className="mt-2 space-y-1.5">
                          {linkedOrders[upload.id].slice(0, 4).map((order) => (
                            <li key={order.id} className="flex items-center justify-between gap-2 text-xs">
                              <Link to="/dashboard/patient/orders" className="inline-flex min-w-0 items-center gap-1 text-primary hover:underline">
                                <LinkIcon className="h-3 w-3 shrink-0" />
                                <span className="truncate">{order.medication_name} · {order.pharmacy_name}</span>
                              </Link>
                              <span className="whitespace-nowrap text-[10px] text-muted-foreground">
                                {order.status.replace(/_/g, " ")} · {new Date(order.created_at).toLocaleDateString("en-ZA")}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </article>
                );
              })}

              {prescriptions.map((prescription) => (
                <article key={`rx-${prescription.id}`} className="rounded-xl border border-border bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <span className="rounded bg-healthcare-teal/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-healthcare-teal">E-Script</span>
                        {prescription.medication_name}
                      </p>
                      {prescription.dosage && <p className="mt-1 text-xs text-muted-foreground">{prescription.dosage}</p>}
                      <p className="mt-1 text-xs text-muted-foreground">
                        Dr. {prescription.doctor_name || "—"} · {new Date(prescription.created_at).toLocaleDateString("en-ZA")}
                      </p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${
                      prescription.is_active === false ? "bg-muted text-muted-foreground" : "bg-healthcare-green/15 text-healthcare-green"
                    }`}>{prescription.is_active === false ? "Inactive" : "Active"}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
        {prescriptions.filter((prescription) => prescription.is_active !== false).length >= 2 && (
          <DrugInteractionPanel medications={prescriptions.filter((prescription) => prescription.is_active !== false).map((prescription) => prescription.medication_name)} />
        )}
      </div>
    </main>
  );
}
