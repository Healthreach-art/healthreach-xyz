import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Plus, Search, Stethoscope } from "lucide-react";
import { RoleGuard } from "@/components/RoleGuard";
import { PatientAddressHeader } from "@/components/PatientAddressHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrescriptionPicker } from "@/components/PrescriptionPicker";
import { PrescriptionBadge } from "@/components/PrescriptionBadge";
import { useCart } from "@/hooks/useCart";
import { customerPrice } from "@/lib/pricing";
import { listPatientMarketplace } from "@/lib/patient-marketplace.functions";
import { firestoreClient } from "@/lib/firestore-client";
import { toast } from "sonner";
import medGeneric from "@/assets/med-generic.jpg";

interface Med {
  id: string;
  pharmacy_id: string;
  name: string;
  price: number;
  stock_quantity: number;
  requires_prescription?: boolean | null;
  image_url?: string | null;
  description?: string | null;
  category?: string | null;
}
interface Pharmacy {
  user_id: string;
  organization_name: string | null;
  full_name: string;
}

const CATEGORIES = ["All", "Pain Relief", "Chronic", "Antibiotics", "Vitamins & Supplements", "Cold & Flu", "Baby & Child", "First Aid"];

export const Route = createFileRoute("/dashboard/patient/medications")({
  head: () => ({ meta: [{ title: "Order Medication — HealthReachCare" }] }),
  component: () => <RoleGuard allow="patient"><MedicationMarketplace /></RoleGuard>,
});

function matchesCategory(medication: Med, category: string) {
  if (category === "All") return true;
  const value = `${medication.category ?? ""} ${medication.name} ${medication.description ?? ""}`.toLowerCase();
  const terms: Record<string, string[]> = {
    "Pain Relief": ["pain", "analgesic", "paracetamol", "ibuprofen"],
    Chronic: ["chronic", "diabetes", "blood pressure", "hypertension"],
    Antibiotics: ["antibiotic", "antimicrobial"],
    "Vitamins & Supplements": ["vitamin", "supplement", "mineral"],
    "Cold & Flu": ["cold", "flu", "cough", "allergy"],
    "Baby & Child": ["baby", "child", "paediatric", "pediatric"],
    "First Aid": ["first aid", "bandage", "antiseptic", "wound"],
  };
  return terms[category]?.some((term) => value.includes(term)) ?? false;
}

function MedicationMarketplace() {
  const cart = useCart();
  const loadMarketplace = useServerFn(listPatientMarketplace);
  const [medications, setMedications] = useState<Med[]>([]);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [rxFor, setRxFor] = useState<Med | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const data = await loadMarketplace();
        if (cancelled) return;
        setMedications(Array.isArray(data?.meds) ? data.meds as Med[] : []);
        setPharmacies(Array.isArray(data?.pharmacies) ? data.pharmacies as Pharmacy[] : []);
      } catch (error) {
        if (cancelled) return;
        setMedications([]);
        setPharmacies([]);
        toast.error(error instanceof Error ? `Could not load medicines: ${error.message}` : "Could not load medicines");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void refresh();
    const channel = firestoreClient.channel("patient-medications-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "medications_public" }, () => void refresh())
      .subscribe();
    return () => { cancelled = true; void firestoreClient.removeChannel(channel); };
  }, [loadMarketplace]);

  const filtered = useMemo(() => medications.filter((medication) => {
    const needle = query.trim().toLowerCase();
    const matchesSearch = !needle || [medication.name, medication.category, medication.description]
      .some((text) => (text ?? "").toLowerCase().includes(needle));
    return matchesSearch && matchesCategory(medication, category);
  }), [medications, query, category]);

  function addToCart(medication: Med) {
    if (medication.requires_prescription) { setRxFor(medication); return; }
    const pharmacy = pharmacies.find((entry) => entry.user_id === medication.pharmacy_id);
    cart.add({
      medId: medication.id,
      name: medication.name,
      price: Number(medication.price),
      pharmacyId: medication.pharmacy_id,
      pharmacyName: pharmacy?.organization_name || pharmacy?.full_name || "Pharmacy",
      requiresPrescription: false,
      stock: medication.stock_quantity,
    });
    toast.success(`${medication.name} added to cart`);
  }

  return (
    <>
      <PatientAddressHeader />
      <main className="container-narrow space-y-6 px-4 py-7 pb-24 sm:px-6">
        <Link to="/dashboard/patient" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 h-4 w-4" /> Dashboard</Link>
        <header>
          <p className="text-xs font-semibold uppercase text-healthcare-green">Pharmacy marketplace</p>
          <h1 className="mt-1 text-2xl font-bold">Order medication</h1>
          <p className="mt-1 text-sm text-muted-foreground">Browse medicines listed by approved, active pharmacies.</p>
        </header>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input aria-label="Search medicines" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, category or description"
            className="h-11 w-full rounded-md border border-border bg-card pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Medication categories">
          {CATEGORIES.map((item) => <Button key={item} variant={category === item ? "default" : "outline"} size="sm" className="shrink-0" onClick={() => setCategory(item)}>{item}</Button>)}
        </div>

        {loading ? <p className="py-10 text-center text-sm text-muted-foreground">Loading available medicines…</p> : filtered.length === 0 ? (
          <div className="border border-dashed border-border p-8 text-center">
            <p className="font-semibold">No medicines found</p>
            <p className="mt-1 text-sm text-muted-foreground">No products are currently listed by approved pharmacies in this area. Try another category or search.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((medication) => {
              const pharmacy = pharmacies.find((entry) => entry.user_id === medication.pharmacy_id);
              return (
                <article key={medication.id} className="flex min-w-0 overflow-hidden border border-border bg-card">
                  <div className="relative h-28 w-24 shrink-0 bg-muted sm:h-32 sm:w-28">
                    <img src={medication.image_url || medGeneric} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    {medication.requires_prescription && <span className="absolute left-2 top-2 rounded bg-healthcare-sky px-1.5 py-0.5 text-[10px] font-bold text-white">Rx</span>}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold">{medication.name}</h2>
                      <div className="mt-1"><PrescriptionBadge requiresPrescription={medication.requires_prescription} /></div>
                      {medication.category && <p className="mt-1 text-[11px] text-muted-foreground">{medication.category}</p>}
                      {medication.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{medication.description}</p>}
                      <Link to="/pharmacy/$id" params={{ id: medication.pharmacy_id }} className="mt-1 block truncate text-xs text-primary hover:underline">{pharmacy?.organization_name || pharmacy?.full_name || "Dispensing pharmacy"}</Link>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div><p className="text-sm font-bold">R{customerPrice(Number(medication.price)).toFixed(2)}</p><p className="text-[10px] text-healthcare-green">{medication.stock_quantity} available</p></div>
                      {medication.requires_prescription ? <Button size="sm" variant="outline" onClick={() => setRxFor(medication)}><Stethoscope className="mr-1 h-4 w-4" /> Prescription</Button> : <Button size="icon" aria-label={`Add ${medication.name} to cart`} onClick={() => addToCart(medication)}><Plus className="h-4 w-4" /></Button>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
      <Dialog open={!!rxFor} onOpenChange={(value) => !value && setRxFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Prescription required</DialogTitle></DialogHeader>
          {rxFor && <PrescriptionPicker
            pharmacyId={rxFor.pharmacy_id}
            pharmacyName={pharmacies.find((entry) => entry.user_id === rxFor.pharmacy_id)?.organization_name || pharmacies.find((entry) => entry.user_id === rxFor.pharmacy_id)?.full_name || undefined}
            medicationId={rxFor.id}
            medicationName={rxFor.name}
            onPicked={(uploadId) => {
              const pharmacy = pharmacies.find((entry) => entry.user_id === rxFor.pharmacy_id);
              cart.add({ medId: rxFor.id, name: rxFor.name, price: Number(rxFor.price), pharmacyId: rxFor.pharmacy_id, pharmacyName: pharmacy?.organization_name || pharmacy?.full_name || "Pharmacy", requiresPrescription: true, prescriptionUploadId: uploadId, stock: rxFor.stock_quantity });
              toast.success(`${rxFor.name} added to cart`);
              setRxFor(null);
            }}
            onUploadedPending={() => { toast.success("Prescription uploaded. We’ll notify you once it is reviewed."); setRxFor(null); }}
          />}
        </DialogContent>
      </Dialog>
    </>
  );
}
