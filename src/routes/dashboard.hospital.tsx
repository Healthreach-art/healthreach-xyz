import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Stethoscope, Plus, Clock, CheckCircle2, X, FileText, Trash2, Edit2, Star, CalendarCheck } from "lucide-react";
import { RoleGuard } from "@/components/RoleGuard";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { issueEPrescription } from "@/lib/doctors.functions";

export const Route = createFileRoute("/dashboard/hospital")({
  head: () => ({ meta: [{ title: "Hospital Dashboard — HEALTHREACH" }] }),
  component: () => <RoleGuard allow="hospital"><HospitalDashboard /></RoleGuard>,
});

const SPECIALTIES = ["General Practitioner", "Dentist", "Optometrist", "Psychologist", "Pediatrician", "Gynecologist", "Cardiologist", "Dermatologist", "Other"];
const PROVIDERS = ["Discovery Health", "Bonitas", "Momentum Health", "Medihelp", "Fedhealth", "Bestmed", "GEMS", "Profmed", "Polmed"];

interface Doctor {
  id: string; full_name: string; specialty: string; qualifications: string;
  practice_number: string; bio: string; photo_url: string;
  consultation_fee: number; accepted_medical_aids: string[];
  online_available: boolean; in_person_available: boolean; phone_available: boolean;
  city: string; address: string; is_active: boolean;
  rating_avg: number; rating_count: number;
}

interface Appt {
  id: string; patient_id: string; doctor_id: string; scheduled_at: string;
  mode: string; status: string; payment_status: string; reason: string;
  consultation_fee: number; doctor_notes: string;
  use_medical_aid: boolean; medical_aid_provider: string | null; medical_aid_member_number: string | null;
}

function HospitalDashboard() {
  const { user, profile, approvalStatus, isDemo, signOut } = useAuth();
  const issueRx = useServerFn(issueEPrescription);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [patients, setPatients] = useState<Record<string, { full_name: string; phone: string }>>({});
  const [docDialog, setDocDialog] = useState<Partial<Doctor> | null>(null);
  const [rxFor, setRxFor] = useState<Appt | null>(null);

  async function load() {
    if (!user) return;
    const [{ data: ds }, { data: as }] = await Promise.all([
      supabase.from("doctors").select("*").eq("hospital_id", user.id).order("created_at", { ascending: false }),
      supabase.from("doctor_appointments").select("*").eq("hospital_id", user.id).order("scheduled_at", { ascending: false }),
    ]);
    setDoctors((ds ?? []) as Doctor[]);
    const list = (as ?? []) as Appt[];
    setAppts(list);
    const pids = Array.from(new Set(list.map((a) => a.patient_id)));
    if (pids.length) {
      const { data: ps } = await supabase.from("profiles").select("user_id, full_name, phone").in("user_id", pids);
      const m: Record<string, { full_name: string; phone: string }> = {};
      (ps ?? []).forEach((p: any) => { m[p.user_id] = { full_name: p.full_name || "", phone: p.phone || "" }; });
      setPatients(m);
    }
  }
  useEffect(() => { load(); }, [user]);

  if (approvalStatus === "pending") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="healthcare-card p-8 max-w-md text-center">
          <Clock className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-bold text-foreground">Pending Approval</h2>
          <p className="mt-2 text-sm text-muted-foreground">Your hospital account is awaiting admin approval.</p>
          <Button variant="outline" className="mt-6" onClick={signOut}>Sign Out</Button>
        </div>
      </div>
    );
  }

  async function saveDoctor() {
    if (!docDialog || !user) return;
    const payload: any = {
      hospital_id: user.id,
      full_name: (docDialog.full_name || "").trim(),
      specialty: docDialog.specialty || "General Practitioner",
      qualifications: docDialog.qualifications || "",
      practice_number: docDialog.practice_number || "",
      bio: docDialog.bio || "",
      photo_url: docDialog.photo_url || "",
      consultation_fee: Number(docDialog.consultation_fee || 0),
      accepted_medical_aids: docDialog.accepted_medical_aids || [],
      online_available: docDialog.online_available ?? true,
      in_person_available: docDialog.in_person_available ?? true,
      phone_available: docDialog.phone_available ?? false,
      city: docDialog.city || "",
      address: docDialog.address || "",
      is_active: docDialog.is_active ?? true,
    };
    if (!payload.full_name) return toast.error("Doctor name is required");
    let error;
    if (docDialog.id) {
      ({ error } = await supabase.from("doctors").update(payload).eq("id", docDialog.id));
    } else {
      ({ error } = await supabase.from("doctors").insert(payload));
    }
    if (error) return toast.error(error.message);
    toast.success("Saved"); setDocDialog(null); load();
  }

  async function delDoctor(id: string) {
    if (!confirm("Remove this doctor?")) return;
    await supabase.from("doctors").delete().eq("id", id);
    toast.success("Removed"); load();
  }

  async function setStatus(id: string, status: string) {
    const extra: any = {};
    if (status === "completed") extra.completed_at = new Date().toISOString();
    if (status === "cancelled") extra.cancelled_at = new Date().toISOString();
    await supabase.from("doctor_appointments").update({ status, ...extra }).eq("id", id);
    toast.success(`Marked ${status}`); load();
  }

  async function saveNotes(id: string, doctor_notes: string) {
    await supabase.from("doctor_appointments").update({ doctor_notes }).eq("id", id);
    toast.success("Notes saved"); load();
  }

  return (
    <div className="container-narrow px-4 sm:px-6 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Hospital Dashboard</h1>
          <p className="text-sm text-muted-foreground">{profile?.organization_name || "My Hospital"}</p>
        </div>
        <Button variant="outline" size="sm" onClick={signOut}>Sign Out</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <Stat icon={Stethoscope} label="Doctors" value={doctors.length} />
        <Stat icon={CalendarCheck} label="Appointments" value={appts.length} />
        <Stat icon={CheckCircle2} label="Completed" value={appts.filter((a) => a.status === "completed").length} />
      </div>

      <Tabs defaultValue="appointments">
        <TabsList>
          <TabsTrigger value="appointments">Appointments</TabsTrigger>
          <TabsTrigger value="doctors">Doctors</TabsTrigger>
        </TabsList>

        <TabsContent value="appointments" className="space-y-3 mt-4">
          {appts.length === 0 && <p className="text-sm text-muted-foreground">No appointments yet.</p>}
          {appts.map((a) => {
            const doc = doctors.find((d) => d.id === a.doctor_id);
            const p = patients[a.patient_id];
            return (
              <div key={a.id} className="rounded-2xl border border-border bg-card p-4 space-y-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-bold text-foreground">{p?.full_name || "Patient"} <span className="text-xs text-muted-foreground">· {p?.phone}</span></p>
                    <p className="text-xs text-healthcare-teal">Dr. {doc?.full_name} · {doc?.specialty}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(a.scheduled_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })} · {a.mode.replace("_", " ")}
                    </p>
                    {a.reason && <p className="text-xs text-foreground/80 mt-1 line-clamp-2">{a.reason}</p>}
                    {a.use_medical_aid && (
                      <p className="text-[11px] text-healthcare-sky mt-1">Medical aid: {a.medical_aid_provider} · #{a.medical_aid_member_number}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                      a.status === "confirmed" ? "bg-healthcare-green/15 text-healthcare-green" :
                      a.status === "completed" ? "bg-primary/15 text-primary" :
                      a.status === "cancelled" ? "bg-destructive/15 text-destructive" :
                      "bg-healthcare-sky/15 text-healthcare-sky"
                    }`}>{a.status}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      a.payment_status === "paid" ? "bg-healthcare-green/15 text-healthcare-green" : "bg-muted text-muted-foreground"
                    }`}>{a.payment_status}</span>
                  </div>
                </div>
                <Textarea rows={2} placeholder="Doctor's notes…" defaultValue={a.doctor_notes}
                  onBlur={(e) => e.target.value !== a.doctor_notes && saveNotes(a.id, e.target.value)} maxLength={2000} />
                <div className="flex flex-wrap gap-2">
                  {a.status === "pending" && <Button size="sm" onClick={() => setStatus(a.id, "confirmed")}>Confirm</Button>}
                  {a.status !== "completed" && a.status !== "cancelled" && (
                    <Button size="sm" variant="outline" onClick={() => setStatus(a.id, "completed")}>Mark completed</Button>
                  )}
                  {a.status !== "cancelled" && a.status !== "completed" && (
                    <Button size="sm" variant="ghost" onClick={() => setStatus(a.id, "cancelled")}><X className="h-3.5 w-3.5 mr-1" />Cancel</Button>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => setRxFor(a)}><FileText className="h-3.5 w-3.5 mr-1" />Issue prescription</Button>
                </div>
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="doctors" className="space-y-3 mt-4">
          <Button onClick={() => setDocDialog({ accepted_medical_aids: [], in_person_available: true, online_available: true })}>
            <Plus className="h-4 w-4 mr-1" /> Add doctor
          </Button>
          {doctors.length === 0 && <p className="text-sm text-muted-foreground">Add your first doctor to start receiving bookings.</p>}
          {doctors.map((d) => (
            <div key={d.id} className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-foreground">Dr. {d.full_name}</p>
                <p className="text-xs text-healthcare-teal">{d.specialty} · R{d.consultation_fee.toFixed(0)}</p>
                <p className="text-[11px] text-muted-foreground">{d.city} · {d.is_active ? "Active" : "Hidden"}{d.rating_count > 0 ? ` · ${d.rating_avg.toFixed(1)}★ (${d.rating_count})` : ""}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setDocDialog(d)}><Edit2 className="h-3.5 w-3.5" /></Button>
              <Button size="sm" variant="ghost" onClick={() => delDoctor(d.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
            </div>
          ))}
        </TabsContent>
      </Tabs>

      {/* Doctor edit dialog */}
      <Dialog open={!!docDialog} onOpenChange={(o) => !o && setDocDialog(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{docDialog?.id ? "Edit doctor" : "Add doctor"}</DialogTitle></DialogHeader>
          {docDialog && (
            <div className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div><Label>Full name *</Label><Input value={docDialog.full_name || ""} onChange={(e) => setDocDialog({ ...docDialog, full_name: e.target.value })} /></div>
                <div><Label>Specialty</Label>
                  <Select value={docDialog.specialty || "General Practitioner"} onValueChange={(v) => setDocDialog({ ...docDialog, specialty: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SPECIALTIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Qualifications</Label><Input value={docDialog.qualifications || ""} onChange={(e) => setDocDialog({ ...docDialog, qualifications: e.target.value })} placeholder="MBChB (UCT), …" /></div>
                <div><Label>Practice number</Label><Input value={docDialog.practice_number || ""} onChange={(e) => setDocDialog({ ...docDialog, practice_number: e.target.value })} /></div>
                <div><Label>Consultation fee (R)</Label><Input type="number" value={docDialog.consultation_fee || 0} onChange={(e) => setDocDialog({ ...docDialog, consultation_fee: Number(e.target.value) })} /></div>
                <div><Label>City</Label><Input value={docDialog.city || ""} onChange={(e) => setDocDialog({ ...docDialog, city: e.target.value })} /></div>
                <div className="sm:col-span-2"><Label>Address</Label><Input value={docDialog.address || ""} onChange={(e) => setDocDialog({ ...docDialog, address: e.target.value })} /></div>
                <div className="sm:col-span-2"><Label>Photo URL</Label><Input value={docDialog.photo_url || ""} onChange={(e) => setDocDialog({ ...docDialog, photo_url: e.target.value })} placeholder="https://…" /></div>
                <div className="sm:col-span-2"><Label>Bio</Label><Textarea rows={3} value={docDialog.bio || ""} onChange={(e) => setDocDialog({ ...docDialog, bio: e.target.value })} /></div>
              </div>
              <div className="space-y-1">
                <Label>Consultation modes</Label>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-2"><Checkbox checked={docDialog.in_person_available ?? true} onCheckedChange={(c) => setDocDialog({ ...docDialog, in_person_available: !!c })} /> In-person</label>
                  <label className="flex items-center gap-2"><Checkbox checked={docDialog.online_available ?? true} onCheckedChange={(c) => setDocDialog({ ...docDialog, online_available: !!c })} /> Video</label>
                  <label className="flex items-center gap-2"><Checkbox checked={docDialog.phone_available ?? false} onCheckedChange={(c) => setDocDialog({ ...docDialog, phone_available: !!c })} /> Phone</label>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Medical aids accepted</Label>
                <div className="grid grid-cols-2 gap-1.5 text-sm">
                  {PROVIDERS.map((p) => {
                    const checked = (docDialog.accepted_medical_aids || []).includes(p);
                    return (
                      <label key={p} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox checked={checked} onCheckedChange={(c) => {
                          const cur = new Set(docDialog.accepted_medical_aids || []);
                          if (c) cur.add(p); else cur.delete(p);
                          setDocDialog({ ...docDialog, accepted_medical_aids: Array.from(cur) });
                        }} /> {p}
                      </label>
                    );
                  })}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm pt-2">
                <Checkbox checked={docDialog.is_active ?? true} onCheckedChange={(c) => setDocDialog({ ...docDialog, is_active: !!c })} />
                Visible to patients
              </label>
            </div>
          )}
          <DialogFooter><Button onClick={saveDoctor}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Issue prescription dialog */}
      <Dialog open={!!rxFor} onOpenChange={(o) => !o && setRxFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Issue document</DialogTitle>
            <DialogDescription>Sent directly to the patient's profile.</DialogDescription>
          </DialogHeader>
          {rxFor && <RxForm appt={rxFor} onDone={() => { setRxFor(null); load(); }} issueRx={issueRx} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: number | string }) {
  return (
    <div className="healthcare-card p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold text-foreground">{value}</p>
        </div>
      </div>
    </div>
  );
}

function RxForm({ appt, onDone, issueRx }: { appt: Appt; onDone: () => void; issueRx: any }) {
  const [kind, setKind] = useState<"prescription" | "referral" | "sick_note">("prescription");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [med, setMed] = useState("");
  const [dose, setDose] = useState("");
  const [inst, setInst] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await issueRx({ data: {
        appointmentId: appt.id, kind, title: title.trim(), body: body.trim(),
        medicationName: med.trim() || undefined, dosage: dose.trim() || undefined,
        instructions: inst.trim() || undefined, validUntil: validUntil || undefined,
      }});
      toast.success("Document issued and sent to patient");
      onDone();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <div><Label>Type</Label>
        <Select value={kind} onValueChange={(v: any) => setKind(v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="prescription">Prescription</SelectItem>
            <SelectItem value="referral">Referral letter</SelectItem>
            <SelectItem value="sick_note">Sick note</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Antibiotics for tonsillitis" /></div>
      {kind === "prescription" && (
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Medication</Label><Input value={med} onChange={(e) => setMed(e.target.value)} /></div>
          <div><Label>Dosage</Label><Input value={dose} onChange={(e) => setDose(e.target.value)} placeholder="e.g. 500mg" /></div>
          <div className="col-span-2"><Label>Instructions</Label><Textarea rows={2} value={inst} onChange={(e) => setInst(e.target.value)} placeholder="e.g. 1 tablet 3x daily for 7 days" /></div>
        </div>
      )}
      {(kind === "referral" || kind === "sick_note") && (
        <div><Label>Body</Label><Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} /></div>
      )}
      <div><Label>Valid until (optional)</Label><Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></div>
      <Button onClick={submit} disabled={busy} className="w-full">{busy ? "Issuing…" : "Issue document"}</Button>
    </div>
  );
}
