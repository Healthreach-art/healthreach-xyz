import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Star, MapPin, Video, Phone, User as UserIcon, CalendarCheck, BadgeCheck, Stethoscope } from "lucide-react";

const SITE = "https://healthreachhub.lovable.app";

interface Doctor {
  id: string; full_name: string; specialty: string; qualifications: string;
  practice_number: string; bio: string; photo_url: string;
  consultation_fee: number; accepted_medical_aids: string[]; languages: string[];
  online_available: boolean; in_person_available: boolean; phone_available: boolean;
  city: string; address: string; rating_avg: number; rating_count: number;
}

async function fetchDoctor(id: string) {
  const { data } = await supabase
    .from("doctors")
    .select("id, full_name, specialty, qualifications, practice_number, bio, photo_url, consultation_fee, accepted_medical_aids, languages, online_available, in_person_available, phone_available, city, address, rating_avg, rating_count, is_active, is_verified")
    .eq("id", id)
    .maybeSingle();
  return data?.is_active && data?.is_verified ? (data as Doctor) : null;
}

export const Route = createFileRoute("/doctors/$id")({
  loader: async ({ params }) => {
    const doc = await fetchDoctor(params.id);
    return { doc };
  },
  head: ({ params, loaderData }) => {
    const d = loaderData?.doc;
    const title = d ? `Dr. ${d.full_name} — ${d.specialty}, ${d.city} | HealthReach RSA` : "Doctor — HealthReach RSA";
    const description = d
      ? `Book an appointment with Dr. ${d.full_name}, ${d.specialty} in ${d.city}. Consultation from R${Number(d.consultation_fee).toFixed(0)}. Verified profile on HealthReach RSA.`
      : "Find and book trusted doctors across South Africa on HealthReach RSA.";
    const url = `${SITE}/doctors/${params.id}`;
    const meta: Array<Record<string, string>> = [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "profile" },
      { property: "og:url", content: url },
    ];
    if (d?.photo_url) meta.push({ property: "og:image", content: d.photo_url });
    const scripts = d
      ? [{
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Physician",
            name: `Dr. ${d.full_name}`,
            medicalSpecialty: d.specialty,
            image: d.photo_url || undefined,
            address: { "@type": "PostalAddress", addressLocality: d.city, streetAddress: d.address, addressCountry: "ZA" },
            url,
            aggregateRating: d.rating_count > 0 ? {
              "@type": "AggregateRating", ratingValue: Number(d.rating_avg).toFixed(1), reviewCount: d.rating_count,
            } : undefined,
          }),
        }]
      : [];
    return { meta, links: [{ rel: "canonical", href: url }], scripts };
  },
  component: PublicDoctorPage,
});

function PublicDoctorPage() {
  const { id } = Route.useParams();
  const { doc: initialDoc } = Route.useLoaderData();
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<Doctor | null>(initialDoc);
  const [reviews, setReviews] = useState<{ stars: number; comment: string; created_at: string }[]>([]);
  const [busySlots, setBusySlots] = useState<Set<string>>(new Set());
  const [availability, setAvailability] = useState<{ day_of_week: number; start_hour: number; end_hour: number; slot_minutes: number; is_active: boolean }[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function refreshSlots() {
      const since = new Date(); since.setHours(0, 0, 0, 0);
      const until = new Date(since); until.setDate(until.getDate() + 14);
      const { data: appts } = await supabase
        .from("doctor_appointments")
        .select("scheduled_at")
        .eq("doctor_id", id)
        .gte("scheduled_at", since.toISOString())
        .lt("scheduled_at", until.toISOString())
        .in("status", ["pending", "confirmed"]);
      if (!cancelled) setBusySlots(new Set((appts ?? []).map((a: any) => new Date(a.scheduled_at).toISOString())));
    }
    (async () => {
      if (!doc) {
        const d = await fetchDoctor(id);
        if (d && !cancelled) setDoc(d);
      }
      const [{ data: r }, { data: av }] = await Promise.all([
        supabase.from("doctor_reviews").select("stars, comment, created_at").eq("doctor_id", id).order("created_at", { ascending: false }).limit(20),
        supabase.from("doctor_availability").select("day_of_week, start_hour, end_hour, slot_minutes, is_active").eq("doctor_id", id).eq("is_active", true),
      ]);
      if (cancelled) return;
      setReviews(r ?? []);
      setAvailability(av ?? []);
      await refreshSlots();
    })();
    // Realtime: when bookings change for this doctor, refresh busy slots within seconds.
    const ch = supabase
      .channel(`doctor-pub-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "doctor_appointments", filter: `doctor_id=eq.${id}` }, refreshSlots)
      .on("postgres_changes", { event: "*", schema: "public", table: "doctor_availability", filter: `doctor_id=eq.${id}` }, async () => {
        const { data: av } = await supabase.from("doctor_availability").select("day_of_week, start_hour, end_hour, slot_minutes, is_active").eq("doctor_id", id).eq("is_active", true);
        if (!cancelled) setAvailability(av ?? []);
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [id, doc]);

  // Build next-14-day slot grid from doctor's availability (fallback Mon–Fri 09–16 if none set).
  const days = useMemo(() => {
    const fallback = availability.length === 0;
    const out: { date: Date; slots: { iso: string; label: string; taken: boolean }[] }[] = [];
    const now = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(now); d.setDate(now.getDate() + i); d.setHours(0, 0, 0, 0);
      const dow = d.getDay();
      const windows = fallback
        ? (dow === 0 || dow === 6 ? [] : [{ start_hour: 9, end_hour: 16, slot_minutes: 60 }])
        : availability.filter((a) => a.day_of_week === dow);
      const slots: { iso: string; label: string; taken: boolean }[] = [];
      for (const w of windows) {
        for (let m = w.start_hour * 60; m + w.slot_minutes <= w.end_hour * 60; m += w.slot_minutes) {
          const s = new Date(d); s.setHours(Math.floor(m / 60), m % 60, 0, 0);
          if (s.getTime() < now.getTime() + 30 * 60 * 1000) continue;
          const iso = s.toISOString();
          const h = String(Math.floor(m / 60)).padStart(2, "0");
          const mm = String(m % 60).padStart(2, "0");
          slots.push({ iso, label: `${h}:${mm}`, taken: busySlots.has(iso) });
        }
      }
      if (slots.length) out.push({ date: d, slots });
      if (out.length >= 7) break;
    }
    return out;
  }, [busySlots, availability]);

  function pickSlot(iso: string) {
    if (user && role === "patient") {
      navigate({ to: "/dashboard/patient/doctors/$id", params: { id }, search: { when: iso } as any });
    } else {
      navigate({ to: "/login", search: { redirect: `/doctors/${id}` } as any });
    }
  }

  if (!doc) {
    return (
      <div className="container-narrow px-4 sm:px-6 py-16 text-center space-y-3">
        <h1 className="text-2xl font-bold">Doctor not found</h1>
        <p className="text-sm text-muted-foreground">This profile may have been removed or is no longer active.</p>
        <Link to="/doctors" className="text-primary underline text-sm">Browse all doctors</Link>
      </div>
    );
  }

  return (
    <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
      <nav className="text-xs text-muted-foreground" aria-label="Breadcrumb">
        <Link to="/" className="hover:underline">Home</Link> ›{" "}
        <Link to="/doctors" className="hover:underline">Doctors</Link> ›{" "}
        <span className="text-foreground">Dr. {doc.full_name}</span>
      </nav>

      <header className="rounded-2xl border border-border bg-card p-5 sm:p-6 flex flex-col sm:flex-row gap-5 shadow-sm">
        <div className="h-28 w-28 rounded-2xl bg-healthcare-mint/30 flex items-center justify-center shrink-0 overflow-hidden">
          {doc.photo_url
            ? <img src={doc.photo_url} alt={`Dr. ${doc.full_name}`} className="h-full w-full object-cover" loading="lazy" />
            : <UserIcon className="h-12 w-12 text-healthcare-teal" aria-hidden />}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Dr. {doc.full_name}</h1>
          <p className="text-sm text-healthcare-teal font-medium flex items-center gap-1"><Stethoscope className="h-4 w-4" />{doc.specialty}</p>
          {doc.qualifications && <p className="text-xs text-muted-foreground mt-1">{doc.qualifications}</p>}
          {doc.practice_number && <p className="text-[11px] text-muted-foreground">Practice no. {doc.practice_number}</p>}
          <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-1 mt-2">
            <MapPin className="h-3 w-3" /> {doc.city}{doc.address ? ` · ${doc.address}` : ""}
            {doc.rating_count > 0 && (
              <span className="ml-2 inline-flex items-center gap-0.5">
                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />{doc.rating_avg.toFixed(1)} ({doc.rating_count})
              </span>
            )}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {doc.in_person_available && <Pill>In-person</Pill>}
            {doc.online_available && <Pill><Video className="h-3 w-3" /> Video</Pill>}
            {doc.phone_available && <Pill><Phone className="h-3 w-3" /> Phone</Pill>}
            {(doc.accepted_medical_aids ?? []).map((p) => (
              <Pill key={p} tone="sky"><BadgeCheck className="h-3 w-3" />{p}</Pill>
            ))}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground">Consultation</p>
          <p className="text-2xl font-bold text-primary">R{Number(doc.consultation_fee).toFixed(0)}</p>
          <p className="text-[10px] text-muted-foreground">+ R15 booking fee</p>
        </div>
      </header>

      {doc.bio && (
        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm">
          <h2 className="font-bold text-foreground mb-2">About Dr. {doc.full_name}</h2>
          <p className="text-sm text-foreground/80 whitespace-pre-line">{doc.bio}</p>
        </section>
      )}

      <section id="book" className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold text-foreground flex items-center gap-2"><CalendarCheck className="h-5 w-5 text-primary" /> Available appointments</h2>
          <p className="text-xs text-muted-foreground">Next 7 weekdays · Mon–Fri · 09:00–16:00 SAST</p>
        </div>
        <div className="space-y-3">
          {days.map((d) => (
            <div key={d.date.toISOString()} className="flex flex-col sm:flex-row sm:items-center gap-2">
              <p className="text-xs font-semibold text-foreground w-32 shrink-0">
                {d.date.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {d.slots.map((s) => (
                  <button
                    key={s.iso}
                    type="button"
                    disabled={s.taken}
                    onClick={() => pickSlot(s.iso)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                      s.taken
                        ? "border-border bg-muted text-muted-foreground line-through cursor-not-allowed"
                        : "border-primary/30 bg-primary/5 text-primary hover:bg-primary hover:text-primary-foreground"
                    }`}
                    aria-label={`Book ${s.label} on ${d.date.toDateString()}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {days.length === 0 && <p className="text-sm text-muted-foreground">No upcoming weekday slots — please check back soon.</p>}
        </div>
        <div className="flex items-center justify-between border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">R15 platform booking fee. Consultation fee paid to the doctor.</p>
          <Button onClick={() => pickSlot(new Date(Date.now() + 24 * 3600 * 1000).toISOString())} className="bg-primary text-primary-foreground">
            Book appointment
          </Button>
        </div>
      </section>

      {reviews.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-3">
          <h2 className="font-bold text-foreground">Patient reviews</h2>
          {reviews.map((r, i) => (
            <article key={i} className="border-b border-border last:border-0 pb-2 last:pb-0">
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, k) => (
                  <Star key={k} className={`h-3.5 w-3.5 ${k < r.stars ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}`} />
                ))}
                <span className="text-[10px] text-muted-foreground ml-2">{new Date(r.created_at).toLocaleDateString("en-ZA")}</span>
              </div>
              {r.comment && <p className="text-sm text-foreground/80 mt-1">{r.comment}</p>}
            </article>
          ))}
        </section>
      )}

      <p className="text-[11px] text-muted-foreground text-center">
        HealthReach RSA is a marketplace connecting patients with independent healthcare providers. We do not provide medical services, prescriptions, or treatment.
      </p>
    </div>
  );
}

function Pill({ children, tone = "mint" }: { children: React.ReactNode; tone?: "mint" | "sky" }) {
  const c = tone === "sky" ? "bg-healthcare-sky/15 text-healthcare-sky" : "bg-healthcare-mint/30 text-healthcare-teal";
  return <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${c}`}>{children}</span>;
}
