import { ArrowLeft,  createFileRoute } from "@tanstack/react-router";
import { ArrowLeft,  RoleGuard } from "@/components/RoleGuard";
import { ArrowLeft,  useEffect, useState } from "react";
import { ArrowLeft,  useAuth } from "@/hooks/useAuth";
import { ArrowLeft,  supabase } from "@/integrations/supabase/client";
import { ArrowLeft,  Button } from "@/components/ui/button";
import { ArrowLeft,  Input } from "@/components/ui/input";
import { ArrowLeft,  Label } from "@/components/ui/label";
import { ArrowLeft,  Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft,  Textarea } from "@/components/ui/textarea";
import { ArrowLeft,  toast } from "sonner";
import { ArrowLeft,  ShieldCheck, BadgeCheck, Clock } from "lucide-react";

const PROVIDERS = [
  "Discovery Health", "Bonitas", "Momentum Health", "Medihelp",
  "Fedhealth", "Bestmed", "Profmed", "GEMS", "Polmed", "Other",
];

export const Route = createFileRoute("/dashboard/patient/medical-aid")({
  head: () => ({ meta: [{ title: "Medical Aid — HealthReachCare" }] }),
  component: () => <RoleGuard allow="patient"><Page /></RoleGuard>,
});

function Page() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [ecName, setEcName] = useState("");
  const [ecPhone, setEcPhone] = useState("");
  const [provider, setProvider] = useState("");
  const [plan, setPlan] = useState("");
  const [memberNo, setMemberNo] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("none");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
      if (data) {
        setFullName(data.full_name || ""); setPhone(data.phone || "");
        setDob(data.date_of_birth || ""); setIdNumber(data.id_number || "");
        setEcName(data.emergency_contact_name || ""); setEcPhone(data.emergency_contact_phone || "");
        setProvider(data.medical_aid_provider || ""); setPlan(data.medical_aid_plan || "");
        setMemberNo(data.medical_aid_member_number || "");
        setNotes(data.medical_aid_notes || "");
        setStatus(data.medical_aid_verification_status || "none");
      }
      setLoading(false);
    })();
  }, [user]);

  async function save() {
    if (!user) return;
    setBusy(true);
    const newStatus = provider && memberNo ? (status === "verified" ? "verified" : "pending") : "none";
    const { error } = await supabase.from("profiles").update({
      full_name: fullName.trim(),
      phone: phone.trim() || null,
      date_of_birth: dob || null,
      id_number: idNumber.trim() || null,
      emergency_contact_name: ecName.trim() || null,
      emergency_contact_phone: ecPhone.trim() || null,
      medical_aid_provider: provider || null,
      medical_aid_plan: plan.trim() || null,
      medical_aid_member_number: memberNo.trim() || null,
      medical_aid_notes: notes.trim() || null,
      medical_aid_verification_status: newStatus,
    }).eq("user_id", user.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    setStatus(newStatus);
    toast.success("Saved. Your medical aid details will be verified by our team.");
  }

  if (loading) return <div className="container-narrow px-4 sm:px-6 py-8 text-sm text-muted-foreground">Loading…</div>;
      <Link to="/dashboard/patient" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to Dashboard
      </Link>

  return (
    <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
      <Link to="/dashboard/patient" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to Dashboard
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" /> Personal & Medical Aid
        </h1>
        <p className="text-sm text-muted-foreground">Saved once, used for every doctor appointment.</p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-4 shadow-sm">
        <h2 className="font-bold text-foreground">Patient details</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label>Full name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} /></div>
          <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} /></div>
          <div><Label>Date of birth</Label><Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></div>
          <div><Label>ID / Passport number</Label><Input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} maxLength={40} /></div>
          <div><Label>Emergency contact name</Label><Input value={ecName} onChange={(e) => setEcName(e.target.value)} maxLength={120} /></div>
          <div><Label>Emergency contact phone</Label><Input value={ecPhone} onChange={(e) => setEcPhone(e.target.value)} maxLength={40} /></div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-foreground">Medical aid (optional)</h2>
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1 ${
            status === "verified" ? "bg-healthcare-green/15 text-healthcare-green" :
            status === "pending" ? "bg-healthcare-sky/15 text-healthcare-sky" :
            "bg-muted text-muted-foreground"
          }`}>
            {status === "verified" ? <><BadgeCheck className="h-3 w-3" /> Verified</> :
             status === "pending" ? <><Clock className="h-3 w-3" /> Pending verification</> :
             "Not provided"}
          </span>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
              <SelectContent>{PROVIDERS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Plan / package</Label><Input value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="e.g. Classic Saver" maxLength={120} /></div>
          <div className="sm:col-span-2"><Label>Membership number</Label><Input value={memberNo} onChange={(e) => setMemberNo(e.target.value)} maxLength={120} /></div>
          <div className="sm:col-span-2"><Label>Notes (optional)</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          We don't auto-verify with medical aids — your details are submitted to our team and confirmed within 24 hours during business days.
        </p>
      </div>

      <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save details"}</Button>
    </div>
  );
}
