import { useEffect, useState } from "react";
import { firestoreClient } from "@/lib/firestore-client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AddressPicker, type PickedAddress } from "@/components/AddressPicker";
import { toast } from "sonner";
import { MapPin, Plus, Trash2, Star, StarOff, Pencil, X, Building2 } from "lucide-react";

type Branch = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  phone: string | null;
  service_radius_km: number;
  is_primary: boolean;
  is_active: boolean;
  created_at?: string | null;
};

const empty = { name: "", phone: "", service_radius_km: 60, is_primary: false };

export function PharmacyBranchesManager() {
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [picked, setPicked] = useState<PickedAddress | null>(null);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data, error } = await firestoreClient
      .from("pharmacy_branches")
      .select("*")
      .eq("pharmacy_id", user.id);
    if (error) {
      console.warn("pharmacy_branches query:", error.message);
    }

    const list = ((data as Branch[]) || []).sort((a, b) => {
      if (Boolean(b.is_primary) !== Boolean(a.is_primary)) {
        return b.is_primary ? 1 : -1;
      }
      return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
    });

    setBranches(list);
    setLoading(false);
  }

  useEffect(() => { load(); }, [user?.id]);

  function resetForm() {
    setForm(empty);
    setPicked(null);
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(b: Branch) {
    setEditingId(b.id);
    setForm({
      name: b.name,
      phone: b.phone || "",
      service_radius_km: b.service_radius_km,
      is_primary: b.is_primary,
    });
    setPicked({ address: b.address, lat: b.latitude, lng: b.longitude });
    setShowForm(true);
  }

  async function save() {
    if (!user) return;
    if (!form.name.trim()) { toast.error("Branch name required"); return; }
    if (!picked) { toast.error("Pick an address from the map"); return; }
    setBusy(true);
    const payload = {
      pharmacy_id: user.id,
      name: form.name.trim(),
      address: picked.address,
      latitude: picked.lat,
      longitude: picked.lng,
      phone: form.phone || "",
      service_radius_km: Number(form.service_radius_km) || 60,
      is_primary: form.is_primary,
      is_active: true,
    };
    const { error } = editingId
      ? await firestoreClient.from("pharmacy_branches").update(payload).eq("id", editingId)
      : await firestoreClient.from("pharmacy_branches").insert(payload);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editingId ? "Branch updated" : "Branch added");
    resetForm();
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this branch?")) return;
    const { error } = await firestoreClient.from("pharmacy_branches").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Branch removed");
    load();
  }

  async function makePrimary(id: string) {
    const { error } = await firestoreClient.from("pharmacy_branches").update({ is_primary: true }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    load();
  }

  async function toggleActive(b: Branch) {
    const { error } = await firestoreClient.from("pharmacy_branches").update({ is_active: !b.is_active }).eq("id", b.id);
    if (error) { toast.error(error.message); return; }
    load();
  }

  return (
    <div className="healthcare-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Building2 className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Branches & extra locations</h3>
        <span className="ml-auto text-xs text-muted-foreground">{branches.length} location{branches.length === 1 ? "" : "s"}</span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Add every branch of your pharmacy. Orders within each branch's service radius will route to your pharmacy automatically.
      </p>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-2">
          {branches.map((b) => (
            <div key={b.id} className="rounded-md border border-border bg-muted/20 p-3">
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">{b.name}</p>
                    {b.is_primary && <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/10 text-primary">Primary</span>}
                    {!b.is_active && <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Inactive</span>}
                  </div>
                  <p className="text-xs text-muted-foreground leading-snug mt-0.5">{b.address}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Radius {b.service_radius_km} km{b.phone ? ` · ${b.phone}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {!b.is_primary && (
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => makePrimary(b.id)}>
                    <Star className="h-3 w-3 mr-1" /> Make primary
                  </Button>
                )}
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => startEdit(b)}>
                  <Pencil className="h-3 w-3 mr-1" /> Edit
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => toggleActive(b)}>
                  {b.is_active ? <><StarOff className="h-3 w-3 mr-1" /> Disable</> : <>Enable</>}
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => remove(b.id)}>
                  <Trash2 className="h-3 w-3 mr-1" /> Delete
                </Button>
              </div>
            </div>
          ))}
          {branches.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No extra branches yet. Add your first one below.</p>
          )}
        </div>
      )}

      {!showForm ? (
        <Button size="sm" className="mt-4 w-full" onClick={() => setShowForm(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add branch / location
        </Button>
      ) : (
        <div className="mt-4 rounded-md border border-dashed border-border p-3 space-y-3">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold">{editingId ? "Edit branch" : "New branch"}</h4>
            <Button variant="ghost" size="sm" className="ml-auto h-7 px-2" onClick={resetForm}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="branch-name" className="text-xs">Branch name</Label>
            <Input id="branch-name" placeholder="e.g. Sandton City" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Address</Label>
            <AddressPicker value={picked} onChange={setPicked} placeholder="Branch address…" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="branch-phone" className="text-xs">Phone (optional)</Label>
              <Input id="branch-phone" placeholder="+27…" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branch-radius" className="text-xs">Service radius (km)</Label>
              <Input id="branch-radius" type="number" min={1} max={500} value={form.service_radius_km} onChange={(e) => setForm({ ...form, service_radius_km: Number(e.target.value) })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={form.is_primary} onChange={(e) => setForm({ ...form, is_primary: e.target.checked })} />
            Set as primary branch
          </label>
          <Button size="sm" className="w-full" onClick={save} disabled={busy}>
            {busy ? "Saving…" : editingId ? "Update branch" : "Add branch"}
          </Button>
        </div>
      )}
    </div>
  );
}
