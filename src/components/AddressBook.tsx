import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddressPicker } from "@/components/AddressPicker";
import { MapPin, Plus, Star, Trash2, Home, Briefcase } from "lucide-react";
import { toast } from "sonner";

interface Address {
  id: string;
  label: string;
  street: string;
  is_default: boolean;
  lat: number | null;
  lng: number | null;
  notes: string | null;
}

const labelIcon = (l: string) => (l.toLowerCase().includes("work") ? Briefcase : Home);

export function AddressBook() {
  const { user } = useAuth();
  const [items, setItems] = useState<Address[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ label: "Home", street: "", notes: "", lat: null as number | null, lng: null as number | null });
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!user) return;
    const { data } = await supabase.from("user_addresses").select("*").eq("user_id", user.id).order("is_default", { ascending: false });
    setItems((data ?? []) as Address[]);
  }
  useEffect(() => { load(); }, [user]);

  async function add() {
    if (!user) return;
    if (!form.street.trim() || form.lat == null || form.lng == null) {
      toast.error("Please pick a real address from the suggestions or use current location");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("user_addresses").insert({
      user_id: user.id,
      label: form.label.trim() || "Home",
      street: form.street.trim(),
      notes: form.notes.trim() || null,
      lat: form.lat,
      lng: form.lng,
      is_default: items.length === 0,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Address saved");
    setAdding(false);
    setForm({ label: "Home", street: "", notes: "", lat: null, lng: null });
    load();
  }

  async function remove(id: string) {
    await supabase.from("user_addresses").delete().eq("id", id);
    load();
  }

  async function setDefault(id: string) {
    if (!user) return;
    await supabase.from("user_addresses").update({ is_default: true }).eq("id", id).eq("user_id", user.id);
    toast.success("Default delivery address updated");
    load();
  }

  // Address picker now handles geolocation + autocomplete.

  return (
    <div className="healthcare-card p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" /> Saved Addresses
        </h2>
        <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>

      {items.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground">No saved addresses yet.</p>
      )}

      <div className="space-y-2">
        {items.map((a) => {
          const Icon = labelIcon(a.label);
          return (
            <div key={a.id} className={`rounded-lg border p-3 ${a.is_default ? "border-primary bg-primary/5" : "border-border"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-primary" />
                    <p className="text-sm font-medium">{a.label}</p>
                    {a.is_default && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">Default</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{a.street}</p>
                  {a.notes && <p className="text-[11px] text-muted-foreground mt-0.5">📝 {a.notes}</p>}
                  {a.lat && a.lng && <p className="text-[10px] text-muted-foreground mt-0.5">📍 {a.lat.toFixed(4)}, {a.lng.toFixed(4)}</p>}
                </div>
                <div className="flex items-center gap-1">
                  {!a.is_default && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDefault(a.id)}>
                      <Star className="h-3 w-3" /> Set default
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => remove(a.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {adding && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <div className="grid grid-cols-3 gap-2">
            {["Home", "Work", "Other"].map((l) => (
              <button key={l} onClick={() => setForm({ ...form, label: l })}
                className={`text-xs rounded-md border py-1.5 ${form.label === l ? "border-primary bg-primary/10 text-primary" : "border-border bg-card"}`}>
                {l}
              </button>
            ))}
          </div>
          <AddressPicker
            value={form.lat && form.lng ? { address: form.street, lat: form.lat, lng: form.lng } : null}
            onChange={(a) => setForm({ ...form, street: a.address, lat: a.lat, lng: a.lng })}
            placeholder="Start typing your address…"
          />
          <Input placeholder="Delivery notes (gate code, building...)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setAdding(false)} className="flex-1">Cancel</Button>
            <Button size="sm" onClick={add} disabled={busy} className="flex-1">{busy ? "Saving..." : "Save address"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
