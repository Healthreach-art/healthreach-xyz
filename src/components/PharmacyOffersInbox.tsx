import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Bell, Check, X, Clock, MapPin } from "lucide-react";
import { toast } from "sonner";
import { dispatchOrderToNearbyDrivers } from "@/lib/driver-dispatch.functions";

interface Offer {
  id: string;
  order_id: string;
  distance_km: number;
  tier_km: number;
  expires_at: string;
  created_at: string;
  medication_name?: string;
  delivery_address?: string;
}

export function PharmacyOffersInbox() {
  const { user } = useAuth();
  const dispatchDrivers = useServerFn(dispatchOrderToNearbyDrivers);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [now, setNow] = useState(Date.now());

  async function load() {
    if (!user) return;
    const { data } = await supabase
      .from("pharmacy_offers")
      .select("id, order_id, distance_km, tier_km, expires_at, created_at")
      .eq("pharmacy_id", user.id)
      .eq("status", "open")
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    const list = (data ?? []) as Offer[];
    if (list.length === 0) { setOffers([]); return; }
    const { data: orders } = await supabase
      .from("orders")
      .select("id, medication_name, delivery_address")
      .in("id", list.map((o) => o.order_id));
    const map = new Map((orders ?? []).map((o) => [o.id, o]));
    setOffers(list.map((o) => ({
      ...o,
      medication_name: map.get(o.order_id)?.medication_name ?? "Medication",
      delivery_address: map.get(o.order_id)?.delivery_address ?? "",
    })));
  }

  useEffect(() => {
    let cancelled = false;
    const t = setInterval(() => setNow(Date.now()), 1000);

    if (!user) {
      return () => { clearInterval(t); };
    }

    load();
    const poll = setInterval(load, 5000);

    const ch = supabase
      .channel(`pharmacy_offers_${user.id}_${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pharmacy_offers", filter: `pharmacy_id=eq.${user.id}` },
        () => { if (!cancelled) load(); },
      )
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(t);
      clearInterval(poll);
      try { ch.unsubscribe(); } catch { /* noop */ }
      supabase.removeChannel(ch);
    };
  }, [user]);

  async function accept(id: string) {
    const { data, error } = await supabase.rpc("accept_pharmacy_offer", { _offer_id: id });
    if (error) { toast.error(error.message); load(); return; }
    try {
      const orderId = String(data);
      const result = await dispatchDrivers({ data: { orderId } });
      if ((result.inserted ?? 0) > 0) toast.success(`Order accepted — sent to ${result.inserted} nearby driver${result.inserted === 1 ? "" : "s"}`);
      else toast.success("Order accepted — it will rebroadcast when drivers are online");
    } catch {
      toast.success("Order accepted — prepare for dispatch");
    }
    load();
  }
  async function decline(id: string) {
    const { error } = await supabase.rpc("decline_pharmacy_offer", { _offer_id: id });
    if (error) { toast.error(error.message); return; }
    toast.message("Offer declined — system will escalate");
    load();
  }

  if (offers.length === 0) return null;

  return (
    <div className="healthcare-card p-5 border-primary/30 bg-primary/5">
      <div className="flex items-center gap-2 mb-3">
        <Bell className="h-4 w-4 text-primary animate-pulse" />
        <h3 className="font-semibold">Incoming order requests</h3>
        <span className="text-xs px-2 py-0.5 rounded-full bg-primary text-primary-foreground">{offers.length}</span>
      </div>
      <div className="space-y-2">
        {offers.map((o) => {
          const remaining = Math.max(0, Math.ceil((new Date(o.expires_at).getTime() - now) / 1000));
          return (
            <div key={o.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{o.medication_name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3 w-3" />
                    {o.distance_km.toFixed(1)} km · {o.delivery_address || "Address pending"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Tier: within {o.tier_km} km
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${remaining < 15 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
                    <Clock className="h-3 w-3 inline mr-0.5" />{remaining}s
                  </span>
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                <Button size="sm" className="flex-1" onClick={() => accept(o.id)}>
                  <Check className="h-3 w-3" /> Accept
                </Button>
                <Button size="sm" variant="outline" onClick={() => decline(o.id)}>
                  <X className="h-3 w-3" /> Decline
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
