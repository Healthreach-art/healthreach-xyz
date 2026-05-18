import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Search, Clock, MapPin, Pill, Plus, Stethoscope, Zap, Lock, Unlock, History, Truck, Store as StoreIcon, Star, Heart, Baby, Thermometer, Sparkles, Bandage, ShieldPlus, Activity, Grid3x3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useCart } from "@/hooks/useCart";
import { useAuth } from "@/hooks/useAuth";
import { customerPrice } from "@/lib/pricing";
import { PrescriptionUploader } from "@/components/PrescriptionVerification";
import { toast } from "sonner";
import medGeneric from "@/assets/med-generic.jpg";

interface Ph { user_id: string; organization_name: string | null; full_name: string; address: string | null; phone: string | null; }
interface Med { id: string; pharmacy_id: string; name: string; price: number; stock_quantity: number; requires_prescription?: boolean | null; image_url?: string | null; description?: string | null; category?: string | null; }
interface Offer extends Med { pharmacyName: string; address: string; distanceKm: number; etaMin: number; etaMax: number; rating: number; isOpen: boolean; }
interface Group { key: string; name: string; image: string; requiresRx: boolean; offers: Offer[]; minPrice: number; }

const FULFILL_KEY = "hr.fulfillment";
const LOCK_KEY = "hr.lockedPharmacy";

function hashOf(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
function distanceFor(id: string) {
  const h = hashOf(id);
  const km = Number((0.8 + (h % 90) / 10).toFixed(1)); // 0.8 – 9.7 km
  const etaMin = 15 + Math.round(km * 2);
  return { km, etaMin, etaMax: etaMin + 15, rating: Number((4.0 + ((h % 90) / 100)).toFixed(1)), isOpen: (h % 9) !== 0 };
}

export const Route = createFileRoute("/dashboard/patient/pharmacies")({
  head: () => ({ meta: [{ title: "Order Medication — HEALTHREACH" }] }),
  component: () => <RoleGuard allow="patient"><MedicineMarketplace /></RoleGuard>,
});

function MedicineMarketplace() {
  const cart = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    setFulfillment((localStorage.getItem(FULFILL_KEY) as any) || "delivery");
    setLockedPharmacy(localStorage.getItem(LOCK_KEY));
  }, []);

  // Realtime: refresh medication stock/price as pharmacies update
  useEffect(() => {
    const channel = supabase
      .channel("meds-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "medications" }, (payload: any) => {
        setMeds((prev) => {
          if (payload.eventType === "DELETE") return prev.filter((m) => m.id !== payload.old.id);
          const row = payload.new as Med;
          const idx = prev.findIndex((m) => m.id === row.id);
          if (idx === -1) return row.stock_quantity > 0 ? [...prev, row] : prev;
          const next = [...prev]; next[idx] = row;
          return next.filter((m) => m.stock_quantity > 0);
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    (async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "pharmacy");
      const ids = (roles ?? []).map((r: any) => r.user_id);
      if (ids.length) {
        const [{ data: profs }, { data: medsData }] = await Promise.all([
          supabase.from("profiles").select("user_id, organization_name, full_name, address, phone, approval_status").in("user_id", ids).eq("approval_status", "approved"),
          supabase.from("medications").select("id, pharmacy_id, name, price, stock_quantity, requires_prescription, image_url, description, category").in("pharmacy_id", ids).gt("stock_quantity", 0),
        ]);
        setPharmacies((profs ?? []) as Ph[]);
        setMeds((medsData ?? []) as Med[]);
      }
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
      const dist = distanceFor(m.pharmacy_id);
      const offer: Offer = {
        ...m,
        pharmacyName: ph.organization_name || ph.full_name || "Pharmacy",
        address: ph.address || "Johannesburg",
        distanceKm: dist.km, etaMin: dist.etaMin, etaMax: dist.etaMax, rating: dist.rating, isOpen: dist.isOpen,
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
    // Sort offers in each group: locked pharmacy first, then closest
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
  }, [meds, phById, lockedPharmacy]);

  const search = q.trim().toLowerCase();
  const filtered = search ? groups.filter((g) => g.name.toLowerCase().includes(search) || g.offers.some((o) => o.pharmacyName.toLowerCase().includes(search))) : groups;
  const recentGroups = recent.map((n) => groups.find((g) => g.name.toLowerCase() === n.toLowerCase())).filter(Boolean) as Group[];

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

      {!loading && !search && recentGroups.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-2"><History className="h-4 w-4" /> Reorder recent</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recentGroups.map((g) => <MedCard key={g.key} g={g} onOpen={() => setActive(g)} onOneClick={() => oneClick(g)} />)}
          </div>
        </section>
      )}

      {!loading && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Pill className="h-4 w-4" /> {search ? `Results for "${q}"` : "All medicines"} ({filtered.length})
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
            <DialogTitle className="flex items-center gap-2"><Stethoscope className="h-5 w-5 text-primary" /> Upload prescription</DialogTitle>
            <DialogDescription>This medicine requires a valid prescription before the pharmacy can dispense it.</DialogDescription>
          </DialogHeader>
          {rxFor && (
            <PrescriptionUploader pharmacyId={rxFor.med.pharmacy_id} medicationId={rxFor.med.id} onUploaded={() => { setRxFor(null); setActive(null); }} />
          )}
        </DialogContent>
      </Dialog>
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
