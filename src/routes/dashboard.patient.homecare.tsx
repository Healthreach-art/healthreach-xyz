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
import { ArrowLeft,  HomeIcon, Loader2 } from "lucide-react";
import { REQUEST_LABEL } from "@/lib/homecare";
import { PatientAddressHeader } from "@/components/PatientAddressHeader";
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
    setRequests((data ?? []) as HomecareRequest[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!user?.id) return;
    const applyAddress = (value: PatientAddress | null) => {
      if (value?.lat != null && value.lng != null) setAddress({ address: value.address, lat: value.lat, lng: value.lng });
    };
    applyAddress(readPatientAddress(user.id));
    const onChange = (event: Event) => applyAddress((event as CustomEvent<PatientAddress>).detail);
    window.addEventListener(PATIENT_ADDRESS_CHANGED, onChange);
    return () => window.removeEventListener(PATIENT_ADDRESS_CHANGED, onChange);
  }, [user?.id]);

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
    const addr = address ?? (profile?.address ? { address: profile.address } as PickedAddress : null);
    if (!addr?.address) { toast.error("Please give the address for the visit"); return; }
    setSaving(true);
    try {
      await createRequest({
        data: {
          serviceType: serviceType.trim(),
          description: description.trim(),
          address: addr.address,
          latitude: addr.lat ?? null,
          longitude: addr.lng ?? null,
          preferredAt: preferredAt ? new Date(preferredAt).toISOString() : null,
          durationHours: hours ? Number(hours) : null,
        },
      });
      setServiceType("");
      setDescription("");
      setPreferredAt("");
      setHours("");
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

  return (
    <>
    <PatientAddressHeader />
    <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
      <Link to="/dashboard/patient" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to Dashboard
      </Link>
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><HomeIcon className="h-6 w-6 text-primary" /> Home care</h1>
        <p className="text-sm text-muted-foreground">Send a request to the HealthReachCare coordinator. Availability, coverage and pricing are confirmed with you before a service is agreed.</p>
      </div>

      <div className="healthcare-card p-5 space-y-4">
        <div>
          <p className="font-semibold text-sm">Request a home care service</p>
          <p className="text-xs text-muted-foreground mt-1">No service or price is confirmed until the coordinator has reviewed your request and you have accepted a quote.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="service-type">What kind of care do you need?</Label>
            <Input id="service-type" value={serviceType} onChange={(event) => setServiceType(event.target.value)} maxLength={120} placeholder="Describe the care needed" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="preferred">Preferred date & time</Label>
            <Input id="preferred" type="datetime-local" value={preferredAt} onChange={(e) => setPreferredAt(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hours">Hours needed</Label>
            <Input id="hours" type="number" min="1" max="24" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Visit address</Label>
          <AddressPicker value={address} onChange={setAddress} placeholder={profile?.address || "Start typing the street address…"} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="desc">What is needed?</Label>
          <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Tell us about the care needed, mobility, medication and anything the carer should know." />
        </div>
        <Button onClick={submit} disabled={saving}>{saving ? "Sending…" : "Send request"}</Button>
      </div>

      <div className="space-y-3">
        <p className="font-semibold text-sm">My requests</p>
        {loading && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
        {!loading && requests.length === 0 && <p className="text-sm text-muted-foreground">No requests yet.</p>}
        {requests.map((r) => {
          const latestAssignment = (r.homecare_assignments ?? [])
            .slice()
            .sort((first, second) => second.created_at.localeCompare(first.created_at))[0];
          return (
            <div key={r.id} className="healthcare-card p-4 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{r.service_type}</p>
                  <p className="text-xs text-muted-foreground">{r.address}</p>
                  {r.preferred_at && <p className="text-xs text-muted-foreground">Preferred: {new Date(r.preferred_at).toLocaleString()}</p>}
                </div>
                <Badge variant={r.status === "confirmed" ? "default" : "secondary"}>{REQUEST_LABEL[r.status] ?? r.status}</Badge>
              </div>
              {r.quote_amount != null && (
                <div className="rounded-xl border p-3 space-y-1 text-sm">
                  <p className="font-semibold">Coordinator's quote: {r.quote_currency ?? "ZAR"} {Number(r.quote_amount).toFixed(2)}</p>
                  {r.quote_details && <p>{r.quote_details}</p>}
                  {r.quote_issued_at && <p className="text-xs text-muted-foreground">Issued {new Date(r.quote_issued_at).toLocaleString()}</p>}
                </div>
              )}
              {r.status === "quote_pending" && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={respondingTo === r.id} onClick={() => answerQuote(r.id, "accept")}>
                    Accept quote
                  </Button>
                  <Button size="sm" variant="outline" disabled={respondingTo === r.id} onClick={() => answerQuote(r.id, "decline")}>
                    Decline quote
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
    </div>
    </>
  );
}
