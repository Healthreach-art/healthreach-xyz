import { ArrowLeft,  createFileRoute } from "@tanstack/react-router";
import { ArrowLeft,  useEffect, useState } from "react";
import { ArrowLeft,  RoleGuard } from "@/components/RoleGuard";
import { ArrowLeft,  supabase } from "@/integrations/supabase/client";
import { ArrowLeft,  useAuth } from "@/hooks/useAuth";
import { ArrowLeft,  Button } from "@/components/ui/button";
import { ArrowLeft,  Input } from "@/components/ui/input";
import { ArrowLeft,  Label } from "@/components/ui/label";
import { ArrowLeft,  Textarea } from "@/components/ui/textarea";
import { ArrowLeft,  Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft,  Users, Plus, Trash2, Cake, AlertCircle, Heart, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { ArrowLeft,  toast } from "sonner";
import { ArrowLeft,  RecipientDocumentsBlock } from "@/components/RecipientDocumentsBlock";
import { ArrowLeft,  PrescriptionUploader, PrescriptionStatusBadge, type PrescriptionUpload } from "@/components/PrescriptionVerification";

export const Route = createFileRoute("/dashboard/patient/family")({
  head: () => ({ meta: [{ title: "Family Profiles — HealthReachCare" }] }),
  component: () => <RoleGuard allow="patient"><Page /></RoleGuard>,
});

interface Member {
  id: string; full_name: string; relationship: string; date_of_birth: string | null;
  allergies: string; conditions: string; notes: string;
}

function Page() {
  const { user } = useAuth();
  const [items, setItems] = useState<Member[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    full_name: "", relationship: "child", date_of_birth: "",
    allergies: "", conditions: "", notes: "",
  });
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!user) return;
    const { data } = await supabase.from("family_members").select("*").eq("user_id", user.id).order("created_at");
    setItems((data ?? []) as Member[]);
  }
  useEffect(() => { load(); }, [user]);

  async function add() {
    if (!user) return;
    if (!form.full_name.trim()) return toast.error("Name is required");
    setBusy(true);
    const { error } = await supabase.from("family_members").insert({
      user_id: user.id,
      full_name: form.full_name.trim(),
      relationship: form.relationship,
      date_of_birth: form.date_of_birth || null,
      allergies: form.allergies.trim(),
      conditions: form.conditions.trim(),
      notes: form.notes.trim(),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Family member added");
    setOpen(false);
    setForm({ full_name: "", relationship: "child", date_of_birth: "", allergies: "", conditions: "", notes: "" });
    load();
  }

  async function remove(id: string) {
    await supabase.from("family_members").delete().eq("id", id);
    toast.success("Removed");
    load();
  }

  return (
    <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
      <Link to="/dashboard/patient" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to Dashboard
      </Link>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> Family Profiles
          </h1>
          <p className="text-sm text-muted-foreground">Manage profiles for dependants you order medication for.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add member</Button>
      </div>

      {open && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Relationship</Label>
              <Select value={form.relationship} onValueChange={(v) => setForm({ ...form, relationship: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="child">Child</SelectItem>
                  <SelectItem value="spouse">Spouse / Partner</SelectItem>
                  <SelectItem value="parent">Parent</SelectItem>
                  <SelectItem value="sibling">Sibling</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date of birth</Label>
              <Input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Known allergies</Label>
              <Input placeholder="e.g. Penicillin" value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Chronic conditions</Label>
            <Input placeholder="e.g. Asthma, Diabetes" value={form.conditions} onChange={(e) => setForm({ ...form, conditions: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <Button onClick={add} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {items.length === 0 && !open && (
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            No family members yet. Add one to order on their behalf.
          </div>
        )}
        {items.map((m) => (
          <FamilyMemberCard key={m.id} member={m} onRemove={() => remove(m.id)} />
        ))}
      </div>
    </div>
  );
}

function FamilyMemberCard({ member, onRemove }: { member: Member; onRemove: () => void }) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [uploads, setUploads] = useState<PrescriptionUpload[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadUploads() {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("prescription_uploads")
      .select("*")
      .eq("patient_id", user.id)
      .eq("family_member_id" as never, member.id)
      .order("created_at", { ascending: false });
    setUploads((data ?? []) as PrescriptionUpload[]);
    setLoading(false);
  }

  useEffect(() => {
    if (expanded) loadUploads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-bold text-foreground">{member.full_name}</p>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{member.relationship}</p>
        </div>
        <Button size="icon" variant="ghost" onClick={onRemove}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
      {member.date_of_birth && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Cake className="h-3.5 w-3.5" /> {new Date(member.date_of_birth).toLocaleDateString("en-ZA", { dateStyle: "medium" })}</p>
      )}
      {member.allergies && (
        <p className="text-xs text-amber-600 flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> Allergies: {member.allergies}</p>
      )}
      {member.conditions && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Heart className="h-3.5 w-3.5" /> {member.conditions}</p>
      )}
      {member.notes && <p className="text-xs text-muted-foreground">{member.notes}</p>}

      <Button
        size="sm"
        variant="outline"
        className="w-full justify-between"
        onClick={() => setExpanded((x) => !x)}
      >
        <span className="inline-flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Documents & prescriptions</span>
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </Button>

      {expanded && (
        <div className="space-y-4 pt-2 border-t border-border">
          <RecipientDocumentsBlock familyMemberId={member.id} />

          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div>
              <h4 className="text-sm font-semibold text-foreground">Prescription library — {member.full_name}</h4>
              <p className="text-[11px] text-muted-foreground">
                Upload prescriptions issued in their name. They'll auto-attach when you order on their behalf.
              </p>
            </div>
            <PrescriptionUploader familyMemberId={member.id} onUploaded={() => loadUploads()} />
            {loading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : uploads.length === 0 ? (
              <p className="text-xs text-muted-foreground">No prescriptions yet for {member.full_name}.</p>
            ) : (
              <ul className="space-y-1.5">
                {uploads.map((u) => (
                  <li key={u.id} className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-2 py-1.5 text-xs">
                    <span>Uploaded {new Date(u.created_at).toLocaleDateString()}</span>
                    <PrescriptionStatusBadge status={u.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
