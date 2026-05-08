import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Search, Pill, Star, Clock, MapPin, Stethoscope, Loader2,
  Heart, Thermometer, Sparkles, Repeat, Baby, Bandage, Plus, Store, TrendingUp,
} from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RoleGuard } from "@/components/RoleGuard";
import { PrescriptionUploader } from "@/components/PrescriptionVerification";
import pharmacy1 from "@/assets/pharmacy-1.jpg";
import pharmacy2 from "@/assets/pharmacy-2.jpg";
import pharmacy3 from "@/assets/pharmacy-3.jpg";
import pharmacy4 from "@/assets/pharmacy-4.jpg";
import medGeneric from "@/assets/med-generic.jpg";
import { customerPrice } from "@/lib/pricing";

const PHARMACY_IMAGES = [pharmacy1, pharmacy2, pharmacy3, pharmacy4];
function pharmacyImage(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PHARMACY_IMAGES[h % PHARMACY_IMAGES.length];
}
function pharmacyMeta(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const rating = Number((4.0 + ((h % 100) / 100)).toFixed(1));
  const deliveryMin = 15 + (h % 6) * 5;
  const isOpen = (h % 7) !== 0;
  const fee = (h % 4 === 0) ? 0 : 15 + (h % 4) * 5;
  const badges: string[] = [];
  if (h % 5 === 0) badges.push("Popular");
  if (h % 7 === 0) badges.push("24/7");
  if (deliveryMin <= 20) badges.push("Fast Delivery");
  return { rating, deliveryMin, deliveryLabel: `${deliveryMin}–${deliveryMin + 10} min`, isOpen, fee, badges };
}

export const Route = createFileRoute("/dashboard/patient")({
  head: () => ({ meta: [{ title: "Order Medicine — HEALTHREACH" }] }),
  component: () => <RoleGuard allow="patient"><PatientHome /></RoleGuard>,
});

interface Pharmacy { user_id: string; organization_name: string | null; full_name: string; address: string | null; }
interface Med { id: string; pharmacy_id: string; name: string; price: number; stock_quantity: number; requires_prescription?: boolean | null; }

const CATEGORIES = [
  { key: "Pain Relief", icon: Heart, terms: ["pain", "ibuprofen", "paracetamol", "panado", "aspirin", "disprin", "voltaren"] },
  { key: "Cold & Flu", icon: Thermometer, terms: ["cold", "flu", "cough", "sinus", "med-lemon", "allergex"] },
  { key: "Vitamins", icon: Sparkles, terms: ["vitamin", "supplement", "omega", "magnesium", "zinc"] },
  { key: "Chronic", icon: Repeat, terms: ["chronic", "insulin", "metformin", "blood pressure", "hypertension", "statin", "asthma"] },
  { key: "Baby Care", icon: Baby, terms: ["baby", "infant", "nappy", "calpol"] },
  { key: "First Aid", icon: Bandage, terms: ["bandage", "plaster", "antiseptic", "wound", "burn"] },
];

function PatientHome() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [meds, setMeds] = useState<Med[]>([]);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loading, setLoading] = useState(true);
  const [openPharmacy, setOpenPharmacy] = useState<Pharmacy | null>(null);
  const [storeSearch, setStoreSearch] = useState("");
  const [storeCat, setStoreCat] = useState<string | null>(null);
  const [rxFor, setRxFor] = useState<Med | null>(null);
  const [activeCat, setActiveCat] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: medsData }, { data: roles }] = await Promise.all([
        supabase.from("medications").select("id, pharmacy_id, name, price, stock_quantity, requires_prescription").gt("stock_quantity", 0).order("name"),
        supabase.from("user_roles").select("user_id").eq("role", "pharmacy"),
      ]);
      setMeds((medsData ?? []) as Med[]);
      const ids = (roles ?? []).map((r: any) => r.user_id);
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, organization_name, full_name, address, approval_status")
          .in("user_id", ids)
          .eq("approval_status", "approved");
        setPharmacies((profs ?? []) as Pharmacy[]);
      }
      setLoading(false);
    })();
  }, []);

  const trending = meds.slice(0, 12);
  const activeCategory = CATEGORIES.find((c) => c.key === activeCat);
  const filteredPharmacies = pharmacies.filter((p) => {
    const q = search.toLowerCase();
    if (!q) return true;
    const name = (p.organization_name || p.full_name || "").toLowerCase();
    const addr = (p.address ?? "").toLowerCase();
    return name.includes(q) || addr.includes(q);
  });
  const filteredMeds = trending.filter((m) => {
    const q = search.toLowerCase();
    const matchesQ = !q || m.name.toLowerCase().includes(q);
    const matchesCat = !activeCategory || activeCategory.terms.some((t) => m.name.toLowerCase().includes(t));
    return matchesQ && matchesCat;
  });

  const storeMeds = openPharmacy
    ? meds
        .filter((m) => m.pharmacy_id === openPharmacy.user_id)
        .filter((m) => !storeSearch || m.name.toLowerCase().includes(storeSearch.toLowerCase()))
        .filter((m) => {
          if (!storeCat) return true;
          const cat = CATEGORIES.find((c) => c.key === storeCat);
          return cat?.terms.some((t) => m.name.toLowerCase().includes(t));
        })
    : [];

  return (
    <div className="container-narrow px-4 sm:px-6 py-6 sm:py-8">
      {/* Welcome + sticky search */}
      <div className="mb-5">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
          Welcome back, {profile?.full_name?.split(" ")[0] || "there"} 👋
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Medicine delivered in minutes. Order from pharmacies near you.</p>
      </div>

      <div className="sticky top-2 z-20 mb-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search medicines, pharmacies, brands…"
            className="w-full h-13 sm:h-14 rounded-2xl border border-border bg-card pl-12 pr-4 text-sm sm:text-base shadow-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {/* Categories - horizontal scroll */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-foreground">Shop by category</h2>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
          {CATEGORIES.map((c) => {
            const active = activeCat === c.key;
            return (
              <button
                key={c.key}
                onClick={() => setActiveCat(active ? null : c.key)}
                className={`flex flex-col items-center gap-2 shrink-0 rounded-2xl border p-3 w-24 sm:w-28 transition-all hover:-translate-y-0.5 ${
                  active ? "border-primary bg-primary/10 shadow-md" : "border-border bg-card hover:shadow-md"
                }`}
              >
                <div className={`h-12 w-12 rounded-full flex items-center justify-center ${active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
                  <c.icon className="h-6 w-6" />
                </div>
                <span className="text-xs font-medium text-foreground text-center leading-tight">{c.key}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Featured pharmacies */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Store className="h-5 w-5 text-primary" /> Featured Pharmacies
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">{filteredPharmacies.length} near you</p>
          </div>
        </div>

        {loading && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
        {!loading && filteredPharmacies.length === 0 && (
          <div className="healthcare-card p-8 text-center text-sm text-muted-foreground">No pharmacies match your search.</div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredPharmacies.map((p) => {
            const m = pharmacyMeta(p.user_id);
            const name = p.organization_name || p.full_name;
            const itemCount = meds.filter((med) => med.pharmacy_id === p.user_id).length;
            return (
              <button
                key={p.user_id}
                onClick={() => { setOpenPharmacy(p); setStoreSearch(""); setStoreCat(null); }}
                className="group text-left rounded-2xl border border-border bg-card overflow-hidden transition-all hover:shadow-xl hover:-translate-y-1"
              >
                <div className="relative h-40 overflow-hidden">
                  <img src={pharmacyImage(p.user_id)} alt={name} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                  {m.badges.length > 0 && (
                    <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                      {m.badges.slice(0, 2).map((b) => (
                        <span key={b} className="px-2 py-1 rounded-full bg-white/95 backdrop-blur text-[10px] font-bold text-primary shadow">
                          {b}
                        </span>
                      ))}
                    </div>
                  )}
                  <span className={`absolute top-3 right-3 px-2 py-1 rounded-full text-[10px] font-bold shadow ${m.isOpen ? "bg-healthcare-green text-white" : "bg-muted text-muted-foreground"}`}>
                    {m.isOpen ? "Open" : "Closed"}
                  </span>
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-bold text-base text-foreground line-clamp-1">{name}</h3>
                    <span className="flex items-center gap-0.5 text-sm font-semibold text-foreground shrink-0">
                      <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" /> {m.rating.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {m.deliveryLabel}</span>
                    <span>•</span>
                    <span className={m.fee === 0 ? "text-healthcare-green font-medium" : ""}>{m.fee === 0 ? "Free delivery" : `R${m.fee} delivery`}</span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1 flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {p.address || "Johannesburg"} · {itemCount} items
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Trending medicines */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" /> Trending medicines
          </h2>
        </div>
        {loading && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
        {!loading && filteredMeds.length === 0 && (
          <div className="healthcare-card p-6 text-center text-sm text-muted-foreground">No medicines match.</div>
        )}
        <div className="flex gap-4 overflow-x-auto pb-3 -mx-1 px-1 snap-x">
          {filteredMeds.map((med) => {
            const ph = pharmacies.find((p) => p.user_id === med.pharmacy_id);
            return (
              <div key={med.id} className="snap-start shrink-0 w-44 sm:w-52 rounded-2xl border border-border bg-card overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all">
                <div className="relative h-32 bg-muted">
                  <img src={medGeneric} alt={med.name} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                  {med.requires_prescription && (
                    <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-healthcare-sky text-white text-[9px] font-bold">Rx</span>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-sm font-semibold text-foreground line-clamp-1">{med.name}</p>
                  <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{ph?.organization_name || ph?.full_name || "Pharmacy"}</p>
                  <p className="text-[11px] text-muted-foreground">{med.stock_quantity} in stock</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-base font-bold text-foreground">R{customerPrice(med.price).toFixed(0)}</span>
                    {med.requires_prescription ? (
                      <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => setRxFor(med)}>
                        <Stethoscope className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <Button size="sm" className="h-8 px-2 rounded-full" onClick={() => navigate({ to: "/payment", search: { medId: med.id, name: med.name, price: Number(med.price), pharmacyId: med.pharmacy_id, qty: 1 } as any })}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Pharmacy Store - Uber Eats style full-screen */}
      <Dialog open={!!openPharmacy} onOpenChange={(o) => !o && setOpenPharmacy(null)}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-0 gap-0">
          {openPharmacy && (() => {
            const m = pharmacyMeta(openPharmacy.user_id);
            const name = openPharmacy.organization_name || openPharmacy.full_name;
            return (
              <>
                <DialogHeader className="sr-only"><DialogTitle>{name}</DialogTitle></DialogHeader>
                {/* Hero banner */}
                <div className="relative h-44 sm:h-56 overflow-hidden">
                  <img src={pharmacyImage(openPharmacy.user_id)} alt={name} className="absolute inset-0 h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
                  <div className="absolute bottom-4 left-6 right-6">
                    <h2 className="text-2xl sm:text-3xl font-bold text-foreground">{name}</h2>
                    <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-foreground mt-2">
                      <span className="flex items-center gap-1 font-semibold">
                        <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" /> {m.rating.toFixed(1)}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${m.isOpen ? "bg-healthcare-green text-white" : "bg-muted"}`}>
                        {m.isOpen ? "Open" : "Closed"}
                      </span>
                      <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {m.deliveryLabel}</span>
                      <span>{m.fee === 0 ? "Free delivery" : `R${m.fee} delivery`}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><MapPin className="h-3 w-3" /> {openPharmacy.address || "Johannesburg"}</p>
                  </div>
                </div>

                {/* Search inside pharmacy */}
                <div className="px-6 pt-4 pb-2 sticky top-0 bg-background z-10 border-b border-border">
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      value={storeSearch}
                      onChange={(e) => setStoreSearch(e.target.value)}
                      placeholder={`Search inside ${name}…`}
                      className="w-full h-10 rounded-xl border border-border bg-card pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    <button
                      onClick={() => setStoreCat(null)}
                      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border ${!storeCat ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-accent"}`}
                    >All</button>
                    {CATEGORIES.map((c) => (
                      <button
                        key={c.key}
                        onClick={() => setStoreCat(storeCat === c.key ? null : c.key)}
                        className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border ${storeCat === c.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-accent"}`}
                      >{c.key}</button>
                    ))}
                  </div>
                </div>

                {/* Products grid */}
                <div className="px-6 py-4">
                  {storeMeds.length === 0 ? (
                    <p className="text-sm text-center text-muted-foreground py-10">No products in this category.</p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {storeMeds.map((med) => (
                        <div key={med.id} className="group flex items-center gap-3 rounded-xl border border-border p-3 hover:shadow-md hover:border-primary/40 transition-all">
                          <img src={medGeneric} alt="" loading="lazy" className="h-16 w-16 rounded-lg object-cover shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground line-clamp-1">{med.name}</p>
                            <p className="text-[11px] text-muted-foreground">{med.stock_quantity} in stock {med.requires_prescription && "· Rx"}</p>
                            <p className="text-base font-bold text-foreground mt-0.5">R{customerPrice(med.price).toFixed(2)}</p>
                          </div>
                          {med.requires_prescription ? (
                            <Button size="sm" variant="outline" onClick={() => { setRxFor(med); setOpenPharmacy(null); }}>
                              <Stethoscope className="h-3.5 w-3.5" /> Rx
                            </Button>
                          ) : (
                            <Button size="sm" className="rounded-full h-9 w-9 p-0 group-hover:scale-110 transition-transform" onClick={() => { setOpenPharmacy(null); navigate({ to: "/payment", search: { medId: med.id, name: med.name, price: Number(med.price), pharmacyId: med.pharmacy_id, qty: 1 } as any }); }}>
                              <Plus className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Prescription upload */}
      <Dialog open={!!rxFor} onOpenChange={(o) => !o && setRxFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-primary" /> Upload prescription
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {rxFor?.name} requires a valid prescription. Upload an image or PDF — your assigned pharmacy will verify it within minutes.
            </p>
          </DialogHeader>
          {rxFor && <PrescriptionUploader pharmacyId={rxFor.pharmacy_id} medicationId={rxFor.id} onUploaded={() => setRxFor(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
