import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Stethoscope, FileText, Clock, Video, Phone, Building2, X, Star, MessageCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AppointmentChatDialog } from "@/components/AppointmentChatDialog";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/patient/consultations")({
  head: () => ({ meta: [{ title: "My Consultations — HEALTHREACH" }] }),
  component: () => <RoleGuard allow="patient"><Page /></RoleGuard>,
});

interface Appt {
  id: string; doctor_id: string; hospital_id: string; scheduled_at: string;
  mode: string; status: string; payment_status: string;
  consultation_fee: number; platform_fee: number;
  reason: string; doctor_notes: string;
}
interface DocRow { id: string; user_id: string; full_name: string; specialty: string; photo_url: string }
interface Rx { id: string; appointment_id: string; kind: string; title: string; body: string;
  medication_name: string | null; dosage: string | null; instructions: string | null;
  valid_until: string | null; created_at: string }

function Page() {
  const { user } = useAuth();
  const [appts, setAppts] = useState<Appt[]>([]);
  const [docs, setDocs] = useState<Record<string, DocRow>>({});
  const [rxByAppt, setRxByAppt] = useState<Record<string, Rx[]>>({});
  const [reviewFor, setReviewFor] = useState<{ appointmentId: string; doctorId: string } | null>(null);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const [chatFor, setChatFor] = useState<{ appointmentId: string; appointmentType: "doctor" | "pharmacy"; providerUserId: string; name: string } | null>(null);
  const [pharmAppts, setPharmAppts] = useState<Array<{ id: string; pharmacy_id: string; reason: string; preferred_at: string; status: string; mode: string; pharmacist_notes: string | null }>>([]);
  const [pharms, setPharms] = useState<Record<string, { name: string }>>({});

  async function load() {
    if (!user) return;
    const { data } = await supabase.from("doctor_appointments").select("*").eq("patient_id", user.id).order("scheduled_at", { ascending: false });
    const list = (data ?? []) as Appt[];
    setAppts(list);
    const docIds = Array.from(new Set(list.map((a) => a.doctor_id)));
    if (docIds.length) {
      const { data: ds } = await supabase.from("doctors").select("id, user_id, full_name, specialty, photo_url").in("id", docIds);
      const m: Record<string, DocRow> = {};
      (ds ?? []).forEach((d: any) => { m[d.id] = d; });
      setDocs(m);
    }
    const apptIds = list.map((a) => a.id);
    if (apptIds.length) {
      const { data: rxs } = await supabase.from("e_prescriptions").select("*").in("appointment_id", apptIds);
      const m: Record<string, Rx[]> = {};
      (rxs ?? []).forEach((r: any) => { (m[r.appointment_id] ||= []).push(r); });
      setRxByAppt(m);
    }
    // Pharmacy appointments
    const { data: pa } = await supabase
      .from("pharmacy_appointments").select("id, pharmacy_id, reason, preferred_at, status, mode, pharmacist_notes")
      .eq("patient_id", user.id).order("preferred_at", { ascending: false });
    const pl = (pa ?? []) as typeof pharmAppts;
    setPharmAppts(pl);
    const pIds = Array.from(new Set(pl.map((p) => p.pharmacy_id)));
    if (pIds.length) {
      const { data: profs } = await supabase
        .from("profiles").select("user_id, full_name, organization_name").in("user_id", pIds);
      const m: Record<string, { name: string }> = {};
      (profs ?? []).forEach((p: any) => { m[p.user_id] = { name: p.organization_name || p.full_name || "Pharmacy" }; });
      setPharms(m);
    }
  }
  useEffect(() => {
    load();
    if (!user) return;
    const ch = supabase
      .channel(`patient-consult-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "doctor_appointments", filter: `patient_id=eq.${user.id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "pharmacy_appointments", filter: `patient_id=eq.${user.id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "e_prescriptions", filter: `patient_id=eq.${user.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  async function cancel(id: string) {
    await supabase.from("doctor_appointments").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", id);
    toast.success("Appointment cancelled"); load();
  }

  async function submitReview() {
    if (!reviewFor || !user) return;
    const { error } = await supabase.from("doctor_reviews").insert({
      doctor_id: reviewFor.doctorId, patient_id: user.id,
      appointment_id: reviewFor.appointmentId, stars, comment: comment.trim(),
    });
    if (error) return toast.error(error.message);
    toast.success("Review submitted"); setReviewFor(null); setComment(""); setStars(5);
  }

  return (
    <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Stethoscope className="h-6 w-6 text-primary" /> My Consultations
        </h1>
        <p className="text-sm text-muted-foreground">Appointments, prescriptions, sick notes and referrals.</p>
      </div>

      {appts.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
          No consultations yet. Find a doctor and book one.
        </div>
      )}

      {appts.map((a) => {
        const doc = docs[a.doctor_id];
        const rxs = rxByAppt[a.id] || [];
        return (
          <div key={a.id} className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-3">
            <div className="flex items-start gap-3">
              <div className="h-12 w-12 rounded-xl bg-healthcare-mint/30 flex items-center justify-center shrink-0 overflow-hidden">
                {doc?.photo_url ? <img src={doc.photo_url} alt="" className="h-full w-full object-cover" /> : <Building2 className="h-5 w-5 text-healthcare-teal" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-foreground">Dr. {doc?.full_name ?? "Doctor"}</p>
                <p className="text-xs text-healthcare-teal">{doc?.specialty}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <Clock className="h-3 w-3" /> {new Date(a.scheduled_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}
                  <span className="mx-1">·</span>
                  {a.mode === "video" ? <><Video className="h-3 w-3" /> Video</> :
                   a.mode === "phone" ? <><Phone className="h-3 w-3" /> Phone</> : "In-person"}
                </p>
                {a.reason && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.reason}</p>}
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
                }`}>{a.payment_status === "paid" ? "R15 paid" : "Booking fee pending"}</span>
              </div>
            </div>

            {a.doctor_notes && (
              <div className="rounded-xl bg-muted/40 p-3 text-xs text-foreground/80">
                <span className="font-semibold">Doctor's notes:</span> {a.doctor_notes}
              </div>
            )}

            {rxs.length > 0 && (
              <div className="space-y-2 pt-1">
                {rxs.map((r) => (
                  <div key={r.id} className="rounded-xl border border-border p-3 bg-healthcare-sky/5">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="h-4 w-4 text-healthcare-sky" />
                      <span className="text-xs font-bold uppercase tracking-wide text-healthcare-sky">{r.kind.replace("_", " ")}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">{new Date(r.created_at).toLocaleDateString("en-ZA")}</span>
                    </div>
                    {r.title && <p className="font-semibold text-sm text-foreground">{r.title}</p>}
                    {r.medication_name && <p className="text-sm text-foreground"><span className="font-medium">{r.medication_name}</span> {r.dosage && `· ${r.dosage}`}</p>}
                    {r.instructions && <p className="text-xs text-foreground/80 mt-1">{r.instructions}</p>}
                    {r.body && <p className="text-xs text-foreground/80 mt-1 whitespace-pre-wrap">{r.body}</p>}
                    {r.valid_until && <p className="text-[11px] text-muted-foreground mt-1">Valid until {new Date(r.valid_until).toLocaleDateString("en-ZA")}</p>}
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              {doc?.user_id && a.status !== "cancelled" && (
                <Button size="sm" variant="outline" onClick={() => setChatFor({ appointmentId: a.id, appointmentType: "doctor", providerUserId: doc.user_id, name: `Dr. ${doc.full_name}` })}>
                  <MessageCircle className="h-3.5 w-3.5 mr-1" /> Message doctor
                </Button>
              )}
              {a.status === "pending" || a.status === "confirmed" ? (
                <Button size="sm" variant="ghost" onClick={() => cancel(a.id)}><X className="h-3.5 w-3.5 mr-1" /> Cancel</Button>
              ) : null}
              {a.status === "completed" && (
                <Button size="sm" variant="outline" onClick={() => setReviewFor({ appointmentId: a.id, doctorId: a.doctor_id })}>
                  <Star className="h-3.5 w-3.5 mr-1" /> Leave review
                </Button>
              )}
            </div>
          </div>
        );
      })}

      {pharmAppts.length > 0 && (
        <div className="pt-4">
          <h2 className="text-lg font-bold text-foreground mb-2">Pharmacy bookings</h2>
          <div className="space-y-3">
            {pharmAppts.map((p) => (
              <div key={p.id} className="rounded-2xl border border-border bg-card p-4 space-y-2">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-healthcare-sky/15 flex items-center justify-center shrink-0">
                    <Building2 className="h-5 w-5 text-healthcare-sky" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-foreground truncate">{pharms[p.pharmacy_id]?.name || "Pharmacy"}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {new Date(p.preferred_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}
                      <span className="mx-1">·</span>{p.mode === "video" ? "Video" : p.mode === "phone" ? "Phone" : "In-person"}
                    </p>
                    {p.reason && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.reason}</p>}
                    {p.pharmacist_notes && <p className="text-xs text-foreground/80 mt-1"><span className="font-semibold">Pharmacist:</span> {p.pharmacist_notes}</p>}
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${
                    p.status === "confirmed" ? "bg-healthcare-green/15 text-healthcare-green" :
                    p.status === "cancelled" ? "bg-destructive/15 text-destructive" :
                    p.status === "completed" ? "bg-muted text-muted-foreground" :
                    "bg-healthcare-sky/15 text-healthcare-sky"
                  }`}>{p.status}</span>
                </div>
                {p.status !== "cancelled" && (
                  <Button size="sm" variant="outline" onClick={() => setChatFor({ appointmentId: p.id, appointmentType: "pharmacy", providerUserId: p.pharmacy_id, name: pharms[p.pharmacy_id]?.name || "Pharmacy" })}>
                    <MessageCircle className="h-3.5 w-3.5 mr-1" /> Message pharmacist
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}


      <Dialog open={!!reviewFor} onOpenChange={(o) => !o && setReviewFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Rate this consultation</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setStars(n)}>
                  <Star className={`h-7 w-7 ${n <= stars ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}`} />
                </button>
              ))}
            </div>
            <Textarea rows={4} placeholder="Tell others about your experience…" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} />
            <Button onClick={submitReview} className="w-full">Submit review</Button>
          </div>
        </DialogContent>
      </Dialog>

      {chatFor && user && (
        <AppointmentChatDialog
          open={!!chatFor}
          onClose={() => setChatFor(null)}
          appointmentId={chatFor.appointmentId}
          appointmentType="doctor"
          patientId={user.id}
          providerId={chatFor.providerUserId}
          myRole="patient"
          title={`Chat with ${chatFor.name}`}
          subtitle="Replies appear in real time"
        />
      )}
    </div>
  );
}
