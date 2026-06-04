import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { RoleGuard } from "@/components/RoleGuard";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, ShieldCheck, Camera, FileText, Car, IdCard, CheckCircle2, Clock, User } from "lucide-react";
import { toast } from "sonner";
import { CameraCapture } from "@/components/CameraCapture";

export const Route = createFileRoute("/driver/onboarding")({
  head: () => ({ meta: [{ title: "Driver Onboarding — HEALTHREACH" }] }),
  component: () => <RoleGuard allow="driver"><Onboarding /></RoleGuard>,
});

type DocKey = "id_document_path" | "license_path" | "selfie_path" | "vehicle_photo_path";

interface DocSpec {
  key: DocKey;
  label: string;
  icon: typeof IdCard;
  hint: string;
  capture?: "user" | "environment";
  /** If true, force the in-app live camera (no file upload fallback in the UI). */
  liveOnly?: boolean;
}

const DOCS: DocSpec[] = [
  { key: "id_document_path", label: "ID / Passport", icon: IdCard, hint: "Clear photo of your ID or passport (you can upload an existing file).", capture: "environment" },
  { key: "license_path", label: "Driver's License", icon: FileText, hint: "Front of your valid driver's license." },
  { key: "selfie_path", label: "Selfie holding ID", icon: Camera, hint: "Use the in-app camera. Hold your ID/passport next to your face.", capture: "user", liveOnly: true },
  { key: "vehicle_photo_path", label: "Vehicle Photo", icon: Car, hint: "Photo showing your vehicle and plate.", capture: "environment" },
];

interface DriverDocs {
  id?: string;
  id_document_path?: string | null;
  license_path?: string | null;
  selfie_path?: string | null;
  vehicle_photo_path?: string | null;
  vehicle_type?: string | null;
  vehicle_registration?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
}

function Onboarding() {
  const { user, approvalStatus } = useAuth();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<DriverDocs>({});
  const [loading, setLoading] = useState(true);
  const [uploadingKey, setUploadingKey] = useState<DocKey | "avatar" | null>(null);
  const [vehicleType, setVehicleType] = useState("Motorbike");
  const [vehicleReg, setVehicleReg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [cameraFor, setCameraFor] = useState<DocSpec | null>(null);
  const [avatarCameraOpen, setAvatarCameraOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string>("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data }, { data: prof }] = await Promise.all([
        supabase.from("driver_documents").select("*").eq("driver_id", user.id).maybeSingle(),
        supabase.from("profiles").select("avatar_url").eq("user_id", user.id).maybeSingle(),
      ]);
      if (prof?.avatar_url) setAvatarUrl(prof.avatar_url);
      if (data) {
        setDocs(data);
        setVehicleType(data.vehicle_type || "Motorbike");
        setVehicleReg(data.vehicle_registration || "");
        const keys: DocKey[] = ["id_document_path", "license_path", "selfie_path", "vehicle_photo_path"];
        const urls: Record<string, string> = {};
        await Promise.all(keys.map(async (k) => {
          const path = (data as any)[k];
          if (path) {
            const { data: signed } = await supabase.storage.from("driver-docs").createSignedUrl(path, 3600);
            if (signed?.signedUrl) urls[k] = signed.signedUrl;
          }
        }));
        setPreviews(urls);
      }
      setLoading(false);
    })();
  }, [user]);

  async function handleUpload(key: DocKey, file: File) {
    if (!user) throw new Error("Not signed in");
    setUploadingKey(key);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/${key}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("driver-docs").upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw new Error(error.message);

      const update: Partial<DriverDocs> = { [key]: path };
      const { error: dbError } = await supabase
        .from("driver_documents")
        .upsert({ driver_id: user.id, ...update } as any, { onConflict: "driver_id" });
      if (dbError) throw new Error(dbError.message);

      const { data: signed } = await supabase.storage.from("driver-docs").createSignedUrl(path, 3600);
      setDocs((p) => ({ ...p, [key]: path }));
      if (signed?.signedUrl) setPreviews((p) => ({ ...p, [key]: signed.signedUrl }));
      toast.success("Uploaded");
    } finally {
      setUploadingKey(null);
    }
  }

  async function handleAvatarUpload(file: File) {
    if (!user) throw new Error("Not signed in");
    setUploadingKey("avatar");
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw new Error(error.message);
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = pub.publicUrl;
      // Upsert so the row is created if the signup trigger never ran for this user.
      const { error: dbErr } = await supabase
        .from("profiles")
        .upsert(
          { user_id: user.id, avatar_url: url, full_name: user.user_metadata?.full_name ?? "", email: user.email ?? "" } as never,
          { onConflict: "user_id" }
        );
      if (dbErr) throw new Error(dbErr.message);
      setAvatarUrl(url);
      toast.success("Profile photo saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save photo");
    } finally {
      setUploadingKey(null);
    }
  }

  async function submitForReview() {
    if (!user) return;
    if (!avatarUrl) { toast.error("Add a profile photo so patients can recognise you."); return; }
    const allUploaded = DOCS.every((d) => (docs as any)[d.key]);
    if (!allUploaded) { toast.error("Please upload all documents."); return; }
    if (!vehicleReg.trim()) { toast.error("Enter your vehicle registration."); return; }
    setSubmitting(true);
    const { error } = await supabase.from("driver_documents").upsert({
      driver_id: user.id,
      vehicle_type: vehicleType,
      vehicle_registration: vehicleReg.trim(),
      submitted_at: new Date().toISOString(),
    } as any, { onConflict: "driver_id" });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Submitted for verification");
    navigate({ to: "/dashboard/driver" });
  }

  const completed = DOCS.filter((d) => (docs as any)[d.key]).length;
  const submitted = !!docs.submitted_at;
  const reviewed = !!docs.reviewed_at;

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="container-narrow px-4 sm:px-6 py-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link to="/dashboard/driver" className="text-xs text-muted-foreground hover:underline">← Back to dashboard</Link>
        <h1 className="text-2xl font-bold mt-2 flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-primary" /> Driver Verification</h1>
        <p className="text-sm text-muted-foreground mt-1">Upload your documents so admins can approve your account.</p>
      </div>

      {(submitted || approvalStatus === "approved") && (
        <div className={`healthcare-card p-4 mb-6 flex items-start gap-3 ${approvalStatus === "approved" ? "ring-1 ring-healthcare-green/40" : "ring-1 ring-primary/30"}`}>
          {approvalStatus === "approved" ? <CheckCircle2 className="h-5 w-5 text-healthcare-green shrink-0 mt-0.5" /> : <Clock className="h-5 w-5 text-primary shrink-0 mt-0.5" />}
          <div className="text-sm">
            <p className="font-semibold">{approvalStatus === "approved" ? "Verified" : reviewed ? "Reviewed" : "Submitted — awaiting admin review"}</p>
            {docs.review_notes && <p className="text-muted-foreground mt-1">Notes: {docs.review_notes}</p>}
          </div>
        </div>
      )}

      {/* Profile photo — shown to patients and pharmacies */}
      <div className="healthcare-card p-5 mb-6">
        <h2 className="font-semibold mb-3 flex items-center gap-2"><User className="h-4 w-4" /> Profile photo
          <span className="text-[10px] uppercase tracking-wide text-destructive">Required</span>
        </h2>
        <div className="flex items-center gap-4">
          {avatarUrl ? (
            <img src={avatarUrl} alt="You" className="h-20 w-20 rounded-full object-cover ring-2 ring-primary/40" />
          ) : (
            <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              <User className="h-8 w-8" />
            </div>
          )}
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-2">Patients and pharmacies see this photo so they know who's coming. Use a clear face shot.</p>
            <Button size="sm" variant="outline" onClick={() => setAvatarCameraOpen(true)} disabled={uploadingKey === "avatar"} className="gap-1">
              {uploadingKey === "avatar" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
              {avatarUrl ? "Retake photo" : "Take photo"}
            </Button>
          </div>
        </div>
      </div>

      <div className="healthcare-card p-5 mb-6">
        <h2 className="font-semibold mb-3 flex items-center gap-2"><Car className="h-4 w-4" /> Vehicle</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Vehicle type</Label>
            <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} className="w-full mt-1 h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option>Motorbike</option><option>Scooter</option><option>Car</option><option>Bicycle</option>
            </select>
          </div>
          <div>
            <Label className="text-xs">Registration plate</Label>
            <Input value={vehicleReg} onChange={(e) => setVehicleReg(e.target.value.toUpperCase())} placeholder="GP 123 ABC" className="mt-1" />
          </div>
        </div>
      </div>

      <div className="space-y-4 mb-6">
        {DOCS.map((spec) => {
          const uploaded = !!(docs as any)[spec.key];
          const preview = previews[spec.key];
          return (
            <div key={spec.key} className="healthcare-card p-5">
              <div className="flex items-start gap-4">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${uploaded ? "bg-healthcare-green/15 text-healthcare-green" : "bg-muted text-muted-foreground"}`}>
                  {uploaded ? <CheckCircle2 className="h-5 w-5" /> : <spec.icon className="h-5 w-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="font-semibold text-foreground">{spec.label}</p>
                    {uploaded && <span className="text-xs text-healthcare-green">Uploaded</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{spec.hint}</p>
                  {preview && <img src={preview} alt={spec.label} className="mt-3 h-24 w-24 object-cover rounded-md border border-border" />}
                  <div className="mt-3 flex gap-2 flex-wrap">
                    {spec.liveOnly ? (
                      <Button size="sm" variant="outline" onClick={() => setCameraFor(spec)} disabled={uploadingKey === spec.key} className="gap-2">
                        {uploadingKey === spec.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
                        {uploaded ? "Retake" : "Open camera"}
                      </Button>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setCameraFor(spec)} disabled={uploadingKey === spec.key} className="gap-2">
                          <Camera className="h-3 w-3" /> Camera
                        </Button>
                        <FileButton spec={spec} uploading={uploadingKey === spec.key} onFile={(f) => handleUpload(spec.key, f)} hasFile={uploaded} />
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 sticky bottom-4 bg-background/80 backdrop-blur p-3 rounded-lg border border-border">
        <span className="text-xs text-muted-foreground">{completed}/{DOCS.length} docs · {avatarUrl ? "photo ✓" : "photo missing"}</span>
        <Button onClick={submitForReview} disabled={submitting || completed < DOCS.length || !avatarUrl} className="gap-2">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {submitted ? "Re-submit for Review" : "Submit for Review"}
        </Button>
      </div>

      {/* In-app camera */}
      <CameraCapture
        open={!!cameraFor}
        onClose={() => setCameraFor(null)}
        onCapture={async (f) => { if (cameraFor) await handleUpload(cameraFor.key, f); }}
        title={cameraFor?.label || "Take photo"}
        hint={cameraFor?.hint}
        facing={cameraFor?.capture || "environment"}
        filenamePrefix={cameraFor?.key || "doc"}
      />
      <CameraCapture
        open={avatarCameraOpen}
        onClose={() => setAvatarCameraOpen(false)}
        onCapture={handleAvatarUpload}
        title="Profile photo"
        hint="A clear photo of your face. Patients will see this when you're delivering."
        facing="user"
        filenamePrefix="avatar"
      />
    </div>
  );
}

function FileButton({ spec, uploading, onFile, hasFile }: { spec: DocSpec; uploading: boolean; onFile: (f: File) => void; hasFile: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref} type="file" accept="image/*,application/pdf" {...(spec.capture ? { capture: spec.capture } : {})}
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
