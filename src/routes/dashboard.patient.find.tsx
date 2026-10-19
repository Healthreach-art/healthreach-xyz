import { createFileRoute, Link } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { firestoreClient } from "@/lib/firestore-client";
import { useAuth } from "@/hooks/useAuth";
import { Search, Loader2, Stethoscope, MapPin, Navigation, ArrowLeft, Video, Phone, BadgeCheck, SlidersHorizontal, Star, Building2, Baby, HeartPulse, Brain, Microscope, UserRound, ChevronRight } from "lucide-react";
import { BookingScreen, ScreenTitle, ServiceRow, StepLabel } from "@/components/BookingScreen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PATIENT_ADDRESS_CHANGED, readPatientAddress } from "@/lib/patient-address";
import { toast } from "sonner";

interface Doctor {
  id: string; full_name: string; specialty: string; city: string; hospital_id: string | null;
  photo_url: string; consultation_fee: number | null; rating_avg: number | null; rating_count: number | null;
  qualifications: string | null; address: string | null;
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

const SPECIALTIES = [
  "General Practitioner", "Paediatrician", "Cardiologist", "Dermatologist", "Gynaecologist", "Psychiatrist",
  "Psychologist", "ENT Specialist", "Ophthalmologist", "Orthopaedic Surgeon", "Neurologist", "Endocrinologist",
  "Urologist", "Dentist", "Physiotherapist",
];
const NEEDS = [
  { id: "general", label: "General Consultation", sub: "Common health concerns", icon: Stethoscope, specialties: ["General Practitioner"] },
  { id: "women", label: "Women's Health", sub: "Female health and wellness", icon: UserRound, specialties: ["Gynaecologist"] },
  { id: "child", label: "Child Health", sub: "Paediatric care", icon: Baby, specialties: ["Paediatrician"] },
  { id: "chronic", label: "Chronic Condition Review", sub: "Diabetes, hypertension, etc.", icon: HeartPulse, specialties: ["General Practitioner", "Endocrinologist", "Cardiologist"] },
  { id: "mental", label: "Mental Health", sub: "Counselling and support", icon: Brain, specialties: ["Psychologist", "Psychiatrist"] },
  { id: "specialist", label: "Specialist Consultation", sub: "E.g. Cardiology, Dermatology", icon: Microscope, specialties: SPECIALTIES.filter((x) => x !== "General Practitioner") },
] as const;
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
  const [need, setNeed] = useState<string | null>(null);
  const [showList, setShowList] = useState(!!searchParams.q);
  const [consultationModes, setConsultationModes] = useState<string[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [clinicsById, setClinicsById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLabel, setLocationLabel] = useState("");
  const [radius, setRadius] = useState(25);
  const [sortBy, setSortBy] = useState<"distance" | "rating" | "fee">("distance");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [loadError, setLoadError] = useState("");
  const doctorRequestId = useRef(0);

  useEffect(() => { setQ(searchParams.q); }, [searchParams.q]);

  const loadDoctors = useCallback(async () => {
    const currentRequest = ++doctorRequestId.current;
    setLoading(true);
    setLoadError("");
    try {
      // Select the live row shape instead of a brittle column list: older approved doctor records may not yet have optional profile fields.
      const { data, error } = await firestoreClient.from("doctors")
        .select("*")
        .eq("is_active", true).eq("is_verified", true)
        .limit(80);
      if (currentRequest !== doctorRequestId.current) return;
      if (error) throw error;
      const results = ((data ?? []) as Doctor[]).sort((a, b) => (b.rating_avg ?? 0) - (a.rating_avg ?? 0));
      setDoctors(results);
      const hospitalIds = Array.from(new Set(results.map((doctor) => doctor.hospital_id).filter((id): id is string => !!id)));
      if (hospitalIds.length) {
        const { data: clinics, error: clinicsError } = await firestoreClient.from("profiles")
          .select("user_id, organization_name, full_name").in("user_id", hospitalIds);
        if (currentRequest !== doctorRequestId.current) return;
        if (clinicsError) {
          console.error("[patient-doctors] Could not load clinic names.", clinicsError);
          toast.error("The doctor list loaded, but some clinic details are unavailable.");
        } else {
          const mapped: Record<string, string> = {};
          ((clinics ?? []) as Array<{ user_id: string; organization_name: string | null; full_name: string | null }>)
            .forEach((clinic) => {
              const name = clinic.organization_name || clinic.full_name;
              if (name) mapped[clinic.user_id] = name;
            });
          setClinicsById(mapped);
        }
      }
    } catch (error) {
      if (currentRequest !== doctorRequestId.current) return;
      console.error("[patient-doctors] Could not load verified doctors.", error);
      setLoadError("We couldn’t load the doctor directory. Check your connection and try again.");
      setDoctors([]);
      setClinicsById({});
    } finally {
      if (currentRequest === doctorRequestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDoctors();
    return () => { doctorRequestId.current += 1; };
  }, [loadDoctors]);

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
      if (need && !(NEEDS.find((n) => n.id === need)?.specialties as readonly string[] | undefined)?.includes(d.specialty)) return false;
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
    return withDistance(matched, userLoc)
      .filter((doctor) => doctor.distance_km == null || doctor.distance_km <= radius)
      .sort((a, b) => sortBy === "rating"
        ? (b.rating_avg ?? 0) - (a.rating_avg ?? 0)
        : sortBy === "fee"
          ? (a.consultation_fee ?? Number.MAX_SAFE_INTEGER) - (b.consultation_fee ?? Number.MAX_SAFE_INTEGER)
          : (a.distance_km ?? 9e9) - (b.distance_km ?? 9e9));
  }, [doctors, q, need, specialty, consultationModes, userLoc, radius, sortBy]);

  const toggleMode = (mode: string) => setConsultationModes((selected) =>
    selected.includes(mode) ? selected.filter((item) => item !== mode) : [...selected, mode],
  );

  const needLabel = NEEDS.find((n) => n.id === need)?.label ?? (q ? `Results for “${q}”` : "All doctors");
  const chip = (active: boolean) => `shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold ${active ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-800"}`;

  return (
    <main className="min-h-screen bg-emerald-50/60 px-4 py-6 pb-28">
      {!showList ? (
        <>
          <StepLabel n={1} label="Choose Your Need" />
          <BookingScreen backTo="/dashboard/patient">
            <ScreenTitle title="Book a Doctor" sub="Get professional medical care from trusted doctors." />
            <form onSubmit={(e) => { e.preventDefault(); setNeed(null); setShowList(true); }} className="relative mb-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="What do you need help with?" className="h-11 rounded-xl border-0 bg-slate-100 pl-9" />
            </form>
            {NEEDS.map((n) => <ServiceRow key={n.id} icon={n.icon} title={n.label} sub={n.sub} onClick={() => { setNeed(n.id); setShowList(true); }} />)}
          </BookingScreen>
        </>
      ) : (
        <>
          <StepLabel n={2} label="Find & Compare Doctors" />
          <BookingScreen onBack={() => setShowList(false)}>
            <ScreenTitle title="Available Doctors" sub={needLabel} />
            <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1">
              <button type="button" onClick={useMyLocation} disabled={locating} className={chip(locationLabel === "Current location")}>{locating ? <Loader2 className="inline h-3 w-3 animate-spin" /> : "Near me"}</button>
              <button type="button" onClick={() => toggleMode("in_person")} className={chip(consultationModes.includes("in_person"))}>In-person</button>
              <button type="button" onClick={() => toggleMode("video")} className={chip(consultationModes.includes("video"))}>Online</button>
              <button type="button" aria-label="Filters" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((o) => !o)} className="ml-auto shrink-0 rounded-full p-1.5 text-emerald-700 hover:bg-emerald-50"><SlidersHorizontal className="h-4 w-4" /></button>
            </div>
            {filtersOpen && <div className="mb-3 grid gap-2 rounded-2xl bg-emerald-50 p-3 text-sm">
              <label className="flex items-center justify-between gap-2">Distance<select value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="h-9 rounded-lg border border-emerald-100 bg-white px-2">{[25, 50, 75, 100].map((km) => <option key={km} value={km}>Within {km} km</option>)}</select></label>
              <label className="flex items-center justify-between gap-2">Specialty<select value={specialty} onChange={(e) => setSpecialty(e.target.value)} className="h-9 max-w-[60%] rounded-lg border border-emerald-100 bg-white px-2"><option value="any">Any</option>{SPECIALTIES.map((x) => <option key={x}>{x}</option>)}</select></label>
              <label className="flex items-center justify-between gap-2">Sort by<select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="h-9 rounded-lg border border-emerald-100 bg-white px-2"><option value="distance">Distance</option><option value="rating">Rating</option><option value="fee">Fee</option></select></label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={consultationModes.includes("phone")} onChange={() => toggleMode("phone")} />Phone consultations</label>
            </div>}
            {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
              : loadError ? <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{loadError}<Button variant="outline" size="sm" className="mt-3 block" onClick={() => void loadDoctors()}>Try again</Button></div>
              : <DoctorGrid doctors={filteredDoctors} clinicsById={clinicsById} />}
          </BookingScreen>
        </>
      )}
    </main>
  );
}

type WithDist = Doctor & { distance_km: number | null };

function DoctorGrid({ doctors, clinicsById }: { doctors: WithDist[]; clinicsById: Record<string, string> }) {
  if (doctors.length === 0) return <div className="py-10 text-center">
    <Stethoscope className="mx-auto h-9 w-9 text-emerald-600/70" />
    <p className="mt-3 font-semibold text-emerald-950">No approved doctors match yet</p>
    <p className="mt-1 text-sm text-slate-500">Try another need or filter, or check back soon.</p>
  </div>;
  return (
    <div>
      {doctors.map((d) => (
        <Link key={d.id} to="/dashboard/patient/doctors/$id" params={{ id: d.id }} className="flex gap-3 border-b border-slate-100 py-3 last:border-0">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-emerald-50">
            {d.photo_url ? <img src={d.photo_url} alt={d.full_name} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-emerald-700"><Stethoscope className="h-7 w-7" /></div>}
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 truncate text-sm font-bold text-emerald-950">{d.full_name.toLowerCase().startsWith("dr") ? d.full_name : `Dr. ${d.full_name}`}<BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" /></p>
            <p className="truncate text-xs text-slate-500">{d.specialty}{d.distance_km != null ? ` · ${d.distance_km} km` : ""}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-600">
              {d.rating_avg != null && (d.rating_count ?? 0) > 0 ? <><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{d.rating_avg.toFixed(1)} ({d.rating_count} reviews)</> : <span className="text-slate-400">No reviews yet</span>}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {d.in_person_available && <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">In-person</span>}
              {d.online_available && <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">Online</span>}
              {d.phone_available && <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">Phone</span>}
              <span className="ml-auto text-xs font-bold text-emerald-900">{d.consultation_fee == null ? "" : `R${Number(d.consultation_fee).toFixed(0)}`}</span>
            </div>
            {(d.hospital_id && clinicsById[d.hospital_id]) && <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-slate-500"><Building2 className="h-3 w-3" />{clinicsById[d.hospital_id!]}</p>}
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 self-center text-slate-400" />
        </Link>
      ))}
    </div>
  );
}
