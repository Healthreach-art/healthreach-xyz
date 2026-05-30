import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Truck, MapPin, Clock, CheckCircle, Package,
  DollarSign, Navigation, Radio, X, Loader2, MessageCircle, Settings,
  Power, ShieldCheck, Bike, Car, BadgeCheck, Wallet, Star, IdCard, KeyRound,
  Coffee, AlertTriangle, TrendingUp, WifiOff, RefreshCw,
} from "lucide-react";
import { PickupCodeDialog } from "@/components/PickupCodeDialog";
import { DeliveryCodeDialog } from "@/components/DeliveryCodeDialog";
import { FailedDeliveryDialog } from "@/components/FailedDeliveryDialog";
import { useDriverPresence } from "@/hooks/useDriverPresence";
import { PLATFORM_RULES } from "@/lib/platform-rules";
import { Switch } from "@/components/ui/switch";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { OrderChatDialog } from "@/components/OrderChatDialog";
import { DeliveryMap } from "@/components/DeliveryMap";
import { SettingsDialog } from "@/components/SettingsDialog";
import { useDriverLocationBroadcaster } from "@/hooks/useDriverLocationBroadcaster";
import { OrderTimeline } from "@/components/OrderTimeline";
import { acceptDeliveryOffer, declineDeliveryOffer, getNearbyOffersForDriver, DRIVER_OFFER_RADIUS_KM, type NearbyOffer } from "@/lib/driver-dispatch.functions";

type DStatus = "assigned" | "picked_up" | "in_transit" | "delivered" | "failed";

interface LiveDelivery {
  id: string;
  order_id: string;
  status: DStatus;
  pickup_address: string | null;
  delivery_address: string | null;
  estimated_time: string | null;
  created_at: string;
  updated_at: string;
  patient_name?: string;
  patient_phone?: string;
  pharmacy_name?: string;
  pharmacy_phone?: string;
  earnings?: number;
}

interface CompletedDelivery {
  id: string;
  order_id: string;
  updated_at: string;
  patient_name: string;
  earnings: number;
}

interface Offer {
  id: string;
  order_id: string;
  message: string | null;
  created_at: string;
  declined_by: string[] | null;
  expires_at: string;
  pickup_address: string | null;
  delivery_address: string | null;
  distance_km: number;
  earnings: number;
  offer_round: number;
}

const STAGE_ORDER: DStatus[] = ["assigned", "picked_up", "in_transit", "delivered"];
const nextStatus: Record<DStatus, DStatus | null> = {
  assigned: "picked_up", picked_up: "in_transit", in_transit: "delivered", delivered: null, failed: null,
};
const prevStatus: Record<DStatus, DStatus | null> = {
  assigned: null, picked_up: "assigned", in_transit: "picked_up", delivered: "in_transit", failed: null,
};
const nextLabel: Record<DStatus, string> = {
  assigned: "Mark Picked Up", picked_up: "Start Delivery", in_transit: "Complete Delivery", delivered: "", failed: "",
};
const stageLabel: Record<DStatus, string> = {
  assigned: "Assigned", picked_up: "Picked Up", in_transit: "In Transit", delivered: "Delivered", failed: "Failed",
};
const deliveryStatusLabels: Record<DStatus, { label: string; color: string }> = {
  assigned: { label: "Assigned", color: "bg-accent text-accent-foreground" },
  picked_up: { label: "Picked Up", color: "bg-primary/10 text-primary" },
  in_transit: { label: "In Transit", color: "bg-healthcare-sky/20 text-healthcare-sky" },
  delivered: { label: "Delivered", color: "bg-healthcare-green/20 text-healthcare-green" },
  failed: { label: "Failed", color: "bg-destructive/10 text-destructive" },

};

import { RoleGuard } from "@/components/RoleGuard";

export const Route = createFileRoute("/dashboard/driver")({
  head: () => ({ meta: [{ title: "Driver Dashboard — HEALTHREACH" }] }),
  component: () => <RoleGuard allow="driver"><DriverDashboard /></RoleGuard>,
});

// Fallback deterministic estimate (1.5–8.5 km) when Mapbox is unavailable
function estimateDistanceKm(orderId: string): number {
  let h = 0;
  for (let i = 0; i < orderId.length; i++) h = (h * 31 + orderId.charCodeAt(i)) >>> 0;
  return Math.round(((h % 700) / 100 + 1.5) * 10) / 10;
}
function estimateEarnings(km: number): number {
  return Math.round(25 + km * 6); // R25 base + R6/km
}

function DriverDashboard() {
  const { user, profile, approvalStatus, signOut } = useAuth();
  const [liveDeliveries, setLiveDeliveries] = useState<LiveDelivery[]>([]);
  const [completed, setCompleted] = useState<CompletedDelivery[]>([]);
  const [updating, setUpdating] = useState<string | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [chatOrderId, setChatOrderId] = useState<string | null>(null);
  const [pickupForDelivery, setPickupForDelivery] = useState<LiveDelivery | null>(null);
  const [failForDelivery, setFailForDelivery] = useState<LiveDelivery | null>(null);
  const [deliverForDelivery, setDeliverForDelivery] = useState<LiveDelivery | null>(null);
  const [refreshingOffers, setRefreshingOffers] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ratings, setRatings] = useState<{ avg: number; count: number; recent: { stars: number; comment: string; created_at: string }[] }>({ avg: 0, count: 0, recent: [] });
  const [online, setOnline] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("driver:online") !== "false";
  });
  const [onBreak, setOnBreak] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("driver:break") === "true";
  });
  const [netOnline, setNetOnline] = useState<boolean>(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [acceptance, setAcceptance] = useState<{ accepted: number; offered: number; cancelled: number; late: number }>({ accepted: 0, offered: 0, cancelled: 0, late: 0 });
  const vehicleType = (typeof window !== "undefined" && localStorage.getItem("driver:vehicle")) || "Motorbike";
  const loadNearbyOffers = useServerFn(getNearbyOffersForDriver);
  const acceptOfferSafely = useServerFn(acceptDeliveryOffer);
  const declineOfferSafely = useServerFn(declineDeliveryOffer);

  const presenceStatus: "online" | "offline" | "break" = !netOnline || !online ? "offline" : onBreak ? "break" : "online";
  useDriverPresence(user?.id ?? null, presenceStatus);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("driver:online", String(online));
  }, [online]);
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("driver:break", String(onBreak));
  }, [onBreak]);
  useEffect(() => {
    function on() { setNetOnline(true); }
    function off() { setNetOnline(false); toast.warning("You're offline — pausing new requests"); }
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  // Effective availability for receiving requests
  const available = online && !onBreak && netOnline;


  // Broadcast live GPS continuously while online (Uber-style),
  // tagged with the most recent active order if there is one.
  const activeOrderId = liveDeliveries[0]?.order_id ?? null;
  useDriverLocationBroadcaster({ driverId: user?.id ?? null, activeOrderId, enabled: available });

  // 1s tick for countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Restore scroll to URL hash on load / refresh
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace("#", "");
    if (!hash) return;
    const t = setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "start" });
    }, 300);
    return () => clearTimeout(t);
  }, []);

  // Auto-remove expired offers locally
  useEffect(() => {
    setOffers((prev) => prev.filter((o) => new Date(o.expires_at).getTime() > now));
  }, [now]);

  // 🔔 Play a ticking beep while offers are pending (1s interval).
  // Uses Web Audio so no asset file needed.
  useEffect(() => {
    if (offers.length === 0) return;
    let ctx: AudioContext | null = null;
    function beep() {
      try {
        if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = 880;
        g.gain.value = 0.0001;
        o.connect(g); g.connect(ctx.destination);
        const t = ctx.currentTime;
        g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
        o.start(t); o.stop(t + 0.18);
      } catch { /* ignore */ }
    }
    beep();
    const id = setInterval(beep, 1000);
    return () => { clearInterval(id); ctx?.close().catch(() => {}); };
  }, [offers.length]);

  // Browser notification on brand-new incoming offers
  const prevOfferIdsRef = useRef<string[]>([]);
  useEffect(() => {
    const ids = offers.map((o) => o.id);
    const fresh = ids.filter((id) => !prevOfferIdsRef.current.includes(id));
    if (fresh.length > 0 && prevOfferIdsRef.current.length > 0) {
      const f = offers.find((o) => o.id === fresh[0]);
      toast.info("🚚 New delivery — 60s to accept", { description: f?.message ?? "" });
      if (typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "granted") {
          try { new Notification("New delivery request", { body: "Tap to accept within 60 seconds", icon: "/favicon.ico" }); } catch { /* noop */ }
        } else if (Notification.permission === "default") {
          Notification.requestPermission().catch(() => {});
        }
      }
    }
    prevOfferIdsRef.current = ids;
  }, [offers]);

  useEffect(() => {
    if (!user) return;

    async function loadDeliveries() {
      const { data } = await supabase
        .from("deliveries")
        .select("id, order_id, status, pickup_address, delivery_address, estimated_time, created_at, updated_at")
        .eq("driver_id", user!.id)
        .order("updated_at", { ascending: false });
      const all = (data ?? []) as LiveDelivery[];
      const active = all.filter((d) => d.status !== "delivered");

      // Hydrate active deliveries with patient + pharmacy contact info
      if (active.length > 0) {
        const orderIds = active.map((d) => d.order_id);
        const { data: orders } = await supabase
          .from("orders")
          .select("id, patient_id, pharmacy_id, delivery_fee")
          .in("id", orderIds);
        const orderMap = new Map((orders ?? []).map((o) => [o.id, o]));
        const userIds = Array.from(new Set((orders ?? []).flatMap((o) => [o.patient_id, o.pharmacy_id].filter((v): v is string => !!v))));
        const { data: profs } = userIds.length > 0
          ? await supabase.from("profiles").select("user_id, full_name, phone, organization_name").in("user_id", userIds)
          : { data: [] as { user_id: string; full_name: string; phone: string; organization_name: string }[] };
        const profMap = new Map((profs ?? []).map((p) => [p.user_id, p]));
        setLiveDeliveries(active.map((d) => {
          const o = orderMap.get(d.order_id);
          const pat = o ? profMap.get(o.patient_id) : null;
          const phar = o?.pharmacy_id ? profMap.get(o.pharmacy_id) : null;
          const fee = Number(o?.delivery_fee ?? 0);
          return {
            ...d,
            patient_name: pat?.full_name || "Customer",
            patient_phone: pat?.phone || "",
            pharmacy_name: phar?.organization_name || phar?.full_name || "Pharmacy",
            pharmacy_phone: phar?.phone || "",
            earnings: fee > 0 ? fee : estimateEarnings(estimateDistanceKm(d.order_id)),
          };
        }));
      } else {
        setLiveDeliveries([]);
      }

      const done = all.filter((d) => d.status === "delivered");
      // Hydrate patient names and earnings from orders
      if (done.length > 0) {
        const orderIds = done.map((d) => d.order_id);
        const { data: orders } = await supabase
          .from("orders")
          .select("id, patient_id, delivery_fee")
          .in("id", orderIds);
        const orderMap = new Map((orders ?? []).map((o) => [o.id, o]));
        const patientIds = Array.from(new Set((orders ?? []).map((o) => o.patient_id)));
        const { data: profiles } = patientIds.length > 0
          ? await supabase.from("profiles").select("user_id, full_name").in("user_id", patientIds)
          : { data: [] as { user_id: string; full_name: string }[] };
        const nameMap = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name]));
        setCompleted(done.map((d) => {
          const order = orderMap.get(d.order_id);
          const fee = Number(order?.delivery_fee ?? 0);
          return {
            id: d.id,
            order_id: d.order_id,
            updated_at: d.updated_at,
            patient_name: order ? (nameMap.get(order.patient_id) || "Patient") : "Patient",
            earnings: fee > 0 ? fee : estimateEarnings(estimateDistanceKm(d.order_id)),
          };
        }));
      } else {
        setCompleted([]);
      }
    }

    async function loadOffers() {
      // Uber-style: server filters offers to those within 20 km of the
      // driver's live location (driver_locations table).
      if (!available) {
        setOffers([]);
        return;
      }
      try {
        const result = await loadNearbyOffers({ data: { maxKm: DRIVER_OFFER_RADIUS_KM } });
        const enriched: Offer[] = (result.offers ?? []).map((o: NearbyOffer) => ({
          id: o.id,
          order_id: o.order_id,
          message: o.message,
          created_at: o.created_at,
          declined_by: o.declined_by,
          expires_at: o.expires_at,
          pickup_address: o.pickup_address,
          delivery_address: o.delivery_address,
          distance_km: o.distance_km,
          earnings: o.delivery_fee > 0 ? o.delivery_fee : estimateEarnings(o.distance_km),
          offer_round: o.offer_round,
        }));
        setOffers(enriched);
      } catch (e) {
        console.error("loadOffers failed", e);
        setOffers([]);
      }
    }
    loadOffersRef.current = loadOffers;

    Promise.all([loadDeliveries(), loadOffers(), loadRatings(), loadStats()]).finally(() => setLoading(false));
    const poll = setInterval(() => {
      loadDeliveries();
      if (available) loadOffers();
    }, 3000);

    async function loadStats() {
      const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
      const [{ data: offersAll }, { data: dels }] = await Promise.all([
        supabase.from("delivery_offers").select("id, accepted_by, declined_by, status").gte("created_at", since),
        supabase.from("deliveries").select("status, created_at, updated_at").eq("driver_id", user!.id).gte("created_at", since),
      ]);
      const offered = (offersAll ?? []).filter((o) => o.accepted_by === user!.id || (o.declined_by ?? []).includes(user!.id)).length;
      const accepted = (offersAll ?? []).filter((o) => o.accepted_by === user!.id).length;
      const delsArr = (dels ?? []) as { status: string; created_at: string; updated_at: string }[];
      const cancelled = delsArr.filter((d) => d.status === "failed").length;
      const late = delsArr.filter((d) => {
        if (d.status !== "delivered") return false;
        const mins = (new Date(d.updated_at).getTime() - new Date(d.created_at).getTime()) / 60000;
        return mins > PLATFORM_RULES.ETA_MAX;
      }).length;
      setAcceptance({ accepted, offered: Math.max(offered, accepted), cancelled, late });
    }

    async function loadRatings() {
      const { data } = await supabase
        .from("ratings")
        .select("stars, comment, created_at")
        .eq("target_type", "driver")
        .eq("target_id", user!.id)
        .order("created_at", { ascending: false });
      const rows = (data ?? []) as { stars: number; comment: string; created_at: string }[];
      const avg = rows.length ? rows.reduce((s, r) => s + r.stars, 0) / rows.length : 0;
      setRatings({ avg, count: rows.length, recent: rows.slice(0, 3) });
    }

    const channel = supabase
      .channel(`driver-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries", filter: `driver_id=eq.${user.id}` }, (payload) => {
        if (payload.eventType === "INSERT") {
          const d = payload.new as LiveDelivery;
          toast.success("New delivery assigned!", {
            description: d.pickup_address ? `Pickup: ${d.pickup_address}` : `Order ${d.order_id.slice(0, 8)}`,
          });
        }
        loadDeliveries();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_offers" }, () => loadOffers())
      .on("postgres_changes", { event: "*", schema: "public", table: "ratings", filter: `target_id=eq.${user.id}` }, () => loadRatings())
      .subscribe();
    return () => { clearInterval(poll); supabase.removeChannel(channel); };
  }, [user, loadNearbyOffers, available]);

  async function acceptOffer(offer: Offer) {
    if (!user) return;
    setRespondingId(offer.id);
    try {
      await acceptOfferSafely({ data: { offerId: offer.id } });
    } catch {
      setRespondingId(null);
      toast.error("Too late — another driver took it.");
      setOffers((prev) => prev.filter((o) => o.id !== offer.id));
      return;
    }

    setRespondingId(null);
    setOffers((prev) => prev.filter((o) => o.id !== offer.id));
    toast.success("Delivery accepted!");
  }

  async function declineOffer(offer: Offer) {
    if (!user) return;
    setRespondingId(offer.id);
    await declineOfferSafely({ data: { offerId: offer.id } });
    setOffers((prev) => prev.filter((o) => o.id !== offer.id));
    setRespondingId(null);
  }

  async function setDeliveryStatus(d: LiveDelivery, target: DStatus) {
    setUpdating(d.id);
    const { error } = await supabase.from("deliveries").update({ status: target }).eq("id", d.id);
    const orderStatusMap: Record<DStatus, "ready" | "out_for_delivery" | "delivered" | "cancelled" | null> = {
      assigned: "ready", picked_up: "out_for_delivery", in_transit: "out_for_delivery", delivered: "delivered", failed: "cancelled",
    };
    const orderStatus = orderStatusMap[target];
    if (orderStatus) {
      await supabase.from("orders").update({ status: orderStatus }).eq("id", d.order_id);
    }
    setUpdating(null);
    if (error) toast.error(error.message);
    else toast.success(`Marked ${stageLabel[target]}`);
  }

  async function advance(d: LiveDelivery) {
    const next = nextStatus[d.status];
    if (!next) return;
    if (d.status === "assigned" && next === "picked_up") {
      setPickupForDelivery(d);
      return;
    }
    await setDeliveryStatus(d, next);
  }

  async function revert(d: LiveDelivery) {
    const prev = prevStatus[d.status];
    if (prev) await setDeliveryStatus(d, prev);
  }

  // Today's earnings & count from real completed deliveries
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const completedToday = completed.filter((c) => new Date(c.updated_at) >= today);
  const todayEarnings = completedToday.reduce((s, c) => s + c.earnings, 0);
  const totalEarnings = completed.reduce((s, c) => s + c.earnings, 0);

  const stats = useMemo(() => [
    { icon: Truck, label: "Active Deliveries", value: String(liveDeliveries.length), color: "text-primary", target: "active" },
    { icon: CheckCircle, label: "Completed Today", value: String(completedToday.length), color: "text-healthcare-green", target: "completed" },
    { icon: DollarSign, label: "Today's Earnings", value: `R ${todayEarnings.toFixed(0)}`, color: "text-healthcare-teal", target: "completed" },
    { icon: Navigation, label: "Total Earnings", value: `R ${totalEarnings.toFixed(0)}`, color: "text-healthcare-sky", target: "completed" },
  ], [liveDeliveries.length, completedToday.length, todayEarnings, totalEarnings]);

  if (approvalStatus === "pending") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="healthcare-card p-8 max-w-md text-center">
          <Clock className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-bold text-foreground">Pending Approval</h2>
          <p className="mt-2 text-sm text-muted-foreground">Your driver account is awaiting admin approval.</p>
          <Button variant="outline" className="mt-6" onClick={signOut}>Sign Out</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container-narrow px-4 sm:px-6 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="relative">
            {(profile as { avatar_url?: string } | null)?.avatar_url ? (
              <img src={(profile as { avatar_url?: string }).avatar_url} alt="Driver" className="h-14 w-14 rounded-full object-cover ring-2 ring-primary/30" />
            ) : (
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-lg font-semibold text-primary ring-2 ring-primary/30">
                {(profile?.full_name || "D").slice(0, 1)}
              </div>
            )}
            <span className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full ring-2 ring-background ${online ? "bg-healthcare-green animate-pulse" : "bg-muted-foreground"}`} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{profile?.full_name || "Driver"}</h1>
            <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
              {vehicleType.toLowerCase().includes("car") ? <Car className="h-3 w-3" /> : <Bike className="h-3 w-3" />}
              {vehicleType}
              <span className="inline-flex items-center gap-1 text-healthcare-green">
                <BadgeCheck className="h-3 w-3" /> {approvalStatus === "approved" ? "Verified" : "Pending"}
              </span>
              {ratings.count > 0 && (
                <span className="inline-flex items-center gap-1 text-amber-500">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {ratings.avg.toFixed(1)} <span className="text-muted-foreground">({ratings.count})</span>
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 border ${online ? "bg-healthcare-green/10 border-healthcare-green/40" : "bg-muted border-border"}`}>
            <Power className={`h-4 w-4 ${online ? "text-healthcare-green" : "text-muted-foreground"}`} />
            <span className="text-xs font-medium">{online ? "Online" : "Offline"}</span>
            <Switch checked={online} onCheckedChange={(v) => { setOnline(v); if (v) setOnBreak(false); }} />
          </div>
          <button
            type="button"
            onClick={() => setOnBreak((b) => !b)}
            disabled={!online}
            className={`flex items-center gap-2 rounded-full px-3 py-1.5 border text-xs font-medium transition-colors ${onBreak ? "bg-amber-500/10 border-amber-500/40 text-amber-600" : "bg-muted border-border text-muted-foreground hover:bg-accent"} disabled:opacity-50`}
          >
            <Coffee className="h-4 w-4" /> {onBreak ? "On Break" : "Take Break"}
          </button>
          <Button variant="outline" size="sm" asChild><Link to="/driver/wallet" className="gap-1"><Wallet className="h-4 w-4" /> Wallet</Link></Button>
          <Button variant="outline" size="sm" asChild><Link to="/driver/onboarding" className="gap-1"><IdCard className="h-4 w-4" /> Verify</Link></Button>
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}><Settings className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={signOut}>Sign Out</Button>
        </div>
      </div>

      {!netOnline && (
        <div className="mb-6 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive flex items-center gap-2">
          <WifiOff className="h-4 w-4" /> No internet connection. You'll automatically resume when reconnected.
        </div>
      )}
      {netOnline && !online && (
        <div className="mb-6 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground flex items-center gap-2">
          <Power className="h-4 w-4" /> You're offline. Toggle online to receive new delivery requests.
        </div>
      )}
      {netOnline && online && onBreak && (
        <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-700 flex items-center gap-2">
          <Coffee className="h-4 w-4" /> Break mode — you stay logged in but won't receive new requests.
        </div>
      )}

      {/* Performance summary */}
      <div className="grid gap-3 sm:grid-cols-4 mb-6">
        <PerfCard label="Acceptance" value={`${acceptance.offered ? Math.round((acceptance.accepted / acceptance.offered) * 100) : 100}%`} sub={`${acceptance.accepted}/${acceptance.offered} offers`} tone="text-healthcare-green" icon={CheckCircle} />
        <PerfCard label="Cancellations" value={String(acceptance.cancelled)} sub="last 30 days" tone="text-destructive" icon={X} />
        <PerfCard label="Late deliveries" value={String(acceptance.late)} sub={`> ${PLATFORM_RULES.ETA_MAX} min`} tone="text-amber-500" icon={Clock} />
        <PerfCard label="Rating" value={ratings.count > 0 ? ratings.avg.toFixed(1) : "—"} sub={`${ratings.count} reviews`} tone="text-amber-500" icon={Star} />
      </div>


      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {stats.map((stat) => (
          <a
            key={stat.label}
            href={`#${stat.target}`}
            onClick={(e) => {
              e.preventDefault();
              const el = document.getElementById(stat.target);
              if (el) {
                history.replaceState(null, "", `#${stat.target}`);
                el.scrollIntoView({ behavior: "smooth", block: "start" });
              }
            }}
            className="healthcare-card p-5 transition-all hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-xl font-bold text-foreground">{stat.value}</p>
              </div>
            </div>
          </a>
        ))}
      </div>

      {/* Incoming Requests (Uber-style broadcast) */}
      {available && offers.length > 0 && (
        <div className="mb-8 rounded-xl border-2 border-primary/40 bg-primary/5 p-5">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
            <Radio className="h-5 w-5 text-primary animate-pulse" />
            Incoming Delivery Requests
            <span className="ml-auto text-xs font-normal text-muted-foreground">{offers.length} available</span>
          </h2>
          <div className="space-y-3">
            {offers.map((offer) => {
              const msLeft = Math.max(0, new Date(offer.expires_at).getTime() - now);
              const totalSec = Math.floor(msLeft / 1000);
              const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
              const ss = String(totalSec % 60).padStart(2, "0");
              const urgent = msLeft < 60_000;
              return (
                <div key={offer.id} className="rounded-lg bg-background border border-border p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-muted-foreground">Order {offer.order_id.slice(0, 8)}</span>
                    <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${urgent ? "bg-destructive/10 text-destructive" : "bg-accent text-accent-foreground"}`}>
                      ⏱ {mm}:{ss}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground mb-3">{offer.message || "New delivery request"}</p>

                  <div className="space-y-1.5 text-xs mb-3">
                    <div className="flex items-start gap-2">
                      <Package className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                      <div><span className="text-muted-foreground">Pickup: </span><span className="text-foreground">{offer.pickup_address || "—"}</span></div>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="h-3.5 w-3.5 text-healthcare-green mt-0.5 shrink-0" />
                      <div><span className="text-muted-foreground">Dropoff: </span><span className="text-foreground">{offer.delivery_address || "—"}</span></div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mb-3 text-xs">
                    <span className="inline-flex items-center gap-1 rounded-full bg-healthcare-sky/15 text-healthcare-sky px-2 py-0.5">
                      <Navigation className="h-3 w-3" /> ~{offer.distance_km} km
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-healthcare-green/15 text-healthcare-green px-2 py-0.5">
                      <DollarSign className="h-3 w-3" /> R {offer.earnings}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 gap-1" disabled={respondingId === offer.id} onClick={() => acceptOffer(offer)}>
                      <CheckCircle className="h-3 w-3" /> {respondingId === offer.id ? "Accepting..." : "Accept"}
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 gap-1" disabled={respondingId === offer.id} onClick={() => declineOffer(offer)}>
                      <X className="h-3 w-3" /> Decline
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <div id="active" className="lg:col-span-3 space-y-4 scroll-mt-24">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            Active Deliveries
            <span className="inline-flex h-2 w-2 rounded-full bg-healthcare-green animate-pulse" />
            <span className="text-xs font-normal text-muted-foreground">Live</span>
          </h2>

          {loading && (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          )}

          {!loading && liveDeliveries.length === 0 && offers.length === 0 && (
            <div className="healthcare-card p-8 text-center">
              <Truck className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-foreground font-medium">No active deliveries</p>
              <p className="text-xs text-muted-foreground mt-1">New requests from pharmacies will appear above when broadcast.</p>
            </div>
          )}

          {liveDeliveries.map((delivery) => {
            const statusInfo = deliveryStatusLabels[delivery.status];
            const isUpdating = updating === delivery.id;
            return (
              <div key={delivery.id} className="healthcare-card p-5 ring-1 ring-primary/20">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-mono text-muted-foreground">{delivery.id.slice(0, 8)}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.color}`}>{statusInfo.label}</span>
                    <Button size="sm" variant="ghost" className="h-6 gap-1 text-xs px-2" onClick={() => setChatOrderId(delivery.order_id)}>
                      <MessageCircle className="h-3 w-3" /> Chat
                    </Button>
                  </div>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex items-start gap-2">
                    <Package className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <span className="text-muted-foreground">Pickup — {delivery.pharmacy_name || "Pharmacy"}:</span>
                      <p className="text-foreground">{delivery.pickup_address || "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin className="h-3.5 w-3.5 text-healthcare-green mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <span className="text-muted-foreground">Dropoff — {delivery.patient_name || "Customer"}:</span>
                      <p className="text-foreground">{delivery.delivery_address || "—"}</p>
                    </div>
                  </div>
                  {delivery.earnings != null && (
                    <div className="flex items-center gap-2 pt-1">
                      <ShieldCheck className="h-3.5 w-3.5 text-healthcare-teal" />
                      <span className="text-muted-foreground">Estimated earnings:</span>
                      <span className="font-semibold text-healthcare-teal">R {delivery.earnings.toFixed(0)}</span>
                    </div>
                  )}
                </div>

                {/* Mini route map */}
                <div className="mt-3">
                  <DeliveryMap orderId={delivery.order_id} driverId={user?.id} pickup={delivery.pickup_address} dropoff={delivery.delivery_address} status={delivery.status} className="h-40 w-full rounded-lg overflow-hidden border border-border" />
                </div>

                {/* Unified real-time timeline */}
                <div className="mt-4">
                  <OrderTimeline orderId={delivery.order_id} initialDeliveryStatus={delivery.status} compact />
                </div>


                <div className="flex items-center justify-between gap-2 mt-4 flex-wrap">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> ETA: {delivery.estimated_time || "—"}
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {(() => {
                      const navTarget = delivery.status === "assigned" ? delivery.pickup_address : delivery.delivery_address;
                      const navLabel = delivery.status === "assigned" ? "Navigate to Pharmacy" : "Navigate";
                      return navTarget ? (
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(navTarget)}&travelmode=driving`}
                          target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
                        >
                          <Navigation className="h-3 w-3" /> {navLabel}
                        </a>
                      ) : null;
                    })()}
                    {prevStatus[delivery.status] && (
                      <Button size="sm" variant="outline" disabled={isUpdating} onClick={() => revert(delivery)}>
                        Undo
                      </Button>
                    )}
                    {nextStatus[delivery.status] && (
                      <Button size="sm" variant="default" disabled={isUpdating} onClick={() => advance(delivery)} className="gap-1">
                        {delivery.status === "assigned" && <KeyRound className="h-3 w-3" />}
                        {isUpdating ? "Updating..." : nextLabel[delivery.status]}
                      </Button>
                    )}
                    {delivery.status !== "delivered" && delivery.status !== "failed" && (
                      <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 gap-1" onClick={() => setFailForDelivery(delivery)}>
                        <AlertTriangle className="h-3 w-3" /> Report Issue
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div id="completed" className="lg:col-span-2 scroll-mt-24 space-y-4">
          <div className="healthcare-card p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Completed Deliveries</h2>
            {completed.length === 0 ? (
              <p className="text-sm text-muted-foreground">No completed deliveries yet.</p>
            ) : (
              <div className="space-y-3">
                {completed.slice(0, 8).map((d) => (
                  <div key={d.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{d.patient_name}</p>
                      <p className="text-xs text-muted-foreground">{new Date(d.updated_at).toLocaleDateString()}</p>
                    </div>
                    <span className="text-sm font-semibold text-healthcare-green">R {d.earnings.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="healthcare-card p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Star className="h-5 w-5 text-amber-400 fill-amber-400" /> Reviews
              </h2>
              {ratings.count > 0 && (
                <span className="text-sm font-semibold">{ratings.avg.toFixed(1)} <span className="text-xs text-muted-foreground">({ratings.count})</span></span>
              )}
            </div>
            {ratings.count === 0 ? (
              <p className="text-sm text-muted-foreground">No ratings yet. Complete deliveries to receive feedback.</p>
            ) : (
              <div className="space-y-3">
                {ratings.recent.map((r, i) => (
                  <div key={i} className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-1 mb-1">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <Star key={j} className={`h-3.5 w-3.5 ${j < r.stars ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
                      ))}
                      <span className="ml-auto text-[11px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                    {r.comment && <p className="text-xs text-foreground">{r.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <OrderChatDialog orderId={chatOrderId} orderLabel={chatOrderId ? `Order ${chatOrderId.slice(0, 8)}` : ""} onClose={() => setChatOrderId(null)} />
      <PickupCodeDialog
        deliveryId={pickupForDelivery?.id ?? null}
        pharmacyName={pickupForDelivery?.pharmacy_name}
        onClose={() => setPickupForDelivery(null)}
        onVerified={() => { /* realtime will refresh */ }}
      />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <FailedDeliveryDialog delivery={failForDelivery} onClose={() => setFailForDelivery(null)} />
    </div>
  );
}

function PerfCard({ label, value, sub, tone, icon: Icon }: { label: string; value: string; sub: string; tone: string; icon: typeof TrendingUp }) {
  return (
    <div className="healthcare-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={`h-4 w-4 ${tone}`} /> {label}
      </div>
      <p className={`text-2xl font-bold mt-1 ${tone}`}>{value}</p>
      <p className="text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

