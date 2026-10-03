import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { useEffect, useState } from "react";
import { firestoreClient } from "@/lib/firestore-client";
import { useAuth } from "@/hooks/useAuth";
import {
  Search, Star, Clock, MapPin, Stethoscope, Loader2, ArrowLeft, Plus,
  Heart, Thermometer, Sparkles, Repeat, Baby, Bandage, CalendarPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCart } from "@/hooks/useCart";
import { customerPrice } from "@/lib/pricing";
import { PrescriptionPicker } from "@/components/PrescriptionPicker";
import { toast } from "sonner";
import pharmacy1 from "@/assets/pharmacy-1.jpg";
import pharmacy2 from "@/assets/pharmacy-2.jpg";
import pharmacy3 from "@/assets/pharmacy-3.jpg";
import pharmacy4 from "@/assets/pharmacy-4.jpg";
import medGeneric from "@/assets/med-generic.jpg";

const PHARMACY_IMAGES = [pharmacy1, pharmacy2, pharmacy3, pharmacy4];
function pharmacyImage(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PHARMACY_IMAGES[h % PHARMACY_IMAGES.length];
}
function pharmacyMeta(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return {
    rating: Number((4.0 + ((h % 100) / 100)).toFixed(1)),
    deliveryLabel: `${15 + (h % 6) * 5}–${25 + (h % 6) * 5} min`,
    isOpen: (h % 7) !== 0,
    fee: (h % 4 === 0) ? 0 : 15 + (h % 4) * 5,
  };
}

const CATEGORIES = [
  { key: "All", icon: Sparkles, terms: [] as string[] },
  { key: "Pain Relief", icon: Heart, terms: ["pain", "ibuprofen", "paracetamol", "panado", "aspirin", "disprin", "voltaren"] },
  { key: "Cold & Flu", icon: Thermometer, terms: ["cold", "flu", "cough", "sinus", "med-lemon", "allergex"] },
  { key: "Vitamins", icon: Sparkles, terms: ["vitamin", "supplement", "omega", "magnesium", "zinc"] },
  { key: "Chronic", icon: Repeat, terms: ["chronic", "insulin", "metformin", "blood pressure", "hypertension", "statin", "asthma"] },
  { key: "Baby Care", icon: Baby, terms: ["baby", "infant", "nappy", "calpol"] },
  { key: "First Aid", icon: Bandage, terms: ["bandage", "plaster", "antiseptic", "wound", "burn"] },
];

interface Pharmacy { user_id: string; organization_name: string | null; full_name: string; address: string | null; appointments_enabled: boolean; walkins_enabled: boolean; opening_hours: string | null; services: string[] | null; phone: string | null; }
interface Med { id: string; pharmacy_id: string; name: string; price: number; stock_quantity: number; requires_prescription?: boolean | null; description?: string | null; }

export const Route = createFileRoute("/pharmacy/$id")({
  loader: async ({ params }) => {
    const { data } = await firestoreClient
      .from("pharmacy_directory")
      .select("organization_name, full_name, address")
      .eq("user_id", params.id)
      .maybeSingle();
    const name = data?.organization_name || data?.full_name || "Pharmacy";
    return { name, address: data?.address ?? null };
  },
  head: ({ params, loaderData }) => {
    const name = loaderData?.name ?? "Pharmacy";
    const url = `https://healthreachcare.co.za/pharmacy/${params.id}`;
    const description = `Browse and order medication from ${name} on HealthReachCare. Live stock, fast delivery in South Africa.`;
    return {
      meta: [
        { title: `${name} — HealthReachCare` },
        { name: "description", content: description },
        { property: "og:title", content: `${name} — HealthReachCare` },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Pharmacy",
            name,
            url,
            address: {
              "@type": "PostalAddress",
              streetAddress: loaderData?.address ?? undefined,
              addressLocality: "Cape Town",
              addressCountry: "ZA",
            },
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: "4.5",
              reviewCount: "120",
            },
          }),
        },
      ],
    };
  },
  component: () => <RoleGuard allow="patient"><Storefront /></RoleGuard>,
});

function Storefront() {
  const { id } = useParams({ from: "/pharmacy/$id" });
  const navigate = useNavigate();
  const { user } = useAuth();
  const cart = useCart();
  const [pharmacy, setPharmacy] = useState<Pharmacy | null>(null);
  const [meds, setMeds] = useState<Med[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("All");
  const [rxFor, setRxFor] = useState<Med | null>(null);
  const [apptOpen, setApptOpen] = useState(false);
  const [apptWhen, setApptWhen] = useState("");
  const [apptMode, setApptMode] = useState("in_person");
  const [apptReason, setApptReason] = useState("");
  const [apptBusy, setApptBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: prof }, { data: medsData }] = await Promise.all([
        firestoreClient.from("pharmacy_directory").select("user_id, organization_name, full_name, address, appointments_enabled, walkins_enabled, opening_hours, services, phone").eq("user_id", id).maybeSingle(),
        firestoreClient.from("medications").select("id, pharmacy_id, name, price, stock_quantity, requires_prescription, description").eq("pharmacy_id", id).gt("stock_quantity", 0).order("name"),
      ]);
      setPharmacy(prof as Pharmacy | null);
      setMeds((medsData ?? []) as Med[]);
      setLoading(false);
    })();
  }, [id]);

  const m = pharmacyMeta(id);
  const name = pharmacy?.organization_name || pharmacy?.full_name || "Pharmacy";

  const filtered = meds
    .filter((med) => !search || med.name.toLowerCase().includes(search.toLowerCase()))
    .filter((med) => {
      if (cat === "All") return true;
      const c = CATEGORIES.find((x) => x.key === cat);
      return c?.terms.some((t) => med.name.toLowerCase().includes(t));
    });

  const handleAdd = (med: Med) => {
    if (med.requires_prescription) { setRxFor(med); return; }
    cart.add({
      medId: med.id, name: med.name, price: Number(med.price),
      pharmacyId: med.pharmacy_id, pharmacyName: name,
      requiresPrescription: !!med.requires_prescription,
    });
    toast.success(`${med.name} added to cart`);
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }
  if (!pharmacy) {
    return (
      <div className="container-narrow px-4 sm:px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">Pharmacy not found.</p>
        <Button asChild className="mt-4"><Link to="/dashboard/patient">Back to home</Link></Button>
      </div>
    );
  }

  return (
    <div className="pb-24">
      {/* Hero banner */}
      <div className="relative h-56 sm:h-72 overflow-hidden">
        <img src={pharmacyImage(id)} alt={name} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
        <Link to="/dashboard/patient" aria-label="Back to dashboard" className="absolute top-4 left-4 z-10 rounded-full bg-background/90 backdrop-blur p-2 hover:bg-background shadow-md">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="absolute bottom-5 left-4 right-4 sm:left-8 sm:right-8 max-w-3xl mx-auto">
          <h1 className="text-2xl sm:text-4xl font-bold text-foreground">{name}</h1>
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
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <MapPin className="h-3 w-3" /> {pharmacy.address || "Cape Town"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {pharmacy.appointments_enabled && (
              <Button size="sm" onClick={() => setApptOpen(true)} className="rounded-full">
                <CalendarPlus className="h-4 w-4 mr-1" /> Book appointment
              </Button>
            )}
            {pharmacy.walkins_enabled && (
              <span className="inline-flex items-center gap-1 rounded-full bg-healthcare-mint/40 text-foreground px-3 py-1.5 text-xs font-semibold">
                <MapPin className="h-3.5 w-3.5" /> Walk-ins welcome
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Services + walk-in info */}
      {(pharmacy.walkins_enabled || (pharmacy.services?.length ?? 0) > 0) && (
        <div className="container-narrow px-4 sm:px-6 pt-5">
          <div className="healthcare-card p-4 grid gap-3 sm:grid-cols-2">
            {pharmacy.walkins_enabled && (
              <div>
                <p className="text-xs font-bold uppercase text-muted-foreground">Walk-in hours</p>
                <p className="text-sm mt-1">{pharmacy.opening_hours?.trim() || "Mon–Fri 08:00–18:00"}</p>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><MapPin className="h-3 w-3" /> {pharmacy.address || "Cape Town"}</p>
              </div>
            )}
            {(pharmacy.services?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-bold uppercase text-muted-foreground">Services offered</p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {pharmacy.services!.map((s) => (
                    <span key={s} className="px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-[11px] font-semibold">{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      

      {/* Sticky search + tabs */}
      <div className="sticky top-12 z-20 bg-background/95 backdrop-blur border-b border-border">
        <div className="container-narrow px-4 sm:px-6 py-3 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search inside ${name}…`}
              aria-label={`Search products inside ${name}`}
              className="w-full h-11 rounded-xl border border-border bg-card pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setCat(c.key)}
                className={`shrink-0 px-3.5 py-2 rounded-full text-xs font-semibold border whitespace-nowrap ${cat === c.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-accent text-foreground"}`}
              >{c.key}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Products */}
      <div className="container-narrow px-4 sm:px-6 py-6">
        {filtered.length === 0 ? (
          <p className="text-sm text-center text-muted-foreground py-12">No products match your search.</p>
        ) : (
          <>
            <h2 className="text-lg font-bold text-foreground mb-4">{filtered.length} item{filtered.length === 1 ? "" : "s"}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((med) => (
                <div key={med.id} className="group flex gap-3 rounded-2xl border border-border bg-card p-3 hover:shadow-lg hover:border-primary/40 hover:-translate-y-0.5 transition-all">
                  <img src={medGeneric} alt="" loading="lazy" className="h-20 w-20 rounded-xl object-cover shrink-0" />
                  <div className="flex-1 min-w-0 flex flex-col">
                    <p className="text-sm font-semibold text-foreground line-clamp-2">{med.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {med.stock_quantity} in stock {med.requires_prescription && "· Rx"}
                    </p>
                    <div className="mt-auto flex items-center justify-between pt-2">
                      <span className="text-base font-bold text-foreground">R{customerPrice(med.price).toFixed(2)}</span>
                      {med.requires_prescription ? (
                        <Button size="sm" variant="outline" onClick={() => setRxFor(med)}>
                          <Stethoscope className="h-3.5 w-3.5" /> Rx
                        </Button>
                      ) : (
                        <Button size="sm" aria-label={`Add ${med.name} to cart`} className="rounded-full h-9 w-9 p-0 group-hover:scale-110 transition-transform" onClick={() => handleAdd(med)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Rx upload */}
      <Dialog open={!!rxFor} onOpenChange={(o) => !o && setRxFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-primary" /> Prescription required
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {rxFor?.name} needs a valid prescription. Pick an approved one below or upload a new one.
            </p>
          </DialogHeader>
          {rxFor && (
            <PrescriptionPicker
              pharmacyId={rxFor.pharmacy_id}
              pharmacyName={name}
              medicationId={rxFor.id}
              medicationName={rxFor.name}
              onPicked={(uploadId) => {
                cart.add({
                  medId: rxFor.id, name: rxFor.name, price: Number(rxFor.price),
                  pharmacyId: rxFor.pharmacy_id, pharmacyName: name,
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

      {/* Book appointment */}
      <Dialog open={apptOpen} onOpenChange={setApptOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-primary" /> Book at {name}
            </DialogTitle>
            <DialogDescription>{pharmacy.address || "Pick a date & time to visit or consult."}</DialogDescription>
            <p className="text-xs text-muted-foreground pt-1">You are booking with a <span className="font-semibold text-healthcare-teal">Pharmacist</span></p>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Preferred date & time</Label>
              <Input
                type="datetime-local"
                value={apptWhen}
                min={new Date(Date.now() + 30 * 60 * 1000).toISOString().slice(0, 16)}
                onChange={(e) => setApptWhen(e.target.value)}
              />
            </div>
            <div>
              <Label>Appointment type</Label>
              <Select value={apptMode} onValueChange={setApptMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_person">In-person</SelectItem>
                  <SelectItem value="phone">Phone consultation</SelectItem>
                  <SelectItem value="video">Video consultation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reason (optional)</Label>
              <Textarea
                rows={3}
                value={apptReason}
                onChange={(e) => setApptReason(e.target.value)}
                placeholder="What would you like advice on?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={apptBusy}
              onClick={async () => {
                if (!user) { navigate({ to: "/login" }); return; }
                if (!apptWhen) { toast.error("Pick a date & time"); return; }
                setApptBusy(true);
                const { error } = await firestoreClient.from("pharmacy_appointments").insert({
                  patient_id: user.id,
                  pharmacy_id: id,
                  reason: apptReason.trim().slice(0, 1000),
                  preferred_at: new Date(apptWhen).toISOString(),
                  mode: apptMode,
                  status: "pending",
                });
                setApptBusy(false);
                if (error) { toast.error(error.message); return; }
                toast.success(`Appointment requested at ${name}`);
                setApptOpen(false);
                setApptWhen(""); setApptReason("");
              }}
            >
              {apptBusy ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Booking…</> : "Confirm booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
