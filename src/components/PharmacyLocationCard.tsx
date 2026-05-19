import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { AddressPicker, type PickedAddress } from "@/components/AddressPicker";
import { useServerFn } from "@tanstack/react-start";
import { setPharmacyLocation } from "@/lib/dispatch.functions";
import { toast } from "sonner";
import { MapPin, CheckCircle2 } from "lucide-react";

export function PharmacyLocationCard() {
  const { user } = useAuth();
  const setLoc = useServerFn(setPharmacyLocation);
  const [picked, setPicked] = useState<PickedAddress | null>(null);
  const [saved, setSaved] = useState<{ address: string; lat: number; lng: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("address, latitude, longitude").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data?.latitude && data?.longitude && data?.address) {
          setSaved({ address: data.address, lat: data.latitude, lng: data.longitude });
          setPicked({ address: data.address, lat: data.latitude, lng: data.longitude });
        }
      });
  }, [user]);

  async function save() {
    if (!picked) { toast.error("Pick an address first"); return; }
    setBusy(true);
    try {
      await setLoc({ data: { address: picked.address, lat: picked.lat, lng: picked.lng } });
      setSaved(picked);
      toast.success("Pharmacy location saved — you'll start receiving orders");
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="healthcare-card p-5">
      <div className="flex items-center gap-2 mb-3">
        <MapPin className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Pharmacy location</h3>
        {saved && <CheckCircle2 className="h-4 w-4 text-healthcare-green ml-auto" />}
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Set your storefront address so the dispatcher can route patient orders within a 60 km service radius.
      </p>
      <AddressPicker value={picked} onChange={setPicked} placeholder="Pharmacy address…" />
      <Button size="sm" className="mt-3 w-full" onClick={save} disabled={busy || !picked || (saved?.lat === picked?.lat && saved?.lng === picked?.lng)}>
        {busy ? "Saving…" : saved ? "Update location" : "Save location"}
      </Button>
    </div>
  );
}
