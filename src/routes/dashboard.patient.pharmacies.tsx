import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Search, Star, Clock, MapPin, Store, Phone, Shuffle, Pill, Plus, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCart } from "@/hooks/useCart";
import { customerPrice } from "@/lib/pricing";
import { PrescriptionUploader } from "@/components/PrescriptionVerification";
import { toast } from "sonner";
import pharmacy1 from "@/assets/pharmacy-1.jpg";
import pharmacy2 from "@/assets/pharmacy-2.jpg";
import pharmacy3 from "@/assets/pharmacy-3.jpg";
import pharmacy4 from "@/assets/pharmacy-4.jpg";
import medGeneric from "@/assets/med-generic.jpg";

const IMGS = [pharmacy1, pharmacy2, pharmacy3, pharmacy4];
function img(id: string) { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return IMGS[h % IMGS.length]; }
function meta(id: string) {
  let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const rating = Number((4.0 + ((h % 100) / 100)).toFixed(1));
  const dm = 15 + (h % 6) * 5;
  const fee = (h % 4 === 0) ? 0 : 15 + (h % 4) * 5;
  return { rating, deliveryLabel: `${dm}–${dm + 10} min`, isOpen: (h % 7) !== 0, fee };
}

interface Ph { user_id: string; organization_name: string | null; full_name: string; address: string | null; phone: string | null; }
interface Med { id: string; pharmacy_id: string; name: string; price: number; stock_quantity: number; requires_prescription?: boolean | null; }

export const Route = createFileRoute("/dashboard/patient/pharmacies")({
  head: () => ({ meta: [{ title: "Browse Pharmacies — HEALTHREACH" }] }),
  component: () => <RoleGuard allow="patient"><PharmaciesPage /></RoleGuard>,
});

function PharmaciesPage() {
  const cart = useCart();
  const navigate = useNavigate();
  const [pharmacies, setPharmacies] = useState<Ph[]>([]);
  const [meds, setMeds] = useState<Med[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [rxFor, setRxFor] = useState<{ med: Med; pharmacyId: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "pharmacy");
      const ids = (roles ?? []).map((r: any) => r.user_id);
      if (ids.length) {
        const [{ data: profs }, { data: medsData }] = await Promise.all([
          supabase.from("profiles").select("user_id, organization_name, full_name, address, phone, approval_status").in("user_id", ids).eq("approval_status", "approved"),
          supabase.from("medications").select("id, pharmacy_id, name, price, stock_quantity, requires_prescription").in("pharmacy_id", ids).gt("stock_quantity", 0),
        ]);
        setPharmacies((profs ?? []) as Ph[]);
        setMeds((medsData ?? []) as Med[]);
      }
      setLoading(false);
    })();
  }, []);

  const phById = useMemo(() => Object.fromEntries(pharmacies.map(p => [p.user_id, p])), [pharmacies]);

  const search = q.trim().toLowerCase();

  const filteredPharmacies = pharmacies.filter((p) => {
    if (!search) return true;
    return ((p.organization_name || p.full_name || "").toLowerCase().includes(search))
      || ((p.address ?? "").toLowerCase().includes(search));
  });

  const matchingMeds = search.length >= 2
    ? meds.filter((m) => m.name.toLowerCase().includes(search)).slice(0, 12)
    : [];

  const orderFromRandom = () => {
    const open = pharmacies.filter((p) => meta(p.user_id).isOpen);
    const pool = open.length ? open : pharmacies;
    if (!pool.length) { toast.error("No pharmacies available right now"); return; }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    toast.success(`Opening ${pick.organization_name || pick.full_name}`);
    navigate({ to: "/pharmacy/$id", params: { id: pick.user_id } });
  };

  const addMed = (med: Med) => {
    const ph = phById[med.pharmacy_id];
    if (med.requires_prescription) { setRxFor({ med, pharmacyId: med.pharmacy_id }); return; }
    cart.add({
      medId: med.id, name: med.name, price: Number(med.price),
      pharmacyId: med.pharmacy_id, pharmacyName: ph?.organization_name || ph?.full_name || "Pharmacy",
      requiresPrescription: !!med.requires_prescription,
    });
    toast.success(`${med.name} added to cart`);
  };

  return (
    <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Store className="h-6 w-6 text-primary" /> Order Medication</h1>
          <p className="text-sm text-muted-foreground">Browse {pharmacies.length} pharmacies near you, or search a medicine across all of them.</p>
        </div>
        <Button onClick={orderFromRandom} className="rounded-full" variant="secondary">
          <Shuffle className="h-4 w-4" /> Surprise me
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a medicine, pharmacy or location…"
          className="w-full h-12 rounded-2xl border border-border bg-card pl-12 pr-4 text-sm shadow focus:outline-none focus:ring-2 focus:ring-primary" />
      </div>

      {loading && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}

      {!loading && matchingMeds.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Pill className="h-4 w-4" /> Medicines matching "{q}"
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {matchingMeds.map((m) => {
              const ph = phById[m.pharmacy_id];
              return (
                <div key={m.id} className="rounded-2xl border border-border bg-card overflow-hidden hover:shadow-lg transition-all flex">
                  <div className="relative w-24 h-24 shrink-0">
                    <img src={medGeneric} alt={m.name} className="absolute inset-0 h-full w-full object-cover" />
                    {m.requires_prescription && (
                      <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-healthcare-sky text-white text-[9px] font-bold">Rx</span>
                    )}
                  </div>
                  <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
                    <div>
                      <p className="text-sm font-semibold line-clamp-1">{m.name}</p>
                      <Link to="/pharmacy/$id" params={{ id: m.pharmacy_id }} className="text-[11px] text-muted-foreground hover:text-primary line-clamp-1 underline-offset-2 hover:underline">
                        {ph?.organization_name || ph?.full_name || "Pharmacy"}
                      </Link>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-base font-bold">R{customerPrice(Number(m.price)).toFixed(0)}</span>
                      <Button size="sm" className="h-8 px-2 rounded-full" onClick={() => addMed(m)}>
                        {m.requires_prescription ? <Stethoscope className="h-3.5 w-3.5" /> : <Plus className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {!loading && filteredPharmacies.length === 0 && matchingMeds.length === 0 && (
        <div className="healthcare-card p-8 text-center text-sm text-muted-foreground">No pharmacies or medicines match your search.</div>
      )}

      {!loading && filteredPharmacies.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Store className="h-4 w-4" /> Pharmacies ({filteredPharmacies.length})
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPharmacies.map((p) => {
              const m = meta(p.user_id);
              const name = p.organization_name || p.full_name;
              return (
                <div key={p.user_id} className="group rounded-2xl border border-border bg-card overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all flex flex-col">
                  <Link to="/pharmacy/$id" params={{ id: p.user_id }} className="block">
                    <div className="relative h-40 overflow-hidden">
                      <img src={img(p.user_id)} alt={name} loading="lazy" className="absolute inset-0 h-full w-full object-cover group-hover:scale-110 transition-transform duration-500" />
                      <span className={`absolute top-3 right-3 px-2 py-1 rounded-full text-[10px] font-bold shadow ${m.isOpen ? "bg-healthcare-green text-white" : "bg-muted text-muted-foreground"}`}>{m.isOpen ? "Open" : "Closed"}</span>
                    </div>
                    <div className="p-4 pb-2">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="font-bold text-base text-foreground line-clamp-1">{name}</h3>
                        <span className="flex items-center gap-0.5 text-sm font-semibold shrink-0"><Star className="h-4 w-4 fill-yellow-500 text-yellow-500" /> {m.rating.toFixed(1)}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {m.deliveryLabel}</span>
                        <span>•</span>
                        <span className={m.fee === 0 ? "text-healthcare-green font-medium" : ""}>{m.fee === 0 ? "Free delivery" : `R${m.fee} delivery`}</span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1 flex items-center gap-1"><MapPin className="h-3 w-3" /> {p.address || "Johannesburg"}</p>
                    </div>
                  </Link>
                  <div className="px-4 pb-4 mt-auto flex gap-2">
                    <Button asChild size="sm" className="flex-1 rounded-full">
                      <Link to="/pharmacy/$id" params={{ id: p.user_id }}>Shop</Link>
                    </Button>
                    {p.phone ? (
                      <Button asChild size="sm" variant="outline" className="rounded-full">
                        <a href={`tel:${p.phone.replace(/\s/g, "")}`} aria-label={`Call ${name}`}>
                          <Phone className="h-3.5 w-3.5" /> Contact
                        </a>
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="rounded-full" disabled>
                        <Phone className="h-3.5 w-3.5" /> Contact
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <Dialog open={!!rxFor} onOpenChange={(o) => !o && setRxFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Stethoscope className="h-5 w-5 text-primary" /> Upload prescription</DialogTitle>
          </DialogHeader>
          {rxFor && (
            <>
              <p className="text-xs text-muted-foreground">
                {rxFor.med.name} requires a valid prescription. The pharmacy will see it on their incoming-orders board within minutes.
              </p>
              <PrescriptionUploader pharmacyId={rxFor.pharmacyId} medicationId={rxFor.med.id} onUploaded={() => setRxFor(null)} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
