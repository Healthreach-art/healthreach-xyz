import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useAuth } from "@/hooks/useAuth";
import { firestoreClient } from "@/lib/firestore-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AddressPicker, type PickedAddress } from "@/components/AddressPicker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowLeft, BadgeCheck, CalendarDays, Check, CheckCircle2, ChevronRight,
  Clock3, Copy, HeartHandshake, HeartPulse, Loader2, Mail, MapPin, MessageCircle,
  ShieldCheck, Stethoscope, UsersRound,
} from "lucide-react";
import { PATIENT_ADDRESS_CHANGED, readPatientAddress, type PatientAddress } from "@/lib/patient-address";
import { useServerFn } from "@tanstack/react-start";
import { respondToHomecareQuote, submitHomecareRequest } from "@/lib/homecare.functions";

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
  homecare_assignments: Array<{ id: string; created_at: string; status: string; scheduled_at: string | null }>;
  homecare_providers: { business_name: string | null; full_name: string | null } | null;
}

const SERVICES = [
  { title: "Personal Care", description: "Assistance with daily living activities and personal hygiene", icon: HeartHandshake },
  { title: "Nursing Care", description: "Professional nursing support at home", icon: Stethoscope },
  { title: "Companionship", description: "Emotional support and companionship for a better quality of life", icon: UsersRound },
  { title: "Specialised Care", description: "Care for chronic conditions, post-surgery recovery and more", icon: HeartPulse },
] as const;

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
      { name: "description", content: "Request trusted homecare services and track quotations from HealthReachCare." },
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
  if (status === "pending_review" || status === "quote_pending") return "Pending Quotes";
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
  const [requests, setRequests] = useState<HomecareRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [serviceType, setServiceType] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dateKey, setDateKey] = useState("");
  const [time, setTime] = useState("");
  const [locationMode, setLocationMode] = useState<"home" | "different">("home");
  const [address, setAddress] = useState<PickedAddress | null>(null);
  const [savedAddress, setSavedAddress] = useState("");
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [tab, setTab] = useState<RequestTab>("All");
  const [selectedRequest, setSelectedRequest] = useState<HomecareRequest | null>(null);
  const [addressPickerOpen, setAddressPickerOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const homeAddress = savedAddress || profile?.address || "";
  const visitAddress = locationMode === "home" ? homeAddress : address?.address ?? "";
  const dates = useMemo(() => Array.from({ length: 4 }, (_, offset) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return {
      key: localDateKey(date),
      label: offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : new Intl.DateTimeFormat("en-ZA", {
        weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Johannesburg",
      }).format(date),
    };
  }), []);

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
          serviceType,
          description: instructions.trim(),
          address: visitAddress.trim(),
          latitude: locationMode === "different" ? address?.lat ?? null : address?.address === homeAddress ? address.lat : null,
          longitude: locationMode === "different" ? address?.lng ?? null : address?.address === homeAddress ? address.lng : null,
          preferredAt: preferredAt.toISOString(),
          durationHours: null,
        },
      });
      setReferenceNumber(result.referenceNumber);
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

  const resetWizard = () => {
    setServiceType("");
    setInstructions("");
    setDateKey("");
    setTime("");
    setLocationMode("home");
    setStep(0);
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
    <main className="container-narrow space-y-8 px-4 py-6 pb-28 sm:px-6 sm:py-8">
      <header className="flex items-center justify-between border-b border-border/60 pb-4">
        <Link to="/dashboard/patient" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link>
      </header>

      {step === 4 ? (
        <section className="mx-auto max-w-2xl space-y-6 rounded-3xl border border-emerald-100 bg-white p-6 text-center shadow-sm sm:p-10">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100"><CheckCircle2 className="h-11 w-11 text-emerald-700" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Request Submitted!</h1>
            <p className="mx-auto mt-2 max-w-lg text-sm text-slate-600">Your homecare request has been sent to our verified providers. You&apos;ll be notified once you receive a quotation.</p>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-left">
            <div><p className="text-xs font-medium text-emerald-800">Your request reference</p><p className="mt-1 font-mono text-lg font-bold text-emerald-950">{referenceNumber}</p></div>
            <Button type="button" variant="outline" size="sm" onClick={() => void copyReference()} aria-label="Copy request reference">
              {copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}{copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <div className="rounded-2xl bg-slate-50 p-5 text-left">
            <h2 className="font-semibold text-slate-900">What happens next?</h2>
            <ol className="mt-3 space-y-3 text-sm text-slate-700">
              {["Providers will review your request", "You'll receive quotations (usually within 1-2 hours)", "Choose the best provider for your needs"].map((item, index) => (
                <li key={item} className="flex items-start gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">{index + 1}</span>{item}</li>
              ))}
            </ol>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button onClick={() => { resetWizard(); document.getElementById("my-homecare-requests")?.scrollIntoView({ behavior: "smooth" }); }} className="bg-emerald-700 text-white hover:bg-emerald-800">View My Requests</Button>
            <Button asChild variant="outline"><Link to="/dashboard/patient">Back to Home</Link></Button>
          </div>
        </section>
      ) : step === 0 ? (
        <>
          <section className="rounded-3xl bg-gradient-to-br from-emerald-800 via-emerald-700 to-teal-700 px-6 py-8 text-white sm:px-9">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">Personalized support at home</p>
            <h1 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight">Compassionate homecare, when you need it most.</h1>
            <p className="mt-3 max-w-2xl text-sm text-emerald-50">Get professional, trusted homecare services for yourself or your loved ones.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {["Trained Caregivers", "Verified Providers", "Safe & Secure"].map((badge) => <span key={badge} className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-medium"><ShieldCheck className="h-3.5 w-3.5" />{badge}</span>)}
            </div>
          </section>

          <section className="space-y-4">
            <div><h2 className="text-xl font-bold text-slate-900">Our Homecare Services</h2><p className="mt-1 text-sm text-muted-foreground">Choose a service to begin a request.</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              {SERVICES.map(({ title, description, icon: Icon }) => (
                <button key={title} type="button" onClick={() => { setServiceType(title); setStep(1); }}
                  className="flex items-start gap-4 rounded-2xl border border-border bg-white p-4 text-left transition hover:border-emerald-300 hover:shadow-sm">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Icon className="h-5 w-5" /></span>
                  <span><span className="block font-semibold text-slate-900">{title}</span><span className="mt-1 block text-sm text-muted-foreground">{description}</span></span>
                </button>
              ))}
            </div>
            <Button onClick={() => { resetWizard(); setStep(1); }} className="h-12 w-full rounded-xl bg-emerald-700 text-base text-white hover:bg-emerald-800 sm:w-auto sm:px-8">
              Request Homecare <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </section>
        </>
      ) : null}

      {step > 0 && step < 4 && (
        <section className="overflow-hidden rounded-3xl border border-border/70 bg-white shadow-sm">
          <div className="border-b border-border/60 px-5 py-4 sm:px-6">
            <div className="flex items-center justify-between gap-4">
              <div><h2 className="font-semibold text-slate-900">Homecare request</h2><p className="text-xs text-muted-foreground">Complete the steps to request care.</p></div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setStep(0)}>Close</Button>
            </div>
            <ol className="mt-4 grid grid-cols-3 gap-2" aria-label="Homecare request steps">
              {["Service & Details", "Location & Schedule", "Review & Confirm"].map((label, index) => {
                const number = index + 1;
                return <li key={label}><button type="button" onClick={() => number < step && setStep(number)} aria-current={step === number ? "step" : undefined}
                  className={`flex w-full items-center gap-2 text-left text-xs font-medium ${number <= step ? "text-emerald-800" : "text-muted-foreground"}`}>
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${number <= step ? "border-emerald-600 bg-emerald-600 text-white" : "border-border"}`}>{number}</span>
                  <span className="hidden sm:inline">{label}</span>
                </button></li>;
              })}
            </ol>
          </div>

          <div className="space-y-6 p-5 sm:p-6">
            {step === 1 && (
              <section className="space-y-4">
                <div><h2 className="text-lg font-bold text-slate-900">Choose a service</h2><p className="mt-1 text-sm text-muted-foreground">Select the type of care you need.</p></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {SERVICES.map(({ title, description, icon: Icon }) => {
                    const active = serviceType === title;
                    return <button key={title} type="button" aria-pressed={active} onClick={() => setServiceType(title)}
                      className={`relative flex min-h-28 items-start gap-3 rounded-2xl border p-4 text-left transition ${active ? "border-emerald-600 bg-emerald-50 ring-2 ring-emerald-600" : "border-border hover:border-emerald-300"}`}>
                      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${active ? "text-emerald-700" : "text-slate-500"}`} />
                      <span><span className="block font-semibold text-slate-900">{title}</span><span className="mt-1 block text-sm text-muted-foreground">{description}</span></span>
                      {active && <CheckCircle2 className="absolute right-3 top-3 h-5 w-5 text-emerald-700" />}
                    </button>;
                  })}
                </div>
              </section>
            )}

            {step === 2 && (
              <section className="space-y-6">
                <div><h2 className="text-lg font-bold text-slate-900">Location & Schedule</h2><p className="mt-1 text-sm text-muted-foreground">Where and when would you like care?</p></div>
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900">Service Location</h3>
                  <div className="rounded-2xl border border-border p-4">
                    <div className="flex items-start gap-3">
                      <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-muted-foreground">{locationMode === "home" ? "Home address" : "Different service address"}</p>
                        <p className="mt-1 text-sm font-medium text-slate-900">{visitAddress || "No saved home address"}</p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={() => { setLocationMode("home"); setAddressPickerOpen(true); }}>Change</Button>
                    </div>
                    <button type="button" aria-pressed={locationMode === "different"} onClick={() => { setLocationMode("different"); setAddressPickerOpen(true); }}
                      className={`mt-3 w-full rounded-xl border px-3 py-2 text-left text-sm ${locationMode === "different" ? "border-emerald-500 bg-emerald-50 text-emerald-900" : "border-dashed border-border text-muted-foreground"}`}>
                      {locationMode === "different" ? "Using a different location" : "Use a different location"}
                    </button>
                    {addressPickerOpen && (
                      <div className="mt-3 space-y-2">
                        <AddressPicker value={address} onChange={(picked) => { setAddress(picked); setSavedAddress(picked.address); setLocationMode("different"); }} placeholder="Search an address or use current location" />
                        <Button type="button" variant="ghost" size="sm" onClick={() => setAddressPickerOpen(false)}>Done</Button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><CalendarDays className="h-4 w-4 text-emerald-700" /> Preferred Schedule</h3>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {dates.map((date) => <button key={date.key} type="button" aria-pressed={dateKey === date.key} onClick={() => setDateKey(date.key)}
                      className={`shrink-0 rounded-xl border px-4 py-2.5 text-sm font-medium ${dateKey === date.key ? "border-emerald-700 bg-emerald-700 text-white" : "border-border hover:border-emerald-300"}`}>{date.label}</button>)}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {TIME_SLOTS.map((slot) => <button key={slot.value} type="button" aria-pressed={time === slot.value} onClick={() => setTime(slot.value)}
                      className={`rounded-xl border px-3 py-2.5 text-sm font-medium ${time === slot.value ? "border-emerald-700 bg-emerald-700 text-white" : "border-border hover:border-emerald-300"}`}>{slot.label}</button>)}
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="homecare-instructions" className="text-sm font-semibold text-slate-900">Special Instructions <span className="font-normal text-muted-foreground">(optional)</span></label>
                  <Textarea id="homecare-instructions" value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={4} maxLength={5000} placeholder="Share any specific care requirements or helpful information." />
                </div>
              </section>
            )}

            {step === 3 && (
              <section className="space-y-4">
                <div><h2 className="text-lg font-bold text-slate-900">Review & Confirm</h2><p className="mt-1 text-sm text-muted-foreground">Check your request details before submitting.</p></div>
                <div className="divide-y rounded-2xl border border-border">
                  <ReviewRow title="Service Type" value={serviceType} onChange={() => setStep(1)} />
                  <ReviewRow title="Location" value={visitAddress} onChange={() => { setStep(2); setAddressPickerOpen(true); }} />
                  <ReviewRow title="Preferred Date & Time" value={dateKey && time ? `${new Date(`${dateKey}T12:00:00+02:00`).toLocaleDateString("en-ZA", { dateStyle: "full", timeZone: "Africa/Johannesburg" })} · ${TIME_SLOTS.find((slot) => slot.value === time)?.label}` : "Not selected"} onChange={() => setStep(2)} />
                  <ReviewRow title="Special Instructions" value={instructions.trim() || "None"} onChange={() => setStep(2)} />
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
                  A coordinator will review your request and send a quotation. No payment is taken until you review and accept a quotation.
                </div>
              </section>
            )}

            <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-4">
              <Button type="button" variant="outline" onClick={() => setStep((current) => Math.max(current - 1, 1))} disabled={step === 1 || saving}>Back</Button>
              {step < 3
                ? <Button type="button" onClick={() => {
                  if (step === 1 && !serviceType) return toast.error("Choose a homecare service.");
                  if (step === 2) {
                    if (!visitAddress.trim()) return toast.error("Choose or add a service address.");
                    if (!dateKey || !time) return toast.error("Choose a preferred date and time.");
                    if (new Date(`${dateKey}T${time}:00+02:00`).getTime() <= Date.now()) return toast.error("Choose a date and time in the future.");
                  }
                  setStep((current) => current + 1);
                }} className="bg-emerald-700 text-white hover:bg-emerald-800">Next <ChevronRight className="ml-1 h-4 w-4" /></Button>
                : <Button type="button" onClick={() => void submit()} disabled={saving} className="bg-emerald-700 text-white hover:bg-emerald-800">{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</> : "Submit Request"}</Button>}
            </div>
          </div>
        </section>
      )}

      {(step === 0 || step === 4) && (
        <section id="my-homecare-requests" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="text-xl font-bold text-slate-900">My Homecare Requests</h2><p className="mt-1 text-sm text-muted-foreground">Track requests, quotations, and care coordination updates.</p></div>
            {step === 0 && <Button onClick={() => { resetWizard(); setStep(1); }} className="bg-emerald-700 text-white hover:bg-emerald-800">New Request</Button>}
          </div>
          <div role="tablist" aria-label="Filter homecare requests" className="grid grid-cols-4 rounded-xl bg-muted p-1">
            {REQUEST_TABS.map((value) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}
              className={`rounded-lg px-2 py-2 text-xs font-medium sm:text-sm ${tab === value ? "bg-white text-emerald-900 shadow-sm" : "text-muted-foreground"}`}>{value}</button>)}
          </div>
          {loading && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
          {!loading && visibleRequests.length === 0 && <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No {tab.toLowerCase()} homecare requests.</div>}
          <div className="space-y-3">
            {visibleRequests.map((request) => <RequestCard key={request.id} request={request} onDetails={() => setSelectedRequest(request)} />)}
          </div>
        </section>
      )}

      <Dialog open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>Homecare request details</DialogTitle></DialogHeader>
          {selectedRequest && <RequestDetails request={selectedRequest} busy={respondingTo === selectedRequest.id}
            onQuoteResponse={(response) => void answerQuote(selectedRequest.id, response)} />}
        </DialogContent>
      </Dialog>
    </main>
  );
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

function RequestDetails({ request, busy, onQuoteResponse }: {
  request: HomecareRequest;
  busy: boolean;
  onQuoteResponse: (response: "accept" | "decline") => void;
}) {
  const requestRef = referenceFor(request);
  const providerName = request.homecare_providers?.business_name || request.homecare_providers?.full_name;
  const canRespond = request.status === "quote_pending" && request.quote_amount != null;
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

    {request.quote_amount != null ? (
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
            <p className="text-xs text-muted-foreground">Visit quotation</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{request.quote_currency === "ZAR" || !request.quote_currency ? "R" : `${request.quote_currency} `}{Number(request.quote_amount).toFixed(2)} <span className="text-sm font-medium text-muted-foreground">per visit</span></p>
            {request.quote_details && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{request.quote_details}</p>}
            {request.quote_issued_at && <p className="mt-2 text-xs text-muted-foreground">Quotation issued {new Date(request.quote_issued_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}</p>}
          </div>
        </section>
        {canRespond && <div>
          <Button type="button" disabled={busy} onClick={() => onQuoteResponse("accept")} className="bg-emerald-700 text-white hover:bg-emerald-800">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Accept Quotation</Button>
        </div>}
        {request.status === "quote_accepted" && <p className="text-sm text-emerald-800">Quotation accepted. The care coordinator will confirm the next steps with you.</p>}
      </>
    ) : (
      <div className="rounded-xl border border-dashed border-border bg-slate-50 p-4 text-sm text-muted-foreground">
        Your request is with the HealthReachCare homecare coordination team. The verified team will share the visit quotation here when it is ready.
      </div>
    )}
  </div>;
}
