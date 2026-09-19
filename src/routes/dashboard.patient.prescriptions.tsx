import { createFileRoute, Link } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { verifyPrescription } from "@/utils/ai.functions";
import { Stethoscope, FileText, Loader2, AlertTriangle, CheckCircle2, Clock, RefreshCw, Upload as UploadIcon, ShieldCheck, KeyRound, Sparkles, Download, Share2, Link as LinkIcon, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrescriptionStatusBadge, PrescriptionUploader, getPrescriptionFileUrl, FraudPanel, type PrescriptionUpload } from "@/components/PrescriptionVerification";
import { PatientVerificationCard } from "@/components/PatientVerificationCard";
import { PrescriptionScanButton } from "@/components/PrescriptionScanButton";
import { DrugInteractionPanel } from "@/components/DrugInteractionPanel";
import { toast } from "sonner";


export const Route = createFileRoute("/dashboard/patient/prescriptions")({
  head: () => ({ meta: [{ title: "Prescriptions — HealthReachCareCare" }] }),
  component: () => <RoleGuard allow="patient"><Page /></RoleGuard>,
});

interface Prescription { id: string; medication_name: string; dosage: string | null; doctor_name: string; is_active: boolean | null; created_at: string; }

const MS_DAY = 86_400_000;

function validityOf(u: PrescriptionUpload): { state: "valid" | "expiring" | "expired" | "pending"; days: number | null } {
  if (u.status !== "approved") return { state: "pending", days: null };
  if (!u.expires_at) return { state: "valid", days: null };
  const days = Math.floor((new Date(u.expires_at).getTime() - Date.now()) / MS_DAY);
  if (days < 0) return { state: "expired", days };
  if (days <= 14) return { state: "expiring", days };
  return { state: "valid", days };
}




function Page() {
  const { user } = useAuth();
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [pxUploads, setPxUploads] = useState<PrescriptionUpload[]>([]);
  const [linkedOrders, setLinkedOrders] = useState<Record<string, Array<{ id: string; medication_name: string; status: string; created_at: string; pharmacy_id: string; pharmacy_name: string }>>>({});
  const [loading, setLoading] = useState(true);
  const verifyRx = useServerFn(verifyPrescription);

  const reloadUploads = async () => {
    if (!user) return;
    const { data } = await supabase.from("prescription_uploads").select("*").eq("patient_id", user.id).order("created_at", { ascending: false });
    setPxUploads((data ?? []) as PrescriptionUpload[]);
  };

  async function loadLinkedOrders(uploadIds: string[]) {
    if (!uploadIds.length) { setLinkedOrders({}); return; }
    const { data: ords } = await supabase
      .from("orders")
      .select("id, medication_name, status, created_at, pharmacy_id, prescription_upload_id")
      .in("prescription_upload_id", uploadIds)
      .order("created_at", { ascending: false });
    const list = (ords ?? []) as any[];
    const pharmIds = Array.from(new Set(list.map((o) => o.pharmacy_id).filter(Boolean)));
    const names: Record<string, string> = {};
    if (pharmIds.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name, organization_name").in("user_id", pharmIds);
      (profs ?? []).forEach((p: any) => { names[p.user_id] = p.organization_name || p.full_name || "Pharmacy"; });
    }
    const grouped: Record<string, any[]> = {};
    list.forEach((o) => {
      (grouped[o.prescription_upload_id] ||= []).push({ ...o, pharmacy_name: names[o.pharmacy_id] || "Pharmacy" });
    });
    setLinkedOrders(grouped);
  }

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: rx }, { data: ups }] = await Promise.all([
        supabase.from("prescriptions").select("id, medication_name, dosage, doctor_name, is_active, created_at").eq("patient_id", user.id).order("created_at", { ascending: false }),
        supabase.from("prescription_uploads").select("*").eq("patient_id", user.id).order("created_at", { ascending: false }),
      ]);
      setPrescriptions((rx ?? []) as Prescription[]);
      const upsList = (ups ?? []) as PrescriptionUpload[];
      setPxUploads(upsList);
      await loadLinkedOrders(upsList.map((u) => u.id));
      setLoading(false);
    })();
  }, [user]);

  async function downloadPrescription(u: PrescriptionUpload) {
    try {
      const url = await getPrescriptionFileUrl(u.file_path);
      const res = await fetch(url);
      const blob = await res.blob();
      const ext = (u.mime_type?.split("/")[1] || "file").replace("jpeg", "jpg");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `prescription-${u.id.slice(0,8)}.${ext}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast.success("Prescription downloaded");
    } catch (e: any) { toast.error(e?.message || "Could not download"); }
  }

  async function sharePrescription(u: PrescriptionUpload) {
    try {
      const url = await getPrescriptionFileUrl(u.file_path);
      const shareData = { title: "HealthReachCareCare prescription", text: "Secure prescription link", url };
      if (typeof navigator !== "undefined" && (navigator as any).share) {
        try { await (navigator as any).share(shareData); return; }
        catch { /* user cancelled — fall through to copy */ }
      }
      await navigator.clipboard.writeText(url);
      toast.success("Secure link copied", { description: "Share with your pharmacy. Link expires shortly." });
    } catch (e: any) { toast.error(e?.message || "Could not share"); }
  }


  const alerts = useMemo(() => {
    const expiring = pxUploads.filter((u) => validityOf(u).state === "expiring");
    const expired = pxUploads.filter((u) => validityOf(u).state === "expired");
    const refillable = pxUploads.filter((u) => validityOf(u).state === "valid" || validityOf(u).state === "expiring");
    return { expiring, expired, refillable };
  }, [pxUploads]);

  // Auto-run AI verification after a new upload so the patient sees a trust score immediately.
  async function runAutoVerify(row: PrescriptionUpload) {
    if (row.mime_type === "application/pdf") return;
    try {
      const fileUrl = await getPrescriptionFileUrl(row.file_path);
      const r = await verifyRx({ data: { uploadId: row.id, fileUrl, mimeType: row.mime_type } });
      if (!r.error) {
        const lvl = r.risk_level;
        const fn = lvl === "low" ? toast.success : lvl === "high" ? toast.error : toast.warning;
        fn(`AI trust ${r.trust_score}/100 · ${lvl} risk`, { description: r.summary || `${r.medications.length} medication(s) detected.` });
      }
    } catch {
      /* silent — user can re-run manually */
    } finally {
      reloadUploads();
    }
  }

  return (
    <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Prescription Library</h1>
        <p className="text-sm text-muted-foreground">Upload once — our AI verifies it and re-uses it at any pharmacy when you order.</p>
      </div>
      <PatientVerificationCard />


      {(alerts.expiring.length > 0 || alerts.expired.length > 0) && (
        <div className="space-y-2">
          {alerts.expired.length > 0 && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-destructive">{alerts.expired.length} prescription{alerts.expired.length > 1 ? "s" : ""} expired</p>
                <p className="text-xs text-muted-foreground">Upload a fresh prescription to keep ordering Rx medication.</p>
              </div>
            </div>
          )}
          {alerts.expiring.length > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 flex items-start gap-2">
              <Clock className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-amber-700 dark:text-amber-400">{alerts.expiring.length} expiring within 14 days</p>
                <p className="text-xs text-muted-foreground">Reorder soon — eligible for refill until expiry.</p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="healthcare-card p-6">
        <h2 className="text-lg font-semibold text-foreground mb-2 flex items-center gap-2">
          <UploadIcon className="h-5 w-5 text-primary" /> Add to my library
        </h2>
        <p className="text-xs text-muted-foreground mb-4 flex items-start gap-2">
          <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
          <span>
            No need to choose a pharmacy. Upload your prescription and our AI captures the doctor details, medications, signature
            and trust score. When you order Rx medicine the prescription is attached automatically.
          </span>
        </p>
        <PrescriptionUploader onUploaded={(row) => { reloadUploads(); runAutoVerify(row); }} />
      </div>


      <div className="healthcare-card p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" /> My Prescription Library
          <span className="ml-auto text-xs font-normal text-muted-foreground">{alerts.refillable.length} eligible for refill</span>
        </h2>
        {loading && <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
        {!loading && pxUploads.length === 0 && prescriptions.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing here yet — upload a prescription above or order Rx medicine to add one automatically.</p>
        )}

        <div className="space-y-3">
          {/* Uploaded prescriptions (with AI verification, repeats, dispense token) */}
          {pxUploads.map((u) => {
            const v = validityOf(u);
            const canRefill = v.state === "valid" || v.state === "expiring";
            return (
              <div key={`up-${u.id}`} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-sm font-medium text-foreground truncate flex items-center gap-2">
                    <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">Uploaded</span>
                    Prescription · {new Date(u.created_at).toLocaleDateString()}
                  </p>
                  <div className="flex items-center gap-2">
                    <PrescriptionStatusBadge status={u.status} />
                    {v.state === "valid" && v.days !== null && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-healthcare-green/20 text-healthcare-green inline-flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Valid · {v.days}d left
                      </span>
                    )}
                    {v.state === "expiring" && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400 inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Expires in {v.days}d
                      </span>
                    )}
                    {v.state === "expired" && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/15 text-destructive inline-flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Expired
                      </span>
                    )}
                  </div>
                </div>
                {(u.status === "rejected" || u.status === "reupload_requested") && u.pharmacist_notes && (
                  <p className="mt-2 text-xs text-destructive">Pharmacist: {u.pharmacist_notes}</p>
                )}
                {u.status === "approved" && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-xs flex items-center gap-2">
                      <RefreshCw className="h-3 w-3 text-primary" />
                      <span>
                        <span className="font-semibold">{Math.max(0, (u.repeats_total ?? 0) - (u.repeats_used ?? 0))}</span>
                        <span className="text-muted-foreground"> of {(u.repeats_total ?? 0)} repeats remaining</span>
                      </span>
                    </div>
                    {u.dispense_token && (
                      <div className="rounded-md border border-healthcare-green/30 bg-healthcare-green/10 px-2.5 py-1.5 text-xs flex items-center gap-2">
                        <KeyRound className="h-3 w-3 text-healthcare-green" />
                        <span className="font-mono font-semibold text-healthcare-green">{u.dispense_token}</span>
                        <span className="text-[10px] text-muted-foreground ml-auto">last dispense</span>
                      </div>
                    )}
                  </div>
                )}
                {(u.fraud_score ?? 0) >= 40 && (
                  <div className="mt-2"><FraudPanel row={u} /></div>
                )}
                {(u.fraud_score ?? 0) < 40 && u.status === "approved" && (
                  <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-healthcare-green">
                    <ShieldCheck className="h-3 w-3" /> Verified · low risk
                  </div>
                )}
                <div className="flex flex-wrap gap-2 mt-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={async () => {
                    try { const url = await getPrescriptionFileUrl(u.file_path); window.open(url, "_blank", "noopener,noreferrer"); }
                    catch (e: any) { toast.error(e?.message || "Could not open file"); }
                  }}><FileText className="h-3 w-3" /> View</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => downloadPrescription(u)}>
                    <Download className="h-3 w-3" /> Download
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => sharePrescription(u)}>
                    <Share2 className="h-3 w-3" /> Share with pharmacy
                  </Button>
                  {canRefill && (u.repeats_total ?? 0) > (u.repeats_used ?? 0) && (
                    <Button size="sm" variant="default" className="h-7 text-xs gap-1" asChild>
                      <Link to="/dashboard/patient/find">
                        <RefreshCw className="h-3 w-3" /> Refill
                      </Link>
                    </Button>
                  )}
                  {(u.repeats_total ?? 0) > 0 && (u.repeats_used ?? 0) >= (u.repeats_total ?? 0) && (
                    <span className="text-xs px-2 py-1 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 inline-flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Renewal required
                    </span>
                  )}
                  <PrescriptionScanButton row={u} />
                </div>
                {(linkedOrders[u.id]?.length ?? 0) > 0 && (
                  <div className="mt-3 rounded-md border border-border/60 bg-muted/30 p-2">
                    <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide flex items-center gap-1">
                      <Package className="h-3 w-3" /> Used on {linkedOrders[u.id].length} order{linkedOrders[u.id].length > 1 ? "s" : ""}
                    </p>
                    <ul className="mt-1 space-y-1">
                      {linkedOrders[u.id].slice(0, 4).map((o) => (
                        <li key={o.id} className="text-xs flex items-center justify-between gap-2">
                          <Link to="/dashboard/patient/orders" className="text-primary hover:underline truncate inline-flex items-center gap-1">
                            <LinkIcon className="h-3 w-3" /> {o.medication_name} · {o.pharmacy_name}
                          </Link>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {o.status.replace(/_/g, " ")} · {new Date(o.created_at).toLocaleDateString("en-ZA")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}

          {/* Doctor-issued / e-prescriptions captured into the prescriptions table */}
          {prescriptions.map((p) => (
            <div key={`rx-${p.id}`} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-foreground flex items-center gap-2">
                    <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-healthcare-teal/15 text-healthcare-teal">E-Script</span>
                    {p.medication_name}
                  </p>
                  {p.dosage && <p className="text-xs text-muted-foreground mt-0.5">{p.dosage}</p>}
                  <p className="text-xs text-muted-foreground mt-0.5">Dr. {p.doctor_name || "—"} • {new Date(p.created_at).toLocaleDateString()}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${p.is_active === false ? "bg-muted text-muted-foreground" : "bg-healthcare-green/20 text-healthcare-green"}`}>
                  {p.is_active === false ? "inactive" : "active"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>


      {prescriptions.length >= 2 && (
        <DrugInteractionPanel medications={prescriptions.filter(p => p.is_active !== false).map(p => p.medication_name)} />
      )}
    </div>
  );
}
