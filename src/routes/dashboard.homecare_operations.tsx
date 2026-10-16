import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { RoleGuard } from "@/components/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, HomeIcon } from "lucide-react";
import { toast } from "sonner";
import { firestoreClient } from "@/lib/firestore-client";
import {
  adminAssignHomecare,
  issueHomecareQuote,
  listHomecareOperationsRequests,
  listHomecareProvidersForOperations,
} from "@/lib/homecare.functions";
import { REQUEST_LABEL } from "@/lib/homecare";

interface RequestRow {
  id: string;
  patient_id: string;
  service_type: string;
  description: string | null;
  address: string;
  preferred_at: string | null;
  duration_hours: number | null;
  status: string;
  quote_amount: number | null;
  quote_currency: string | null;
  quote_details: string | null;
  created_at: string;
}

interface ProviderRow {
  id: string;
  business_name: string | null;
  full_name: string | null;
  services: string[] | null;
  service_areas: string[] | null;
}

export const Route = createFileRoute("/dashboard/homecare_operations")({
  head: () => ({ meta: [{ title: "Home Care Operations — HealthReachCare" }] }),
  component: () => <RoleGuard allow="homecare_operations"><HomecareOperationsPage /></RoleGuard>,
});

function HomecareOperationsPage() {
  const listRequests = useServerFn(listHomecareOperationsRequests);
  const listProviders = useServerFn(listHomecareProvidersForOperations);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const result = await listRequests();
      setRequests(result.requests as RequestRow[]);
      const providerResult = await listProviders();
      setProviders(providerResult.providers as ProviderRow[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load home care requests.");
    } finally {
      setLoading(false);
    }
  }, [listProviders, listRequests]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const channel = firestoreClient.channel("homecare-operations-requests")
      .on("postgres_changes", { event: "*", schema: "public", table: "homecare_requests" }, () => void load())
      .subscribe();
    return () => { void firestoreClient.removeChannel(channel); };
  }, [load]);

  const awaitingQuote = requests.filter((request) => request.status === "pending_review");
  const awaitingPatient = requests.filter((request) => request.status === "quote_pending");
  const accepted = requests.filter((request) => request.status === "quote_accepted");
  const other = requests.filter((request) => !["pending_review", "quote_pending", "quote_accepted"].includes(request.status));

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <main className="container-narrow px-4 sm:px-6 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2"><HomeIcon className="h-6 w-6 text-primary" /> Home care coordination</h1>
        <p className="text-sm text-muted-foreground">
          Review patient requests and issue only confirmed, case-specific quotes. No provider, coverage or price is promised until verified.
        </p>
      </header>

      <RequestSection title="Needs review and quote" requests={awaitingQuote} providers={providers} onChanged={load} />
      <RequestSection title="Awaiting patient response" requests={awaitingPatient} providers={providers} onChanged={load} />
      <RequestSection title="Quote accepted — coordinate provider and scheduling" requests={accepted} providers={providers} onChanged={load} />
      {other.length > 0 && <RequestSection title="Other request states" requests={other} providers={providers} onChanged={load} />}
    </main>
  );
}

function RequestSection({ title, requests, providers, onChanged }: {
  title: string;
  requests: RequestRow[];
  providers: ProviderRow[];
  onChanged: () => void;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title} <span className="text-sm font-normal text-muted-foreground">({requests.length})</span></h2>
      {requests.length === 0 && <p className="text-sm text-muted-foreground">No requests in this queue.</p>}
      {requests.map((request) => <RequestCard key={request.id} request={request} providers={providers} onChanged={onChanged} />)}
    </section>
  );
}

function RequestCard({ request, providers, onChanged }: {
  request: RequestRow;
  providers: ProviderRow[];
  onChanged: () => void;
}) {
  const issueQuote = useServerFn(issueHomecareQuote);
  const assignProvider = useServerFn(adminAssignHomecare);
  const [amount, setAmount] = useState(request.quote_amount == null ? "" : String(request.quote_amount));
  const [details, setDetails] = useState(request.quote_details ?? "");
  const [providerId, setProviderId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);

  const submitQuote = async () => {
    const parsedAmount = Number(amount);
    if (!amount.trim() || !Number.isFinite(parsedAmount) || parsedAmount < 0) {
      toast.error("Enter a valid quote amount.");
      return;
    }
    setSaving(true);
    try {
      await issueQuote({ data: { requestId: request.id, amount: parsedAmount, details: details.trim() } });
      toast.success("Quote sent to the patient for approval.");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not issue the quote.");
    } finally {
      setSaving(false);
    }
  };

  const coordinateVisit = async () => {
    if (!providerId) {
      toast.error("Choose an approved provider after confirming the service is in their coverage area.");
      return;
    }
    setSaving(true);
    try {
      await assignProvider({
        data: {
          requestId: request.id,
          providerId,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        },
      });
      toast.success("Provider coordination recorded.");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not coordinate the visit.");
    } finally {
      setSaving(false);
    }
  };

  const selectedProvider = providers.find((provider) => provider.id === providerId);

  return (
    <article className="healthcare-card p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{request.service_type}</p>
          <p className="text-xs text-muted-foreground">Request {request.id} · Patient {request.patient_id}</p>
          <p className="text-sm mt-1">{request.address}</p>
          {request.preferred_at && <p className="text-xs text-muted-foreground">Preferred: {new Date(request.preferred_at).toLocaleString()}</p>}
          {request.duration_hours != null && <p className="text-xs text-muted-foreground">Requested duration: {request.duration_hours} hours</p>}
        </div>
        <Badge variant="secondary">{REQUEST_LABEL[request.status] ?? request.status}</Badge>
      </div>
      {request.description && <p className="text-sm whitespace-pre-wrap">{request.description}</p>}

      {request.status === "pending_review" && (
        <div className="space-y-3 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            Confirm service feasibility, coverage, scope and the full price before sending. Issuing a quote does not charge the patient.
          </p>
          <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
            <div className="space-y-1">
              <Label htmlFor={`amount-${request.id}`}>Quote amount (ZAR)</Label>
              <Input id={`amount-${request.id}`} type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`details-${request.id}`}>Scope, conditions and next steps</Label>
              <Textarea id={`details-${request.id}`} maxLength={2000} value={details} onChange={(event) => setDetails(event.target.value)} />
            </div>
          </div>
          <Button onClick={submitQuote} disabled={saving || details.trim().length < 3}>
            {saving ? "Sending…" : "Send quote for patient approval"}
          </Button>
        </div>
      )}
      {request.quote_amount != null && request.status !== "pending_review" && (
        <div className="rounded-lg border p-3 text-sm">
          <p className="font-semibold">Quote: {request.quote_currency ?? "ZAR"} {Number(request.quote_amount).toFixed(2)}</p>
          {request.quote_details && <p className="mt-1 whitespace-pre-wrap">{request.quote_details}</p>}
        </div>
      )}
      {request.status === "quote_accepted" && (
        <div className="space-y-3 border-t pt-3">
          <p className="text-xs text-muted-foreground">The patient accepted the quote. Confirm service scope, provider coverage and availability before recording coordination. This does not process payment.</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-1">
              <Label>Approved provider</Label>
              <Select value={providerId} onValueChange={setProviderId}>
                <SelectTrigger><SelectValue placeholder="Select after verifying coverage" /></SelectTrigger>
                <SelectContent>
                  {providers.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.business_name || provider.full_name || "Home care provider"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Agreed visit time (optional)</Label>
              <Input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
            </div>
            <Button onClick={coordinateVisit} disabled={saving || providers.length === 0}>
              {saving ? "Saving…" : "Record coordination"}
            </Button>
          </div>
          {selectedProvider && (
            <p className="text-xs text-muted-foreground">
              On file — services: {selectedProvider.services?.length ? selectedProvider.services.join(", ") : "No services recorded"};
              {" "}service areas: {selectedProvider.service_areas?.length ? selectedProvider.service_areas.join(", ") : "No coverage areas recorded"}.
              {" "}Verify this request is within the provider&apos;s current coverage before coordinating.
            </p>
          )}
          {providers.length === 0 && <p className="text-xs text-muted-foreground">No approved, active providers are currently available to the coordinator.</p>}
        </div>
      )}
    </article>
  );
}
