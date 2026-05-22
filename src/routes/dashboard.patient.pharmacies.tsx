import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Search, Clock, MapPin, Pill, Plus, Stethoscope, Zap, Lock, Unlock, History, Truck, Store as StoreIcon, Star, Heart, Baby, Thermometer, Sparkles, Bandage, ShieldPlus, Activity, Grid3x3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useCart } from "@/hooks/useCart";
import { useAuth } from "@/hooks/useAuth";
import { customerPrice } from "@/lib/pricing";
import { listPatientMarketplace } from "@/lib/patient-marketplace.functions";
import { PrescriptionUploader } from "@/components/PrescriptionVerification";
import { toast } from "sonner";
import medGeneric from "@/assets/med-generic.jpg";
import { Crosshair } from "lucide-react";

interface Ph { user_id: string; organization_name: string | null; full_name: string; address: string | null; phone: string | null; latitude: number | null; longitude: number | null; }
interface Med { id: string; pharmacy_id: string; name: string; price: number; stock_quantity: number; requires_prescription?: boolean | null; image_url?: string | null; description?: string | null; category?: string | null; }
interface Offer extends Med { pharmacyName: string; address: string; distanceKm: number; etaMin: number; etaMax: number; rating: number; isOpen: boolean; }
interface Group { key: string; name: string; image: string; requiresRx: boolean; offers: Offer[]; minPrice: number; }

const FULFILL_KEY = "hr.fulfillment";
const LOCK_KEY = "hr.lockedPharmacy";
const MYLOC_KEY = "hr.patientLoc";

const CATEGORIES: { key: string; label: string; icon: any; tone: string; iconColor: string }[] = [
  { key: "All", label: "All", icon: Grid3x3, tone: "bg-primary/10", iconColor: "text-primary" },
  { key: "Pain Relief", label: "Pain Relief", icon: Activity, tone: "bg-rose-100", iconColor: "text-rose-600" },
  { key: "Cold & Flu", label: "Cold & Flu", icon: Thermometer, tone: "bg-sky-100", iconColor: "text-sky-600" },
  { key: "Allergy", label: "Allergy", icon: Sparkles, tone: "bg-amber-100", iconColor: "text-amber-600" },
  { key: "Vitamins", label: "Vitamins", icon: Heart, tone: "bg-emerald-100", iconColor: "text-emerald-600" },
  { key: "Antibiotics", label: "Antibiotics", icon: ShieldPlus, tone: "bg-violet-100", iconColor: "text-violet-600" },
  { key: "Chronic", label: "Chronic Care", icon: Pill, tone: "bg-blue-100", iconColor: "text-blue-600" },
  { key: "First Aid", label: "First Aid", icon: Bandage, tone: "bg-red-100", iconColor: "text-red-600" },
  { key: "Baby Care", label: "Baby Care", icon: Baby, tone: "bg-pink-100", iconColor: "text-pink-600" },
  { key: "Other", label: "Other", icon: StoreIcon, tone: "bg-muted", iconColor: "text-muted-foreground" },
];

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
}
function hashOf(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
function ratingFor(id: string) { return Number((4.0 + ((hashOf(id) % 90) / 100)).toFixed(1)); }
function etaFromKm(km: number) { const etaMin = 15 + Math.max(5, Math.round(km * 2)); return { etaMin, etaMax: etaMin + 15 }; }

export const Route = createFileRoute("/dashboard/patient/pharmacies")({
  head: () => ({ meta: [{ title: "Order Medication — HEALTHREACH" }] }),
  component: () => <RoleGuard allow="patient"><MedicineMarketplace /></RoleGuard>,
});

function MedicineMarketplace() {
  const cart = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const loadMarketplace = useServerFn(listPatientMarketplace);
  const [pharmacies, setPharmacies] = useState<Ph[]>([]);
  const [meds, setMeds] = useState<Med[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [activeCat, setActiveCat] = useState<string>("All");
  const [active, setActive] = useState<Group | null>(null);
  const [rxFor, setRxFor] = useState<{ med: Offer } | null>(null);
  const [fulfillment, setFulfillment] = useState<"delivery" | "pickup">("delivery");
  const [lockedPharmacy, setLockedPharmacy] = useState<string | null>(null);
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locBusy, setLocBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setFulfillment((localStorage.getItem(FULFILL_KEY) as any) || "delivery");
    setLockedPharmacy(localStorage.getItem(LOCK_KEY));
    try {
      const raw = localStorage.getItem(MYLOC_KEY);
      if (raw) setMyLoc(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  // Fall back to profile's saved address if no override location is set
  useEffect(() => {
    if (myLoc || !user) return;
    supabase.from("profiles").select("latitude, longitude").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data?.latitude && data?.longitude) setMyLoc({ lat: data.latitude, lng: data.longitude });
      });
  }, [user, myLoc]);

  function useMyLocation() {
    if (!navigator.geolocation) { toast.error("Geolocation not supported in this browser"); return; }
    setLocBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMyLoc(loc);
        try { localStorage.setItem(MYLOC_KEY, JSON.stringify(loc)); } catch { /* ignore */ }
        toast.success("Pinned your location — pharmacies sorted by closest");
        setLocBusy(false);
      },
      (err) => { toast.error(err.message || "Could not get your location"); setLocBusy(false); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function refreshMarketplace() {
    const data = await loadMarketplace();
    setMeds(data.meds as Med[]);
    setPharmacies(data.pharmacies as Ph[]);
  }

  // Realtime: refresh medication stock/price as pharmacies update
  useEffect(() => {
    const channel = supabase
      .channel("meds-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "medications" }, () => {
        refreshMarketplace().catch(() => toast.error("Could not refresh medicine stock"));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    (async () => {
      await refreshMarketplace();
      if (user) {
        const { data: orders } = await supabase.from("orders").select("medication_name, created_at").eq("patient_id", user.id).order("created_at", { ascending: false }).limit(20);
        const seen = new Set<string>();
        const list: string[] = [];
        for (const o of orders ?? []) {
          const k = (o as any).medication_name?.toLowerCase();
          if (k && !seen.has(k)) { seen.add(k); list.push((o as any).medication_name); }
          if (list.length >= 6) break;
        }
        setRecent(list);
      }
      setLoading(false);
    })();
  }, [user]);

  const phById = useMemo(() => Object.fromEntries(pharmacies.map((p) => [p.user_id, p])), [pharmacies]);

  const groups: Group[] = useMemo(() => {
    const map = new Map<string, Group>();
    for (const m of meds) {
      const ph = phById[m.pharmacy_id];
      if (!ph) continue;
      let km: number;
      if (myLoc && ph.latitude != null && ph.longitude != null) {
        km = Number(haversineKm(myLoc.lat, myLoc.lng, ph.latitude, ph.longitude).toFixed(1));
      } else {
        // No coords on either side — push to the bottom with a sentinel distance
        km = 999;
      }
      const { etaMin, etaMax } = etaFromKm(km === 999 ? 5 : km);
      const offer: Offer = {
        ...m,
        pharmacyName: ph.organization_name || ph.full_name || "Pharmacy",
        address: ph.address || "Johannesburg",
        distanceKm: km, etaMin, etaMax,
        rating: ratingFor(m.pharmacy_id),
        isOpen: true,
      };
      const key = m.name.trim().toLowerCase();
      const g = map.get(key);
      if (g) {
        g.offers.push(offer);
        g.minPrice = Math.min(g.minPrice, Number(m.price));
        g.requiresRx = g.requiresRx || !!m.requires_prescription;
      } else {
        map.set(key, {
          key, name: m.name, image: m.image_url || medGeneric, requiresRx: !!m.requires_prescription,
          offers: [offer], minPrice: Number(m.price),
        });
      }
    }
    // Sort offers in each group: locked pharmacy first, then closest by real distance
    for (const g of map.values()) {
      g.offers.sort((a, b) => {
        if (lockedPharmacy) {
          if (a.pharmacy_id === lockedPharmacy && b.pharmacy_id !== lockedPharmacy) return -1;
          if (b.pharmacy_id === lockedPharmacy && a.pharmacy_id !== lockedPharmacy) return 1;
        }
        return a.distanceKm - b.distanceKm;
      });
    }
    return Array.from(map.values());
  }, [meds, phById, lockedPharmacy, myLoc]);

  const search = q.trim().toLowerCase();
  const byCat = activeCat === "All" ? groups : groups.filter((g) => (g.offers[0]?.category || "Other") === activeCat);
  // "All" never lists the full catalogue — user must search or pick a category.
  const showGrid = activeCat !== "All" || !!search;
  const filtered = search
    ? byCat.filter((g) => g.name.toLowerCase().includes(search) || g.offers.some((o) => o.pharmacyName.toLowerCase().includes(search)))
    : byCat;
  const recentGroups = recent.map((n) => groups.find((g) => g.name.toLowerCase() === n.toLowerCase())).filter(Boolean) as Group[];

  const catCounts = useMemo(() => {
    const c: Record<string, number> = { All: groups.length };
    for (const g of groups) { const k = g.offers[0]?.category || "Other"; c[k] = (c[k] || 0) + 1; }
    return c;
  }, [groups]);

  const setMode = (m: "delivery" | "pickup") => { setFulfillment(m); localStorage.setItem(FULFILL_KEY, m); };
  const toggleLock = (id: string, name: string) => {
    if (lockedPharmacy === id) { localStorage.removeItem(LOCK_KEY); setLockedPharmacy(null); toast.success(`Unlocked from ${name}`); }
    else { localStorage.setItem(LOCK_KEY, id); setLockedPharmacy(id); toast.success(`Locked to ${name} — orders will go here first`); }
  };

  const orderOffer = (offer: Offer) => {
    if (offer.requires_prescription) { setRxFor({ med: offer }); return; }
    cart.add({
      medId: offer.id, name: offer.name, price: Number(offer.price),
      pharmacyId: offer.pharmacy_id, pharmacyName: offer.pharmacyName,
      requiresPrescription: !!offer.requires_prescription,
    });
    toast.success(`${offer.name} from ${offer.pharmacyName} added`, {
      description: `${fulfillment === "pickup" ? "Pickup" : "Delivery"} • ETA ${offer.etaMin}–${offer.etaMax} min`,
      action: { label: "Checkout", onClick: () => navigate({ to: "/checkout" }) },
    });
    setActive(null);
  };

  const oneClick = (g: Group) => {
    const open = g.offers.filter((o) => o.isOpen);
    const pool = open.length ? open : g.offers;
    if (!pool.length) { toast.error("No pharmacy available right now"); return; }
    orderOffer(pool[0]); // already sorted: locked first, then closest
  };

  return (
    <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Pill className="h-6 w-6 text-primary" /> Order Medication</h1>
          <p className="text-sm text-muted-foreground">Search any medicine. We'll match you with the closest pharmacy that has it in stock.</p>
        </div>
        <div className="inline-flex rounded-full border border-border bg-card p-1 shadow-sm">
          <button onClick={() => setMode("delivery")} className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition ${fulfillment === "delivery" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
            <Truck className="h-3.5 w-3.5" /> Delivery
          </button>
          <button onClick={() => setMode("pickup")} className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition ${fulfillment === "pickup" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
            <StoreIcon className="h-3.5 w-3.5" /> Pickup
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button variant={myLoc ? "outline" : "default"} size="sm" onClick={useMyLocation} disabled={locBusy} className="rounded-full">
          {locBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crosshair className="h-3.5 w-3.5" />}
          {myLoc ? "Update my location" : "Use my location"}
        </Button>
        {myLoc && (
          <span className="text-[11px] text-muted-foreground">
            📍 Sorting by closest to {myLoc.lat.toFixed(4)}, {myLoc.lng.toFixed(4)}
          </span>
        )}
        {!myLoc && (
          <span className="text-[11px] text-muted-foreground">Pin your location for accurate distance &amp; ETA.</span>
        )}
      </div>

      {lockedPharmacy && phById[lockedPharmacy] && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-2">
          <div className="flex items-center gap-2 text-sm">
            <Lock className="h-4 w-4 text-primary" />
            <span>Connected to <strong>{phById[lockedPharmacy].organization_name || phById[lockedPharmacy].full_name}</strong> — orders go here first.</span>
          </div>
          <Button size="sm" variant="ghost" onClick={() => toggleLock(lockedPharmacy, phById[lockedPharmacy].organization_name || phById[lockedPharmacy].full_name)}>
            <Unlock className="h-3.5 w-3.5" /> Unlock
          </Button>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search any medicine (e.g. paracetamol, insulin, allergy)…"
          className="w-full h-12 rounded-2xl border border-border bg-card pl-12 pr-4 text-sm shadow focus:outline-none focus:ring-2 focus:ring-primary" />
      </div>

      {loading && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}

      {!loading && (
        <div className="-mx-4 sm:mx-0 px-4 sm:px-0 overflow-x-auto">
          <div className="flex gap-2 pb-1 min-w-max">
            {CATEGORIES.map((c) => {
              const Icon = c.icon;
              const count = catCounts[c.key] || 0;
              const isActive = activeCat === c.key;
              return (
                <button key={c.key} onClick={() => setActiveCat(c.key)}
                  className={`flex flex-col items-center justify-center gap-1 min-w-[84px] px-3 py-2.5 rounded-2xl border transition-all ${
                    isActive ? "border-primary bg-primary text-primary-foreground shadow-md" : "border-border bg-card hover:border-primary/40"
                  }`}>
                  <div className={`h-9 w-9 rounded-full flex items-center justify-center ${isActive ? "bg-primary-foreground/15" : c.tone}`}>
                    <Icon className={`h-5 w-5 ${isActive ? "text-primary-foreground" : c.iconColor}`} />
                  </div>
                  <div className="text-[11px] font-semibold leading-tight text-center">{c.label}</div>
                  <div className={`text-[9px] ${isActive ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{count}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!loading && !search && activeCat === "All" && recentGroups.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-2"><History className="h-4 w-4" /> Reorder recent</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recentGroups.map((g) => <MedCard key={g.key} g={g} onOpen={() => setActive(g)} onOneClick={() => oneClick(g)} />)}
          </div>
        </section>
      )}

      {!loading && showGrid && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Pill className="h-4 w-4" /> {search ? `Results for "${q}"` : activeCat} ({filtered.length})
          </h2>
          {filtered.length === 0 ? (
            <div className="healthcare-card p-8 text-center text-sm text-muted-foreground">No medicines match your search.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((g) => <MedCard key={g.key} g={g} onOpen={() => setActive(g)} onOneClick={() => oneClick(g)} />)}
            </div>
          )}
        </section>
      )}

      {!loading && !showGrid && (
        <section className="healthcare-card p-10 text-center space-y-3">
          <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Search className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-lg font-bold">Search for any medicine</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Type the medicine name above, or pick a category to browse. We'll show every pharmacy that has it in stock — sorted by closest to you with live pricing.
          </p>
          <p className="text-[11px] text-muted-foreground">{groups.length} medicines available across {pharmacies.length} pharmacies</p>
        </section>
      )}

      {/* Offers dialog */}
      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-lg">
          {active && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <img src={active.image} alt={active.name} className="h-12 w-12 rounded-lg object-cover" />
                  <div>
                    <div>{active.name}</div>
                    <div className="text-xs font-normal text-muted-foreground">{active.offers.length} pharmacies have this in stock</div>
                  </div>
                </DialogTitle>
                <DialogDescription className="sr-only">Choose a pharmacy to order from</DialogDescription>
              </DialogHeader>

              <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
                {active.offers.map((o, i) => {
                  const locked = lockedPharmacy === o.pharmacy_id;
                  return (
                    <div key={o.id} className={`rounded-xl border p-3 ${i === 0 ? "border-primary bg-primary/5" : "border-border"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link to="/pharmacy/$id" params={{ id: o.pharmacy_id }} className="font-semibold text-sm hover:text-primary line-clamp-1">{o.pharmacyName}</Link>
                            {i === 0 && <span className="px-1.5 py-0.5 rounded bg-primary text-primary-foreground text-[9px] font-bold">CLOSEST</span>}
                            {locked && <span className="px-1.5 py-0.5 rounded bg-healthcare-teal text-white text-[9px] font-bold flex items-center gap-0.5"><Lock className="h-2.5 w-2.5" />MY PHARMACY</span>}
                            {!o.isOpen && <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[9px] font-bold">CLOSED</span>}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1 flex-wrap">
                            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{o.distanceKm} km</span>
                            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{o.etaMin}–{o.etaMax} min</span>
                            <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />{o.rating}</span>
                            <span>Stock: {o.stock_quantity}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-base">R{customerPrice(Number(o.price)).toFixed(0)}</div>
                          <div className="text-[10px] text-muted-foreground">incl. fees</div>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <Button size="sm" className="flex-1 rounded-full" onClick={() => orderOffer(o)}>
                          {o.requires_prescription ? <><Stethoscope className="h-3.5 w-3.5" /> Upload Rx</> : <><Plus className="h-3.5 w-3.5" /> Add to cart</>}
                        </Button>
                        <Button size="sm" variant="outline" className="rounded-full" onClick={() => toggleLock(o.pharmacy_id, o.pharmacyName)}>
                          {locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="text-[11px] text-muted-foreground border-t border-border pt-2">
                Order will be broadcast to <strong>{active.offers[0]?.pharmacyName}</strong>. If they don't accept within 5 minutes, we auto-route to the next closest pharmacy.
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Prescription dialog */}
      <Dialog open={!!rxFor} onOpenChange={(o) => !o && setRxFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Stethoscope className="h-5 w-5 text-primary" /> Prescription required</DialogTitle>
            <DialogDescription>Reuse an approved prescription on file, or upload a new one for the pharmacy to verify.</DialogDescription>
          </DialogHeader>
          {rxFor && (
            <RxPicker
              med={rxFor.med}
              onAttached={(uploadId) => {
                cart.add({
                  medId: rxFor.med.id, name: rxFor.med.name, price: Number(rxFor.med.price),
                  pharmacyId: rxFor.med.pharmacy_id, pharmacyName: rxFor.med.pharmacyName,
                  requiresPrescription: true, prescriptionUploadId: uploadId,
                });
                toast.success(`${rxFor.med.name} added with prescription attached`, {
                  action: { label: "Checkout", onClick: () => navigate({ to: "/checkout" }) },
                });
                setRxFor(null); setActive(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface ExistingRx { id: string; status: string; created_at: string; expires_at: string | null; medication_id: string | null; }
function RxPicker({ med, onAttached }: { med: Offer; onAttached: (uploadId: string) => void }) {
  const { user } = useAuth();
  const [existing, setExisting] = useState<ExistingRx[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"choose" | "upload">("choose");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("prescription_uploads")
        .select("id, status, created_at, expires_at, medication_id")
        .eq("patient_id", user.id)
        .eq("pharmacy_id", med.pharmacy_id)
        .in("status", ["approved", "pending"])
        .order("created_at", { ascending: false });
      const rows = (data ?? []) as ExistingRx[];
      setExisting(rows);
      setMode(rows.length ? "choose" : "upload");
      setLoading(false);
    })();
  }, [user, med.pharmacy_id]);

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-3">
      {mode === "choose" && existing.length > 0 && (
        <>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Use existing prescription</p>
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {existing.map((rx) => {
              const isApproved = rx.status === "approved";
              const expires = rx.expires_at ? new Date(rx.expires_at) : null;
              return (
                <button key={rx.id} onClick={() => onAttached(rx.id)}
                  className="w-full flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 hover:border-primary text-left transition">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Rx · {new Date(rx.created_at).toLocaleDateString()}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {isApproved ? `Approved${expires ? ` · expires ${expires.toLocaleDateString()}` : ""}` : "Pending pharmacy review"}
                    </p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isApproved ? "bg-healthcare-green/20 text-healthcare-green" : "bg-accent text-accent-foreground"}`}>
                    {rx.status.toUpperCase()}
                  </span>
                </button>
              );
            })}
          </div>
          <button onClick={() => setMode("upload")} className="text-xs font-semibold text-primary hover:underline">
            + Upload a new prescription instead
          </button>
        </>
      )}
      {mode === "upload" && (
        <>
          {existing.length > 0 && (
            <button onClick={() => setMode("choose")} className="text-xs font-semibold text-primary hover:underline">
              ← Back to existing prescriptions
            </button>
          )}
          <PrescriptionUploader
            pharmacyId={med.pharmacy_id}
            medicationId={med.id}
            onUploaded={(row) => onAttached(row.id)}
          />
        </>
      )}
    </div>
  );
}

function MedCard({ g, onOpen, onOneClick }: { g: Group; onOpen: () => void; onOneClick: () => void }) {
  const closest = g.offers[0];
  const maxPrice = Math.max(...g.offers.map((o) => Number(o.price)));
  const hasRange = maxPrice > g.minPrice;
  return (
    <div className="group rounded-2xl border border-border bg-card overflow-hidden hover:shadow-xl hover:-translate-y-0.5 transition-all flex flex-col">
      <button onClick={onOpen} className="block text-left w-full">
        <div className="relative h-36 overflow-hidden bg-muted">
          <img src={g.image} alt={g.name} loading="lazy" className="absolute inset-0 h-full w-full object-contain p-2 group-hover:scale-105 transition-transform duration-500" />
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            {g.requiresRx && <span className="px-2 py-0.5 rounded bg-healthcare-sky text-white text-[10px] font-bold shadow">Rx ONLY</span>}
            {closest.category && <span className="px-2 py-0.5 rounded bg-card/95 text-foreground text-[10px] font-semibold shadow">{closest.category}</span>}
          </div>
          {!closest.isOpen && <span className="absolute top-2 right-2 px-2 py-0.5 rounded bg-destructive text-destructive-foreground text-[10px] font-bold shadow">CLOSED</span>}
        </div>
        <div className="p-3 space-y-2">
          <div>
            <h3 className="font-bold text-sm line-clamp-2 leading-tight min-h-[2.5rem]">{g.name}</h3>
            {closest.description && <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{closest.description}</p>}
          </div>

          <div className="flex items-baseline gap-1.5">
            <span className="font-extrabold text-lg text-primary">R{customerPrice(g.minPrice).toFixed(2)}</span>
            {hasRange && <span className="text-[10px] text-muted-foreground">– R{customerPrice(maxPrice).toFixed(2)}</span>}
          </div>

          {/* Supplier panel — Dischem-style */}
          <div className="rounded-lg bg-muted/50 border border-border/60 p-2 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <StoreIcon className="h-3 w-3 text-primary" />
                </div>
                <span className="font-semibold text-[11px] line-clamp-1">{closest.pharmacyName}</span>
              </div>
              <span className="flex items-center gap-0.5 text-[10px] font-semibold shrink-0">
                <Star className="h-2.5 w-2.5 fill-yellow-500 text-yellow-500" />{closest.rating}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><MapPin className="h-2.5 w-2.5" />{closest.distanceKm} km</span>
              <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" />{closest.etaMin}–{closest.etaMax} min</span>
              <span className="flex items-center gap-1 ml-auto"><Pill className="h-2.5 w-2.5" />{closest.stock_quantity} in stock</span>
            </div>
            {g.offers.length > 1 && (
              <div className="text-[10px] text-primary font-semibold pt-0.5">+ {g.offers.length - 1} more {g.offers.length - 1 === 1 ? "pharmacy" : "pharmacies"} nearby</div>
            )}
          </div>
        </div>
      </button>
      <div className="px-3 pb-3 mt-auto flex items-center gap-1.5">
        <Button size="sm" variant="outline" className="flex-1 rounded-full h-9 text-xs" onClick={onOpen}>Compare</Button>
        <Button size="sm" className="flex-1 rounded-full h-9 text-xs" onClick={onOneClick}>
          <Zap className="h-3.5 w-3.5" /> 1-click
        </Button>
      </div>
    </div>
  );
}
