import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useAuth } from "@/hooks/useAuth";
import { firestoreClient } from "@/lib/firestore-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AddressPicker, type PickedAddress } from "@/components/AddressPicker";
import { toast } from "sonner";
import { ArrowLeft, Activity, Baby, Bandage, Heart, HeartHandshake, HeartPulse, HomeIcon, Loader2, ShieldPlus, Stethoscope, UsersRound } from "lucide-react";
import { REQUEST_LABEL } from "@/lib/homecare";
import { HOMECARE_SERVICES } from "@/lib/homecare";
import { PATIENT_ADDRESS_CHANGED, readPatientAddress, type PatientAddress } from "@/lib/patient-address";
import { useServerFn } from "@tanstack/react-start";
import { respondToHomecareQuote, submitHomecareRequest } from "@/lib/homecare.functions";

interface HomecareRequest {
  id: string;
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

export const Route = createFileRoute("/dashboard/patient/homecare")({
  head: () => ({
    meta: [
      { title: "Home Care Requests — HealthReachCare" },
      { name: "description", content: "Request a home care visit and follow its progress from review to completion." },
      { property: "og:title", content: "Home Care Requests — HealthReachCare" },
      { property: "og:description", content: "Request a home care visit and follow its progress." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <RoleGuard allow="patient"><PatientHomecarePage /></RoleGuard>,
});

function PatientHomecarePage() {
  const { user, profile } = useAuth();
  const createRequest = useServerFn(submitHomecareRequest);
  const respondToQuote = useServerFn(respondToHomecareQuote);
  const [requests, setRequests] = useState<HomecareRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [serviceType, setServiceType] = useState("");
  const [description, setDescription] = useState("");
  const [preferredAt, setPreferredAt] = useState("");
  const [hours, setHours] = useState("");
  const [address, setAddress] = useState<PickedAddress | null>(null);
  const [savedAddress, setSavedAddress] = useState("");
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data, error } = await firestoreClient
      .from("homecare_requests")
      .select("*, homecare_assignments(id, created_at, status, scheduled_at), homecare_providers(business_name, full_name)")
      .eq("patient_id", user.id).order("created_at", { ascending: false });
    if (error) {
      toast.error(`Could not load your home care requests: ${error.message}`);
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
      setSavedAddress(value?.address ?? "");
      setAddress(value?.address && value.lat != null && value.lng != null
        ? { address: value.address, lat: value.lat, lng: value.lng }
        : null);
    };
    applyAddress(readPatientAddress(user.id) ?? (profile?.address ? { address: profile.address, lat: null, lng: null } : null));
    const onChange = (event: Event) => applyAddress((event as CustomEvent<PatientAddress>).detail);
    window.addEventListener(PATIENT_ADDRESS_CHANGED, onChange);
    return () => window.removeEventListener(PATIENT_ADDRESS_CHANGED, onChange);
  }, [user?.id, profile?.address]);

  useEffect(() => {
    if (!user?.id) return;
    const ch = firestoreClient.channel(`hc-patient-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "homecare_requests", filter: `patient_id=eq.${user.id}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "homecare_assignments" }, () => void load())
      .subscribe();
    return () => { firestoreClient.removeChannel(ch); };
  }, [user?.id, load]);

  const submit = async () => {
    if (!user) { toast.error("Please sign in to request home care."); return; }
    if (!serviceType.trim()) { toast.error("Describe the type of care you need."); return; }
    const visitAddress = address?.address || savedAddress.trim() || profile?.address?.trim();
    if (!visitAddress) { toast.error("Please give the address for the visit"); return; }
    setSaving(true);
    try {
      await createRequest({
        data: {
          serviceType: serviceType.trim(),
          description: description.trim(),
          address: visitAddress,
          latitude: address?.lat ?? null,
          longitude: address?.lng ?? null,
          preferredAt: preferredAt ? new Date(preferredAt).toISOString() : null,
          durationHours: hours ? Number(hours) : null,
        },
      });
      setServiceType("");
      setDescription("");
      setPreferredAt("");
      setHours("");
      setStep(1);
      toast.success("Request sent to the HealthReachCare home care coordinator.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send your request.");
    } finally {
      setSaving(false);
    }
  };

  const answerQuote = async (requestId: string, response: "accept" | "decline") => {
    setRespondingTo(requestId);
    try {
      await respondToQuote({ data: { requestId, response } });
      toast.success(response === "accept" ? "Quote accepted. The coordinator will confirm next steps." : "Quote declined.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit your response.");
    } finally {
      setRespondingTo(null);
    }
  };

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

  const nextStep = () => {
    if (validateStep(step)) setStep((current) => Math.min(current + 1, 4));
  };

  return (
    <>
    <main className="container-narrow space-y-7 px-4 py-7 sm:px-6 sm:py-8">
      <header className="flex justify-end border-b border-border/60 pb-5">
        <Link to="/dashboard/patient" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 h-4 w-4" /> Dashboard</Link>
      </header>
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Personalized support at home</p>
        <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold tracking-tight text-slate-900"><HomeIcon className="h-7 w-7 text-emerald-600" /> Request Homecare</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">Tell us what support you need. A HealthReachCare coordinator will review your request and prepare a personalized quotation before any service is agreed.</p>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border/60 bg-white shadow-sm">
        <div className="border-b border-border/60 px-5 py-4 sm:px-6">
          <ol className="grid grid-cols-4 gap-2">
            {["Care service", "Requirements", "Location", "Review"].map((label, index) => {
              const number = index + 1;
              return <li key={label}><button type="button" onClick={() => number < step && setStep(number)} aria-current={step === number ? "step" : undefined}
                className={`flex w-full items-center gap-2 text-left text-xs font-medium ${step === number ? "text-emerald-700" : number < step ? "text-emerald-700" : "text-muted-foreground"}`}>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs ${number <= step ? "border-emerald-600 bg-emerald-600 text-white" : "border-border bg-white"}`}>{number}</span>
                <span className="hidden sm:inline">{label}</span>
              </button></li>;
            })}
          </ol>
        </div>
        <div className="space-y-5 p-5 sm:p-6">
          {step === 1 && <>
            <div><h2 className="text-lg font-semibold text-slate-900">What kind of care do you need?</h2><p className="mt-1 text-sm text-muted-foreground">Select a service to get started.</p></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {HOMECARE_SERVICES.map((service, index) => {
                const icons = [UsersRound, HeartPulse, Bandage, Activity, ShieldPlus, Heart, Baby, HeartHandshake, Stethoscope, Heart];
                const Icon = icons[index] ?? HomeIcon;
                const selected = serviceType === service;
                return <button key={service} type="button" aria-pressed={selected} onClick={() => setServiceType(service)}
                  className={`flex min-h-24 items-start gap-3 rounded-xl border p-4 text-left transition ${selected ? "border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600" : "border-border/70 hover:border-emerald-300 hover:bg-slate-50/50"}`}>
                  <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${selected ? "text-emerald-700" : "text-slate-500"}`} />
                  <span className="text-sm font-semibold text-slate-900">{service}</span>
                </button>;
              })}
            </div>
            <div className="space-y-2"><Label htmlFor="other-service">Something else?</Label><Input id="other-service" value={HOMECARE_SERVICES.includes(serviceType as typeof HOMECARE_SERVICES[number]) ? "" : serviceType} onChange={(event) => setServiceType(event.target.value)} maxLength={120} placeholder="Describe another type of care" /></div>
          </>}

          {step === 2 && <>
            <div><h2 className="text-lg font-semibold text-slate-900">Care requirements & schedule</h2><p className="mt-1 text-sm text-muted-foreground">The more you share, the better the coordinator can match your needs.</p></div>
            <div className="space-y-2"><Label htmlFor="desc">Describe the care needed</Label><Textarea id="desc" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} rows={5} placeholder="Include the type of support, mobility needs, medication assistance, or anything the care team should know." /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="preferred">Preferred date & time <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="preferred" type="datetime-local" min={new Date().toISOString().slice(0, 16)} value={preferredAt} onChange={(event) => setPreferredAt(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="hours">Estimated duration in hours <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="hours" type="number" min="1" max="24" step="1" value={hours} onChange={(event) => setHours(event.target.value)} placeholder="e.g. 2" /></div>
            </div>
          </>}

          {step === 3 && <>
            <div><h2 className="text-lg font-semibold text-slate-900">Where is care needed?</h2><p className="mt-1 text-sm text-muted-foreground">Choose or enter the verified address for the visit.</p></div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
              <p className="mb-2 text-sm font-semibold text-slate-900">Visit address</p>
              <AddressPicker value={address} onChange={(picked) => { setAddress(picked); setSavedAddress(picked.address); }} placeholder={savedAddress || profile?.address || "Search an address or use current location"} />
              {(address?.address || savedAddress || profile?.address) && <p className="mt-2 text-xs text-emerald-800">Selected: {address?.address || savedAddress || profile?.address}</p>}
            </div>
            <p className="text-xs text-muted-foreground">Your location is only shared with the coordinator and assigned provider as needed to arrange care.</p>
          </>}

          {step === 4 && <>
            <div><h2 className="text-lg font-semibold text-slate-900">Review your request</h2><p className="mt-1 text-sm text-muted-foreground">Check your details before sending them to our care coordinator.</p></div>
            <div className="space-y-3 rounded-xl border border-border/70 bg-slate-50/50 p-4 text-sm">
              <div><p className="text-xs text-muted-foreground">Care service</p><p className="font-semibold text-slate-900">{serviceType}</p></div>
              <div><p className="text-xs text-muted-foreground">Care requirements</p><p className="whitespace-pre-wrap text-slate-800">{description}</p></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><p className="text-xs text-muted-foreground">Preferred schedule</p><p>{preferredAt ? new Date(preferredAt).toLocaleString() : "Flexible — to be discussed"}</p></div>
                <div><p className="text-xs text-muted-foreground">Estimated duration</p><p>{hours ? `${hours} hour(s)` : "To be discussed"}</p></div>
              </div>
              <div><p className="text-xs text-muted-foreground">Visit address</p><p className="font-medium">{address?.address || savedAddress || profile?.address}</p></div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="font-semibold text-emerald-950">No upfront unverified charge</p>
              <p className="mt-1 text-sm text-emerald-900/80">HealthReachCare coordinators will review your needs and prepare a personalized quotation. You can review and accept or decline the quotation before any service is arranged. No payment is taken with this request.</p>
            </div>
          </>}

          <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-4">
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => setStep((current) => Math.max(current - 1, 1))} disabled={step === 1 || saving}>Back</Button>
            {step < 4
              ? <Button type="button" className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700" onClick={nextStep}>Continue</Button>
              : <Button className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700" onClick={submit} disabled={saving}>{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</> : "Send care request"}</Button>}
          </div>
        </div>
      </section>

      <div className="space-y-3">
        <div><h2 className="text-lg font-semibold text-slate-900">My active requests</h2><p className="text-sm text-muted-foreground">Track quotations and care coordination updates here.</p></div>
        {loading && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
        {!loading && requests.length === 0 && <div className="rounded-2xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">You have no homecare requests yet. Use the guided form above to tell us what support you need.</div>}
        {requests.map((r) => {
          const latestAssignment = (r.homecare_assignments ?? [])
            .slice()
            .sort((first, second) => second.created_at.localeCompare(first.created_at))[0];
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
                  {latestAssignment?.scheduled_at && <p>Agreed visit: {new Date(latestAssignment.scheduled_at).toLocaleString()}</p>}
                  {latestAssignment && <p className="text-xs text-muted-foreground">Visit status: {latestAssignment.status}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">Payment is not collected through this quote workflow.</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
    </>
  );
}
