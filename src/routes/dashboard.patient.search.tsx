import { createFileRoute, Link } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft } from "lucide-react";
import { Search, Loader2, Plus, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrescriptionPicker } from "@/components/PrescriptionPicker";
import { useCart } from "@/hooks/useCart";
import { customerPrice } from "@/lib/pricing";
import { toast } from "sonner";
import medGeneric from "@/assets/med-generic.jpg";
import { listPatientMarketplace } from "@/lib/patient-marketplace.functions";

interface Med { id: string; pharmacy_id: string; name: string; price: number; stock_quantity: number; requires_prescription?: boolean | null; description?: string | null; category?: string | null; }
interface Ph { user_id: string; organization_name: string | null; full_name: string; }

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
    const channel = supabase
      .channel("search-meds-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "medications" }, () => { refresh(); })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
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
      <Link to="/dashboard/patient" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to Dashboard
      </Link>
    <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Search Medicines</h1>
        <p className="text-sm text-muted-foreground">Find any medicine across all approved pharmacies.</p>
      </div>
      <div className="relative">
        <label htmlFor="med-search" className="sr-only">Search medicines</label>
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <input id="med-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, symptom, ingredient, category…" autoFocus aria-label="Search medicines"
          className="w-full h-12 rounded-2xl border border-border bg-card pl-12 pr-4 text-sm shadow focus:outline-none focus:ring-2 focus:ring-primary" />
      </div>
      {loading && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
      {!loading && filtered.length === 0 && (
        <div className="healthcare-card p-8 text-center text-sm text-muted-foreground">No medicines match.</div>
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
  );
}
