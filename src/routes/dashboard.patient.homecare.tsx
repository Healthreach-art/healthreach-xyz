import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { LockFavourite } from "@/components/LockFavourite";
import { useAuth } from "@/hooks/useAuth";
import { firestoreClient } from "@/lib/firestore-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AddressPicker, type PickedAddress } from "@/components/AddressPicker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { BookingScreen, ScreenTitle, ServiceRow, StepLabel } from "@/components/BookingScreen";
import homecareImg from "@/assets/role-homecare.jpg";
import {
  Accessibility, ArrowLeft, BadgeCheck, CalendarDays, Check, CheckCircle2, ChevronRight,
  Clock3, Copy, HeartHandshake, HeartPulse, Loader2, Mail, MapPin, MessageCircle, Pill,
  ShieldCheck, Stethoscope, UsersRound,
} from "lucide-react";
import { PATIENT_ADDRESS_CHANGED, readPatientAddress, type PatientAddress } from "@/lib/patient-address";
import { useServerFn } from "@tanstack/react-start";
import { listHomecareServicePrices, respondToHomecareQuote, submitHomecareRequest } from "@/lib/homecare.functions";
import { HomecareServiceChat } from "@/components/HomecareServiceChat";
import { MarketplacePayment } from "@/components/MarketplacePayment";
import { REQUEST_LABEL } from "@/lib/homecare";

interface HomecareRequest {
  id: string;
  reference_number: string | null;
  service_type: string;
  description: string | null;
  address: string;
  preferred_at: string | null;
  status: string;
  quote_amount: number | null;
  quote_currency: string | null;
  quote_details: string | null;
  quote_issued_at: string | null;
  pricing_mode?: string;
  total_amount?: number;
  payment_verified_at?: string;
  payment_status?: string;
  payment_reference?: string;
  homecare_assignments: Array<{
    id: string;
    request_id?: string;
    provider_id?: string;
    created_at: string;
    status: string;
    scheduled_at: string | null;
    completed_at?: string | null;
  }>;
  homecare_providers: { business_name: string | null; full_name: string | null } | null;
}

const SERVICES = [
  { title: "Personal Care", description: "Bathing, dressing, grooming and daily living support", icon: HeartHandshake },
  { title: "Elderly Care", description: "Companionship and everyday support for older loved ones", icon: UsersRound },
  { title: "Post-Surgery Care", description: "Recovery support, wound care checks and rest at home", icon: Stethoscope },
  { title: "Mobility Assistance", description: "Help moving safely, transfers and walking support", icon: Accessibility },
  { title: "Medication Support", description: "Reminders and help taking prescribed medicine on time", icon: Pill },
  { title: "Specialised Care", description: "Chronic conditions, dementia and complex care needs", icon: HeartPulse },
] as const;

const INCLUDES: Record<string, string[]> = {
  "Personal Care": ["Bathing & hygiene", "Dressing & grooming", "Meal assistance"],
  "Elderly Care": ["Companionship", "Light housekeeping", "Daily check-ins"],
  "Post-Surgery Care": ["Recovery monitoring", "Mobility help", "Comfort care"],
  "Mobility Assistance": ["Safe transfers", "Walking support", "Fall prevention"],
  "Medication Support": ["Medicine reminders", "Schedule tracking", "Refill reminders"],
  "Specialised Care": ["Condition-specific care", "Care plan follow-up", "Family updates"],
};

function nextDays(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i);
    return { key: localDateKey(d), day: d.toLocaleDateString("en-ZA", { weekday: "short", timeZone: "Africa/Johannesburg" }), num: d.toLocaleDateString("en-ZA", { day: "numeric", timeZone: "Africa/Johannesburg" }), month: d.toLocaleDateString("en-ZA", { month: "short", timeZone: "Africa/Johannesburg" }) };
  });
}

const TIME_SLOTS = [
  { value: "08:00", label: "08:00 AM" },
  { value: "09:00", label: "09:00 AM" },
  { value: "10:00", label: "10:00 AM" },
  { value: "11:00", label: "11:00 AM" },
  { value: "12:00", label: "12:00 PM" },
  { value: "14:00", label: "02:00 PM" },
  { value: "16:00", label: "04:00 PM" },
  { value: "18:00", label: "06:00 PM" },
] as const;

const REQUEST_TABS = ["All", "Active", "Completed", "Cancelled"] as const;
type RequestTab = typeof REQUEST_TABS[number];

export const Route = createFileRoute("/dashboard/patient/homecare")({
  head: () => ({
    meta: [
      { title: "Home Care Requests — HealthReachCare" },
      { name: "description", content: "Request trusted homecare services and pay upfront and track confirmed visits through HealthReachCare." },
      { property: "og:title", content: "Home Care Requests — HealthReachCare" },
      { property: "og:description", content: "Upfront homecare prices, secure payment and visit confirmation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <RoleGuard allow="patient"><PatientHomecarePage /></RoleGuard>,
});

function localDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function referenceFor(request: HomecareRequest) {
  return request.reference_number || `Request ${request.id.slice(0, 8).toUpperCase()}`;
}

function statusLabel(status: string) {
  if (["pending_review", "quote_pending", "awaiting_payment"].includes(status)) return "Awaiting payment";
  if (status === "scheduled") return "Service confirmed";
  if (status === "payment_review") return "Payment needs support review";
  if (status === "quote_accepted" || status === "assigned" || status === "accepted" || status === "scheduled" || status === "in_progress") return "Accepted";
  if (status === "completed" || status === "confirmed") return "Completed";
  if (status === "cancelled" || status === "rejected" || status === "quote_declined") return "Cancelled";
  return status.replaceAll("_", " ");
}

function statusColor(status: string) {
  if (status === "pending_review" || status === "quote_pending") return "bg-amber-100 text-amber-800";
  if (["quote_accepted", "assigned", "accepted", "scheduled", "in_progress"].includes(status)) return "bg-emerald-100 text-emerald-800";
  if (status === "completed" || status === "confirmed") return "bg-sky-100 text-sky-800";
  return "bg-slate-100 text-slate-700";
}

function PatientHomecarePage() {
  const { user, profile } = useAuth();
  const createRequest = useServerFn(submitHomecareRequest);
  const respondToQuote = useServerFn(respondToHomecareQuote);
  const listPrices = useServerFn(listHomecareServicePrices);
  const [services, setServices] = useState<Array<{ name: string; hourlyRateCents: number }>>([]);
  const [priceError, setPriceError] = useState("");
  const [paymentTarget, setPaymentTarget] = useState("");
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const [requests, setRequests] = useState<HomecareRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [serviceType, setServiceType] = useState("");
  const [instructions, setInstructions] = useState("");
  const [careFor, setCareFor] = useState("Myself");
  const [specialRequirements, setSpecialRequirements] = useState("");
  const [hours, setHours] = useState("2");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [tab, setTab] = useState<RequestTab>("All");
  const [copied, setCopied] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<HomecareRequest | null>(null);
  const [dateKey, setDateKey] = useState("");
  const [time, setTime] = useState("");
  const [locationMode, setLocationMode] = useState<"home" | "different">("home");
  const [address, setAddress] = useState<{ address: string; lat: number | null; lng: number | null } | null>(null);
  const [savedAddress, setSavedAddress] = useState("");
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [reordering, setReordering] = useState<string | null>(null);
  const homeAddress = savedAddress || profile?.address || "";
  const visitAddress = locationMode === "home" ? homeAddress : (address?.address || "");
  const description = [instructions.trim(), specialRequirements.trim() ? `Special requirements: ${specialRequirements.trim()}` : "", `Care for: ${careFor}`].filter(Boolean).join("\n");
  const preferredAt = dateKey && time ? `${dateKey}T${time}:00+02:00` : "";

  const load = useCallback(async () => {
    if (!user) return;
    const { data, error } = await firestoreClient
      .from("homecare_requests")
      .select("*, homecare_assignments(id, created_at, status, scheduled_at), homecare_providers(business_name, full_name)")
      .eq("patient_id", user.id).order("created_at", { ascending: false });
    if (error) {
      toast.error(`Could not load your homecare requests: ${error.message}`);
      setLoading(false);
      return;
    }
    setRequests((data ?? []) as unknown as HomecareRequest[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void listPrices().then(result => { setServices(result.services); setPriceError(""); }).catch(() => setPriceError("Service prices could not be loaded. Please try again or contact support.")); }, [listPrices]);
  const hourlyRateCents = services.find(service => service.name === serviceType)?.hourlyRateCents;
  const totalCents = hourlyRateCents === undefined ? null : hourlyRateCents * Number(hours);


  useEffect(() => {
    if (!user?.id) return;
    const applyAddress = (value: PatientAddress | null) => {
      setSavedAddress(value?.address ?? profile?.address ?? "");
      if (value?.address) {
        setAddress(value.lat != null && value.lng != null
          ? { address: value.address, lat: value.lat, lng: value.lng }
          : null);
      }
    };
    applyAddress(readPatientAddress(user.id) ?? (profile?.address ? { address: profile.address, lat: null, lng: null } : null));
    const onChange = (event: Event) => applyAddress((event as CustomEvent<PatientAddress>).detail);
    window.addEventListener(PATIENT_ADDRESS_CHANGED, onChange);
    return () => window.removeEventListener(PATIENT_ADDRESS_CHANGED, onChange);
  }, [user?.id, profile?.address]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = firestoreClient.channel(`hc-patient-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "homecare_requests", filter: `patient_id=eq.${user.id}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "homecare_assignments" }, () => void load())
      .subscribe();
    return () => { void firestoreClient.removeChannel(channel); };
  }, [user?.id, load]);

  const submit = async () => {
    if (!user) return toast.error("Please sign in to request homecare.");
    if (!serviceType) return toast.error("Choose the service you need.");
    if (!visitAddress.trim()) return toast.error("Choose or add a service address.");
    if (!dateKey || !time) return toast.error("Choose a preferred date and time.");
    const preferredAt = new Date(`${dateKey}T${time}:00+02:00`);
    if (!Number.isFinite(preferredAt.getTime()) || preferredAt.getTime() <= Date.now()) {
      return toast.error("Choose a date and time in the future.");
    }

    setSaving(true);
    try {
      const result = await createRequest({
        data: {
          expectedAmountCents: totalCents ?? 0,
          serviceType,
          description: description.slice(0, 5000),
          address: visitAddress.trim(),
          latitude: locationMode === "different" ? address?.lat ?? null : address?.address === homeAddress ? address.lat : null,
          longitude: locationMode === "different" ? address?.lng ?? null : address?.address === homeAddress ? address.lng : null,
          preferredAt: preferredAt.toISOString(),
          durationHours: Number(hours) || null,
        },
      });
      setReferenceNumber(result.referenceNumber);
      setPaymentTarget(result.id);
      setBookingConfirmed(false);
      setStep(4);
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send your homecare request.");
    } finally {
      setSaving(false);
    }
  };

  const answerQuote = async (requestId: string, response: "accept" | "decline") => {
    setRespondingTo(requestId);
    try {
      await respondToQuote({ data: { requestId, response } });
      toast.success(response === "accept" ? "Quotation accepted. The care coordinator will confirm next steps." : "Quotation declined.");
      await load();
      setSelectedRequest((current) => current?.id === requestId
        ? { ...current, status: response === "accept" ? "quote_accepted" : "quote_declined" }
        : current);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit your response.");
    } finally {
      setRespondingTo(null);
    }
  };

  const reorder = async (request: HomecareRequest, _assignmentId: string) => {
    setServiceType(request.service_type);
    setInstructions(request.description ?? "");
    setDateKey(""); setTime(""); setStep(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const latestAssignment = (request: HomecareRequest) => (request.homecare_assignments ?? [])
    .slice()
    .sort((first, second) => second.created_at.localeCompare(first.created_at))[0];
  const completedRequests = requests.filter((request) => {
    const status = latestAssignment(request)?.status ?? request.status;
    return status === "completed" || status === "confirmed";
  });
  const activeRequests = requests.filter((request) => !completedRequests.includes(request));

  const validateStep = (current: number) => {
    if (current === 1 && !serviceType.trim()) {
      toast.error("Choose the type of care you need.");
      return false;
    }
    if (current === 2) {
      if (!description.trim()) {
        toast.error("Please describe the care you need.");
        return false;
      }
      if (preferredAt && new Date(preferredAt).getTime() <= Date.now()) {
        toast.error("Choose a preferred time in the future.");
        return false;
      }
      if (hours && (!Number.isInteger(Number(hours)) || Number(hours) < 1 || Number(hours) > 24)) {
        toast.error("Duration must be between 1 and 24 whole hours.");
        return false;
      }
    }
    if (current === 3 && !(address?.address || savedAddress || profile?.address)?.trim()) {
      toast.error("Add the address for the care visit.");
      return false;
    }
    return true;
  };

  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(referenceNumber);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Could not copy the request reference.");
    }
  };

  const visibleRequests = requests.filter((request) => {
    if (tab === "All") return true;
    if (tab === "Completed") return ["completed", "confirmed"].includes(request.status);
    if (tab === "Cancelled") return ["cancelled", "rejected", "quote_declined"].includes(request.status);
    return !["completed", "confirmed", "cancelled", "rejected", "quote_declined"].includes(request.status);
  });

  return (
    <main className="min-h-screen space-y-8 bg-emerald-50/60 px-4 py-6 pb-28">
      {step === 0 && <><StepLabel n={1} label="Choose a Service" /><BookingScreen backTo="/dashboard/patient">
        <ScreenTitle title="Book Home Care" sub="Professional care and support in the comfort of your home." />
        {priceError && <p role="alert" className="text-sm text-destructive">{priceError}</p>}
        {!priceError && services.length === 0 && <p className="text-sm text-muted-foreground">No priced home care services are currently available.</p>}
        {services.map((service) => <ServiceRow key={service.name} icon={HeartHandshake} title={service.name} sub={`R${(service.hourlyRateCents / 100).toFixed(2)} per hour`} selected={serviceType === service.name} onClick={() => { setServiceType(service.name); setStep(1); }} />)}
      </BookingScreen></>}

      {step === 1 && <><StepLabel n={2} label="Tell Us What You Need" /><BookingScreen onBack={() => setStep(0)}>
        <ScreenTitle title="Service Details" />
        <img src={homecareImg} alt={`${serviceType} at home`} className="h-44 w-full rounded-2xl object-cover" />
        <p className="mt-3 text-sm font-semibold text-emerald-950">{serviceType}</p>
        <p className="mt-1 text-sm text-slate-600">{SERVICES.find((x) => x.title === serviceType)?.description}. Compassionate, professional support arranged by the HealthReachCare care team.</p>
        <p className="mt-4 text-sm font-bold text-emerald-950">Service includes</p>
        <ul className="mt-2 space-y-2">{(INCLUDES[serviceType] ?? []).map((item) => <li key={item} className="flex items-center gap-2 text-sm text-slate-700"><Check className="h-4 w-4 text-emerald-600" />{item}</li>)}</ul>
        <p className="mt-4 text-sm font-semibold text-emerald-900">{hourlyRateCents !== undefined ? `R${(hourlyRateCents / 100).toFixed(2)} per hour · Pay upfront to confirm` : "Price unavailable — choose an available service"}</p>
        <Button type="button" className="mt-4 h-12 w-full rounded-xl bg-emerald-700 text-base hover:bg-emerald-800" onClick={() => setStep(2)}>Continue</Button>
      </BookingScreen></>}

      {step === 2 && <><StepLabel n={3} label="Review & Pay" /><BookingScreen onBack={() => setStep(1)}>
        <ScreenTitle title="Your Requirements" />
        <div className="space-y-3 text-sm">
          <label className="block font-semibold text-emerald-950">Preferred Date
            <input type="date" min={localDateKey(new Date())} value={dateKey} onChange={(e) => setDateKey(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 font-normal" /></label>
          <label className="block font-semibold text-emerald-950">Preferred Time
            <select value={time} onChange={(e) => setTime(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-normal"><option value="">Select time</option>{TIME_SLOTS.map((t) => <option key={t.value} value={t.value}>{t.value}</option>)}</select></label>
          <label className="block font-semibold text-emerald-950">Duration
            <select value={hours} onChange={(e) => setHours(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-normal">{[1, 2, 3, 4, 6, 8, 12, 24].map((n) => <option key={n} value={n}>{n} {n === 1 ? "hour" : "hours"}</option>)}</select></label>
          <label className="block font-semibold text-emerald-950">Who is the care for?
            <select value={careFor} onChange={(e) => setCareFor(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-normal">{["Myself", "My parent", "My child", "My partner", "Another loved one"].map((w) => <option key={w}>{w}</option>)}</select></label>
          <div className="font-semibold text-emerald-950">Your Address
            {locationMode === "home" && homeAddress
              ? <div className="mt-1 flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-700"><span className="min-w-0 truncate">{homeAddress}</span><button type="button" onClick={() => setLocationMode("different")} className="shrink-0 text-xs font-semibold text-emerald-700">Change</button></div>
              : <input value={address?.address ?? ""} onChange={(e) => { setLocationMode("different"); setAddress({ address: e.target.value, lat: null, lng: null }); }} placeholder="Street, suburb, city" className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 font-normal" />}
          </div>
          <label className="block font-semibold text-emerald-950">Care Needs
            <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={5000} rows={3} className="mt-1 rounded-xl border-0 bg-emerald-50 font-normal" placeholder="E.g. My mother needs help with bathing and light meal preparation." /></label>
          <label className="block font-semibold text-emerald-950">Additional Needs <span className="font-normal text-slate-500">(Optional)</span>
            <Textarea value={specialRequirements} onChange={(e) => setSpecialRequirements(e.target.value)} maxLength={1500} rows={2} className="mt-1 rounded-xl border-0 bg-emerald-50 font-normal" placeholder="Please bring any necessary equipment." /></label>
        </div>
        <p className="mt-4 flex justify-between font-semibold text-primary"><span>Total for {hours} hours</span><span>{totalCents !== null ? `R${(totalCents / 100).toFixed(2)}` : "Unavailable"}</span></p>
        <Button type="button" disabled={saving || totalCents === null} className="mt-4 h-12 w-full rounded-xl bg-emerald-700 text-base hover:bg-emerald-800" onClick={() => { if (!dateKey || !time || new Date(preferredAt).getTime() <= Date.now()) { toast.error("Choose a date and time in the future."); return; } if (!visitAddress.trim()) { toast.error("Add the address for the care visit."); return; } if (!instructions.trim()) { toast.error("Please describe the care you need."); return; } void submit(); }}>{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Preparing payment…</> : "Continue to payment"}</Button>
      </BookingScreen></>}

      {step === 4 && <><StepLabel n={4} label={bookingConfirmed ? "Service Confirmed" : "Secure Payment"} /><BookingScreen onBack={() => setStep(0)}>
        <div className="pt-4 text-center">
          {bookingConfirmed ? <CheckCircle2 className="mx-auto h-14 w-14 text-primary" /> : <ShieldCheck className="mx-auto h-14 w-14 text-primary" />}
          <h1 className="mt-3 text-xl font-bold">{bookingConfirmed ? "Your service is confirmed" : "Pay for your care visit"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{serviceType}</p>
          <p className="mt-1 text-sm text-muted-foreground">{dateKey} · {time} · {hours} hours</p>
          <p className="mt-2 break-words text-sm">{visitAddress}</p>
          <p className="mt-3 text-xl font-bold text-primary">{totalCents !== null ? `R${(totalCents / 100).toFixed(2)}` : ""}</p>
          <p className="mt-2 break-all font-mono text-xs">{referenceNumber}</p>
        </div>
        {paymentTarget && <MarketplacePayment kind="homecare" targetId={paymentTarget} onPaid={() => {
          void load();
          void firestoreClient.from("homecare_requests").select("status, payment_verified_at").eq("id", paymentTarget).eq("patient_id", user?.id).maybeSingle().then(result => {
            if (result.data?.status === "scheduled" && result.data.payment_verified_at) setBookingConfirmed(true);
            else toast.info("Payment recorded. Support must resolve your visit availability before service confirmation.");
          });
        }} />}
        <Button type="button" variant="outline" className="mt-4 w-full" onClick={() => { setStep(0); setServiceType(""); setDateKey(""); setTime(""); }}>Book another service</Button>
      </BookingScreen></>}

      <div className="space-y-3">
        <div><h2 className="text-lg font-semibold text-emerald-950">My active requests</h2><p className="text-sm text-muted-foreground">Track payments, confirmed visits and care updates here.</p></div>
        {loading && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
        {!loading && requests.length === 0 && <div className="rounded-2xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">You have no homecare requests yet. Use the guided form above to tell us what support you need.</div>}
        {!loading && requests.length > 0 && activeRequests.length === 0 && <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">There are no active requests right now.</p>}
        {visibleRequests.filter((r) => !completedRequests.includes(r)).map((r) => {
          const assignment = latestAssignment(r);
          return (
            <div key={r.id} className="mx-auto max-w-md space-y-3 rounded-[2rem] border border-emerald-100 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{r.service_type}</p>
                  <p className="text-xs text-muted-foreground">{r.address}</p>
                  {r.preferred_at && <p className="text-xs text-muted-foreground">Preferred: {new Date(r.preferred_at).toLocaleString()}</p>}
                </div>
                <Badge variant={r.status === "confirmed" || r.status === "completed" ? "default" : "secondary"}>{REQUEST_LABEL[r.status] ?? r.status}</Badge>
              </div>
              {(r.total_amount != null || r.quote_amount != null) && (
                <div className="space-y-3">
                  <p className="text-lg font-bold text-emerald-950">Service summary</p>
                  <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-3"><ShieldCheck className="h-6 w-6 text-emerald-700" /><div><p className="text-sm font-semibold text-emerald-950">HealthReachCare Support</p><p className="text-xs text-slate-600">Home care booking</p></div></div>
                  <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
                    <dt className="text-slate-500">Service</dt><dd className="font-medium text-emerald-950">{r.service_type}</dd>
                    <dt className="text-slate-500">Date</dt><dd className="font-medium text-emerald-950">{r.preferred_at ? new Date(r.preferred_at).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Johannesburg" }) : "To be confirmed"}</dd>
                    <dt className="text-slate-500">Time</dt><dd className="font-medium text-emerald-950">{r.preferred_at ? new Date(r.preferred_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" }) : "To be confirmed"}</dd>
                    <dt className="text-slate-500">Caregiver</dt><dd className="font-medium text-emerald-950">{r.homecare_providers?.business_name || r.homecare_providers?.full_name || "Caregiver reserved for payment"}</dd>
                  </dl>
                  {r.quote_details && <p className="text-xs text-slate-600">{r.quote_details}</p>}
                  <div className="flex items-center justify-between border-t border-slate-100 pt-3"><span className="font-bold text-emerald-950">Total Price</span><span className="text-xl font-bold text-emerald-950">{r.quote_currency === "ZAR" || !r.quote_currency ? "R" : `${r.quote_currency} `}{Number(r.total_amount ?? r.quote_amount).toFixed(2)}</span></div>
                  <Button type="button" variant="outline" className="h-10 w-full rounded-xl" onClick={() => setSelectedRequest(r)}>View Full Details</Button>
                </div>
              )}
              {["awaiting_payment", "quote_pending"].includes(r.status) && (
                <div className="space-y-2">
                  <MarketplacePayment kind="homecare" targetId={r.id} reference={r.payment_reference} paid={r.payment_status === "paid"} onPaid={() => { setSelectedRequest(null); void load(); }} />
                  {r.pricing_mode !== "upfront" && <Button variant="outline" disabled={respondingTo === r.id || !!r.payment_reference} onClick={() => answerQuote(r.id, "decline")}>Decline legacy quote</Button>}
                </div>
              )}
              {["quote_accepted", "assigned"].includes(r.status) && <ServiceProgress status={assignment?.status ?? r.status} />}
              {r.payment_status === "paid" && <MarketplacePayment kind="homecare" targetId={r.id} reference={r.payment_reference} paid onPaid={() => void load()} />}
              {r.status === "scheduled" && <p className="text-sm font-semibold text-primary">Payment verified — service confirmed</p>}
              {r.status === "payment_review" && <p className="text-sm text-destructive">Payment recorded — contact support to resolve visit availability before service confirmation.</p>}
              {r.status === "quote_accepted" && (
                <p className="text-xs text-muted-foreground">Your quotation payment is confirmed. The coordinator will confirm provider availability and the visit schedule separately.</p>
              )}
              {r.status === "quote_declined" && <p className="text-xs text-muted-foreground">You declined this quote. Contact the coordinator if you would like to discuss another option.</p>}
              {r.status === "assigned" && (
                <div className="rounded-lg border p-3 text-sm">
                  <p className="font-semibold">Coordination recorded</p>
                  {r.homecare_providers && (
                    <p>Provider: {r.homecare_providers.business_name || r.homecare_providers.full_name || "Approved home care provider"}</p>
                  )}
                  {assignment?.scheduled_at && <p>Agreed visit: {new Date(assignment.scheduled_at).toLocaleString()}</p>}
                  {assignment && <p className="text-xs text-muted-foreground">Visit status: {assignment.status}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">Payment status: {r.payment_status === "paid" ? "Confirmed" : "Not verified"}</p>
                </div>
              )}
              {assignment?.provider_id && ["assigned", "completed", "confirmed"].includes(r.status) && (
                <LockFavourite uid={user?.id} type="caregiver" providerId={assignment.provider_id} providerName={r.homecare_providers?.business_name || r.homecare_providers?.full_name || "this caregiver"} />
              )}
              {assignment && ["accepted", "scheduled", "in_progress"].includes(assignment.status) && (
                <HomecareServiceChat
                  assignmentId={assignment.id}
                  assignmentStatus={assignment.status}
                  counterpart={r.homecare_providers?.business_name || r.homecare_providers?.full_name || "your home care provider"}
                />
              )}
            </div>
          );
        })}
      </div>
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Completed services</h2>
          <p className="text-sm text-muted-foreground">Your completed home care history stays available here.</p>
        </div>
        {!loading && completedRequests.length === 0 && <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">Completed services will appear here.</p>}
        {visibleRequests.filter((r) => completedRequests.includes(r)).map((request) => {
          const assignment = latestAssignment(request);
          return (
            <article key={request.id} className="space-y-3 rounded-2xl border border-border/60 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{request.service_type}</p>
                  <p className="text-xs text-muted-foreground">{request.address}</p>
                  {assignment?.completed_at && <p className="text-xs text-muted-foreground">Completed: {new Date(assignment.completed_at).toLocaleString()}</p>}
                </div>
                <Badge variant="default">Completed</Badge>
              </div>
              {assignment && (
                <HomecareServiceChat
                  assignmentId={assignment.id}
                  assignmentStatus={assignment.status}
                  counterpart={request.homecare_providers?.business_name || request.homecare_providers?.full_name || "your home care provider"}
                />
              )}
              {assignment && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={reordering === request.id}
                  onClick={() => void reorder(request, assignment.id)}
                >
                  {reordering === request.id ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Reordering…</> : "Request this care again"}
                </Button>
              )}
            </article>
          );
        })}
      </section>
      <Dialog open={!!selectedRequest} onOpenChange={(open) => { if (!open) setSelectedRequest(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>Request details</DialogTitle></DialogHeader>
          {selectedRequest && <RequestDetails request={selectedRequest} onPaid={() => { setSelectedRequest(null); void load(); }} />}
        </DialogContent>
      </Dialog>
    </main>
  );
}

function ServiceProgress({ status }: { status: string }) {
  const steps = [["accepted", "Payment verified"], ["scheduled", "Caregiver assigned & scheduled"], ["in_progress", "Service in progress"], ["completed", "Service completed"]] as const;
  const order = ["quote_accepted", "assigned", "accepted", "scheduled", "in_progress", "completed"];
  const reached = (key: string) => order.indexOf(status) >= order.indexOf(key === "accepted" ? "quote_accepted" : key);
  return <div className="rounded-2xl bg-emerald-50 p-4">
    <p className="flex items-center gap-2 font-bold text-emerald-950"><CheckCircle2 className="h-5 w-5 text-emerald-600" />Care Progress</p>
    {steps.map(([key, label]) => <p key={key} className={`mt-2.5 flex items-center gap-2 text-sm ${reached(key) ? "font-semibold text-emerald-950" : "text-slate-400"}`}><span className={`flex h-5 w-5 items-center justify-center rounded-full ${reached(key) ? "bg-emerald-600" : "bg-slate-200"}`}><Check className="h-3 w-3 text-white" /></span>{label}</p>)}
  </div>;
}

function ReviewRow({ title, value, onChange }: { title: string; value: string; onChange: () => void }) {
  return <div className="flex items-start justify-between gap-4 p-4">
    <div className="min-w-0"><p className="text-xs font-medium text-muted-foreground">{title}</p><p className="mt-1 whitespace-pre-wrap text-sm font-medium text-slate-900">{value}</p></div>
    <button type="button" onClick={onChange} className="shrink-0 text-sm font-semibold text-emerald-700 hover:underline">Change</button>
  </div>;
}

function RequestCard({ request, onDetails }: { request: HomecareRequest; onDetails: () => void }) {
  const assignment = request.homecare_assignments?.slice().sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return <article className="rounded-2xl border border-border bg-white p-4 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h3 className="font-semibold text-slate-900">{request.service_type}</h3><p className="mt-1 font-mono text-xs text-muted-foreground">{referenceFor(request)}</p></div>
      <Badge className={statusColor(request.status)}>{statusLabel(request.status)}</Badge>
    </div>
    <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
      <p className="flex items-center gap-2"><Clock3 className="h-4 w-4 shrink-0" />{request.preferred_at ? new Date(request.preferred_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" }) : "Schedule to be confirmed"}</p>
      <p className="flex items-center gap-2"><MapPin className="h-4 w-4 shrink-0" /><span className="truncate">{request.address}</span></p>
      {assignment?.scheduled_at && <p className="flex items-center gap-2 sm:col-span-2"><CalendarDays className="h-4 w-4 shrink-0" />Confirmed visit: {new Date(assignment.scheduled_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" })}</p>}
    </div>
    <div className="mt-4 flex justify-end border-t border-border pt-3">
      <Button type="button" variant="outline" size="sm" onClick={onDetails}>View Details <ChevronRight className="ml-1 h-4 w-4" /></Button>
    </div>
  </article>;
}

function RequestDetails({ request, onPaid }: {
  request: HomecareRequest;
  onPaid: () => void;
}) {
  const requestRef = referenceFor(request);
  const providerName = request.homecare_providers?.business_name || request.homecare_providers?.full_name;
  const canRespond = ["quote_pending", "awaiting_payment"].includes(request.status);
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><p className="font-semibold text-slate-900">{request.service_type}</p><p className="font-mono text-xs text-muted-foreground">{requestRef}</p></div>
      <Badge className={statusColor(request.status)}>{statusLabel(request.status)}</Badge>
    </div>
    <div className="space-y-2 rounded-xl border border-border p-4 text-sm">
      <p><strong>Location:</strong> {request.address}</p>
      <p><strong>Preferred visit:</strong> {request.preferred_at ? new Date(request.preferred_at).toLocaleString("en-ZA", { dateStyle: "full", timeStyle: "short", timeZone: "Africa/Johannesburg" }) : "To be confirmed"}</p>
      {request.description && <p className="whitespace-pre-wrap"><strong>Special instructions:</strong> {request.description}</p>}
    </div>
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline"><a
        href={`https://wa.me/27797285078?text=${encodeURIComponent(`Hi HealthReachCare, I would like to discuss homecare request ${requestRef}.`)}`}
        target="_blank"
        rel="noreferrer"
      ><MessageCircle className="mr-2 h-4 w-4" />WhatsApp support</a></Button>
      <Button asChild variant="outline"><a
        href={`mailto:support@healthreachcare.co.za?subject=${encodeURIComponent(`Homecare request ${requestRef}`)}`}
      ><Mail className="mr-2 h-4 w-4" />Email support</a></Button>
    </div>

    {(request.total_amount != null || request.quote_amount != null) ? (
      <>
        <section className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800"><HeartHandshake className="h-6 w-6" /></div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-slate-900">{providerName || "HealthReachCare Verified Caregiver"}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{providerName ? "Assigned homecare provider" : "Care coordination via support@healthreachcare.co.za"}</p>
              <div className="mt-2 flex flex-wrap gap-2"><Badge className="bg-emerald-100 text-emerald-800"><BadgeCheck className="mr-1 h-3 w-3" />Verified coordination</Badge></div>
            </div>
          </div>
          <div className="rounded-xl bg-white p-4">
            <p className="text-xs text-muted-foreground">Service total</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{request.quote_currency === "ZAR" || !request.quote_currency ? "R" : `${request.quote_currency} `}{Number(request.total_amount ?? request.quote_amount).toFixed(2)} <span className="text-sm font-medium text-muted-foreground">per visit</span></p>
            {request.quote_details && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{request.quote_details}</p>}
            {request.quote_issued_at && <p className="mt-2 text-xs text-muted-foreground">Legacy quotation issued {new Date(request.quote_issued_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}</p>}
          </div>
        </section>
        {canRespond && <MarketplacePayment kind="homecare" targetId={request.id} reference={request.payment_reference} onPaid={onPaid} />}
        {request.status === "quote_accepted" && <p className="text-sm text-emerald-800">Quotation accepted after payment verification. The coordinator will confirm the visit.</p>}
      </>
    ) : (
      <div className="rounded-xl border border-dashed border-border bg-slate-50 p-4 text-sm text-muted-foreground">
        No payable service price is saved on this older request. Choose a service with an upfront price to book.
      </div>
    )}
  </div>;
}
