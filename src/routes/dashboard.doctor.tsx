import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useAuth } from "@/hooks/useAuth";
import { firestoreClient } from "@/lib/firestore-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Stethoscope, Upload, Clock, CheckCircle2, AlertCircle, FileText, Calendar, MessageCircle, Video, MapPin, Phone } from "lucide-react";
import { AppointmentChatDialog } from "@/components/AppointmentChatDialog";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { submitDoctorDocuments } from "@/lib/doctor-verify.functions";
import { Sparkles, X } from "lucide-react";
import { DoctorBottomNav, type DoctorTab } from "@/components/DoctorBottomNav";
import { DoctorFinance } from "@/components/DoctorFinance";
import { Brand } from "@/components/Brand";
import { validDoctorPrice } from "@/lib/doctor-price-policy";

export const Route = createFileRoute("/dashboard/doctor")({
  head: () => ({ meta: [{ title: "Doctor Dashboard — HealthReachCare" }, { name: "description", content: "Manage your consultation prices, availability and patient appointments." }, { property: "og:title", content: "Doctor Dashboard — HealthReachCare" }, { property: "og:description", content: "Doctor consultation prices and appointments." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => (
    <RoleGuard allow="doctor">
      <DoctorDashboard />
    </RoleGuard>
  ),
});

interface DocRow {
  hpcsa_number: string | null;
  hpcsa_cert_path: string | null;
  id_document_path: string | null;
  qualification_paths: string[];
  malpractice_cert_path: string | null;
  malpractice_expires_at: string | null;
  practice_letter_path: string | null;
  indemnity_path: string | null;
  notes: string | null;
  submitted_at: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  requested_documents: string[];
}

interface AvailRow {
  id: string; doctor_id: string; day_of_week: number;
  start_hour: number; end_hour: number; slot_minutes: number; is_active: boolean;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function DoctorDashboard() {
  const { user, approvalStatus, signOut, profile } = useAuth();
  const submit = useServerFn(submitDoctorDocuments);
  const [docs, setDocs] = useState<DocRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [appts, setAppts] = useState<any[]>([]);
  const [patientNames, setPatientNames] = useState<Record<string, string>>({});
  const [doctorRow, setDoctorRow] = useState<any | null>(null);
  const [avail, setAvail] = useState<AvailRow[]>([]);
  const [chatFor, setChatFor] = useState<{ appointmentId: string; patientId: string } | null>(null);

  const [hpcsaNumber, setHpcsaNumber] = useState("");
  const [hpcsaPath, setHpcsaPath] = useState("");
  const [idPath, setIdPath] = useState("");
  const [qualPaths, setQualPaths] = useState<string[]>([]);
  const [malpracticePath, setMalpracticePath] = useState("");
  const [malpracticeExpiry, setMalpracticeExpiry] = useState("");
  const [practiceLetterPath, setPracticeLetterPath] = useState("");
  const [indemnityPath, setIndemnityPath] = useState("");
  const [notes, setNotes] = useState("");

  // Doctor profile fields (so they appear in the public directory after approval)
  const [fullName, setFullName] = useState("");
  const [specialty, setSpecialty] = useState("General Practitioner");
  const [qualifications, setQualifications] = useState("");
  const [practiceNumber, setPracticeNumber] = useState("");
  const [bio, setBio] = useState("");
  const [consultationFee, setConsultationFee] = useState<number | "">("");
  const [city, setCity] = useState("");
  const [practiceAddress, setPracticeAddress] = useState("");
  const [servicesDescription, setServicesDescription] = useState("");
  const [servicesTags, setServicesTags] = useState<string[]>([]);
  const [subspecialties, setSubspecialties] = useState<string[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string>("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [apptFilter, setApptFilter] = useState<"today" | "upcoming" | "pending" | "completed" | "cancelled">("today");
  const [tab, setTab] = useState<DoctorTab>("appointments");
  const [aiBusy, setAiBusy] = useState(false);

  async function load() {
    if (!user) return;
    setLoading(true);
    const [{ data: d }, { data: doc }] = await Promise.all([
      firestoreClient.from("doctor_documents").select("*").eq("doctor_user_id", user.id).maybeSingle(),
      firestoreClient.from("doctors").select("*").eq("user_id", user.id).maybeSingle(),
    ]);
    setDocs((d as DocRow) ?? null);
    setDoctorRow(doc);
    if (doc?.id) {
      const [{ data: a }, { data: av }] = await Promise.all([
        firestoreClient.from("doctor_appointments").select("*").eq("doctor_id", doc.id).order("scheduled_at", { ascending: false }).limit(50),
        firestoreClient.from("doctor_availability").select("*").eq("doctor_id", doc.id).order("day_of_week").order("start_hour"),
      ]);
      setAppts(a ?? []);
      setAvail((av ?? []) as AvailRow[]);
      const patientIds = Array.from(new Set((a ?? []).map((appointment) => appointment.patient_id).filter(Boolean)));
      if (patientIds.length) {
        const { data: patientProfiles, error: patientError } = await firestoreClient
          .from("profiles").select("user_id, full_name").in("user_id", patientIds);
        if (patientError) toast.error(`Could not load patient names: ${patientError.message}`);
        else setPatientNames(Object.fromEntries((patientProfiles ?? []).map((patient) => [patient.user_id, patient.full_name || "Patient"])));
      } else {
        setPatientNames({});
      }
    } else {
      setAppts([]); setAvail([]);
    }
    if (d) {
      setHpcsaNumber(d.hpcsa_number ?? "");
      setHpcsaPath(d.hpcsa_cert_path ?? "");
      setIdPath(d.id_document_path ?? "");
      setQualPaths(d.qualification_paths ?? []);
      setMalpracticePath(d.malpractice_cert_path ?? "");
      setMalpracticeExpiry(d.malpractice_expires_at ?? "");
      setPracticeLetterPath(d.practice_letter_path ?? "");
      setIndemnityPath(d.indemnity_path ?? "");
      setNotes(d.notes ?? "");
    }
    if (doc) {
      setFullName(doc.full_name ?? profile?.full_name ?? "");
      setSpecialty(doc.specialty ?? "General Practitioner");
      setQualifications(doc.qualifications ?? "");
      setPracticeNumber(doc.practice_number ?? "");
      setBio(doc.bio ?? "");
      setConsultationFee(doc.consultation_fee == null ? "" : Number(doc.consultation_fee));
      setCity(doc.city ?? "");
      setPracticeAddress(doc.address ?? "");
      setServicesDescription((doc as any).services_description ?? "");
      setServicesTags(((doc as any).services_tags as string[]) ?? []);
      setSubspecialties(((doc as any).subspecialties as string[]) ?? []);
      setPhotoUrl((doc as any).photo_url ?? profile?.avatar_url ?? "");
    } else {
      setFullName(profile?.full_name ?? "");
      setPhotoUrl(profile?.avatar_url ?? "");
    }

    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  // Realtime — incoming appointments + availability changes flow in within seconds
  useEffect(() => {
    if (!doctorRow?.id) return;
    const ch = firestoreClient
      .channel(`doctor-dash-${doctorRow.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "doctor_appointments", filter: `doctor_id=eq.${doctorRow.id}` }, async (payload) => {
        if (payload.eventType === "INSERT") toast.success("New appointment request");
        const { data: a } = await firestoreClient.from("doctor_appointments").select("*").eq("doctor_id", doctorRow.id).order("scheduled_at", { ascending: false }).limit(50);
        setAppts(a ?? []);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "doctor_availability", filter: `doctor_id=eq.${doctorRow.id}` }, async () => {
        const { data: av } = await firestoreClient.from("doctor_availability").select("*").eq("doctor_id", doctorRow.id).order("day_of_week").order("start_hour");
        setAvail((av ?? []) as AvailRow[]);
      })
      .subscribe();
    return () => { firestoreClient.removeChannel(ch); };
  }, [doctorRow?.id]);

  async function addAvail(dow: number) {
    if (!doctorRow?.id) return toast.error("Save your profile first");
    const { error } = await firestoreClient.from("doctor_availability").insert({
      doctor_id: doctorRow.id, day_of_week: dow, start_hour: 9, end_hour: 17, slot_minutes: 30, is_active: true,
    });
    if (error) toast.error(error.message);
  }
  async function toggleAvailDay(dow: number, rows: AvailRow[]) {
    if (!doctorRow?.id) return toast.error("Save your profile first");
    if (!rows.length) return addAvail(dow);
    const nextActive = !rows.some((row) => row.is_active);
    const results = await Promise.all(rows.map((row) => firestoreClient.from("doctor_availability").update({ is_active: nextActive }).eq("id", row.id)));
    const failed = results.find((result) => result.error);
    if (failed?.error) toast.error(failed.error.message);
    else toast.success(nextActive ? "Availability enabled for this day" : "Availability disabled for this day");
  }
  async function updateAvail(id: string, patch: Partial<AvailRow>) {
    const { error } = await firestoreClient.from("doctor_availability").update(patch).eq("id", id);
    if (error) toast.error(error.message);
  }
  async function removeAvail(id: string) {
    const { error } = await firestoreClient.from("doctor_availability").delete().eq("id", id);
    if (error) toast.error(error.message);
  }
  async function updateApptStatus(id: string, status: string) {
    const patch: any = { status };
    if (status === "completed") patch.completed_at = new Date().toISOString();
    if (status === "cancelled") patch.cancelled_at = new Date().toISOString();
    const { error } = await firestoreClient.from("doctor_appointments").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    else toast.success(`Appointment ${status}`);
  }

  async function uploadTo(file: File, slot: string): Promise<string | null> {
    if (!user) return null;
    try {
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const path = `${user.id}/${slot}-${Date.now()}.${ext}`;
      const { error } = await firestoreClient.storage.from("doctor-docs").upload(path, file, { upsert: true, contentType: file.type || "application/octet-stream" });
      if (error) throw error;

      // Persist draft immediately so files survive refresh and admins can see progress
      const draft: Record<string, unknown> = {
        doctor_user_id: user.id,
        hpcsa_number: hpcsaNumber || null,
        malpractice_expires_at: malpracticeExpiry || null,
        notes: notes || null,
      };
      if (slot === "hpcsa") draft.hpcsa_cert_path = path;
      else if (slot === "id") draft.id_document_path = path;
      else if (slot === "malpractice") draft.malpractice_cert_path = path;
      else if (slot === "practice") draft.practice_letter_path = path;
      else if (slot === "indemnity") draft.indemnity_path = path;
      else if (slot.startsWith("qual")) {
        const next = Array.from(new Set([...(qualPaths || []), path]));
        draft.qualification_paths = next;
      }
      if (Object.keys(draft).length > 1) {
        const { error: dbErr } = await firestoreClient
          .from("doctor_documents")
          .upsert(draft as never, { onConflict: "doctor_user_id" });
        if (dbErr) throw dbErr;
      }
      toast.success("Document uploaded");
      return path;
    } catch (error: any) {
      toast.error(error?.message ?? "Upload failed. Please try again.");
      return null;
    }
  }

  async function saveDocDraft(patch: Partial<DocRow>) {
    if (!user) return;
    const { error } = await firestoreClient
      .from("doctor_documents")
      .upsert({ doctor_user_id: user.id, ...patch } as never, { onConflict: "doctor_user_id" });
    if (error) toast.error(`Draft save failed: ${error.message}`);
  }

  async function uploadPhoto(file: File) {
    if (!user) return;
    setPhotoBusy(true);
    try {
      if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${user.id}/doctor-profile-${Date.now()}.${ext}`;
      const { error } = await firestoreClient.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data: pub } = firestoreClient.storage.from("avatars").getPublicUrl(path);
      setPhotoUrl(pub.publicUrl);
      // Persist on profiles.avatar_url so the photo survives refresh even before
      // the doctor row exists. Once the doctor row exists, mirror it there too.
      await firestoreClient.from("profiles").update({ avatar_url: pub.publicUrl }).eq("user_id", user.id);
      if (doctorRow) {
        const { error: upErr } = await firestoreClient.from("doctors").update({ photo_url: pub.publicUrl }).eq("id", doctorRow.id);
        if (upErr) throw upErr;
      }
      toast.success("Profile photo updated");
    } catch (error: any) {
      toast.error(error?.message ?? "Photo upload failed. Please try again.");
    } finally {
      setPhotoBusy(false);
    }
  }


  async function saveProfile() {
    if (!user) return;
    if (!validDoctorPrice(consultationFee)) return toast.error("Enter your consultation price in rand, with up to two decimal places.");
    setBusy(true);
    const payload: any = {
      user_id: user.id,
      full_name: fullName,
      specialty,
      qualifications,
      practice_number: practiceNumber,
      bio,
      consultation_fee: consultationFee,
      city,
      address: practiceAddress,
      services_description: servicesDescription.slice(0, 8000),
      services_tags: servicesTags,
      subspecialties,
      photo_url: photoUrl || undefined,
      hospital_id: null,
    };
    let error: any;
    if (doctorRow) {
      ({ error } = await firestoreClient.from("doctors").update(payload).eq("id", doctorRow.id));
    } else {
      ({ error } = await firestoreClient.from("doctors").insert({
        ...payload,
        is_active: false,
        is_demo: false,
        is_verified: false,
        verified_at: null,
      }));
    }
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Profile saved");
    load();
  }


  async function submitDocs() {
    if (!user) return;
    // Also update profile status to under_review so the dashboard gate reflects it.
    await firestoreClient.from("profiles").update({ approval_status: "under_review" }).eq("user_id", user.id);
    if (!hpcsaNumber || !hpcsaPath || !idPath || qualPaths.length === 0 || !malpracticePath) {
      toast.error("All required documents must be uploaded first");
      return;
    }
    setBusy(true);
    try {
      await submit({
        data: {
          hpcsa_number: hpcsaNumber,
          hpcsa_cert_path: hpcsaPath,
          id_document_path: idPath,
          qualification_paths: qualPaths,
          malpractice_cert_path: malpracticePath,
          malpractice_expires_at: malpracticeExpiry || undefined,
          practice_letter_path: practiceLetterPath || undefined,
          indemnity_path: indemnityPath || undefined,
          notes: notes || undefined,
        },
      });
      toast.success("Documents submitted for admin review");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Submission failed");
    } finally {
      setBusy(false);
    }
  }

  const isVerified = approvalStatus === "approved" && !!docs?.verified_at;
  const isPending = !!docs?.submitted_at && !docs?.verified_at && !docs?.rejection_reason;
  const wasRejected = !!docs?.rejection_reason;
  const requestedDocuments = docs?.requested_documents ?? [];
  const today = new Date().toDateString();
  const dashboardMetrics = [
    { label: "Today's appointments", value: appts.filter((appointment) => appointment.status !== "cancelled" && new Date(appointment.scheduled_at).toDateString() === today).length },
    { label: "Upcoming", value: appts.filter((appointment) => appointment.status === "confirmed" && new Date(appointment.scheduled_at).getTime() >= Date.now()).length },
    { label: "Pending review", value: appts.filter((appointment) => appointment.status === "pending").length },
    { label: "Completed", value: appts.filter((appointment) => appointment.status === "completed").length },
  ];

  return (
    <div className="container mx-auto max-w-6xl px-3 py-4 pb-24 sm:px-4 sm:py-8 sm:pb-24">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex min-w-0 items-center gap-4">
          <Brand />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Doctor workspace</p>
            <h1 className="truncate text-xl font-bold text-slate-900 sm:text-2xl">{profile?.full_name ? `Welcome, Dr. ${profile.full_name}` : "Welcome to your workspace"}</h1>
            <p className="truncate text-xs text-muted-foreground sm:text-sm">{profile?.email}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="rounded-xl" onClick={signOut}>Sign out</Button>
      </div>


      <Card className="mb-6 p-4">
        {isVerified ? (
          <div className="flex items-center gap-3 text-sm">
            <CheckCircle2 className="h-5 w-5 text-healthcare-green" />
            <span>Your account is verified. You appear in the public directory.</span>
          </div>
        ) : requestedDocuments.length > 0 ? (
          <div className="flex items-start gap-3 text-sm">
            <AlertCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">More documents requested</div>
              <div className="text-muted-foreground">Update and resubmit: {requestedDocuments.join(", ")}.</div>
            </div>
          </div>
        ) : isPending ? (
          <div className="flex items-center gap-3 text-sm">
            <Clock className="h-5 w-5 text-amber-500" />
            <span>Documents submitted. An admin is reviewing them — you'll be notified.</span>
          </div>
        ) : wasRejected ? (
          <div className="flex items-start gap-3 text-sm">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-destructive">Verification rejected</div>
              <div className="text-muted-foreground">{docs?.rejection_reason}</div>
              <div className="text-xs mt-1">Update your documents below and resubmit.</div>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 text-sm">
            <FileText className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">No document, no operation.</div>
              <div className="text-muted-foreground">
                HealthReachCare only connects patients with verified providers. Upload your HPCSA registration, ID, qualifications and malpractice cover. Admin verifies before patients can book you.
              </div>
            </div>
          </div>
        )}
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {dashboardMetrics.map((metric) => (
          <Card key={metric.label} className="rounded-2xl border-border/60 bg-white p-4 shadow-sm">
            <div className="text-xs text-muted-foreground">{metric.label}</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{metric.value}</div>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as DoctorTab)}>

        <TabsContent value="docs">
          <Card className="p-6 space-y-5">
            <p className="text-xs text-muted-foreground">
              South Africa: HPCSA registration is mandatory. Malpractice cover is required to take patients via HealthReachCare.
            </p>

            <div className="space-y-2">
              <Label>HPCSA registration number *</Label>
              <Input
                value={hpcsaNumber}
                onChange={(e) => setHpcsaNumber(e.target.value)}
                onBlur={() => saveDocDraft({ hpcsa_number: hpcsaNumber })}
                placeholder="e.g. MP0123456"
                maxLength={64}
              />
            </div>

            <FileSlot
              label="HPCSA registration certificate (PDF) *"
              currentPath={hpcsaPath}
              onUpload={async (f) => { const p = await uploadTo(f, "hpcsa"); if (p) setHpcsaPath(p); }}
            />
            <FileSlot
              label="South African ID / Passport *"
              currentPath={idPath}
              onUpload={async (f) => { const p = await uploadTo(f, "id"); if (p) setIdPath(p); }}
            />
            <MultiFileSlot
              label="Medical qualifications (degrees, diplomas) *"
              paths={qualPaths}
              onUpload={async (f) => {
                const p = await uploadTo(f, "qual");
                if (p) setQualPaths((prev) => [...prev, p]);
              }}
              onRemove={(p) => setQualPaths((prev) => prev.filter((x) => x !== p))}
            />
            <FileSlot
              label="Professional indemnity / malpractice cover *"
              currentPath={malpracticePath}
              onUpload={async (f) => { const p = await uploadTo(f, "malpractice"); if (p) setMalpracticePath(p); }}
            />
            <div className="space-y-2">
              <Label>Malpractice cover expiry</Label>
              <Input
                type="date"
                value={malpracticeExpiry}
                onChange={(e) => setMalpracticeExpiry(e.target.value)}
                onBlur={() => saveDocDraft({ malpractice_expires_at: malpracticeExpiry || null })}
              />
            </div>
            <FileSlot
              label="Practice / clinic letter (optional)"
              currentPath={practiceLetterPath}
              onUpload={async (f) => { const p = await uploadTo(f, "practice"); if (p) setPracticeLetterPath(p); }}
            />
            <FileSlot
              label="Additional indemnity proof (optional)"
              currentPath={indemnityPath}
              onUpload={async (f) => { const p = await uploadTo(f, "indemnity"); if (p) setIndemnityPath(p); }}
            />
            <div className="space-y-2">
              <Label>Notes for the reviewer</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => saveDocDraft({ notes })}
                rows={3}
                maxLength={1000}
              />
            </div>

            <Button onClick={submitDocs} disabled={busy} className="w-full">
              {busy ? "Submitting..." : isPending ? "Resubmit for review" : "Submit for admin review"}
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="profile">
          <Card className="p-6 space-y-4">
            <p className="text-xs text-muted-foreground">
              How patients will see you in the public directory. Only visible after admin verification.
            </p>

            <div className="flex items-center gap-4 rounded-xl border border-border p-4">
              <div className="h-20 w-20 rounded-full bg-healthcare-mint/30 overflow-hidden flex items-center justify-center shrink-0">
                {photoUrl ? (
                  <img src={photoUrl} alt="Profile" className="h-full w-full object-cover" />
                ) : (
                  <Stethoscope className="h-8 w-8 text-healthcare-teal" />
                )}
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium">Profile photo {photoUrl ? "" : <span className="text-destructive">*required</span>}</p>
                <p className="text-[11px] text-muted-foreground">Patients see this photo when searching. Use a clear, friendly head-shot.</p>
                <label className="inline-flex items-center gap-2 mt-1">
                  <Button type="button" size="sm" variant="outline" disabled={photoBusy} asChild>
                    <span><Upload className="h-3 w-3 mr-1" />{photoBusy ? "Uploading…" : photoUrl ? "Replace photo" : "Upload photo"}</span>
                  </Button>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = ""; }} />
                </label>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">

              <div className="space-y-2">
                <Label>Full name (as on HPCSA)</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} />
              </div>
              <div className="space-y-2">
                <Label>Specialty</Label>
                <Input value={specialty} onChange={(e) => setSpecialty(e.target.value)} maxLength={120} />
              </div>
              <div className="space-y-2">
                <Label>Qualifications</Label>
                <Input value={qualifications} onChange={(e) => setQualifications(e.target.value)} placeholder="e.g. MBChB (UCT), Dip Obs" maxLength={200} />
              </div>
              <div className="space-y-2">
                <Label>Practice number</Label>
                <Input value={practiceNumber} onChange={(e) => setPracticeNumber(e.target.value)} maxLength={64} />
              </div>
              <div className="space-y-2">
                <Label>Consultation fee (R)</Label>
                <Input aria-label="Consultation fee in rand" type="number" value={consultationFee} onChange={(e) => setConsultationFee(e.target.value === "" ? "" : Number(e.target.value))} min={0} step="0.01" required />
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} maxLength={120} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Practice address</Label>
                <Input value={practiceAddress} onChange={(e) => setPracticeAddress(e.target.value)} maxLength={300} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Short bio</Label>
                <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={1000} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Conditions, procedures & special interests (free text)</Label>
                <Textarea
                  value={servicesDescription}
                  onChange={(e) => setServicesDescription(e.target.value)}
                  rows={5}
                  maxLength={8000}
                  placeholder="E.g. I treat type-2 diabetes, hypertension, asthma, women's health, child immunisations, mental-health screening, minor wound suturing, contraception fitting…"
                />
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">{servicesDescription.length}/8000</span>
                </div>
                {(subspecialties.length > 0 || servicesTags.length > 0) && (
                  <div className="space-y-2 pt-2">
                    {subspecialties.length > 0 && (
                      <div>
                        <p className="text-[11px] uppercase font-bold text-muted-foreground mb-1">Subspecialties</p>
                        <div className="flex flex-wrap gap-1">
                          {subspecialties.map((t) => (
                            <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px]">
                              {t}
                              <button type="button" onClick={() => setSubspecialties(subspecialties.filter((x) => x !== t))} aria-label={`Remove ${t}`}><X className="h-3 w-3" /></button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {servicesTags.length > 0 && (
                      <div>
                        <p className="text-[11px] uppercase font-bold text-muted-foreground mb-1">Search keywords ({servicesTags.length})</p>
                        <div className="flex flex-wrap gap-1">
                          {servicesTags.map((t) => (
                            <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-[11px]">
                              {t}
                              <button type="button" onClick={() => setServicesTags(servicesTags.filter((x) => x !== t))} aria-label={`Remove ${t}`}><X className="h-3 w-3" /></button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <Button onClick={saveProfile} disabled={busy}>{busy ? "Saving..." : "Save profile"}</Button>
            {doctorRow && !doctorRow.is_verified && (
              <p className="text-xs text-muted-foreground">
                Profile saved but hidden from patients until an admin verifies your documents.
              </p>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="appointments">
          <Card className="p-6 space-y-4">
            {(() => {
              const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
              const startOfTomorrow = new Date(startOfToday); startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
              const buckets = {
                today: appts.filter((a) => a.status !== "cancelled" && new Date(a.scheduled_at).toDateString() === startOfToday.toDateString()),
                upcoming: appts.filter((a) => a.status === "confirmed" && new Date(a.scheduled_at).getTime() >= startOfTomorrow.getTime()),
                pending: appts.filter((a) => a.status === "pending"),
                completed: appts.filter((a) => a.status === "completed"),
                cancelled: appts.filter((a) => a.status === "cancelled" || a.status === "no_show"),
              } as const;
              const list = buckets[apptFilter];
              const tabs: { key: typeof apptFilter; label: string }[] = [
                { key: "today", label: "Today" },
                { key: "upcoming", label: "Upcoming" },
                { key: "pending", label: "Pending" },
                { key: "completed", label: "Completed" },
                { key: "cancelled", label: "Cancelled" },
              ];
              return (
                <>
                  <div className="flex flex-wrap gap-2">
                    {tabs.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setApptFilter(t.key)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${apptFilter === t.key ? "border-emerald-600 bg-emerald-600 text-white" : "border-border bg-white text-muted-foreground hover:text-foreground"}`}
                      >
                        {t.label}
                        {buckets[t.key].length > 0 && <span className="ml-1 opacity-80">({buckets[t.key].length})</span>}
                      </button>
                    ))}
                  </div>
                  {list.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                      {apptFilter === "today" && "No appointments scheduled for today."}
                      {apptFilter === "upcoming" && "No upcoming appointments."}
                      {apptFilter === "pending" && "No appointments are awaiting your review."}
                      {apptFilter === "completed" && "No completed appointments yet."}
                      {apptFilter === "cancelled" && "Nothing cancelled."}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {list.map((a) => (
                        <div key={a.id} className="rounded-xl border border-border/60 p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex items-start gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                                {a.mode === "video" ? <Video className="h-5 w-5" /> : a.mode === "phone" ? <Phone className="h-5 w-5" /> : <MapPin className="h-5 w-5" />}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-900">{patientNames[a.patient_id] ?? "Patient"}</p>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                  <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{new Date(a.scheduled_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}</span>
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 capitalize">{a.mode?.replace("_", " ") ?? "In-person"}</span>
                                  <Badge variant={a.status === "confirmed" ? "default" : "secondary"} className="capitalize">{a.status?.replace("_", " ")}</Badge>
                                </div>
                                {a.reason && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{a.reason}</p>}
                                {a.mode === "video" && <p className="mt-2 text-xs text-muted-foreground">Secure video meeting link is not available on this appointment yet.</p>}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                            <Button size="sm" variant="outline" className="rounded-lg" onClick={() => setChatFor({ appointmentId: a.id, patientId: a.patient_id })}>
                              <MessageCircle className="mr-1 h-3.5 w-3.5" /> Open Chat
                            </Button>
                            {a.status === "pending" && (
                              <>
                                <Button size="sm" className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => updateApptStatus(a.id, "confirmed")}>Accept</Button>
                                <Button size="sm" variant="ghost" onClick={() => updateApptStatus(a.id, "cancelled")}>Decline</Button>
                              </>
                            )}
                            {a.status === "confirmed" && (
                              <>
                                <Button size="sm" className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => updateApptStatus(a.id, "completed")}>Mark complete</Button>
                                <Button size="sm" variant="ghost" onClick={() => updateApptStatus(a.id, "cancelled")}>Cancel</Button>
                              </>
                            )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </Card>

        </TabsContent>

        <TabsContent value="availability">
          <Card className="p-6 space-y-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Weekly availability</p>
              <p className="text-xs text-muted-foreground">
                Toggle the days you accept appointments, then set the hours and slot duration. Patients only see active availability.
                {!doctorRow && " Save your public profile first."}
              </p>
            </div>
            <div className="space-y-3">
              {DOW.map((label, dow) => {
                const rows = avail.filter((a) => a.day_of_week === dow);
                const dayActive = rows.some((row) => row.is_active);
                return (
                  <div key={dow} className="rounded-xl border border-border/70 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div><p className="text-sm font-semibold text-slate-900">{label}</p><p className="text-xs text-muted-foreground">{dayActive ? "Available for appointments" : "Closed"}</p></div>
                      <Button type="button" size="sm" variant={dayActive ? "default" : "outline"} className={dayActive ? "rounded-lg bg-emerald-600 text-white hover:bg-emerald-700" : "rounded-lg"}
                        onClick={() => void toggleAvailDay(dow, rows)} disabled={!doctorRow} aria-pressed={dayActive}>
                        {dayActive ? "Available" : rows.length ? "Open day" : "Set hours"}
                      </Button>
                    </div>
                    {rows.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No hours set for this day.</p>
                    ) : (
                      <div className="space-y-2">
                        {rows.map((r) => (
                          <div key={r.id} className={`rounded-lg border p-3 ${r.is_active ? "border-emerald-100 bg-emerald-50/40" : "border-border/60 bg-slate-50/60 opacity-70"}`}>
                            <div className="flex flex-wrap items-center gap-2">
                              <label className="text-xs text-muted-foreground" htmlFor={`start-${r.id}`}>From</label>
                              <select id={`start-${r.id}`} value={r.start_hour} disabled={!r.is_active} onChange={(event) => updateAvail(r.id, { start_hour: Number(event.target.value) })} className="h-9 rounded-lg border border-input bg-white px-2 text-sm">
                                {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}
                              </select>
                              <label className="text-xs text-muted-foreground" htmlFor={`end-${r.id}`}>to</label>
                              <select id={`end-${r.id}`} value={r.end_hour} disabled={!r.is_active} onChange={(event) => updateAvail(r.id, { end_hour: Number(event.target.value) })} className="h-9 rounded-lg border border-input bg-white px-2 text-sm">
                                {Array.from({ length: 24 }, (_, index) => index + 1).map((hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}
                              </select>
                              <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={() => removeAvail(r.id)}>Remove window</Button>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <span className="text-xs text-muted-foreground">Appointment length</span>
                              {[15, 30, 45, 60].map((minutes) => (
                                <Button key={minutes} type="button" size="sm" variant={r.slot_minutes === minutes ? "default" : "outline"} disabled={!r.is_active}
                                  className={`h-8 rounded-full px-3 ${r.slot_minutes === minutes ? "bg-emerald-600 text-white hover:bg-emerald-700" : ""}`}
                                  onClick={() => updateAvail(r.id, { slot_minutes: minutes })}>{minutes} min</Button>
                              ))}
                              {!([15, 30, 45, 60] as number[]).includes(r.slot_minutes) && <span className="text-xs text-muted-foreground">Current: {r.slot_minutes} min</span>}
                            </div>
                          </div>
                        ))}
                        <Button type="button" size="sm" variant="outline" className="rounded-lg" onClick={() => addAvail(dow)} disabled={!doctorRow}>Add another time window</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              If you don't set any availability, your public page shows a default Mon–Fri 09:00–16:00 schedule.
            </p>
          </Card>
        </TabsContent>

        <TabsContent value="finance">
          <DoctorFinance appts={appts} defaultFee={Number(doctorRow?.consultation_fee ?? consultationFee)} />
        </TabsContent>

      </Tabs>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        HealthReachCare is a discovery & booking platform only. All medical services, prescriptions, and treatment remain the responsibility of the doctor.
      </p>

      <DoctorBottomNav activeTab={tab} onChange={setTab} />


      {chatFor && user && (
        <AppointmentChatDialog
          open={!!chatFor}
          onClose={() => setChatFor(null)}
          appointmentId={chatFor.appointmentId}
          appointmentType="doctor"
          patientId={chatFor.patientId}
          providerId={user.id}
          myRole="doctor"
          title="Chat with patient"
          subtitle="Replies appear in real time"
        />
      )}
    </div>
  );
}

function FileSlot({ label, currentPath, onUpload }: { label: string; currentPath: string; onUpload: (f: File) => Promise<void>; }) {
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  async function handleFile(file?: File) {
    if (!file) return;
    setUploading(true);
    try {
      await onUpload(file);
    } finally {
      setUploading(false);
      if (ref.current) ref.current.value = "";
    }
  }
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => ref.current?.click()}>
          <Upload className="mr-1 h-3 w-3" /> {uploading ? "Uploading…" : currentPath ? "Replace" : "Upload"}
        </Button>
        {currentPath && <span className="truncate text-xs text-muted-foreground">{currentPath.split("/").pop()}</span>}
        <input ref={ref} type="file" className="hidden" accept="application/pdf,image/*" onChange={(e) => void handleFile(e.target.files?.[0])} />
      </div>
    </div>
  );
}

function MultiFileSlot({ label, paths, onUpload, onRemove }: { label: string; paths: string[]; onUpload: (f: File) => Promise<void>; onRemove: (p: string) => void; }) {
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  async function handleFile(file?: File) {
    if (!file) return;
    setUploading(true);
    try {
      await onUpload(file);
    } finally {
      setUploading(false);
      if (ref.current) ref.current.value = "";
    }
  }
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="space-y-2">
        {paths.map((p) => (
          <div key={p} className="flex items-center gap-2 text-xs">
            <FileText className="h-3 w-3 text-muted-foreground" />
            <span className="flex-1 truncate text-muted-foreground">{p.split("/").pop()}</span>
            <Button type="button" size="sm" variant="ghost" onClick={() => onRemove(p)}>Remove</Button>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => ref.current?.click()}>
          <Upload className="mr-1 h-3 w-3" /> {uploading ? "Uploading…" : "Add document"}
        </Button>
        <input ref={ref} type="file" className="hidden" accept="application/pdf,image/*" onChange={(e) => void handleFile(e.target.files?.[0])} />
      </div>
    </div>
  );
}
