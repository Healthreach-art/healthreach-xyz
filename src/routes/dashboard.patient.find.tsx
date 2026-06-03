import { createFileRoute, Link } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Search, Loader2, Sparkles, Stethoscope, Store, AlertTriangle, Star, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DOCTOR_SPECIALTIES, PHARMACY_SERVICES } from "@/lib/services";
import { matchSymptoms } from "@/lib/symptom-matcher.functions";
import { toast } from "sonner";

interface Doctor {
  id: string; full_name: string; specialty: string; city: string;
  photo_url: string; consultation_fee: number; rating_avg: number; rating_count: number;
}
interface Pharm {
  user_id: string; organization_name: string | null; full_name: string;
  address: string | null; services: string[] | null;
}

export const Route = createFileRoute("/dashboard/patient/find")({
  head: () => ({ meta: [{ title: "Find Care — HEALTHREACH" }] }),
  component: () => <RoleGuard allow="patient"><FindCarePage /></RoleGuard>,
});

function FindCarePage() {
  const aiMatch = useServerFn(matchSymptoms);
  const [q, setQ] = useState("");
  const [specialty, setSpecialty] = useState<string>("any");
  const [service, setService] = useState<string>("any");
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [pharmacies, setPharmacies] = useState<Pharm[]>([]);
  const [loading, setLoading] = useState(true);

  const [symptoms, setSymptoms] = useState("");
  const [matching, setMatching] = useState(false);
  const [aiResult, setAiResult] = useState<Awaited<ReturnType<typeof matchSymptoms>> | null>(null);

  useEffect(() => {
    (async () => {
      const [d, p] = await Promise.all([
        supabase.from("doctors")
          .select("id, full_name, specialty, city, photo_url, consultation_fee, rating_avg, rating_count")
          .eq("is_active", true).eq("is_verified", true).order("rating_avg", { ascending: false }).limit(60),
        supabase.from("profiles")
          .select("user_id, organization_name, full_name, address, services")
          .eq("approval_status", "approved")
          .not("organization_name", "is", null)
          .limit(60),
      ]);
      setDoctors((d.data ?? []) as Doctor[]);
      setPharmacies((p.data ?? []) as Pharm[]);
      setLoading(false);
    })();
  }, []);

  const filteredDoctors = useMemo(() => {
    const needle = q.toLowerCase();
    return doctors.filter((d) => {
      if (specialty !== "any" && d.specialty !== specialty) return false;
      if (!needle) return true;
      return d.full_name.toLowerCase().includes(needle)
        || d.specialty.toLowerCase().includes(needle)
        || d.city.toLowerCase().includes(needle);
    });
  }, [doctors, q, specialty]);

  const filteredPharmacies = useMemo(() => {
    const needle = q.toLowerCase();
    return pharmacies.filter((p) => {
      if (service !== "any" && !(p.services ?? []).includes(service)) return false;
      if (!needle) return true;
      const name = (p.organization_name || p.full_name || "").toLowerCase();
      const addr = (p.address ?? "").toLowerCase();
      const svc = (p.services ?? []).join(" ").toLowerCase();
      return name.includes(needle) || addr.includes(needle) || svc.includes(needle);
    });
  }, [pharmacies, q, service]);

  const runMatch = async () => {
    if (symptoms.trim().length < 3) { toast.error("Tell me a bit more about how you feel"); return; }
    setMatching(true);
    setAiResult(null);
    try {
      const r = await aiMatch({ data: { symptoms: symptoms.trim() } });
      setAiResult(r);
      if (r.specialties[0]) setSpecialty(r.specialties[0]);
      if (r.services[0]) setService(r.services[0]);
    } catch (e: any) {
      toast.error(e?.message || "AI matcher failed");
    } finally {
      setMatching(false);
    }
  };

  return (
    <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Sparkles className="h-6 w-6 text-primary" /> Find Care</h1>
        <p className="text-sm text-muted-foreground">Search doctors and pharmacies, or describe symptoms for an AI match.</p>
      </div>

      {/* AI symptom matcher */}
      <div className="healthcare-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="font-bold">Describe your symptoms</h2>
        </div>
        <Textarea
          rows={3}
          value={symptoms}
          onChange={(e) => setSymptoms(e.target.value)}
          placeholder="e.g. sore throat for 3 days, mild fever, dry cough…"
        />
        <Button onClick={runMatch} disabled={matching}>
          {matching ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Matching…</> : <><Sparkles className="h-4 w-4 mr-1" /> Find matches</>}
        </Button>

        {aiResult && (
          <div className="mt-3 space-y-2 text-sm">
            {aiResult.urgent && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                <AlertTriangle className="h-4 w-4 mt-0.5 text-destructive" />
                <p className="text-destructive font-semibold">This may be urgent. Call <a className="underline" href="tel:10177">10177</a> or visit the nearest ER.</p>
              </div>
            )}
            <p className="text-muted-foreground">{aiResult.reasoning}</p>
            {aiResult.specialties.length > 0 && (
              <div><span className="text-xs font-bold uppercase text-muted-foreground">Suggested specialties: </span>{aiResult.specialties.map((s) => (
                <button key={s} onClick={() => setSpecialty(s)} className="ml-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20">{s}</button>
              ))}</div>
            )}
            {aiResult.services.length > 0 && (
              <div><span className="text-xs font-bold uppercase text-muted-foreground">Suggested services: </span>{aiResult.services.map((s) => (
                <button key={s} onClick={() => setService(s)} className="ml-1 px-2 py-0.5 rounded-full bg-healthcare-mint/40 text-foreground text-xs font-semibold hover:bg-healthcare-mint/60">{s}</button>
              ))}</div>
            )}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, city, condition…" className="pl-9 h-11" />
        </div>
        <Select value={specialty} onValueChange={setSpecialty}>
          <SelectTrigger className="h-11 min-w-[180px]"><SelectValue placeholder="Specialty" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any specialty</SelectItem>
            {DOCTOR_SPECIALTIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={service} onValueChange={setService}>
          <SelectTrigger className="h-11 min-w-[180px]"><SelectValue placeholder="Pharmacy service" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any service</SelectItem>
            {PHARMACY_SERVICES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">All ({filteredDoctors.length + filteredPharmacies.length})</TabsTrigger>
            <TabsTrigger value="doctors"><Stethoscope className="h-4 w-4 mr-1" /> Doctors ({filteredDoctors.length})</TabsTrigger>
            <TabsTrigger value="pharmacies"><Store className="h-4 w-4 mr-1" /> Pharmacies ({filteredPharmacies.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-4 space-y-6">
            <DoctorGrid doctors={filteredDoctors.slice(0, 6)} />
            <PharmacyGrid pharmacies={filteredPharmacies.slice(0, 6)} />
          </TabsContent>
          <TabsContent value="doctors" className="mt-4">
            <DoctorGrid doctors={filteredDoctors} />
          </TabsContent>
          <TabsContent value="pharmacies" className="mt-4">
            <PharmacyGrid pharmacies={filteredPharmacies} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function DoctorGrid({ doctors }: { doctors: Doctor[] }) {
  if (doctors.length === 0) return <p className="text-sm text-muted-foreground py-6 text-center">No matching doctors.</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {doctors.map((d) => (
        <Link key={d.id} to="/dashboard/patient/doctors/$id" params={{ id: d.id }} className="healthcare-card p-4 hover:shadow-lg transition">
          <div className="flex gap-3">
            <div className="h-14 w-14 rounded-full bg-muted overflow-hidden shrink-0">
              {d.photo_url ? <img src={d.photo_url} alt={d.full_name} className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center text-muted-foreground"><Stethoscope className="h-6 w-6" /></div>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold truncate">Dr. {d.full_name}</p>
              <p className="text-xs text-primary font-semibold">{d.specialty}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3" />{d.city || "South Africa"}</p>
              <div className="flex items-center justify-between mt-1.5 text-xs">
                <span className="flex items-center gap-0.5 font-semibold"><Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />{d.rating_avg.toFixed(1)} ({d.rating_count})</span>
                <span className="font-bold">R{Number(d.consultation_fee).toFixed(0)}</span>
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function PharmacyGrid({ pharmacies }: { pharmacies: Pharm[] }) {
  if (pharmacies.length === 0) return <p className="text-sm text-muted-foreground py-6 text-center">No matching pharmacies.</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {pharmacies.map((p) => (
        <Link key={p.user_id} to="/pharmacy/$id" params={{ id: p.user_id }} className="healthcare-card p-4 hover:shadow-lg transition">
          <div className="flex items-center gap-2"><Store className="h-5 w-5 text-primary" />
            <p className="font-bold truncate">{p.organization_name || p.full_name}</p>
          </div>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><MapPin className="h-3 w-3" />{p.address || "South Africa"}</p>
          {(p.services?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {p.services!.slice(0, 4).map((s) => (
                <span key={s} className="px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-[10px] font-semibold">{s}</span>
              ))}
              {(p.services!.length > 4) && <span className="text-[10px] text-muted-foreground">+{p.services!.length - 4}</span>}
            </div>
          )}
        </Link>
      ))}
    </div>
  );
}
