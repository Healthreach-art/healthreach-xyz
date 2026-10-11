import { createFileRoute, Link } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { firestoreClient } from "@/lib/firestore-client";
import { ChevronRight, HousePlus, Loader2, Pill, Plus, Search, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrescriptionPicker } from "@/components/PrescriptionPicker";
import { useCart } from "@/hooks/useCart";
import { customerPrice } from "@/lib/pricing";
import { toast } from "sonner";
import medGeneric from "@/assets/med-generic.jpg";
import { listPatientMarketplace } from "@/lib/patient-marketplace.functions";
import { PrescriptionBadge } from "@/components/PrescriptionBadge";

interface Med { id: string; pharmacy_id: string; name: string; price: number; stock_quantity: number; requires_prescription?: boolean | null; description?: string | null; category?: string | null; }
interface Ph { user_id: string; organization_name: string | null; full_name: string; }

const POPULAR_SERVICES = [
  { name: "General Medicine", description: "Consultations & treatment" },
  { name: "Pediatrics", description: "Child healthcare" },
  { name: "Cardiology", description: "Heart specialist" },
  { name: "Diabetes Care", description: "Specialised care" },
];

export const Route = createFileRoute("/dashboard/patient/search")({
  head: () => ({ meta: [{ title: "Search Medicines — HealthReachCare" }] }),
  component: () => <RoleGuard allow="patient"><SearchPage /></RoleGuard>,
});

function SearchPage() {
  const cart = useCart();
  const loadMarketplace = useServerFn(listPatientMarketplace);
  const [meds, setMeds] = useState<Med[]>([]);
  const [pharmacies, setPharmacies] = useState<Ph[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [rxFor, setRxFor] = useState<Med | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  function focusMedicineSearch() {
    searchRef.current?.focus();
    searchRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const data = await loadMarketplace();
        if (cancelled) return;
        setMeds(Array.isArray(data?.meds) ? (data.meds as Med[]) : []);
        setPharmacies(Array.isArray(data?.pharmacies) ? (data.pharmacies as Ph[]) : []);
      } catch {
        if (cancelled) return;
        setMeds([]);
        setPharmacies([]);
        toast.error("Could not load medicines");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    refresh();

    // Realtime: refresh whenever any pharmacy updates stock/price.
    const channel = firestoreClient
      .channel("search-meds-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "medications" }, () => { refresh(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "pharmacy_branches" }, () => { refresh(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => { refresh(); })
      .subscribe();
    return () => { cancelled = true; firestoreClient.removeChannel(channel); };
  }, [loadMarketplace]);



  const filtered = meds.filter((m) => {
    if (!q) return true;
    const needle = q.toLowerCase();
    return (
      m.name.toLowerCase().includes(needle) ||
      (m.description ?? "").toLowerCase().includes(needle) ||
      (m.category ?? "").toLowerCase().includes(needle)
    );
  });

  const addToCart = (med: Med) => {
    if (med.requires_prescription) { setRxFor(med); return; }
    const ph = pharmacies.find((p) => p.user_id === med.pharmacy_id);
    cart.add({
      medId: med.id, name: med.name, price: Number(med.price),
      pharmacyId: med.pharmacy_id, pharmacyName: ph?.organization_name || ph?.full_name || "Pharmacy",
      requiresPrescription: !!med.requires_prescription,
    });
    toast.success(`${med.name} added to cart`);
  };

  return (
    <>
      <div className="container-narrow space-y-7 px-4 py-8 pb-24 sm:px-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Search</h1>
          <p className="mt-1 text-sm text-muted-foreground">Find doctors, medicines and care services.</p>
        </div>

        <div className="relative">
          <label htmlFor="med-search" className="sr-only">Search doctors, medicines and services</label>
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input ref={searchRef} id="med-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search doctors, medicines, services..." aria-label="Search doctors, medicines and services"
            className="h-12 w-full rounded-2xl border border-border bg-card pl-12 pr-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Link to="/dashboard/patient/find" search={{ q: "" }} className="group flex items-center gap-3 rounded-2xl border border-sky-100 bg-sky-50 p-4 transition-colors hover:bg-sky-100">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-800"><Stethoscope className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1"><strong className="block text-sm text-foreground">Doctors</strong><span className="text-xs text-muted-foreground">Book an appointment</span></span>
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
          <button type="button" onClick={focusMedicineSearch} className="group flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-left transition-colors hover:bg-emerald-100">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800"><Pill className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1"><strong className="block text-sm text-foreground">Medicines</strong><span className="text-xs text-muted-foreground">Order &amp; deliver</span></span>
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>
          <Link to="/dashboard/patient/homecare" className="group flex items-center gap-3 rounded-2xl border border-teal-100 bg-teal-50 p-4 transition-colors hover:bg-teal-100">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-800"><HousePlus className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1"><strong className="block text-sm text-foreground">Home Care</strong><span className="text-xs text-muted-foreground">Care at home</span></span>
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <section aria-labelledby="popular-services-title">
          <h2 id="popular-services-title" className="mb-3 text-base font-bold text-foreground sm:text-lg">Popular Services</h2>
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {POPULAR_SERVICES.map((service) => (
              <Link key={service.name} to="/dashboard/patient/find" search={{ q: service.name } as any} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Stethoscope className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1"><strong className="block text-sm text-foreground">{service.name}</strong><span className="text-xs text-muted-foreground">{service.description}</span></span>
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </section>

        <section aria-labelledby="medicines-title" className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 id="medicines-title" className="text-lg font-bold text-foreground">Medicine catalog</h2>
              <p className="text-sm text-muted-foreground">Available medicines from approved pharmacies.</p>
            </div>
            <Link to="/dashboard/patient/orders" className="shrink-0 text-sm font-semibold text-primary hover:underline">Orders</Link>
          </div>
          {loading && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
          {!loading && filtered.length === 0 && (
            <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">No medicines match.</div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((med) => {
          const ph = pharmacies.find((p) => p.user_id === med.pharmacy_id);
          return (
            <div key={med.id} className="rounded-2xl border border-border bg-card overflow-hidden hover:shadow-lg transition-all flex">
              <div className="relative w-24 h-24 shrink-0 bg-muted">
                <img src={medGeneric} alt={med.name} className="absolute inset-0 h-full w-full object-cover" />
                {med.requires_prescription && (
                  <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-healthcare-sky text-white text-[9px] font-bold">Rx</span>
                )}
              </div>
              <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
                <div>
                  <p className="text-sm font-semibold line-clamp-1">{med.name}</p>
                  <div className="mt-1"><PrescriptionBadge requiresPrescription={med.requires_prescription} /></div>
                  <Link
                    to="/pharmacy/$id"
                    params={{ id: med.pharmacy_id }}
                    className="text-[11px] text-primary hover:underline line-clamp-1"
                  >
                    {ph?.organization_name || ph?.full_name || "Pharmacy"}
                  </Link>
                  {med.description && (
                    <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1">{med.description}</p>
                  )}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-base font-bold">R{customerPrice(med.price).toFixed(0)}</span>
                  {med.requires_prescription ? (
                    <Button size="sm" variant="outline" aria-label={`Upload prescription for ${med.name}`} className="h-8 px-2" onClick={() => setRxFor(med)}><Stethoscope className="h-3.5 w-3.5" /></Button>
                  ) : (
                    <Button size="sm" aria-label={`Add ${med.name} to cart`} className="h-8 px-2 rounded-full" onClick={() => addToCart(med)}><Plus className="h-4 w-4" /></Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
          </div>
        </section>
        <Dialog open={!!rxFor} onOpenChange={(o) => !o && setRxFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Stethoscope className="h-5 w-5 text-primary" /> Prescription required</DialogTitle>
          </DialogHeader>
          {rxFor && (
            <PrescriptionPicker
              pharmacyId={rxFor.pharmacy_id}
              pharmacyName={pharmacies.find((p) => p.user_id === rxFor.pharmacy_id)?.organization_name || pharmacies.find((p) => p.user_id === rxFor.pharmacy_id)?.full_name}
              medicationId={rxFor.id}
              medicationName={rxFor.name}
              onPicked={(uploadId) => {
                const ph = pharmacies.find((p) => p.user_id === rxFor.pharmacy_id);
                cart.add({
                  medId: rxFor.id, name: rxFor.name, price: Number(rxFor.price),
                  pharmacyId: rxFor.pharmacy_id, pharmacyName: ph?.organization_name || ph?.full_name || "Pharmacy",
                  requiresPrescription: true, prescriptionUploadId: uploadId,
                });
                toast.success(`${rxFor.name} added to cart`);
                setRxFor(null);
              }}
              onUploadedPending={() => { toast.success("Prescription uploaded — we'll notify you once approved"); setRxFor(null); }}
            />
          )}
        </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
