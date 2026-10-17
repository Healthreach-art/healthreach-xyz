import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { firestoreClient } from "@/lib/firestore-client";
import { Star, MapPin, User as UserIcon, Search } from "lucide-react";

const SITE = "https://healthreachcare.co.za";

interface Doc {
  id: string; full_name: string | null; specialty: string | null; city: string | null;
  photo_url: string | null; consultation_fee: number | null; rating_avg: number | null; rating_count: number | null;
}

export const Route = createFileRoute("/doctors/")({
  loader: async () => {
    const { data, error } = await firestoreClient
      .from("doctors")
      .select("id, full_name, specialty, city, photo_url, consultation_fee, rating_avg, rating_count")
      .eq("is_active", true)
      .eq("is_verified", true)
      .order("rating_avg", { ascending: false })
      .limit(60);
    return { doctors: (data ?? []) as Doc[], error: error?.message ?? null };
  },
  head: () => ({
    meta: [
      { title: "Find a Doctor in South Africa | HealthReachCare" },
      { name: "description", content: "Search and book trusted doctors across South Africa. Browse profiles, specialties, fees and availability — book in seconds with HealthReachCare." },
      { property: "og:title", content: "Find a Doctor in South Africa | HealthReachCare" },
      { property: "og:description", content: "Search and book trusted doctors across South Africa on HealthReachCare." },
      { property: "og:url", content: `${SITE}/doctors` },
    ],
    links: [{ rel: "canonical", href: `${SITE}/doctors` }],
  }),
  component: DoctorsIndex,
});

function DoctorsIndex() {
  const router = useRouter();
  const { doctors, error } = Route.useLoaderData();
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return doctors;
    return doctors.filter((doctor) =>
      [doctor.full_name, doctor.specialty, doctor.city]
        .some((value) => String(value ?? "").toLowerCase().includes(needle)),
    );
  }, [q, doctors]);

  return (
    <div className="container-narrow px-4 sm:px-6 py-10 space-y-6">
      <header className="space-y-2 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground">Find a doctor in South Africa</h1>
        <p className="text-sm text-muted-foreground">Browse verified profiles, compare fees, and book appointments in seconds.</p>
      </header>
      <div className="relative max-w-xl mx-auto">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, specialty or city…"
          className="w-full h-11 rounded-2xl border border-border bg-card pl-11 pr-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Search doctors"
        />
      </div>
      {error && (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="text-destructive">We couldn’t load the doctor directory. Please try again.</p>
          <button type="button" onClick={() => void router.invalidate()} className="mt-3 rounded-md border border-border px-3 py-1.5 font-medium text-foreground hover:bg-muted">
            Try again
          </button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((d: Doc) => (
          <Link key={d.id} to="/doctors/$id" params={{ id: d.id }} className="rounded-2xl border border-border bg-card p-4 hover:shadow-md transition flex gap-3">
            <div className="h-16 w-16 rounded-xl bg-healthcare-mint/30 overflow-hidden flex items-center justify-center shrink-0">
              {d.photo_url ? <img src={d.photo_url} alt={d.full_name ?? "Doctor"} className="h-full w-full object-cover" loading="lazy" /> : <UserIcon className="h-7 w-7 text-healthcare-teal" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{d.full_name ? `Dr. ${d.full_name}` : "Doctor"}</p>
              <p className="text-xs text-healthcare-teal">{d.specialty || "Healthcare professional"}</p>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3" />{d.city || "—"}</p>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-sm font-bold text-primary">{d.consultation_fee == null ? "Fee on request" : `R${Number(d.consultation_fee).toFixed(0)}`}</span>
                {!!d.rating_count && (
                  <span className="text-[10px] inline-flex items-center gap-0.5 text-muted-foreground">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />{Number(d.rating_avg ?? 0).toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
        {!error && list.length === 0 && (
          <p className="col-span-full text-center text-sm text-muted-foreground py-10">No doctors match your search.</p>
        )}
      </div>
    </div>
  );
}
