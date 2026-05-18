import { createFileRoute, Link } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Stethoscope, FileText, Loader2, AlertTriangle, CheckCircle2, Clock, RefreshCw, Upload as UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PrescriptionStatusBadge, PrescriptionUploader, getPrescriptionFileUrl, type PrescriptionUpload } from "@/components/PrescriptionVerification";
import { PrescriptionScanButton } from "@/components/PrescriptionScanButton";
import { DrugInteractionPanel } from "@/components/DrugInteractionPanel";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/patient/prescriptions")({
  head: () => ({ meta: [{ title: "Prescriptions — HEALTHREACH" }] }),
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

interface PharmacyOpt { user_id: string; organization_name: string | null; }

function Page() {
  const { user } = useAuth();
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [pxUploads, setPxUploads] = useState<PrescriptionUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [pharmacies, setPharmacies] = useState<PharmacyOpt[]>([]);
  const [pickedPharmacy, setPickedPharmacy] = useState<string>("");

  const reloadUploads = async () => {
    if (!user) return;
    const { data } = await supabase.from("prescription_uploads").select("*").eq("patient_id", user.id).order("created_at", { ascending: false });
    setPxUploads((data ?? []) as PrescriptionUpload[]);
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: rx }, { data: ups }, { data: phs }] = await Promise.all([
        supabase.from("prescriptions").select("id, medication_name, dosage, doctor_name, is_active, created_at").eq("patient_id", user.id).order("created_at", { ascending: false }),
        supabase.from("prescription_uploads").select("*").eq("patient_id", user.id).order("created_at", { ascending: false }),
        supabase.from("profiles").select("user_id, organization_name").not("organization_name", "is", null).neq("organization_name", "").order("organization_name"),
      ]);
      setPrescriptions((rx ?? []) as Prescription[]);
      setPxUploads((ups ?? []) as PrescriptionUpload[]);
      // Filter to pharmacies via user_roles
      const ids = (phs ?? []).map((p: any) => p.user_id);
      if (ids.length) {
        const { data: roles } = await supabase.from("user_roles").select("user_id").in("user_id", ids).eq("role", "pharmacy");
        const pharmacyIds = new Set((roles ?? []).map((r: any) => r.user_id));
        setPharmacies(((phs ?? []) as any[]).filter((p) => pharmacyIds.has(p.user_id)));
      }
      setLoading(false);
    })();
  }, [user]);

  const alerts = useMemo(() => {
    const expiring = pxUploads.filter((u) => validityOf(u).state === "expiring");
    const expired = pxUploads.filter((u) => validityOf(u).state === "expired");
    const refillable = pxUploads.filter((u) => validityOf(u).state === "valid" || validityOf(u).state === "expiring");
    return { expiring, expired, refillable };
  }, [pxUploads]);

  return (
    <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Prescriptions</h1>
        <p className="text-sm text-muted-foreground">Validity, expiry alerts, and refill eligibility.</p>
      </div>

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
          <UploadIcon className="h-5 w-5 text-primary" /> Upload a prescription
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          Send a prescription to any pharmacy for review. Once approved it stays valid for 90 days and can be reused for refills at that pharmacy.
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Send to pharmacy</label>
            <Select value={pickedPharmacy} onValueChange={setPickedPharmacy}>
              <SelectTrigger><SelectValue placeholder="Choose a pharmacy…" /></SelectTrigger>
              <SelectContent>
                {pharmacies.map((p) => (
                  <SelectItem key={p.user_id} value={p.user_id}>{p.organization_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {pickedPharmacy ? (
            <PrescriptionUploader pharmacyId={pickedPharmacy} onUploaded={() => { reloadUploads(); toast.success("Pharmacy will review shortly."); }} />
          ) : (
            <p className="text-xs text-muted-foreground italic">Pick a pharmacy to enable upload.</p>
          )}
        </div>
      </div>

      <div className="healthcare-card p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Stethoscope className="h-5 w-5 text-primary" /> Active Prescriptions
        </h2>
        {loading && <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
        {!loading && prescriptions.length === 0 && <p className="text-sm text-muted-foreground">No prescriptions on file.</p>}
        <div className="space-y-3">
          {prescriptions.map((p) => (
            <div key={p.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{p.medication_name}</p>
                  {p.dosage && <p className="text-xs text-muted-foreground">{p.dosage}</p>}
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

      <div className="healthcare-card p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" /> Prescription Uploads
          <span className="ml-auto text-xs font-normal text-muted-foreground">{alerts.refillable.length} eligible for refill</span>
        </h2>
        {pxUploads.length === 0 && <p className="text-sm text-muted-foreground">No uploads yet — upload happens during checkout for Rx-required medicines.</p>}
        <div className="space-y-3">
          {pxUploads.map((u) => {
            const v = validityOf(u);
            const canRefill = v.state === "valid" || v.state === "expiring";
            return (
            <div key={u.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm font-medium text-foreground truncate">Upload · {new Date(u.created_at).toLocaleDateString()}</p>
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
              <div className="flex flex-wrap gap-2 mt-2">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={async () => {
                  try { const url = await getPrescriptionFileUrl(u.file_path); window.open(url, "_blank", "noopener,noreferrer"); }
                  catch (e: any) { toast.error(e?.message || "Could not open file"); }
                }}>View prescription</Button>
                {canRefill && (
                  <Button size="sm" variant="default" className="h-7 text-xs gap-1" asChild>
                    <Link to="/dashboard/patient/pharmacies">
                      <RefreshCw className="h-3 w-3" /> Refill
                    </Link>
                  </Button>
                )}
                <PrescriptionScanButton row={u} />
              </div>
            </div>
            );
          })}
        </div>
      </div>

      {prescriptions.length >= 2 && (
        <DrugInteractionPanel medications={prescriptions.filter(p => p.is_active !== false).map(p => p.medication_name)} />
      )}
    </div>
  );
}
