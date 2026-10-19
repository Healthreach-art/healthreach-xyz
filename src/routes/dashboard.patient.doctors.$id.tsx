import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { useEffect, useMemo, useState } from "react";
import { firestoreClient } from "@/lib/firestore-client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Star, MapPin, Video, Phone, User as UserIcon, CalendarCheck, Loader2, BadgeCheck, ArrowLeft, ShieldCheck, CheckCircle2, Landmark } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { bookDoctorAppointment, getDoctorAvailableSlots, markDoctorAppointmentPaid } from "@/lib/doctors.functions";
import { verifyPaystackTransaction } from "@/lib/paystack.functions";
import { BookingScreen, StepLabel } from "@/components/BookingScreen";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { readPatientAddress } from "@/lib/patient-address";

const PAYSTACK_PUBLIC_KEY = "pk_test_d1b55c54edcc82e952942340a77d0ca85cda7d9a";

declare global {
  interface Window {
    PaystackPop?: {
      setup: (opts: {
        key: string; email: string; amount: number; currency?: string; ref?: string;
        channels?: Array<"card" | "bank" | "ussd" | "bank_transfer">;
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

function totalPayable(consultationFee: number | null, platformFeeCents: number) {
  return Number(consultationFee ?? 0) + platformFeeCents / 100;
}

function distanceInKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(a)) * 10) / 10;
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
  city: string; address: string; latitude: number | null; longitude: number | null; rating_avg: number; rating_count: number;
}

interface AvailableSlot {
  scheduledAt: string;
  durationMinutes: number;
}

interface BookingReservation {
  appointmentId: string;
  platformFeeCents: number;
  scheduledAt: string;
  mode: "in_person" | "video" | "phone";
  reason: string;
}

function Page() {
  const { id } = Route.useParams();
  const { user, profile } = useAuth();
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
  const [visitReason, setVisitReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingStep, setBookingStep] = useState(1);
  const [reservation, setReservation] = useState<BookingReservation | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"paystack" | "bank_transfer">("paystack");
  const [clinicName, setClinicName] = useState("");
  const [distanceKm, setDistanceKm] = useState<number | null>(null);

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
    let active = true;
    void (async () => {
      try {
        const [{ data: d, error: doctorError }, { data: r, error: reviewError }] = await Promise.all([
          firestoreClient.from("doctors").select("*").eq("id", id).eq("status", "approved").eq("is_active", true).eq("is_verified", true).maybeSingle(),
          firestoreClient.from("doctor_reviews").select("stars, comment, created_at").eq("doctor_id", id).order("created_at", { ascending: false }).limit(20),
        ]);
        if (!active) return;
        if (doctorError) throw new Error(`Could not load doctor profile: ${doctorError.message}`);
        if (reviewError) toast.error(`Could not load doctor reviews: ${reviewError.message}`);
        const doctor = d as Doctor | null;
        setDoc(doctor);
        if (doctor) {
          setMode(doctor.in_person_available ? "in_person" : doctor.online_available ? "video" : "phone");
          setClinicName(doctor.address || doctor.city);
          if (doctor.hospital_id) {
            const { data: hospital, error: hospitalError } = await firestoreClient.from("profiles")
              .select("organization_name, full_name").eq("user_id", doctor.hospital_id).maybeSingle();
            if (hospitalError) toast.error(`Could not load clinic details: ${hospitalError.message}`);
            if (hospital) setClinicName(hospital.organization_name || hospital.full_name || doctor.address || doctor.city);
          }
          if (user?.id && doctor.latitude != null && doctor.longitude != null) {
            const address = readPatientAddress(user.id);
            if (address?.lat != null && address.lng != null) {
              setDistanceKm(distanceInKm(address.lat, address.lng, doctor.latitude, doctor.longitude));
            }
          }
        }
        setReviews(r ?? []);
      } catch (error: unknown) {
        if (active) toast.error(error instanceof Error ? error.message : "Could not load doctor profile.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [id, user?.id]);

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

  async function preparePayment() {
    if (!user) return toast.error("Please sign in");
    if (!doc) return;
    if (!when) return toast.error("Pick a date & time");
    const selectedSlot = slots.find((slot) => slot.scheduledAt === when);
    if (!selectedSlot) return toast.error("Choose a currently available appointment time.");
    if (reservation) {
      setBookingStep(4);
      return;
    }
    setBusy(true);
    try {
      const appointmentReason = [visitReason, note.trim()].filter(Boolean).join(": ").slice(0, 1000);
      const { appointmentId, platformFeeCents } = await book({
        data: {
          doctorId: doc.id,
          scheduledAt: selectedSlot.scheduledAt,
          durationMinutes: selectedSlot.durationMinutes,
          mode,
          reason: appointmentReason,
        },
      });
      if (platformFeeCents == null || !Number.isSafeInteger(platformFeeCents) || platformFeeCents < 0) {
        throw new Error("The appointment service returned an invalid platform fee.");
      }
      void import("@/lib/firestore-sync").then(({ mirrorRecord }) => {
        void mirrorRecord("bookings", appointmentId, {
          type: "doctor", service: `Doctor: ${doc.full_name}`, name: user.email,
          doctorRecordId: doc.id, scheduledAt: selectedSlot.scheduledAt, mode, reason: appointmentReason,
          status: "pending", paymentStatus: "pending",
        });
        void mirrorRecord("payments", appointmentId, {
          type: "doctor_appointment_payment",
          amount: Number(doc.consultation_fee ?? 0) + platformFeeCents / 100,
          status: "pending",
        });
      });
      setReservation({ appointmentId, platformFeeCents, scheduledAt: selectedSlot.scheduledAt, mode, reason: appointmentReason });
      setBookingStep(4);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not prepare appointment payment");
    } finally {
      setBusy(false);
    }
  }

  async function cancelReservation() {
    if (reservation) {
      const { error } = await firestoreClient.from("doctor_appointments")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", reservation.appointmentId)
        .eq("patient_id", user?.id);
      if (error) {
        toast.error(`Could not cancel the pending appointment: ${error.message}`);
        return;
      }
      setReservation(null);
    }
    setBookingStep(2);
  }

  async function confirmBooking() {
    if (!user) return toast.error("Please sign in");
    if (!doc || !reservation) return toast.error("Complete the appointment details first.");
    if (doc.consultation_fee == null) return toast.error("This doctor has not listed a consultation fee yet.");
    if (!user.email) return toast.error("Add an email address to your account before paying.");
    if (!user.emailVerified) return toast.error("Verify your email address before paying for an appointment.");
    const totalCents = Math.round(Number(doc.consultation_fee ?? 0) * 100) + reservation.platformFeeCents;
    setBusy(true);
    try {
      await loadPaystack();
      if (!window.PaystackPop) throw new Error("Paystack failed to load");
      const handler = window.PaystackPop.setup({
        key: PAYSTACK_PUBLIC_KEY,
        email: user.email || "",
        amount: totalCents,
        currency: "ZAR",
        ref: `${reservation.appointmentId}_${crypto.randomUUID()}`,
        channels: paymentMethod === "bank_transfer" ? ["bank_transfer"] : ["card", "bank", "ussd"],
        metadata: { appointment_id: reservation.appointmentId, payment_type: "doctor_booking_fee" },
        callback: (resp) => {
          (async () => {
            try {
              const v = await verify({ data: { reference: resp.reference } });
              if (
                !v.verified
                || v.reference !== resp.reference
                || v.metadata.appointment_id !== reservation.appointmentId
                || v.metadata.payment_type !== "doctor_booking_fee"
              ) throw new Error("Payment not verified for this appointment");
              await markPaid({ data: { appointmentId: reservation.appointmentId, reference: resp.reference } });
              void import("@/lib/firestore-sync").then(({ mirrorRecord }) => {
                void mirrorRecord("bookings", reservation.appointmentId, { status: "confirmed", paymentStatus: "paid" });
              });
              toast.success("Appointment confirmed!");
              setBookingStep(5);
            } catch (error: unknown) { toast.error(error instanceof Error ? error.message : "Could not confirm payment"); }
            finally { setBusy(false); }
          })();
        },
        onClose: () => { setBusy(false); toast("Payment cancelled — appointment kept as pending."); },
      });
      handler.openIframe();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not start payment");
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
    <main className="min-h-screen bg-emerald-50/60 px-4 py-6 pb-28">
      {!bookingOpen && (<>
      <StepLabel n={3} label="Select Date & Time" />
      <BookingScreen onBack={() => void navigate({ to: "/dashboard/patient/find", search: { q: "" } })}>
        <div className="flex gap-3">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-emerald-50">
            {doc.photo_url ? <img src={doc.photo_url} alt={doc.full_name} className="h-full w-full object-cover" /> : <UserIcon className="m-6 h-8 w-8 text-emerald-700" />}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-1 text-lg font-bold text-emerald-950">{doc.full_name.toLowerCase().startsWith("dr") ? doc.full_name : `Dr. ${doc.full_name}`}<BadgeCheck className="h-4 w-4 shrink-0 text-emerald-600" /></h1>
            <p className="text-sm text-slate-600">{doc.specialty}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-600">{doc.rating_count > 0 ? <><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{doc.rating_avg.toFixed(1)} ({doc.rating_count} reviews)</> : "No reviews yet"}</p>
            <p className="mt-1 text-xl font-bold text-emerald-950">{doc.consultation_fee == null ? "Fee not listed" : `R${Number(doc.consultation_fee).toFixed(0)}`}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {doc.in_person_available && <Pill>In-person</Pill>}
          {doc.online_available && <Pill>Online</Pill>}
          {doc.phone_available && <Pill>Phone</Pill>}
        </div>
        <p className="mt-2 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3" />{distanceKm != null ? `${distanceKm} km · ` : ""}{clinicName || doc.city}</p>

        <div className="mt-5 flex items-center justify-between"><p className="font-bold text-emerald-950">Select a date</p><p className="text-xs text-slate-500">{selectedDate ? new Date(`${selectedDate}T12:00:00+02:00`).toLocaleDateString("en-ZA", { month: "long", year: "numeric", timeZone: "Africa/Johannesburg" }) : ""}</p></div>
        {slotsLoading ? <p className="mt-3 text-sm text-slate-500">Loading live availability…</p> : slotsError ? <p role="alert" className="mt-3 text-sm text-red-600">{slotsError}</p> : slotGroups.length === 0 ? <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-slate-600">This doctor has no open appointment times right now.</p> : (
          <>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {slotGroups.map(([date]) => (
                <button key={date} type="button" aria-pressed={selectedDate === date} onClick={() => { setSelectedDate(date); setWhen(""); }}
                  className={`flex w-14 shrink-0 flex-col items-center rounded-xl border py-2 text-xs ${selectedDate === date ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-200 text-slate-700"}`}>
                  <span>{selectedDateLabel(date).split(" ")[0]}</span>
                  <span className="text-base font-bold">{selectedDateLabel(date).split(" ")[1]}</span>
                </button>
              ))}
            </div>
            <p className="mt-4 font-bold text-emerald-950">Available time slots</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(slotGroups.find(([date]) => date === selectedDate)?.[1] ?? []).map((slot) => (
                <button key={slot.scheduledAt} type="button" aria-pressed={when === slot.scheduledAt} onClick={() => setWhen(slot.scheduledAt)} className={`rounded-xl border py-2.5 text-sm font-medium ${when === slot.scheduledAt ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-200 text-slate-700 hover:border-emerald-400"}`}>
                  {new Date(slot.scheduledAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" })}
                </button>
              ))}
            </div>
          </>
        )}
        <Button onClick={() => { setBookingStep(bookingStep === 5 ? 5 : reservation ? 4 : when ? 2 : 1); setBookingOpen(true); }} disabled={slotsLoading || slotGroups.length === 0 || doc.consultation_fee == null} className="mt-5 h-12 w-full rounded-xl bg-emerald-700 text-base text-white hover:bg-emerald-800">Continue</Button>
        {doc.bio && <details className="mt-4 text-sm"><summary className="cursor-pointer font-semibold text-emerald-900">About this doctor</summary><p className="mt-2 text-slate-600">{doc.bio}</p>{doc.qualifications && <p className="mt-1 text-xs text-slate-500">{doc.qualifications}</p>}</details>}
      </BookingScreen>
      </>)}

      {bookingOpen && (
        <>
        <StepLabel n={bookingStep < 5 ? 4 : 5} label={bookingStep < 5 ? "Review & Pay" : "Booking Confirmed"} />
        <BookingScreen onBack={bookingStep < 5 && !busy ? () => setBookingOpen(false) : undefined} backTo={bookingStep === 5 ? "/dashboard/patient" : undefined}>
          {bookingStep < 5 ? (
            <div className="space-y-4">
              <ScreenTitle title="Review & Pay" sub="Check your booking, then pay securely." />
              <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-3">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-emerald-100">
                  {doc.photo_url ? <img src={doc.photo_url} alt="" className="h-full w-full object-cover" /> : <UserIcon className="m-3 h-6 w-6 text-emerald-700" />}
                </div>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-900">{doc.full_name}</p><p className="text-xs text-muted-foreground">{doc.specialty} · {distanceKm != null ? `${distanceKm} km · ` : ""}{clinicName || doc.city}</p></div>
                <p className="shrink-0 text-sm font-semibold">R{Number(doc.consultation_fee ?? 0).toFixed(2)}</p>
              </div>
              <ol className="grid grid-cols-4 gap-1" aria-label="Booking progress">
                {["Date & Time", "Consultation", "Details", "Payment"].map((label, index) => (
                  <li key={label} className={`border-b-2 pb-2 text-center text-[10px] font-medium sm:text-xs ${bookingStep === index + 1 ? "border-emerald-600 text-emerald-800" : bookingStep > index + 1 ? "border-emerald-300 text-emerald-700" : "border-border text-muted-foreground"}`}>
                    <span className="block font-bold">{index + 1}</span>{label}
                  </li>
                ))}
              </ol>

              {bookingStep === 1 && (
                <section className="space-y-4">
                  <h2 className="text-lg font-bold">Choose Date & Time</h2>
                  {slotsLoading ? <p className="text-sm text-muted-foreground">Loading available times…</p> : (
                    <>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {slotGroups.map(([date]) => <button key={date} type="button" aria-pressed={selectedDate === date} onClick={() => { setSelectedDate(date); setWhen(""); }} className={`min-w-24 rounded-xl border px-3 py-2 text-sm ${selectedDate === date ? "border-emerald-600 bg-emerald-600 text-white" : "border-border hover:border-emerald-400"}`}><span className="block text-[11px]">{selectedDateLabel(date).split(" ")[0]}</span>{selectedDateLabel(date).split(" ").slice(1).join(" ")}</button>)}
                      </div>
                      {(["Morning", "Afternoon"] as const).map((period) => {
                        const times = slotGroups.find(([date]) => date === selectedDate)?.[1].filter((slot) => {
                          const parts = new Intl.DateTimeFormat("en-ZA", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Africa/Johannesburg" }).formatToParts(new Date(slot.scheduledAt));
                          const hour = Number(parts.find((part) => part.type === "hour")?.value);
                          const minute = Number(parts.find((part) => part.type === "minute")?.value);
                          const minuteOfDay = hour * 60 + minute;
                          return period === "Morning"
                            ? minuteOfDay >= 8 * 60 && minuteOfDay <= 11 * 60 + 30
                            : minuteOfDay >= 13 * 60 && minuteOfDay <= 16 * 60 + 30;
                        }) ?? [];
                        return <div key={period} className="space-y-2"><h3 className="text-sm font-semibold">{period}</h3><div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{times.map((slot) => <button key={slot.scheduledAt} type="button" aria-pressed={when === slot.scheduledAt} onClick={() => setWhen(slot.scheduledAt)} className={`rounded-lg border px-2 py-2 text-sm ${when === slot.scheduledAt ? "border-emerald-600 bg-emerald-600 text-white" : "border-border hover:border-emerald-400"}`}>{new Date(slot.scheduledAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" })}</button>)}</div></div>;
                      })}
                    </>
                  )}
                  {slotsError && <p role="alert" className="text-sm text-destructive">{slotsError}</p>}
                </section>
              )}

              {bookingStep === 2 && (
                <section className="space-y-3">
                  <h2 className="text-lg font-bold">Choose Consultation Mode</h2>
                  {availableModes.filter((item) => item.enabled).map(({ id: modeId, label, description, icon: Icon }) => <button key={modeId} type="button" aria-pressed={mode === modeId} onClick={() => setMode(modeId)} className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left ${mode === modeId ? "border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600" : "border-border hover:border-emerald-300"}`}><Icon className="h-5 w-5 text-emerald-700" /><span className="flex-1"><strong className="block text-sm">{label === "Video" ? "Video Consultation" : label === "Phone" ? "Phone Consultation" : label}</strong><span className="text-xs text-muted-foreground">{modeId === "in_person" ? "Visit the clinic for your consultation" : modeId === "video" ? "Speak with your doctor via secure video call" : "Talk to your doctor over the phone"}</span></span>{mode === modeId && <CheckCircle2 className="h-5 w-5 text-emerald-700" />}</button>)}
                </section>
              )}

              {bookingStep === 3 && (
                <section className="space-y-4">
                  <h2 className="text-lg font-bold">Patient Details</h2>
                  <div className="flex items-center gap-3 rounded-xl border p-3">
                    <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-emerald-100 font-semibold text-emerald-800">{profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : profile?.full_name.charAt(0) || "P"}</div>
                    <div><p className="text-sm font-semibold">{profile?.full_name || user?.user_metadata.full_name || "Patient"}</p><p className="text-xs text-muted-foreground">{user?.email || profile?.email}</p><p className="text-xs text-muted-foreground">{profile?.phone || "Phone number not provided"}</p></div>
                  </div>
                  <div className="space-y-2"><Label htmlFor="visit-reason">Reason for visit</Label><select id="visit-reason" value={visitReason} onChange={(event) => setVisitReason(event.target.value)} disabled={!!reservation} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"><option value="">Choose a reason</option>{["General checkup", "Follow-up", "Prescription renewal", "Acute illness", "Other"].map((reasonOption) => <option key={reasonOption}>{reasonOption}</option>)}</select></div>
                  <div className="space-y-2"><Label htmlFor="doctor-note">Add a note for the doctor (optional)</Label><Textarea id="doctor-note" rows={3} value={note} onChange={(event) => setNote(event.target.value)} disabled={!!reservation} maxLength={800} placeholder="Share any helpful details for your visit." /></div>
                </section>
              )}

              {bookingStep === 4 && reservation && (
                <section className="space-y-4">
                  <h2 className="text-lg font-bold">Payment & Confirmation</h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button type="button" aria-pressed={paymentMethod === "paystack"} onClick={() => setPaymentMethod("paystack")} className={`rounded-xl border p-4 text-left ${paymentMethod === "paystack" ? "border-emerald-600 bg-emerald-50" : "border-border"}`}><strong className="block text-sm">Paystack</strong><span className="text-xs text-muted-foreground">Card, bank or USSD</span></button>
                    <button type="button" aria-pressed={paymentMethod === "bank_transfer"} onClick={() => setPaymentMethod("bank_transfer")} className={`rounded-xl border p-4 text-left ${paymentMethod === "bank_transfer" ? "border-emerald-600 bg-emerald-50" : "border-border"}`}><strong className="flex items-center gap-2 text-sm"><Landmark className="h-4 w-4" /> Bank Transfer</strong><span className="text-xs text-muted-foreground">Secure bank transfer through Paystack</span></button>
                  </div>
                  <div className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Consultation fee</span><span>R{Number(doc.consultation_fee ?? 0).toFixed(2)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Platform fee</span><span>R{(reservation.platformFeeCents / 100).toFixed(2)}</span></div>
                    <div className="flex justify-between border-t pt-2 font-bold"><span>Total</span><span className="text-emerald-800">R{(totalPayable(doc.consultation_fee, reservation.platformFeeCents)).toFixed(2)}</span></div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-emerald-800"><ShieldCheck className="h-4 w-4" /> Your payment is secure</div>
                </section>
              )}

              <div className="flex justify-between gap-3 border-t pt-4">
                {bookingStep > 1 ? <Button variant="outline" disabled={busy} onClick={() => bookingStep === 4 ? setBookingStep(3) : bookingStep === 3 ? void cancelReservation() : setBookingStep(bookingStep - 1)}>Back</Button> : <span />}
                {bookingStep < 3 ? <Button disabled={!when || (bookingStep === 1 && slotsLoading)} onClick={() => setBookingStep(bookingStep + 1)}>Next</Button> : bookingStep === 3 ? <Button disabled={busy} onClick={() => void preparePayment()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Next</Button> : <Button disabled={busy || !reservation} onClick={() => void confirmBooking()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Pay R{reservation ? totalPayable(doc.consultation_fee, reservation.platformFeeCents).toFixed(2) : "0.00"}</Button>}
              </div>
            </>
          ) : (
            <section className="space-y-5 py-4 text-center">
              <div className="relative mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100">
                {[0, 1, 2, 3, 4, 5].map((piece) => <span key={piece} className={`absolute h-2 w-2 animate-bounce rounded-sm ${["bg-emerald-500", "bg-amber-400", "bg-sky-500"][piece % 3]}`} style={{ top: `${piece % 2 ? 8 : 12}px`, left: `${piece * 15}px`, animationDelay: `${piece * 80}ms` }} />)}
                <CheckCircle2 className="h-12 w-12 text-emerald-700" />
              </div>
              <div><h2 className="text-2xl font-bold text-slate-900">Appointment Booked!</h2><p className="mt-2 text-sm text-muted-foreground">Your appointment with {doc.full_name} has been successfully booked.</p></div>
              <div className="space-y-2 rounded-2xl border p-4 text-left text-sm">
                <p><strong>Date:</strong> {reservation && new Date(reservation.scheduledAt).toLocaleDateString("en-ZA", { dateStyle: "full", timeZone: "Africa/Johannesburg" })}</p>
                <p><strong>Time:</strong> {reservation && new Date(reservation.scheduledAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" })}</p>
                <p><strong>Mode:</strong> {reservation?.mode === "video" ? "Video consultation" : reservation?.mode === "phone" ? "Phone consultation" : "In-person"}</p>
                <p><strong>Clinic:</strong> {clinicName || doc.city}</p>
                {distanceKm != null && <p><strong>Distance:</strong> {distanceKm} km</p>}
              </div>
              <div className="grid gap-2">
                <Button className="h-11 rounded-xl bg-emerald-700 text-white hover:bg-emerald-800" onClick={() => navigate({ to: "/dashboard/patient/consultations" })}>View Appointment</Button>
                {reservation && <Button variant="outline" className="h-11 rounded-xl border-emerald-200 text-emerald-800" onClick={() => downloadIcs(reservation.scheduledAt, doc.full_name, clinicName || doc.city)}><CalendarPlus className="mr-2 h-4 w-4" />Add to Calendar</Button>}
                <Button variant="outline" className="h-11 rounded-xl border-emerald-200 text-emerald-800" onClick={() => navigate({ to: "/dashboard/patient/consultations" })}><MessageCircle className="mr-2 h-4 w-4" />Message Doctor</Button>
              </div>
              <LockFavourite uid={user?.id} type="doctor" providerId={doc.id} providerName={doc.full_name} />
            </section>
          )}
        </BookingScreen>
        </>
      )}

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
