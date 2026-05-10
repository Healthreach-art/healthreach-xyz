import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Stethoscope, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrescriptionStatusBadge, getPrescriptionFileUrl, type PrescriptionUpload } from "@/components/PrescriptionVerification";
import { PrescriptionScanButton } from "@/components/PrescriptionScanButton";
import { DrugInteractionPanel } from "@/components/DrugInteractionPanel";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/patient/prescriptions")({
  head: () => ({ meta: [{ title: "Prescriptions — HEALTHREACH" }] }),
  component: () => <RoleGuard allow="patient"><Page /></RoleGuard>,
});

interface Prescription { id: string; medication_name: string; dosage: string | null; doctor_name: string; is_active: boolean | null; created_at: string; }

function Page() {
  const { user } = useAuth();
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [pxUploads, setPxUploads] = useState<PrescriptionUpload[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: rx }, { data: ups }] = await Promise.all([
        supabase.from("prescriptions").select("id, medication_name, dosage, doctor_name, is_active, created_at").eq("patient_id", user.id).order("created_at", { ascending: false }),
        supabase.from("prescription_uploads").select("*").eq("patient_id", user.id).order("created_at", { ascending: false }),
      ]);
      setPrescriptions((rx ?? []) as Prescription[]);
      setPxUploads((ups ?? []) as PrescriptionUpload[]);
      setLoading(false);
    })();
  }, [user]);

  return (
    <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Prescriptions</h1>
        <p className="text-sm text-muted-foreground">Doctor-issued prescriptions and your upload status.</p>
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
        </h2>
        {pxUploads.length === 0 && <p className="text-sm text-muted-foreground">No uploads yet — upload happens during checkout for Rx-required medicines.</p>}
        <div className="space-y-3">
          {pxUploads.map((u) => (
            <div key={u.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground truncate">Upload · {new Date(u.created_at).toLocaleDateString()}</p>
                <PrescriptionStatusBadge status={u.status} />
              </div>
              {(u.status === "rejected" || u.status === "reupload_requested") && u.pharmacist_notes && (
                <p className="mt-2 text-xs text-destructive">Pharmacist: {u.pharmacist_notes}</p>
              )}
              <Button size="sm" variant="outline" className="h-7 text-xs mt-2" onClick={async () => {
                try { const url = await getPrescriptionFileUrl(u.file_path); window.open(url, "_blank", "noopener,noreferrer"); }
                catch (e: any) { toast.error(e?.message || "Could not open file"); }
              }}>View prescription</Button>
              <PrescriptionScanButton row={u} />
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
