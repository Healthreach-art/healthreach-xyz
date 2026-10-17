import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { useEffect, useMemo, useState } from "react";
import { firestoreClient } from "@/lib/firestore-client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Star, MapPin, Video, Phone, User as UserIcon, CalendarCheck, Loader2, BadgeCheck, ArrowLeft } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { bookDoctorAppointment, getDoctorAvailableSlots, markDoctorAppointmentPaid } from "@/lib/doctors.functions";
import { verifyPaystackTransaction } from "@/lib/paystack.functions";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import logo from "@/assets/healthreach-logo.png";

const PAYSTACK_PUBLIC_KEY = "pk_test_d1b55c54edcc82e952942340a77d0ca85cda7d9a";

declare global {
  interface Window {
    PaystackPop?: {
      setup: (opts: {
        key: string; email: string; amount: number; currency?: string; ref?: string;
        metadata?: Record<string, string>;
        callback: (resp: { reference: string }) => void; onClose: () => void;
      }) => { openIframe: () => void };
    };
  }
}

function loadPaystack(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve();
    if (window.PaystackPop) return resolve();
    const s = document.createElement("script");
    s.src = "https://js.paystack.co/v1/inline.js"; s.async = true;
    s.onload = () => resolve(); s.onerror = () => reject(new Error("Failed to load Paystack"));
    document.head.appendChild(s);
  });
}

function slotDateKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export const Route = createFileRoute("/dashboard/patient/doctors/$id")({
  head: () => ({ meta: [{ title: "Doctor — HealthReachCare" }] }),
  validateSearch: (s: Record<string, unknown>): { when?: string } =>
    typeof s.when === "string" ? { when: s.when } : {},
  component: () => <RoleGuard allow="patient"><Page /></RoleGuard>,
});

interface Doctor {
  id: string; hospital_id: string; full_name: string; specialty: string; qualifications: string;
  practice_number: string; bio: string; photo_url: string;
  consultation_fee: number | null; accepted_medical_aids: string[] | null; languages: string[] | null;
  online_available: boolean; in_person_available: boolean; phone_available: boolean;
  city: string; address: string; rating_avg: number; rating_count: number;
}

interface AvailableSlot {
  scheduledAt: string;
  durationMinutes: number;
}

function Page() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const book = useServerFn(bookDoctorAppointment);
  const getSlots = useServerFn(getDoctorAvailableSlots);
  const markPaid = useServerFn(markDoctorAppointmentPaid);
  const verify = useServerFn(verifyPaystackTransaction);

  const [doc, setDoc] = useState<Doctor | null>(null);
  const [reviews, setReviews] = useState<{ stars: number; comment: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const [when, setWhen] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [mode, setMode] = useState<"in_person" | "video" | "phone">("in_person");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setSlotsLoading(true);
    setSlotsError("");
    void getSlots({ data: { doctorId: id } })
      .then(({ slots: availableSlots }) => {
        if (!active) return;
        setSlots(availableSlots);
        const requestedTime = search.when ? Date.parse(search.when) : NaN;
        const matchingSlot = Number.isFinite(requestedTime)
          ? availableSlots.find((slot) => Date.parse(slot.scheduledAt) === requestedTime)
          : undefined;
        setWhen(matchingSlot?.scheduledAt ?? "");
        setSelectedDate(matchingSlot ? slotDateKey(matchingSlot.scheduledAt) : "");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setSlotsError(error instanceof Error ? error.message : "Could not load appointment availability.");
      })
      .finally(() => {
        if (active) setSlotsLoading(false);
      });
    return () => { active = false; };
  }, [getSlots, id, search.when, user]);

  useEffect(() => {
    (async () => {
      const [{ data: d }, { data: r }] = await Promise.all([
        firestoreClient.from("doctors").select("*").eq("id", id).eq("is_active", true).eq("is_verified", true).maybeSingle(),
        firestoreClient.from("doctor_reviews").select("stars, comment, created_at").eq("doctor_id", id).order("created_at", { ascending: false }).limit(20),
      ]);
      setDoc(d as Doctor);
      if (d) setMode(d.in_person_available ? "in_person" : d.online_available ? "video" : "phone");
      setReviews(r ?? []); setLoading(false);
    })();
  }, [id, user]);

  const slotGroups = useMemo(() => {
    const groups = new Map<string, AvailableSlot[]>();
    for (const slot of slots) {
      const key = slotDateKey(slot.scheduledAt);
      groups.set(key, [...(groups.get(key) ?? []), slot]);
    }
    return Array.from(groups.entries()).slice(0, 14);
  }, [slots]);

  useEffect(() => {
    if (!selectedDate && slotGroups.length) setSelectedDate(slotGroups[0][0]);
  }, [selectedDate, slotGroups]);

  async function confirmBooking() {
    if (!user) return toast.error("Please sign in");
    if (!doc) return;
    if (!when) return toast.error("Pick a date & time");
    const selectedSlot = slots.find((slot) => slot.scheduledAt === when);
    if (!selectedSlot) return toast.error("Choose a currently available appointment time.");
    setBusy(true);
    try {
      const { appointmentId, platformFeeCents } = await book({
        data: {
          doctorId: doc.id,
          scheduledAt: selectedSlot.scheduledAt,
          durationMinutes: selectedSlot.durationMinutes,
          mode,
          reason: reason.trim(),
        },
      });
      void import("@/lib/firestore-sync").then(({ mirrorRecord }) => {
        void mirrorRecord("bookings", appointmentId, {
          type: "doctor", service: `Doctor: ${doc.full_name ?? "appointment"}`, name: user.email,
          doctorRecordId: doc.id, scheduledAt: selectedSlot.scheduledAt, mode, reason: reason.trim(),
          status: "pending", paymentStatus: "pending",
        });
        void mirrorRecord("payments", appointmentId, {
          type: "appointment_platform_fee", amount: (platformFeeCents ?? 0) / 100, status: "pending",
        });
      });
      await loadPaystack();
      if (!window.PaystackPop) throw new Error("Paystack failed to load");
      const handler = window.PaystackPop.setup({
        key: PAYSTACK_PUBLIC_KEY,
        email: user.email || "support@healthreachcare.co.za",
        amount: platformFeeCents ?? 0,
        currency: "ZAR",
        ref: `${appointmentId}_${crypto.randomUUID()}`,
        metadata: { appointment_id: appointmentId, payment_type: "doctor_booking_fee" },
        callback: (resp) => {
          (async () => {
            try {
              const v = await verify({ data: { reference: resp.reference } });
              if (
                !v.verified
                || v.reference !== resp.reference
                || v.metadata.appointment_id !== appointmentId
                || v.metadata.payment_type !== "doctor_booking_fee"
              ) throw new Error("Payment not verified for this appointment");
              await markPaid({ data: { appointmentId, reference: resp.reference } });
              void import("@/lib/firestore-sync").then(({ mirrorRecord }) => {
                void mirrorRecord("bookings", appointmentId, { status: "confirmed", paymentStatus: "paid" });
              });
              toast.success("Appointment confirmed!");
              navigate({ to: "/dashboard/patient/consultations" });
            } catch (error: unknown) { toast.error(error instanceof Error ? error.message : "Could not confirm payment"); }
            finally { setBusy(false); }
          })();
        },
        onClose: () => { setBusy(false); toast("Payment cancelled — appointment kept as pending."); },
      });
      handler.openIframe();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Booking failed");
      setBusy(false);
    }
  }

  if (loading) return <div className="container-narrow px-4 sm:px-6 py-8 text-sm text-muted-foreground">Loading…</div>;
  if (!doc) return <div className="container-narrow px-4 sm:px-6 py-8 text-sm text-muted-foreground">Doctor not found.</div>;

  const availableModes = [
    { id: "in_person", label: "In-Person", description: "Visit the practice", icon: MapPin, enabled: doc.in_person_available },
    { id: "video", label: "Video", description: "Consult online", icon: Video, enabled: doc.online_available },
    { id: "phone", label: "Phone", description: "Talk by phone", icon: Phone, enabled: doc.phone_available },
  ] as const;
  const selectedDateLabel = (date: string) => new Date(`${date}T12:00:00+02:00`).toLocaleDateString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <main className="container-narrow space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex items-center justify-between border-b border-border/60 pb-4">
        <Link to="/dashboard/patient/find" search={{ q: "" }} className="flex items-center gap-3" aria-label="HealthReachCare doctor directory">
          <img src={logo} alt="HealthReachCare" className="h-10 w-auto" />
          <span className="hidden text-sm font-semibold text-slate-900 sm:inline">HealthReachCare</span>
        </Link>
        <Link to="/dashboard/patient/find" search={{ q: "" }} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 h-4 w-4" /> Back to doctors</Link>
      </header>
      <section className="flex flex-col gap-5 rounded-2xl border border-border/60 bg-white p-5 shadow-sm sm:flex-row sm:p-6">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-emerald-50">
          {doc.photo_url ? <img src={doc.photo_url} alt={doc.full_name} className="h-full w-full object-cover" /> : <UserIcon className="h-10 w-10 text-emerald-700" />}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-slate-900">Dr. {doc.full_name}</h1>
          <p className="mt-1 text-sm font-medium text-emerald-700">{doc.specialty}</p>
          <p className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-700"><BadgeCheck className="h-3.5 w-3.5" /> Verified practitioner</p>
          {doc.qualifications && <p className="mt-2 text-sm text-slate-600">{doc.qualifications}</p>}
          {doc.practice_number && <p className="mt-1 text-xs text-muted-foreground">Practice number: {doc.practice_number}</p>}
          <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" /> {doc.city}{doc.address ? ` · ${doc.address}` : ""}
            {doc.rating_count > 0 && (
              <span className="ml-2 flex items-center gap-0.5">
                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />{doc.rating_avg.toFixed(1)} ({doc.rating_count})
              </span>
            )}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {doc.in_person_available && <Pill>In-person</Pill>}
            {doc.online_available && <Pill><Video className="h-3 w-3" /> Video</Pill>}
            {doc.phone_available && <Pill><Phone className="h-3 w-3" /> Phone</Pill>}
            
          </div>
          {doc.bio && <p className="text-sm text-foreground/80 mt-3">{doc.bio}</p>}
          {!!doc.languages?.length && <p className="mt-3 text-xs text-muted-foreground"><span className="font-semibold text-slate-700">Languages:</span> {doc.languages.join(", ")}</p>}
          {!!doc.accepted_medical_aids?.length && <p className="mt-1 text-xs text-muted-foreground"><span className="font-semibold text-slate-700">Medical aids:</span> {doc.accepted_medical_aids.join(", ")}</p>}
        </div>
        <div className="shrink-0 sm:text-right">
          <p className="text-xs text-muted-foreground">Consultation</p>
          <p className="text-2xl font-bold text-slate-900">{doc.consultation_fee == null ? "Not listed" : `R${Number(doc.consultation_fee).toFixed(2)}`}</p>
          <p className="text-xs text-muted-foreground">Consultation fee, paid to the doctor</p>
        </div>
      </section>

      <section className="space-y-5 rounded-2xl border border-border/60 bg-white p-5 shadow-sm sm:p-6">
        <div>
          <h2 className="flex items-center gap-2 font-bold text-slate-900"><CalendarCheck className="h-5 w-5 text-emerald-600" /> Book an appointment</h2>
          <p className="mt-1 text-sm text-muted-foreground">Choose a consultation style and an available time.</p>
        </div>
        <fieldset className="space-y-2">
          <Label>Consultation mode</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {availableModes.filter((item) => item.enabled).map(({ id: modeId, label, description, icon: Icon }) => (
              <button key={modeId} type="button" aria-pressed={mode === modeId} onClick={() => setMode(modeId)}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${mode === modeId ? "border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600" : "border-border/70 hover:border-emerald-300"}`}>
                <Icon className={`h-5 w-5 ${mode === modeId ? "text-emerald-700" : "text-muted-foreground"}`} />
                <span><span className="block text-sm font-semibold text-slate-900">{label}</span><span className="block text-xs text-muted-foreground">{description}</span></span>
              </button>
            ))}
          </div>
        </fieldset>
        <div className="space-y-3">
          <Label>Choose a date</Label>
          {slotsLoading ? <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading available times…</div> : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {slotGroups.map(([date]) => (
                <button key={date} type="button" aria-pressed={selectedDate === date} onClick={() => { setSelectedDate(date); setWhen(""); }}
                  className={`min-w-24 rounded-xl border px-3 py-2 text-sm transition ${selectedDate === date ? "border-emerald-600 bg-emerald-600 text-white" : "border-border/70 bg-white text-slate-700 hover:border-emerald-300"}`}>
                  <span className="block text-[11px] opacity-80">{selectedDateLabel(date).split(" ")[0]}</span>
                  <span className="font-semibold">{selectedDateLabel(date).split(" ").slice(1).join(" ")}</span>
                </button>
              ))}
            </div>
          )}
          {slotsError && <p role="alert" className="text-sm text-destructive">{slotsError}</p>}
          {!slotsLoading && !slotsError && slotGroups.length === 0 && <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No appointment times are currently available.</p>}
          {selectedDate && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {(slotGroups.find(([date]) => date === selectedDate)?.[1] ?? []).map((slot) => (
                <button key={slot.scheduledAt} type="button" aria-pressed={when === slot.scheduledAt} onClick={() => setWhen(slot.scheduledAt)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${when === slot.scheduledAt ? "border-emerald-600 bg-emerald-600 text-white" : "border-border/70 bg-white text-slate-700 hover:border-emerald-400 hover:text-emerald-700"}`}>
                  {new Date(slot.scheduledAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" })}
                </button>
              ))}
            </div>
          )}
          {when && <p className="text-xs text-emerald-800">Selected: {new Date(when).toLocaleString("en-ZA", { dateStyle: "full", timeStyle: "short", timeZone: "Africa/Johannesburg" })}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="visit-reason">Reason for visit <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Textarea id="visit-reason" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} placeholder="Share anything that may help the doctor prepare." />
        </div>
        <div className="rounded-xl bg-slate-50/70 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Pricing breakdown</h3>
          <div className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Consultation fee (paid to doctor)</span><span>{doc.consultation_fee == null ? "Not listed" : `R${Number(doc.consultation_fee).toFixed(2)}`}</span></div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">HealthReachCare booking fee</span><span>R15.00</span></div>
            <div className="flex justify-between gap-4 border-t border-border/70 pt-2 font-semibold"><span>Pay now</span><span className="text-emerald-700">R15.00</span></div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
          <p className="max-w-md text-xs text-muted-foreground">The R15 booking fee is paid securely now. Settle the consultation fee directly with the doctor.</p>
          <Button onClick={confirmBooking} disabled={busy || !when || slotsLoading} className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700">
            {busy ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing…</>) : "Confirm & pay R15"}
          </Button>
        </div>
      </section>

      {reviews.length > 0 && (
        <section className="space-y-3 rounded-2xl border border-border/60 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-bold text-foreground">Reviews</h2>
          {reviews.map((r, i) => (
            <div key={i} className="border-b border-border last:border-0 pb-2 last:pb-0">
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, k) => (
                  <Star key={k} className={`h-3.5 w-3.5 ${k < r.stars ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}`} />
                ))}
                <span className="text-[10px] text-muted-foreground ml-2">{new Date(r.created_at).toLocaleDateString("en-ZA")}</span>
              </div>
              {r.comment && <p className="text-sm text-foreground/80 mt-1">{r.comment}</p>}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}

function Pill({ children, tone = "mint" }: { children: React.ReactNode; tone?: "mint" | "sky" }) {
  const c = tone === "sky" ? "bg-healthcare-sky/15 text-healthcare-sky" : "bg-healthcare-mint/30 text-healthcare-teal";
  return <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${c}`}>{children}</span>;
}
