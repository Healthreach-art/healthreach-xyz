import { createFileRoute, Link } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { useEffect, useMemo, useState } from "react";
import { firestoreClient } from "@/lib/firestore-client";
import { Search, Loader2, Stethoscope, Star, MapPin, Navigation, ArrowLeft, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DOCTOR_SPECIALTIES } from "@/lib/services";
import { PatientAddressHeader } from "@/components/PatientAddressHeader";
import { toast } from "sonner";

interface Doctor {
  id: string; full_name: string; specialty: string; city: string;
  photo_url: string; consultation_fee: number; rating_avg: number; rating_count: number;
  latitude: number | null; longitude: number | null;
  subspecialties: string[] | null; services_tags: string[] | null;
  in_person_available: boolean | null; online_available: boolean | null; phone_available: boolean | null;
}

export const Route = createFileRoute("/dashboard/patient/find")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : "",
  }),
  head: () => ({ meta: [{ title: "Book Appointment — HealthReachCare" }] }),
  component: () => <RoleGuard allow="patient"><FindCarePage /></RoleGuard>,
});

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const MAX_RADIUS_KM = 100;
function withDistance(rows: Doctor[], userLoc: { lat: number; lng: number } | null) {
  if (!userLoc) return rows.map((row) => ({ ...row, distance_km: null as number | null }));
  return rows.map((row) => ({
    ...row,
    distance_km: row.latitude != null && row.longitude != null
      ? Math.round(haversineKm(userLoc.lat, userLoc.lng, Number(row.latitude), Number(row.longitude)) * 10) / 10
      : null,
  }))
    .filter((row) => row.distance_km == null || row.distance_km <= MAX_RADIUS_KM)
    .sort((a, b) => (a.distance_km ?? 9e9) - (b.distance_km ?? 9e9));
}

function FindCarePage() {
  const searchParams = Route.useSearch();
  const [q, setQ] = useState(searchParams.q);
  const [specialty, setSpecialty] = useState<string>("any");
  const [consultationMode, setConsultationMode] = useState<string>("any");
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => { setQ(searchParams.q); }, [searchParams.q]);

  useEffect(() => {
    (async () => {
      const { data } = await firestoreClient.from("doctors")
        .select("id, full_name, specialty, city, photo_url, consultation_fee, rating_avg, rating_count, latitude, longitude, subspecialties, services_tags, in_person_available, online_available, phone_available")
        .eq("is_active", true).eq("is_verified", true)
        .not("user_id", "is", null)
        .order("rating_avg", { ascending: false }).limit(80);
      setDoctors((data ?? []) as Doctor[]);
      setLoading(false);
    })();
  }, []);

  const useMyLocation = () => {
    if (!navigator.geolocation) { toast.error("Geolocation not supported"); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
        toast.success("Distances now calculated from your location");
      },
      (err) => { setLocating(false); toast.error(err.message || "Could not get location"); },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const filteredDoctors = useMemo(() => {
    const needle = q.toLowerCase();
    const matched = doctors.filter((d) => {
      if (specialty !== "any" && d.specialty !== specialty) return false;
      if (consultationMode === "in_person" && !d.in_person_available) return false;
      if (consultationMode === "video" && !d.online_available) return false;
      if (consultationMode === "phone" && !d.phone_available) return false;
      if (!needle) return true;
      const hay = [d.full_name, d.specialty, d.city, ...(d.subspecialties ?? []), ...(d.services_tags ?? [])].join(" ").toLowerCase();
      return hay.includes(needle);
    });
    return withDistance(matched, userLoc);
  }, [doctors, q, specialty, consultationMode, userLoc]);

  return (
    <>
      <PatientAddressHeader />
      <main className="container-narrow px-4 py-8 sm:px-6 space-y-6">
      <Link to="/dashboard/patient" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4 mr-1" /> Dashboard</Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-primary">Step 1 · Find a doctor</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold"><Stethoscope className="h-6 w-6 text-primary" /> What do you need help with?</h1>
          <p className="mt-1 text-sm text-muted-foreground">Browse verified doctors and specialists.</p>
        </div>
        <Button variant="outline" size="sm" onClick={useMyLocation} disabled={locating}>
          {locating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Navigation className="h-4 w-4 mr-1" />}
          {userLoc ? "Update location" : "Use my location"}
        </Button>
      </header>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Button size="sm" variant={specialty === "any" ? "default" : "outline"} onClick={() => setSpecialty("any")}>All specialties</Button>
        {DOCTOR_SPECIALTIES.map((item) => <Button key={item} size="sm" variant={specialty === item ? "default" : "outline"} className="shrink-0" onClick={() => setSpecialty(item)}>{item}</Button>)}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search doctor name or city" className="pl-9 h-11" />
        </div>
        <Select value={specialty} onValueChange={setSpecialty}>
          <SelectTrigger className="h-11 min-w-[180px]"><SelectValue placeholder="Specialty" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any specialty</SelectItem>
            {DOCTOR_SPECIALTIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={consultationMode} onValueChange={setConsultationMode}>
          <SelectTrigger className="h-11"><SelectValue placeholder="Consultation mode" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any consultation mode</SelectItem>
            <SelectItem value="in_person">In-person</SelectItem>
            <SelectItem value="video">Video / telehealth</SelectItem>
            <SelectItem value="phone">Phone</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <DoctorGrid doctors={filteredDoctors} />
      )}
      </main>
    </>
  );
}

type WithDist = Doctor & { distance_km: number | null };

function DoctorGrid({ doctors }: { doctors: WithDist[] }) {
  if (doctors.length === 0) return <p className="border border-dashed border-border py-8 text-center text-sm text-muted-foreground">No verified doctors match these filters. Try a different specialty or location.</p>;
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
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3" />{d.city || "South Africa"}
                {d.distance_km != null && <span className="ml-1 font-semibold text-foreground">· {d.distance_km} km</span>}
              </p>
              <div className="flex items-center justify-between mt-1.5 text-xs">
                <span className="flex items-center gap-0.5 font-semibold"><Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />{Number(d.rating_avg ?? 0).toFixed(1)} ({d.rating_count ?? 0})</span>
                <span className="font-bold">R{Number(d.consultation_fee).toFixed(0)}</span>
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <span className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              {d.in_person_available && "In-person"}{d.online_available && <span className="inline-flex items-center gap-1"><Video className="h-3 w-3" /> Video</span>}{d.phone_available && "Phone"}
            </span>
            <span className="text-xs font-semibold text-primary">Book Appointment <span aria-hidden="true">→</span></span>
          </div>
        </Link>
      ))}
    </div>
  );
}
