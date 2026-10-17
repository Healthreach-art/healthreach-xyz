import { createFileRoute, Link } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { useEffect, useMemo, useState } from "react";
import { firestoreClient } from "@/lib/firestore-client";
import { useAuth } from "@/hooks/useAuth";
import { Search, Loader2, Stethoscope, MapPin, Navigation, ArrowLeft, Video, Phone, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DOCTOR_SPECIALTIES } from "@/lib/services";
import { PatientAddressHeader } from "@/components/PatientAddressHeader";
import { PATIENT_ADDRESS_CHANGED, readPatientAddress } from "@/lib/patient-address";
import logo from "@/assets/healthreach-logo.png";
import { toast } from "sonner";

interface Doctor {
  id: string; full_name: string; specialty: string; city: string;
  photo_url: string; consultation_fee: number | null; rating_avg: number | null; rating_count: number | null;
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
  const { user } = useAuth();
  const [q, setQ] = useState(searchParams.q);
  const [specialty, setSpecialty] = useState<string>("any");
  const [consultationModes, setConsultationModes] = useState<string[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLabel, setLocationLabel] = useState("");
  const [locating, setLocating] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => { setQ(searchParams.q); }, [searchParams.q]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await firestoreClient.from("doctors")
        .select("id, full_name, specialty, city, photo_url, consultation_fee, rating_avg, rating_count, latitude, longitude, subspecialties, services_tags, in_person_available, online_available, phone_available")
        .eq("is_active", true).eq("is_verified", true)
        .not("user_id", "is", null)
        .order("rating_avg", { ascending: false }).limit(80);
      if (!active) return;
      if (error) setLoadError(error.message);
      else setDoctors((data ?? []) as Doctor[]);
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const applyAddress = (address: ReturnType<typeof readPatientAddress>) => {
      if (address && address.lat != null && address.lng != null) {
        setUserLoc({ lat: address.lat, lng: address.lng });
        setLocationLabel(address.label || address.address);
      } else {
        setUserLoc(null);
        setLocationLabel("");
      }
    };
    applyAddress(readPatientAddress(user.id));
    const onChange = (event: Event) => applyAddress((event as CustomEvent<ReturnType<typeof readPatientAddress>>).detail);
    window.addEventListener(PATIENT_ADDRESS_CHANGED, onChange);
    return () => window.removeEventListener(PATIENT_ADDRESS_CHANGED, onChange);
  }, [user?.id]);

  const useMyLocation = () => {
    if (!navigator.geolocation) { toast.error("Geolocation not supported"); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationLabel("Current location");
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
      if (consultationModes.length > 0 && !(
        (consultationModes.includes("in_person") && d.in_person_available)
        || (consultationModes.includes("video") && d.online_available)
        || (consultationModes.includes("phone") && d.phone_available)
      )) return false;
      if (!needle) return true;
      const hay = [d.full_name, d.specialty, d.city, ...(d.subspecialties ?? []), ...(d.services_tags ?? [])].join(" ").toLowerCase();
      return hay.includes(needle);
    });
    return withDistance(matched, userLoc);
  }, [doctors, q, specialty, consultationModes, userLoc]);

  const toggleMode = (mode: string) => setConsultationModes((selected) =>
    selected.includes(mode) ? selected.filter((item) => item !== mode) : [...selected, mode],
  );

  return (
    <>
      <PatientAddressHeader />
      <main className="container-narrow space-y-7 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-5">
        <Link to="/dashboard/patient" className="flex items-center gap-3" aria-label="HealthReachCare patient dashboard">
          <img src={logo} alt="HealthReachCare" className="h-10 w-auto" />
          <span className="hidden text-sm font-semibold text-slate-900 sm:inline">HealthReachCare</span>
        </Link>
        <Link to="/dashboard/patient" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 h-4 w-4" /> Dashboard</Link>
      </header>
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Care that fits your needs</p>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold tracking-tight text-slate-900"><Stethoscope className="h-7 w-7 text-emerald-600" /> Find the Right Doctor</h1>
          <p className="mt-2 max-w-xl text-sm text-slate-600">Search verified healthcare professionals by specialty, location, or the way you prefer to consult.</p>
        </div>
        <Button variant="outline" size="sm" onClick={useMyLocation} disabled={locating} className="rounded-xl">
          {locating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Navigation className="h-4 w-4 mr-1" />}
          {userLoc ? "Use current location" : "Calculate from my location"}
        </Button>
      </section>
      {locationLabel && <p className="text-xs text-muted-foreground">Distance from {locationLabel}</p>}

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Browse specialties</h2>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Button size="sm" variant={specialty === "any" ? "default" : "outline"} className="shrink-0 rounded-full" onClick={() => setSpecialty("any")}>All specialties</Button>
          {DOCTOR_SPECIALTIES.map((item) => <Button key={item} size="sm" variant={specialty === item ? "default" : "outline"} className="shrink-0 rounded-full" onClick={() => setSpecialty(item)}>{item}</Button>)}
        </div>
      </div>

      <section className="rounded-2xl border border-border/60 bg-white p-4 shadow-sm sm:p-5">
      <div className="grid gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search doctor name, city, or service" className="h-11 rounded-xl pl-9" />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-700">Consultation modes <span className="font-normal text-muted-foreground">— select any that work for you</span></p>
          <div className="flex flex-wrap gap-2">
            {[{ id: "in_person", label: "In-Person", icon: MapPin }, { id: "video", label: "Video", icon: Video }, { id: "phone", label: "Phone", icon: Phone }].map(({ id, label, icon: Icon }) => (
              <Button key={id} size="sm" type="button" variant={consultationModes.includes(id) ? "default" : "outline"} aria-pressed={consultationModes.includes(id)} className="rounded-full" onClick={() => toggleMode(id)}>
                <Icon className="mr-1.5 h-3.5 w-3.5" />{label}
              </Button>
            ))}
          </div>
        </div>
      </div>
      </section>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : loadError ? (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">Could not load verified doctors: {loadError}</p>
      ) : (
        <DoctorGrid doctors={filteredDoctors} />
      )}
      </main>
    </>
  );
}

type WithDist = Doctor & { distance_km: number | null };

function DoctorGrid({ doctors }: { doctors: WithDist[] }) {
  if (doctors.length === 0) return <div className="rounded-2xl border border-dashed border-border/70 bg-slate-50/50 py-12 text-center">
    <Stethoscope className="mx-auto h-9 w-9 text-emerald-600/70" />
    <p className="mt-3 font-semibold text-slate-900">No verified doctors are listed for these filters</p>
    <p className="mt-1 text-sm text-muted-foreground">Try another specialty or consultation mode, or check back later.</p>
  </div>;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {doctors.map((d) => (
        <article key={d.id} className="group flex flex-col rounded-2xl border border-border/60 bg-white p-5 shadow-sm transition hover:shadow-md">
          <div className="flex gap-4">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-emerald-50">
              {d.photo_url ? <img src={d.photo_url} alt={d.full_name} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-emerald-700"><Stethoscope className="h-7 w-7" /></div>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-slate-900">{d.full_name}</p>
              <p className="mt-0.5 text-sm font-medium text-emerald-700">{d.specialty}</p>
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" /> Verified provider
              </p>
            </div>
          </div>
          <div className="mt-4 flex min-h-8 flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">{d.city || "South Africa"}</span>
              {d.distance_km != null && <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800"><MapPin className="mr-1 inline h-3 w-3" />{d.distance_km} km</span>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
              {d.in_person_available && "In-person"}{d.online_available && <span className="inline-flex items-center gap-1"><Video className="h-3 w-3" /> Video</span>}{d.phone_available && "Phone"}
          </div>
          <div className="mt-auto flex items-center justify-between border-t border-border/60 pt-4">
            <div><p className="text-[11px] text-muted-foreground">Consultation fee</p><p className="font-bold text-slate-900">{d.consultation_fee == null ? "Not listed" : `R${Number(d.consultation_fee).toFixed(2)}`}</p></div>
            <Link to="/dashboard/patient/doctors/$id" params={{ id: d.id }} className="inline-flex h-9 items-center justify-center rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white transition hover:bg-emerald-700">Book Appointment <span className="ml-1" aria-hidden="true">→</span></Link>
          </div>
        </article>
      ))}
    </div>
  );
}
