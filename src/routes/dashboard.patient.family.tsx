import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Plus, Trash2, Cake, AlertCircle, Heart, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { RecipientDocumentsBlock } from "@/components/RecipientDocumentsBlock";
import { PrescriptionUploader, PrescriptionStatusBadge, type PrescriptionUpload } from "@/components/PrescriptionVerification";

export const Route = createFileRoute("/dashboard/patient/family")({
  head: () => ({ meta: [{ title: "Family Profiles — HEALTHREACH" }] }),
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

      <div className="grid sm:grid-cols-2 gap-4">
        {items.length === 0 && !open && (
          <div className="sm:col-span-2 rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            No family members yet. Add one to order on their behalf.
          </div>
        )}
        {items.map((m) => (
          <div key={m.id} className="rounded-2xl border border-border bg-card p-5 space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold text-foreground">{m.full_name}</p>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{m.relationship}</p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => remove(m.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
            {m.date_of_birth && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Cake className="h-3.5 w-3.5" /> {new Date(m.date_of_birth).toLocaleDateString("en-ZA", { dateStyle: "medium" })}</p>
            )}
            {m.allergies && (
              <p className="text-xs text-amber-600 flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> Allergies: {m.allergies}</p>
            )}
            {m.conditions && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Heart className="h-3.5 w-3.5" /> {m.conditions}</p>
            )}
            {m.notes && <p className="text-xs text-muted-foreground">{m.notes}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
