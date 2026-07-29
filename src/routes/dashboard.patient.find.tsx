import { createFileRoute, Link } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Search, Loader2, Stethoscope, Star, MapPin, Navigation, Home as HomeIcon } from "lucide-react";
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
  head: () => ({ meta: [{ title: "Book Appointment — HEALTHREACH" }] }),
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

function FindCarePage() {
  const [q, setQ] = useState("");
  const [specialty, setSpecialty] = useState<string>("any");
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("doctors")
        .select("id, full_name, specialty, city, photo_url, consultation_fee, rating_avg, rating_count, latitude, longitude, subspecialties, services_tags, in_person_available")
        .or("and(is_active.eq.true,is_verified.eq.true),is_demo.eq.true")
        .not("user_id", "is", null)
        .not("photo_url", "is", null).neq("photo_url", "")
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

  return (
    <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
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
          </TabsList>

          <TabsContent value="doctors" className="mt-4">
            <DoctorGrid doctors={filteredDoctors} />
          </TabsContent>
          <TabsContent value="homecare" className="mt-4">
            <p className="text-sm text-muted-foreground mb-3">Doctors offering in-person / home visits.</p>
            <DoctorGrid doctors={filteredHomecare} />
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
