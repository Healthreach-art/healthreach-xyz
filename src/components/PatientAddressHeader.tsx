import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { MapPin, Plus, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { firestoreClient } from "@/lib/firestore-client";
import { AddressPicker, type PickedAddress } from "@/components/AddressPicker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PATIENT_ADDRESS_CHANGED, readPatientAddress, setPatientAddress, type PatientAddress } from "@/lib/patient-address";
import { toast } from "sonner";

interface SavedAddress extends Omit<PatientAddress, "address"> {
  id: string;
  street: string;
  is_default: boolean;
}

export function PatientAddressHeader() {
  const { user, profile } = useAuth();
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [active, setActive] = useState<PatientAddress | null>(null);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<PickedAddress | null>(null);
  const [label, setLabel] = useState("Home");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const saved = readPatientAddress(user.id);
    setActive(saved ?? (profile?.address ? { address: profile.address, lat: null, lng: null } : null));
    setLoading(true);
    firestoreClient.from("user_addresses").select("id, label, street, is_default, lat, lng")
      .eq("user_id", user.id).order("is_default", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoading(false);
        if (error) { toast.error(`Could not load saved addresses: ${error.message}`); return; }
        const rows = (data ?? []) as SavedAddress[];
        setAddresses(rows);
        const current = saved && rows.find((row) => row.id === saved.id || row.street === saved.address);
        const initial = current
          ? { id: current.id, label: current.label, address: current.street, lat: current.lat, lng: current.lng }
          : saved ?? (rows[0] ? { id: rows[0].id, label: rows[0].label, address: rows[0].street, lat: rows[0].lat, lng: rows[0].lng } : null);
        if (initial) {
          setActive(initial);
          setPatientAddress(user.id, initial);
        }
      });
    return () => { cancelled = true; };
  }, [user?.id, profile?.address]);

  useEffect(() => {
    const onChange = (event: Event) => setActive((event as CustomEvent<PatientAddress>).detail);
    window.addEventListener(PATIENT_ADDRESS_CHANGED, onChange);
    return () => window.removeEventListener(PATIENT_ADDRESS_CHANGED, onChange);
  }, []);

  function choose(address: PatientAddress) {
    if (!user) return;
    setActive(address);
    setPatientAddress(user.id, address);
    setOpen(false);
  }

  async function saveNewAddress() {
    if (!user || !picked) return;
    setSaving(true);
    const { data, error } = await firestoreClient.from("user_addresses").insert({
      user_id: user.id,
      label: label.trim() || "Home",
      street: picked.address,
      lat: picked.lat,
      lng: picked.lng,
      is_default: addresses.length === 0,
    }).select("id, label, street, is_default, lat, lng").single();
    setSaving(false);
    if (error || !data) { toast.error(error?.message ?? "Could not save address"); return; }
    const row = data as SavedAddress;
    setAddresses((current) => [...current, row]);
    choose({ id: row.id, label: row.label, address: row.street, lat: row.lat, lng: row.lng });
    setPicked(null);
    setLabel("Home");
    toast.success("Address saved and selected");
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 shrink-0 text-healthcare-green" />
          <span className="shrink-0 font-semibold">
            Delivering to {profile?.full_name ? profile.full_name : ""}{active?.label ? ` · ${active.label}` : ""}
          </span>
          <span className="min-w-0 truncate text-muted-foreground">{active?.address ?? "Choose an address"}</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          {active ? "Change" : "Add address"}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Delivery address</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {loading && <div className="flex justify-center py-3"><Loader2 className="h-5 w-5 animate-spin" /></div>}
            {addresses.map((address) => {
              const selected = address.id === active?.id || address.street === active?.address;
              return (
                <button key={address.id} type="button" onClick={() => choose({ id: address.id, label: address.label, address: address.street, lat: address.lat, lng: address.lng })}
                  className={`flex w-full items-start gap-3 border p-3 text-left ${selected ? "border-primary bg-primary/5" : "border-border hover:bg-accent"}`}>
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1"><strong className="block text-sm">{address.label || "Saved address"}</strong><span className="block truncate text-xs text-muted-foreground">{address.street}</span></span>
                  {selected && <Check className="h-4 w-4 text-primary" />}
                </button>
              );
            })}
            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex items-center gap-2 text-sm font-semibold"><Plus className="h-4 w-4" /> Add new address</div>
              <div className="flex gap-2">
                {["Home", "Work", "Other"].map((value) => <Button key={value} type="button" size="sm" variant={label === value ? "default" : "outline"} onClick={() => setLabel(value)}>{value}</Button>)}
              </div>
              <AddressPicker value={picked} onChange={setPicked} placeholder="Search an address or use current location" />
              <Button className="w-full" onClick={saveNewAddress} disabled={!picked || saving}>
                {saving ? "Saving…" : "Save and use this address"}
              </Button>
            </div>
            <Link to="/dashboard/patient/addresses" onClick={() => setOpen(false)} className="block text-sm font-medium text-primary hover:underline">Manage all addresses</Link>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
