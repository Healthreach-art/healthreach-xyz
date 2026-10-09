import { createFileRoute, Link } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { useEffect, useMemo, useState } from "react";
import { firestoreClient } from "@/lib/firestore-client";
import { Search, Loader2, Stethoscope, Star, MapPin, Navigation, Home as HomeIcon, CheckCircle2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DOCTOR_SPECIALTIES } from "@/lib/services";
import { toast } from "sonner";

interface Doctor {
  id: string; full_name: string; specialty: string; city: string;
  photo_url: string; consultation_fee: number; rating_avg: number; rating_count: number;
  latitude: number | null; longitude: number | null;
  subspecialties: string[] | null; services_tags: string[] | null;
  in_person_available: boolean | null;
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

interface HomecareProvider {
  id: string; provider_type: string; display_name: string; address: string | null; city: string | null;
  services: string[] | null; service_areas: string[] | null; operating_hours: string | null;
  hourly_rate: number | null; distance_km: number | null; service_radius_km?: number | null;
}

const HOMECARE_RADIUS_OPTIONS = [25, 50, 100] as const;

function FindCarePage() {
  const searchParams = Route.useSearch();
  const [q, setQ] = useState(searchParams.q);
  const [specialty, setSpecialty] = useState<string>("any");
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [homecare, setHomecare] = useState<HomecareProvider[]>([]);
  const [homecareRadius, setHomecareRadius] = useState<number>(25);
  const [loading, setLoading] = useState(true);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => { setQ(searchParams.q); }, [searchParams.q]);

  useEffect(() => {
    (async () => {
      const { data } = await firestoreClient.from("doctors")
        .select("id, full_name, specialty, city, photo_url, consultation_fee, rating_avg, rating_count, latitude, longitude, subspecialties, services_tags, in_person_available")
        .or("and(is_active.eq.true,is_verified.eq.true),is_demo.eq.true")
        .not("user_id", "is", null)
        .not("photo_url", "is", null).neq("photo_url", "")
        .order("rating_avg", { ascending: false }).limit(80);
      setDoctors((data ?? []) as Doctor[]);
      setLoading(false);
    })();
  }, []);

  // Approved home care providers — within the chosen radius (and the provider's own service area).
  useEffect(() => {
    (async () => {
      if (userLoc) {
        const { data } = await firestoreClient.action("find_homecare_near", {
          _lat: userLoc.lat, _lng: userLoc.lng, _max_km: homecareRadius,
        });
        setHomecare((data ?? []) as unknown as HomecareProvider[]);
        return;
      }
      const { data } = await firestoreClient.from("homecare_providers")
        .select("id, provider_type, business_name, full_name, address, services, service_areas, operating_hours, hourly_rate, service_radius_km")
        .eq("approval_status", "approved").eq("is_active", true).limit(60);
      setHomecare((data ?? []).map((r: any) => ({
        id: r.id, provider_type: r.provider_type,
        display_name: r.provider_type === "individual" ? (r.full_name || r.business_name) : r.business_name,
        address: r.address, city: null, services: r.services, service_areas: r.service_areas,
        operating_hours: r.operating_hours, hourly_rate: r.hourly_rate,
        service_radius_km: r.service_radius_km, distance_km: null,
      })));
    })();
  }, [userLoc, homecareRadius]);


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

  const MAX_RADIUS_KM = 100;
  const withDistance = (rows: Doctor[]) => {
    if (!userLoc) return rows.map((r) => ({ ...r, distance_km: null as number | null }));
    return rows.map((r) => ({
      ...r,
      distance_km: r.latitude != null && r.longitude != null
        ? Math.round(haversineKm(userLoc.lat, userLoc.lng, Number(r.latitude), Number(r.longitude)) * 10) / 10
        : null,
    }))
    .filter((r) => r.distance_km == null || r.distance_km <= MAX_RADIUS_KM)
    .sort((a, b) => (a.distance_km ?? 9e9) - (b.distance_km ?? 9e9));
  };

  const filterList = (homecareOnly: boolean) => {
    const needle = q.toLowerCase();
    const matched = doctors.filter((d) => {
      if (homecareOnly && !d.in_person_available) return false;
      if (specialty !== "any" && d.specialty !== specialty) return false;
      if (!needle) return true;
      const hay = [d.full_name, d.specialty, d.city, ...(d.subspecialties ?? []), ...(d.services_tags ?? [])].join(" ").toLowerCase();
      return hay.includes(needle);
    });
    return withDistance(matched);
  };

  const filteredDoctors = useMemo(() => filterList(false), [doctors, q, specialty, userLoc]);
  const filteredHomecare = useMemo(() => filterList(true), [doctors, q, specialty, userLoc]);
  const filteredProviders = useMemo(() => {
    const needle = q.toLowerCase();
    return homecare.filter((p) => {
      if (!needle) return true;
      const hay = [p.display_name, p.address, p.city, ...(p.services ?? []), ...(p.service_areas ?? [])].join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [homecare, q]);

  return (
    <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
      <Link to="/dashboard/patient" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to Dashboard
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Stethoscope className="h-6 w-6 text-primary" /> Book Appointment</h1>
          <p className="text-sm text-muted-foreground">Choose a doctor consultation or a homecare in-person visit.</p>
        </div>
        <Button variant="outline" size="sm" onClick={useMyLocation} disabled={locating}>
          {locating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Navigation className="h-4 w-4 mr-1" />}
          {userLoc ? "Update location" : "Use my location"}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
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
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <Tabs defaultValue="doctors">
          <TabsList>
            <TabsTrigger value="doctors"><Stethoscope className="h-4 w-4 mr-1" /> Doctors ({filteredDoctors.length})</TabsTrigger>
            <TabsTrigger value="homecare"><HomeIcon className="h-4 w-4 mr-1" /> Homecare ({filteredHomecare.length})</TabsTrigger>
            <TabsTrigger value="providers"><HomeIcon className="h-4 w-4 mr-1" /> Home care providers ({filteredProviders.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="doctors" className="mt-4">
            <DoctorGrid doctors={filteredDoctors} />
          </TabsContent>
          <TabsContent value="homecare" className="mt-4">
            <p className="text-sm text-muted-foreground mb-3">Doctors offering in-person / home visits.</p>
            <DoctorGrid doctors={filteredHomecare} />
          </TabsContent>
          <TabsContent value="providers" className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Search within</span>
              {HOMECARE_RADIUS_OPTIONS.map((km) => (
                <Button
                  key={km}
                  size="sm"
                  variant={homecareRadius === km ? "default" : "outline"}
                  onClick={() => setHomecareRadius(km)}
                >
                  {km} km
                </Button>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              {userLoc
                ? `Approved home care companies and individual carers within ${homecareRadius} km of you who also travel to your area.`
                : "Approved home care companies and individual carers — use your location to filter by distance."}
            </p>
            {userLoc && filteredProviders.length === 0 && homecareRadius < 100 && (
              <p className="text-sm">
                None within {homecareRadius} km.{" "}
                <button
                  className="font-semibold text-primary underline"
                  onClick={() => setHomecareRadius(homecareRadius === 25 ? 50 : 100)}
                >
                  Expand to {homecareRadius === 25 ? 50 : 100} km
                </button>
              </p>
            )}
            <ProviderGrid providers={filteredProviders} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

type WithDist = Doctor & { distance_km: number | null };

function DoctorGrid({ doctors }: { doctors: WithDist[] }) {
  if (doctors.length === 0) return <p className="text-sm text-muted-foreground py-6 text-center">No matching providers.</p>;
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

function ProviderGrid({ providers }: { providers: HomecareProvider[] }) {
  if (providers.length === 0) return <p className="text-sm text-muted-foreground py-6 text-center">No approved home care providers nearby yet.</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {providers.map((p) => (
        <div key={p.id} className="healthcare-card p-4 flex flex-col gap-3">
          <div className="flex gap-3">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center shrink-0 text-muted-foreground">
              <HomeIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold truncate">{p.display_name}</p>
              <p className="text-xs text-primary font-semibold">
                {p.provider_type === "individual" ? "Individual carer" : "Home care company"}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3" />{p.city || p.address || "South Africa"}
                {p.distance_km != null && <span className="ml-1 font-semibold text-foreground">· {Math.round(Number(p.distance_km) * 10) / 10} km away</span>}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Service area: {(p.service_areas ?? []).length > 0
                  ? (p.service_areas ?? []).join(", ")
                  : p.service_radius_km != null ? `Travels up to ${p.service_radius_km} km` : "On request"}
              </p>
              {(p.services ?? []).length > 0 && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{(p.services ?? []).join(", ")}</p>
              )}
              {p.hourly_rate != null && <p className="text-xs font-bold mt-1">R{Number(p.hourly_rate).toFixed(0)}/hr</p>}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 mt-auto">
            <span className="inline-flex items-center gap-1 rounded-full bg-healthcare-green/10 px-2 py-0.5 text-[11px] font-semibold text-healthcare-green">
              <CheckCircle2 className="h-3 w-3" /> Approved &amp; active
            </span>
            <Button asChild size="sm">
              <Link to="/dashboard/patient/homecare">Book</Link>
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
