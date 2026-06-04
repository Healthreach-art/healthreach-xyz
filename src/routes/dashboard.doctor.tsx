import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Stethoscope, Upload, Clock, CheckCircle2, AlertCircle, FileText, Calendar, MessageCircle } from "lucide-react";
import { AppointmentChatDialog } from "@/components/AppointmentChatDialog";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { submitDoctorDocuments } from "@/lib/doctor-verify.functions";
import { normalizeServices } from "@/lib/normalize-services.functions";
import { Sparkles, X } from "lucide-react";

export const Route = createFileRoute("/dashboard/doctor")({
  head: () => ({ meta: [{ title: "Doctor Dashboard — HEALTHREACH" }] }),
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
}

interface AvailRow {
  id: string; doctor_id: string; day_of_week: number;
  start_hour: number; end_hour: number; slot_minutes: number; is_active: boolean;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function DoctorDashboard() {
  const { user, approvalStatus, signOut, profile } = useAuth();
  const submit = useServerFn(submitDoctorDocuments);
  const normalize = useServerFn(normalizeServices);
  const [docs, setDocs] = useState<DocRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [appts, setAppts] = useState<any[]>([]);
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
  const [consultationFee, setConsultationFee] = useState<number>(450);
  const [city, setCity] = useState("");
  const [practiceAddress, setPracticeAddress] = useState("");
  const [servicesDescription, setServicesDescription] = useState("");
  const [servicesTags, setServicesTags] = useState<string[]>([]);
  const [subspecialties, setSubspecialties] = useState<string[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string>("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [apptFilter, setApptFilter] = useState<"new" | "upcoming" | "cancelled" | "history">("new");
  const [aiBusy, setAiBusy] = useState(false);

  async function load() {
    if (!user) return;
    setLoading(true);
    const [{ data: d }, { data: doc }] = await Promise.all([
      supabase.from("doctor_documents").select("*").eq("doctor_user_id", user.id).maybeSingle(),
      supabase.from("doctors").select("*").eq("user_id", user.id).maybeSingle(),
    ]);
    setDocs((d as DocRow) ?? null);
    setDoctorRow(doc);
    if (doc?.id) {
      const [{ data: a }, { data: av }] = await Promise.all([
        supabase.from("doctor_appointments").select("*").eq("doctor_id", doc.id).order("scheduled_at", { ascending: false }).limit(50),
        supabase.from("doctor_availability").select("*").eq("doctor_id", doc.id).order("day_of_week").order("start_hour"),
      ]);
      setAppts(a ?? []);
      setAvail((av ?? []) as AvailRow[]);
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
      setConsultationFee(Number(doc.consultation_fee ?? 450));
      setCity(doc.city ?? "");
      setPracticeAddress(doc.address ?? "");
      setServicesDescription((doc as any).services_description ?? "");
      setServicesTags(((doc as any).services_tags as string[]) ?? []);
      setSubspecialties(((doc as any).subspecialties as string[]) ?? []);
      setPhotoUrl((doc as any).photo_url ?? "");
    } else {
      setFullName(profile?.full_name ?? "");
    }
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  // Realtime — incoming appointments + availability changes flow in within seconds
  useEffect(() => {
    if (!doctorRow?.id) return;
    const ch = supabase
      .channel(`doctor-dash-${doctorRow.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "doctor_appointments", filter: `doctor_id=eq.${doctorRow.id}` }, async (payload) => {
        if (payload.eventType === "INSERT") toast.success("New appointment request");
        const { data: a } = await supabase.from("doctor_appointments").select("*").eq("doctor_id", doctorRow.id).order("scheduled_at", { ascending: false }).limit(50);
        setAppts(a ?? []);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "doctor_availability", filter: `doctor_id=eq.${doctorRow.id}` }, async () => {
        const { data: av } = await supabase.from("doctor_availability").select("*").eq("doctor_id", doctorRow.id).order("day_of_week").order("start_hour");
        setAvail((av ?? []) as AvailRow[]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [doctorRow?.id]);

  async function addAvail(dow: number) {
    if (!doctorRow?.id) return toast.error("Save your profile first");
    const { error } = await supabase.from("doctor_availability").insert({
      doctor_id: doctorRow.id, day_of_week: dow, start_hour: 9, end_hour: 17, slot_minutes: 30, is_active: true,
    });
    if (error) toast.error(error.message);
  }
  async function updateAvail(id: string, patch: Partial<AvailRow>) {
    const { error } = await supabase.from("doctor_availability").update(patch).eq("id", id);
    if (error) toast.error(error.message);
  }
  async function removeAvail(id: string) {
    const { error } = await supabase.from("doctor_availability").delete().eq("id", id);
    if (error) toast.error(error.message);
  }
  async function updateApptStatus(id: string, status: string) {
    const patch: any = { status };
    if (status === "completed") patch.completed_at = new Date().toISOString();
    if (status === "cancelled") patch.cancelled_at = new Date().toISOString();
    const { error } = await supabase.from("doctor_appointments").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    else toast.success(`Appointment ${status}`);
  }

  async function uploadTo(file: File, slot: string): Promise<string | null> {
    if (!user) return null;
    const ext = file.name.split(".").pop() || "bin";
    const path = `${user.id}/${slot}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("doctor-docs").upload(path, file, { upsert: true });
    if (error) {
      toast.error(error.message);
      return null;
    }
    return path;
  }

  async function saveProfile() {
    if (!user) return;
    setBusy(true);
    const payload = {
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
      hospital_id: null,
      is_active: false, // remains inactive until admin verifies
    };
    let error: any;
    if (doctorRow) {
      ({ error } = await supabase.from("doctors").update(payload).eq("id", doctorRow.id));
    } else {
      ({ error } = await supabase.from("doctors").insert(payload));
    }
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Profile saved");
    load();
  }

  async function runNormalize() {
    if (servicesDescription.trim().length < 10) {
      toast.error("Write a longer description first");
      return;
    }
    setAiBusy(true);
    try {
      const r = await normalize({ data: { text: servicesDescription.trim(), kind: "doctor" } });
      setSubspecialties(Array.from(new Set([...subspecialties, ...r.subspecialties])).slice(0, 40));
      setServicesTags(Array.from(new Set([...servicesTags, ...r.keywords, ...r.subspecialties])).slice(0, 80));
      toast.success(`AI added ${r.subspecialties.length} subspecialties + ${r.keywords.length} keywords`);
    } catch (e: any) {
      toast.error(e?.message ?? "AI failed");
    } finally {
      setAiBusy(false);
    }
  }

  async function submitDocs() {
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

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full healthcare-gradient">
            <Stethoscope className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Doctor Dashboard</h1>
            <p className="text-sm text-muted-foreground">{profile?.full_name || profile?.email}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={signOut}>Sign out</Button>
      </div>

      <Card className="mb-6 p-4">
        {isVerified ? (
          <div className="flex items-center gap-3 text-sm">
            <CheckCircle2 className="h-5 w-5 text-healthcare-green" />
            <span>Your account is verified. You appear in the public directory.</span>
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
                HEALTHREACH only connects patients with verified providers. Upload your HPCSA registration, ID, qualifications and malpractice cover. Admin verifies before patients can book you.
              </div>
            </div>
          </div>
        )}
      </Card>

      <Tabs defaultValue="appointments">
        <TabsList>
          <TabsTrigger value="appointments">
            Appointments {appts.length ? <Badge variant="secondary" className="ml-2">{appts.length}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="availability">Availability</TabsTrigger>
          <TabsTrigger value="profile">Public profile</TabsTrigger>
          <TabsTrigger value="docs">Legal documents</TabsTrigger>
        </TabsList>

        <TabsContent value="docs">
          <Card className="p-6 space-y-5">
            <p className="text-xs text-muted-foreground">
              South Africa: HPCSA registration is mandatory. Malpractice cover is required to take patients via HEALTHREACH.
            </p>

            <div className="space-y-2">
              <Label>HPCSA registration number *</Label>
              <Input value={hpcsaNumber} onChange={(e) => setHpcsaNumber(e.target.value)} placeholder="e.g. MP0123456" maxLength={64} />
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
              <Input type="date" value={malpracticeExpiry} onChange={(e) => setMalpracticeExpiry(e.target.value)} />
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
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={1000} />
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
                <Input type="number" value={consultationFee} onChange={(e) => setConsultationFee(Number(e.target.value))} min={0} />
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
                  <Button type="button" size="sm" variant="outline" onClick={runNormalize} disabled={aiBusy}>
                    {aiBusy ? "Analysing…" : (<><Sparkles className="h-3 w-3 mr-1" /> Build search tags</>)}
                  </Button>
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
          <Card className="p-6">
            {appts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No appointments yet. Once verified, patients can book you at{" "}
                <Link to="/doctors" className="underline">/doctors</Link>. New bookings appear here instantly.
              </p>
            ) : (
              <div className="divide-y">
                {appts.map((a) => (
                  <div key={a.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-medium">{new Date(a.scheduled_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}</div>
                        <div className="text-xs text-muted-foreground capitalize">{a.mode.replace("_", " ")} · {a.status}{a.reason ? ` · ${a.reason.slice(0, 60)}` : ""}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={a.payment_status === "paid" ? "default" : "secondary"}>{a.payment_status}</Badge>
                      <Button size="sm" variant="outline" onClick={() => setChatFor({ appointmentId: a.id, patientId: a.patient_id })}>
                        <MessageCircle className="h-3.5 w-3.5 mr-1" /> Message
                      </Button>
                      {a.status === "pending" && (
                        <Button size="sm" variant="outline" onClick={() => updateApptStatus(a.id, "confirmed")}>Accept</Button>
                      )}
                      {a.status === "pending" && (
                        <Button size="sm" variant="ghost" onClick={() => updateApptStatus(a.id, "cancelled")}>Decline</Button>
                      )}
                      {a.status === "confirmed" && (
                        <>
                          <Button size="sm" onClick={() => updateApptStatus(a.id, "completed")}>Mark complete</Button>
                          <Button size="sm" variant="ghost" onClick={() => updateApptStatus(a.id, "cancelled")}>Cancel</Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="availability">
          <Card className="p-6 space-y-4">
            <div>
              <p className="text-sm font-medium">Weekly availability</p>
              <p className="text-xs text-muted-foreground">
                Add a time window for each day you take bookings. Patients only see these slots on your public profile.
                {!doctorRow && " Save your public profile first."}
              </p>
            </div>
            <div className="space-y-3">
              {DOW.map((label, dow) => {
                const rows = avail.filter((a) => a.day_of_week === dow);
                return (
                  <div key={dow} className="rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold">{label}</p>
                      <Button size="sm" variant="outline" onClick={() => addAvail(dow)} disabled={!doctorRow}>
                        Add window
                      </Button>
                    </div>
                    {rows.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Closed</p>
                    ) : (
                      <div className="space-y-2">
                        {rows.map((r) => (
                          <div key={r.id} className="flex flex-wrap items-center gap-2 text-xs">
                            <Input type="number" min={0} max={23} value={r.start_hour}
                              onChange={(e) => updateAvail(r.id, { start_hour: Number(e.target.value) })}
                              className="w-20" />
                            <span>to</span>
                            <Input type="number" min={1} max={24} value={r.end_hour}
                              onChange={(e) => updateAvail(r.id, { end_hour: Number(e.target.value) })}
                              className="w-20" />
                            <span>· slot</span>
                            <Input type="number" min={10} max={240} step={5} value={r.slot_minutes}
                              onChange={(e) => updateAvail(r.id, { slot_minutes: Number(e.target.value) })}
                              className="w-24" />
                            <span>min</span>
                            <label className="ml-2 flex items-center gap-1">
                              <input type="checkbox" checked={r.is_active}
                                onChange={(e) => updateAvail(r.id, { is_active: e.target.checked })} />
                              Active
                            </label>
                            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => removeAvail(r.id)}>Remove</Button>
                          </div>
                        ))}
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

      </Tabs>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        HEALTHREACH is a discovery & booking platform only. All medical services, prescriptions, and treatment remain the responsibility of the doctor.
      </p>

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
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => ref.current?.click()}>
          <Upload className="mr-1 h-3 w-3" /> {currentPath ? "Replace" : "Upload"}
        </Button>
        {currentPath && <span className="truncate text-xs text-muted-foreground">{currentPath.split("/").pop()}</span>}
        <input ref={ref} type="file" className="hidden" accept="application/pdf,image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
      </div>
    </div>
  );
}

function MultiFileSlot({ label, paths, onUpload, onRemove }: { label: string; paths: string[]; onUpload: (f: File) => Promise<void>; onRemove: (p: string) => void; }) {
  const ref = useRef<HTMLInputElement>(null);
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
        <Button type="button" size="sm" variant="outline" onClick={() => ref.current?.click()}>
          <Upload className="mr-1 h-3 w-3" /> Add document
        </Button>
        <input ref={ref} type="file" className="hidden" accept="application/pdf,image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) { onUpload(f); e.target.value = ""; } }} />
      </div>
    </div>
  );
}
