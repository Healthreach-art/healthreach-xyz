import { createFileRoute, Link } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Stethoscope, Star, MapPin, Video, Phone, User, Search } from "lucide-react";

const SPECIALTIES = [
  "All", "General Practitioner", "Dentist", "Optometrist",
  "Psychologist", "Pediatrician", "Gynecologist", "Cardiologist",
  "Dermatologist", "Other",
];

const PROVIDERS = ["All", "Discovery Health", "Bonitas", "Momentum Health", "Medihelp", "Fedhealth", "Bestmed", "GEMS"];

export const Route = createFileRoute("/dashboard/patient/doctors")({
  head: () => ({ meta: [{ title: "Find a Doctor — HEALTHREACH" }] }),
  component: () => <RoleGuard allow="patient"><Page /></RoleGuard>,
});

interface Doctor {
  id: string; full_name: string; specialty: string; qualifications: string;
  practice_number: string; bio: string; photo_url: string;
  consultation_fee: number; accepted_medical_aids: string[];
  online_available: boolean; in_person_available: boolean; phone_available: boolean;
  city: string; address: string; rating_avg: number; rating_count: number;
}

function Page() {
  const [docs, setDocs] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [specialty, setSpecialty] = useState("All");
  const [provider, setProvider] = useState("All");
  const [city, setCity] = useState("");
  const [onlineOnly, setOnlineOnly] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("doctors").select("*").eq("is_active", true).order("rating_avg", { ascending: false });
      setDocs((data ?? []) as Doctor[]);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => docs.filter((d) => {
    if (q && !`${d.full_name} ${d.specialty} ${d.bio}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (specialty !== "All" && d.specialty !== specialty) return false;
    if (provider !== "All" && !d.accepted_medical_aids.includes(provider)) return false;
    if (city && !d.city.toLowerCase().includes(city.toLowerCase())) return false;
    if (onlineOnly && !d.online_available) return false;
    return true;
  }), [docs, q, specialty, provider, city, onlineOnly]);

  return (
    <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Stethoscope className="h-6 w-6 text-primary" /> Find a Doctor
        </h1>
        <p className="text-sm text-muted-foreground">Search by specialty, medical aid, or online consultation.</p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search doctor or keyword…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div><Label className="text-xs">Specialty</Label>
            <Select value={specialty} onValueChange={setSpecialty}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SPECIALTIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Medical aid accepted</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PROVIDERS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">City</Label>
            <Input placeholder="e.g. Johannesburg" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={onlineOnly} onCheckedChange={(c) => setOnlineOnly(!!c)} />
          Online consultation available
        </label>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading doctors…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center">
          <Stethoscope className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No doctors match your filters yet.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((d) => (
            <Link key={d.id} to="/dashboard/patient/doctors/$id" params={{ id: d.id }}
                  className="rounded-2xl border border-border bg-card p-4 hover:border-primary/40 transition flex gap-4">
              <div className="h-16 w-16 rounded-xl bg-healthcare-mint/30 flex items-center justify-center shrink-0 overflow-hidden">
                {d.photo_url ? <img src={d.photo_url} alt="" className="h-full w-full object-cover" /> :
                  <User className="h-7 w-7 text-healthcare-teal" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="font-bold text-foreground">Dr. {d.full_name}</p>
                  <span className="text-sm font-bold text-primary">R{d.consultation_fee.toFixed(0)}</span>
                </div>
                <p className="text-xs text-healthcare-teal font-medium">{d.specialty}</p>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
                  <MapPin className="h-3 w-3" /> {d.city || "Location on profile"}
                  {d.rating_count > 0 && (
                    <span className="ml-2 flex items-center gap-0.5">
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />{d.rating_avg.toFixed(1)} ({d.rating_count})
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {d.in_person_available && <Badge>In-person</Badge>}
                  {d.online_available && <Badge><Video className="h-3 w-3" /> Video</Badge>}
                  {d.phone_available && <Badge><Phone className="h-3 w-3" /> Phone</Badge>}
                  {d.accepted_medical_aids.slice(0, 3).map((p) => <Badge key={p} tone="sky">{p}</Badge>)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Badge({ children, tone = "mint" }: { children: React.ReactNode; tone?: "mint" | "sky" }) {
  const c = tone === "sky" ? "bg-healthcare-sky/15 text-healthcare-sky" : "bg-healthcare-mint/30 text-healthcare-teal";
  return <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${c}`}>{children}</span>;
}
