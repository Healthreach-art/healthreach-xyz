import { useEffect, useState } from "react";
import { firestoreClient } from "@/lib/firestore-client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { AddressPicker, type PickedAddress } from "@/components/AddressPicker";
import { useServerFn } from "@tanstack/react-start";
import { setPharmacyLocation } from "@/lib/dispatch.functions";
import { toast } from "sonner";
import { MapPin, CheckCircle2, Pencil, X } from "lucide-react";

export function PharmacyLocationCard() {
  const { user } = useAuth();
  const setLoc = useServerFn(setPharmacyLocation);
  const [picked, setPicked] = useState<PickedAddress | null>(null);
  const [saved, setSaved] = useState<{ address: string; lat: number; lng: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!user) return;
    firestoreClient.from("profiles").select("address, latitude, longitude").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data?.latitude && data?.longitude && data?.address) {
          const s = { address: data.address, lat: data.latitude, lng: data.longitude };
          setSaved(s);
          setPicked(s);
        }
        setLoading(false);
      });
  }, [user]);

  async function save() {
    if (!picked) { toast.error("Pick an address first"); return; }
    setBusy(true);
    try {
      await setLoc({ data: { address: picked.address, lat: picked.lat, lng: picked.lng } });
      setSaved(picked);
      setEditing(false);
      toast.success("Pharmacy location saved — you'll start receiving orders");
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    } finally { setBusy(false); }
  }

  if (loading) {
    return (
      <div className="healthcare-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Pharmacy location</h3>
        </div>
        <p className="text-xs text-muted-foreground">Loading…</p>
      </div>
    );
  }

  // Saved & not editing: show locked-in address
  if (saved && !editing) {
    return (
      <div className="healthcare-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Pharmacy location</h3>
          <CheckCircle2 className="h-4 w-4 text-healthcare-green ml-auto" />
        </div>
        <div className="rounded-md border border-border bg-muted/30 p-3">
          <p className="text-sm font-medium leading-snug">{saved.address}</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            📍 {saved.lat.toFixed(5)}, {saved.lng.toFixed(5)}
          </p>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Saved as your permanent storefront. Orders within 60 km route to you automatically.
        </p>
        <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setEditing(true)}>
          <Pencil className="h-3.5 w-3.5 mr-1.5" /> Change address
        </Button>
      </div>
    );
  }

  // First-time setup OR editing existing
  return (
    <div className="healthcare-card p-5">
      <div className="flex items-center gap-2 mb-3">
        <MapPin className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">{saved ? "Update pharmacy location" : "Pharmacy location"}</h3>
        {saved && (
          <Button variant="ghost" size="sm" className="ml-auto h-7 px-2" onClick={() => { setPicked(saved); setEditing(false); }}>
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Set your storefront address so the dispatcher can route patient orders within a 60 km service radius.
      </p>
      <AddressPicker value={picked} onChange={setPicked} placeholder="Pharmacy address…" />
      <Button
        size="sm"
        className="mt-3 w-full"
        onClick={save}
        disabled={busy || !picked || (saved?.lat === picked?.lat && saved?.lng === picked?.lng)}
      >
        {busy ? "Saving…" : saved ? "Update location" : "Save location"}
      </Button>
    </div>
  );
}
