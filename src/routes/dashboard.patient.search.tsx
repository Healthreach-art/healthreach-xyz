import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Search, Loader2, Plus, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrescriptionUploader } from "@/components/PrescriptionVerification";
import { useCart } from "@/hooks/useCart";
import { customerPrice } from "@/lib/pricing";
import { toast } from "sonner";
import medGeneric from "@/assets/med-generic.jpg";

interface Med { id: string; pharmacy_id: string; name: string; price: number; stock_quantity: number; requires_prescription?: boolean | null; }
interface Ph { user_id: string; organization_name: string | null; full_name: string; }

export const Route = createFileRoute("/dashboard/patient/search")({
  head: () => ({ meta: [{ title: "Search Medicines — HEALTHREACH" }] }),
  component: () => <RoleGuard allow="patient"><SearchPage /></RoleGuard>,
});

function SearchPage() {
  const cart = useCart();
  const [meds, setMeds] = useState<Med[]>([]);
  const [pharmacies, setPharmacies] = useState<Ph[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [rxFor, setRxFor] = useState<Med | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: m }, { data: roles }] = await Promise.all([
        supabase.from("medications").select("id, pharmacy_id, name, price, stock_quantity, requires_prescription").gt("stock_quantity", 0).order("name"),
        supabase.from("user_roles").select("user_id").eq("role", "pharmacy"),
      ]);
      setMeds((m ?? []) as Med[]);
      const ids = (roles ?? []).map((r: any) => r.user_id);
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("user_id, organization_name, full_name, approval_status").in("user_id", ids).eq("approval_status", "approved");
        setPharmacies((profs ?? []) as Ph[]);
      }
      setLoading(false);
    })();
  }, []);

  const filtered = meds.filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase()));

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
    <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Search Medicines</h1>
        <p className="text-sm text-muted-foreground">Find any medicine across all approved pharmacies.</p>
      </div>
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a medicine name…" autoFocus
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
                  <p className="text-[11px] text-muted-foreground line-clamp-1">{ph?.organization_name || ph?.full_name || "Pharmacy"}</p>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-base font-bold">R{customerPrice(med.price).toFixed(0)}</span>
                  {med.requires_prescription ? (
                    <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => setRxFor(med)}><Stethoscope className="h-3.5 w-3.5" /></Button>
                  ) : (
                    <Button size="sm" className="h-8 px-2 rounded-full" onClick={() => addToCart(med)}><Plus className="h-4 w-4" /></Button>
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
            <DialogTitle className="flex items-center gap-2"><Stethoscope className="h-5 w-5 text-primary" /> Upload prescription</DialogTitle>
          </DialogHeader>
          {rxFor && <PrescriptionUploader pharmacyId={rxFor.pharmacy_id} medicationId={rxFor.id} onUploaded={() => setRxFor(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
