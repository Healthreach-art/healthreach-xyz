import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { firestoreClient } from "@/lib/firestore-client";
import { Star, MapPin, User as UserIcon, Search } from "lucide-react";

const SITE = "https://healthreachcare.co.za";

interface Doc {
  id: string; full_name: string; specialty: string; city: string;
  photo_url: string; consultation_fee: number; rating_avg: number; rating_count: number;
}

export const Route = createFileRoute("/doctors/")({
  loader: async () => {
    const { data } = await firestoreClient
      .from("doctors")
      .select("id, full_name, specialty, city, photo_url, consultation_fee, rating_avg, rating_count")
      .or("and(is_active.eq.true,is_verified.eq.true),is_demo.eq.true")
      .not("user_id", "is", null)
      .not("photo_url", "is", null)
      .neq("photo_url", "")
      .order("rating_avg", { ascending: false })
      .limit(60);
    return { doctors: (data ?? []) as Doc[] };
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
  const { doctors } = Route.useLoaderData();
  const [q, setQ] = useState("");
  const [list, setList] = useState(doctors);

  useEffect(() => {
    const n = q.trim().toLowerCase();
    if (!n) return setList(doctors);
    setList(doctors.filter((d: Doc) =>
      d.full_name.toLowerCase().includes(n) ||
      d.specialty.toLowerCase().includes(n) ||
      d.city.toLowerCase().includes(n),
    ));
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((d: Doc) => (
          <Link key={d.id} to="/doctors/$id" params={{ id: d.id }} className="rounded-2xl border border-border bg-card p-4 hover:shadow-md transition flex gap-3">
            <div className="h-16 w-16 rounded-xl bg-healthcare-mint/30 overflow-hidden flex items-center justify-center shrink-0">
              {d.photo_url ? <img src={d.photo_url} alt={d.full_name} className="h-full w-full object-cover" loading="lazy" /> : <UserIcon className="h-7 w-7 text-healthcare-teal" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">Dr. {d.full_name}</p>
              <p className="text-xs text-healthcare-teal">{d.specialty}</p>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3" />{d.city || "—"}</p>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-sm font-bold text-primary">R{Number(d.consultation_fee).toFixed(0)}</span>
                {d.rating_count > 0 && (
                  <span className="text-[10px] inline-flex items-center gap-0.5 text-muted-foreground">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />{d.rating_avg.toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
        {list.length === 0 && (
          <p className="col-span-full text-center text-sm text-muted-foreground py-10">No doctors match your search.</p>
        )}
      </div>
    </div>
  );
}
