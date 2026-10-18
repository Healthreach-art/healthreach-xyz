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
  ShieldCheck, Stethoscope, UsersRound, Bell,
} from "lucide-react";
import { PATIENT_ADDRESS_CHANGED, readPatientAddress, type PatientAddress } from "@/lib/patient-address";
import { useServerFn } from "@tanstack/react-start";
import { reorderCompletedHomecare, respondToHomecareQuote, submitHomecareRequest } from "@/lib/homecare.functions";
import { HomecareServiceChat } from "@/components/HomecareServiceChat";
import { PatientNotificationBell } from "@/components/PatientNotificationBell";
import logoUrl from "@/assets/healthreach-logo.png";

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
  const reorderRequest = useServerFn(reorderCompletedHomecare);
  const [requests, setRequests] = useState<HomecareRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [serviceType, setServiceType] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dateKey, setDateKey] = useState("");
  const [time, setTime] = useState("");
  const [locationMode, setLocationMode] = useState<"home" | "different">("home");
  const [address, setAddress] = useState<PickedAddress | null>(null);
  const [savedAddress, setSavedAddress] = useState("");
  const [visitAddress, setVisitAddress] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<HomecareRequest | null>(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<RequestTab>("All");
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [reordering, setReordering] = useState<string | null>(null);

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
      setVisitAddress((current) => current || value?.address || profile?.address || "");
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

  const reorder = async (request: HomecareRequest, assignmentId: string) => {
    setReordering(request.id);
    try {
      await reorderRequest({ data: { requestId: request.id, assignmentId } });
      toast.success("A new request was created from your completed service.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reorder this service.");
    } finally {
      setReordering(null);
    }
  };

  const latestAssignment = (request: HomecareRequest) => (request.homecare_assignments ?? [])
    .slice()
    .sort((first, second) => second.created_at.localeCompare(first.created_at))[0];
  const completedRequests = requests.filter((request) => {
    const status = latestAssignment(request)?.status ?? request.status;
    return status === "completed" || status === "confirmed";
  });
  const activeRequests = requests.filter((request) => !completedRequests.includes(request));

  const homeAddress = savedAddress || profile?.address || "";\n  const description = instructions;\n  const preferredAt = dateKey && time ? `${dateKey}T${time}:00+02:00` : "";\n  const hours = "";\n\n  const validateStep = (current: number) => {
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
    <main className="container-narrow space-y-8 px-4 py-6 pb-28 sm:px-6 sm:py-8">
      <header className="flex items-center justify-between border-b border-border/60 pb-4">
        <Link to="/dashboard/patient" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link>
      </header>

      {step === 4 && (
        <section className="mx-auto max-w-2xl space-y-6 rounded-3xl border border-emerald-100 bg-white p-6 text-center shadow-sm sm:p-10">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100"><CheckCircle2 className="h-11 w-11 text-emerald-700" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Request Submitted!</h1>
            <p className="mx-auto mt-2 max-w-lg text-sm text-slate-600">Your homecare request has been sent to our verified providers. You&apos;ll be notified once you receive a quotation.</p>
          </div>
        </section>
      )}

      <div className="space-y-3">
        <div><h2 className="text-lg font-semibold text-slate-900">My active requests</h2><p className="text-sm text-muted-foreground">Track quotations and care coordination updates here.</p></div>
        {loading && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
        {!loading && requests.length === 0 && <div className="rounded-2xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">You have no homecare requests yet. Use the guided form above to tell us what support you need.</div>}
        {!loading && requests.length > 0 && activeRequests.length === 0 && <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">There are no active requests right now.</p>}
        {activeRequests.map((r) => {
          const assignment = latestAssignment(r);
          return (
            <div key={r.id} className="space-y-3 rounded-2xl border border-border/60 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{r.service_type}</p>
                  <p className="text-xs text-muted-foreground">{r.address}</p>
                  {r.preferred_at && <p className="text-xs text-muted-foreground">Preferred: {new Date(r.preferred_at).toLocaleString()}</p>}
                </div>
                <Badge variant={r.status === "confirmed" || r.status === "completed" ? "default" : "secondary"}>{REQUEST_LABEL[r.status] ?? r.status}</Badge>
              </div>
              {r.quote_amount != null && (
                <div className="space-y-1 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-sm">
                  <p className="font-semibold text-slate-900">Quotation: {r.quote_currency === "ZAR" || !r.quote_currency ? "R" : `${r.quote_currency} `}{Number(r.quote_amount).toFixed(2)}</p>
                  {r.quote_details && <p>{r.quote_details}</p>}
                  {r.quote_issued_at && <p className="text-xs text-muted-foreground">Issued {new Date(r.quote_issued_at).toLocaleString()}</p>}
                </div>
              )}
              {r.status === "quote_pending" && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-700" disabled={respondingTo === r.id} onClick={() => answerQuote(r.id, "accept")}>
                    Accept Quotation
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-lg" disabled={respondingTo === r.id} onClick={() => answerQuote(r.id, "decline")}>
                    Decline Quotation
                  </Button>
                </div>
              )}
              {r.status === "quote_accepted" && (
                <p className="text-xs text-muted-foreground">Your quote is accepted. The coordinator will confirm availability and scheduling separately. No payment has been taken.</p>
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
                  <p className="mt-1 text-xs text-muted-foreground">Payment is not collected through this quote workflow.</p>
                </div>
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
        {completedRequests.map((request) => {
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
