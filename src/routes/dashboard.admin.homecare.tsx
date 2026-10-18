import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useServerFn } from "@tanstack/react-start";
import { firestoreClient } from "@/lib/firestore-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { HomeIcon, Loader2, ShieldCheck, ClipboardList, History } from "lucide-react";
import {
  adminListHomecare, adminReviewHomecare, adminAssignHomecare,
  adminReviewHomecareDocument, getHomecareDocumentUrl, grantHomecareOperationsRole,
  provisionHomecareProviderAccount,
} from "@/lib/homecare.functions";
import { APPROVAL_LABEL, ASSIGNMENT_LABEL, REQUEST_LABEL, docsFor } from "@/lib/homecare";

export const Route = createFileRoute("/dashboard/admin/homecare")({
  head: () => ({
    meta: [
      { title: "Home Care Control — HealthReachCare Admin" },
      { name: "description", content: "Review, approve and assign HealthReachCare home care companies and individual providers." },
      { property: "og:title", content: "Home Care Control — HealthReachCare Admin" },
      { property: "og:description", content: "Review, approve and assign home care providers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <RoleGuard allow="admin"><AdminHomecarePage /></RoleGuard>,
});

function AdminHomecarePage() {
  const grantOperationsRole = useServerFn(grantHomecareOperationsRole);
  const provisionProviderAccount = useServerFn(provisionHomecareProviderAccount);
  const [loading, setLoading] = useState(true);
  const [operationsUserId, setOperationsUserId] = useState("");
  const [providerUserId, setProviderUserId] = useState("");
  const [grantBusy, setGrantBusy] = useState(false);
  const [provisionBusy, setProvisionBusy] = useState(false);
  const [providers, setProviders] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await adminListHomecare();
      setProviders(res.providers); setDocuments(res.documents); setEvents(res.events); setStaff(res.staff);
      const { data: reqs } = await firestoreClient
        .from("homecare_requests").select("*, homecare_assignments(*)").order("created_at", { ascending: false });
      setRequests(reqs ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not load home care data");
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const ch = firestoreClient.channel("admin-homecare")
      .on("postgres_changes", { event: "*", schema: "public", table: "homecare_providers" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "homecare_requests" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "homecare_assignments" }, () => void load())
      .subscribe();
    return () => { firestoreClient.removeChannel(ch); };
  }, [load]);

  const pending = useMemo(() => providers.filter((p) => ["pending", "under_review"].includes(p.approval_status)), [providers]);
  const approved = useMemo(() => providers.filter((p) => p.approval_status === "approved"), [providers]);
  const others = useMemo(() => providers.filter((p) => ["rejected", "suspended", "expired"].includes(p.approval_status)), [providers]);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><HomeIcon className="h-6 w-6 text-primary" /> Home care control</h1>
        <p className="text-sm text-muted-foreground">Approve providers, review their documents, and assign customer visits.</p>
      </div>

      <section className="healthcare-card p-4 space-y-3">
        <div>
          <h2 className="font-semibold">Provision home care operations</h2>
          <p className="text-xs text-muted-foreground">
            Grant the dedicated operations role to an existing account by Firebase UID. The user must sign in again to load the role.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            value={operationsUserId}
            onChange={(event) => setOperationsUserId(event.target.value)}
            placeholder="Firebase user UID"
            className="max-w-md"
          />
          <Button
            disabled={grantBusy || !operationsUserId.trim()}
            onClick={async () => {
              setGrantBusy(true);
              try {
                const result = await grantOperationsRole({ data: { userId: operationsUserId.trim() } });
                toast.success(result.alreadyAssigned ? "This user already has the operations role." : "Home care operations role granted.");
                setOperationsUserId("");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not grant the operations role.");
              } finally {
                setGrantBusy(false);
              }
            }}
          >
            {grantBusy ? "Granting…" : "Grant role"}
          </Button>
        </div>
      </section>

      <section className="healthcare-card p-4 space-y-3">
        <div>
          <h2 className="font-semibold">Provision the dedicated Homecare Provider account</h2>
          <p className="text-xs text-muted-foreground">
            Enter the Firebase UID explicitly. The backend verifies the Auth account is the verified
            support@healthreachcare.co.za user, creates a pending provider application, and replaces
            non-admin roles with the provider role. It does not approve the provider or enable assignments.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            value={providerUserId}
            onChange={(event) => setProviderUserId(event.target.value)}
            placeholder="Firebase user UID"
            aria-label="Support account Firebase user UID"
            className="max-w-md"
          />
          <Button
            disabled={provisionBusy || !providerUserId.trim()}
            onClick={async () => {
              setProvisionBusy(true);
              try {
                await provisionProviderAccount({ data: { userId: providerUserId.trim() } });
                toast.success("Provider-only account provisioned. The user must sign in again and complete provider verification.");
                setProviderUserId("");
                await load();
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not provision the provider account.");
              } finally {
                setProvisionBusy(false);
              }
            }}
          >
            {provisionBusy ? "Provisioning…" : "Provision provider account"}
          </Button>
        </div>
      </section>

      <Tabs defaultValue="pending">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="pending">Pending review ({pending.length})</TabsTrigger>
          <TabsTrigger value="approved"><ShieldCheck className="h-4 w-4 mr-1" />Approved ({approved.length})</TabsTrigger>
          <TabsTrigger value="other">Rejected / suspended ({others.length})</TabsTrigger>
          <TabsTrigger value="requests"><ClipboardList className="h-4 w-4 mr-1" />Requests ({requests.length})</TabsTrigger>
          <TabsTrigger value="history"><History className="h-4 w-4 mr-1" />Approval history</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4 space-y-4">
          {pending.length === 0 && <Empty text="Nothing waiting for review." />}
          {pending.map((p) => <ProviderCard key={p.id} provider={p} documents={documents} staff={staff} events={events} onChanged={load} />)}
        </TabsContent>
        <TabsContent value="approved" className="mt-4 space-y-4">
          {approved.length === 0 && <Empty text="No approved providers yet." />}
          {approved.map((p) => <ProviderCard key={p.id} provider={p} documents={documents} staff={staff} events={events} onChanged={load} />)}
        </TabsContent>
        <TabsContent value="other" className="mt-4 space-y-4">
          {others.length === 0 && <Empty text="Nothing here." />}
          {others.map((p) => <ProviderCard key={p.id} provider={p} documents={documents} staff={staff} events={events} onChanged={load} />)}
        </TabsContent>
        <TabsContent value="requests" className="mt-4 space-y-4">
          {requests.length === 0 && <Empty text="No home care requests yet." />}
          {requests.map((r) => <RequestCard key={r.id} request={r} approved={approved} onChanged={load} />)}
        </TabsContent>
        <TabsContent value="history" className="mt-4 space-y-2">
          {events.length === 0 && <Empty text="No approval actions recorded yet." />}
          {events.map((e) => {
            const p = providers.find((x) => x.id === e.provider_id);
            return (
              <div key={e.id} className="healthcare-card p-3 text-sm">
                <p className="font-semibold">{p?.business_name || p?.full_name || "Provider"} — {e.action.replace("_", " ")}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(e.created_at).toLocaleString()} · by {e.admin_email ?? e.admin_id}
                </p>
                {e.reason && <p className="mt-1">{e.reason}</p>}
                {Array.isArray(e.requested_documents) && e.requested_documents.length > 0 && (
                  <p className="mt-1 text-xs">Requested: {e.requested_documents.join(", ")}</p>
                )}
              </div>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="healthcare-card p-6 text-center text-sm text-muted-foreground">{text}</div>;
}

function ProviderCard({ provider, documents, staff, events, onChanged }:
  { provider: any; documents: any[]; staff: any[]; events: any[]; onChanged: () => void }) {
  const [reason, setReason] = useState("");
  const [wanted, setWanted] = useState<string[]>(Array.isArray(provider.requested_documents) ? provider.requested_documents : []);
  const [busy, setBusy] = useState(false);
  const myDocs = documents.filter((d) => d.provider_id === provider.id);
  const myStaff = staff.filter((s) => s.company_id === provider.id);
  const myEvents = events.filter((e) => e.provider_id === provider.id);
  const required = docsFor(provider.provider_type);

  const act = async (action: "approve" | "reject" | "request_documents" | "suspend" | "reactivate") => {
    setBusy(true);
    try {
      await adminReviewHomecare({ data: { providerId: provider.id, action, reason: reason || undefined, requestedDocuments: action === "request_documents" ? wanted : undefined } });
      toast.success("Done");
      onChanged();
    } catch (e: any) { toast.error(e?.message ?? "Action failed"); }
    setBusy(false);
  };

  const openDoc = async (id: string) => {
    try {
      const { url } = await getHomecareDocumentUrl({ data: { documentId: id } });
      window.open(url, "_blank", "noopener");
    } catch (e: any) { toast.error(e?.message ?? "Could not open document"); }
  };

  const reviewDoc = async (id: string, status: "approved" | "rejected") => {
    try {
      await adminReviewHomecareDocument({ data: { documentId: id, status } });
      onChanged();
    } catch (e: any) { toast.error(e?.message ?? "Could not update document"); }
  };

  return (
    <div className="healthcare-card p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold">{provider.business_name || provider.full_name || provider.email}</p>
          <p className="text-xs text-muted-foreground">
            {provider.provider_type === "individual" ? "Individual provider" : "Company"} · {provider.email}
            {provider.phone ? ` · ${provider.phone}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">{provider.address ?? "No address"}</p>
          <p className="text-xs text-muted-foreground">
            Map pin: {provider.latitude != null && provider.longitude != null
              ? `${Number(provider.latitude).toFixed(4)}, ${Number(provider.longitude).toFixed(4)}`
              : "missing — cannot be approved"}
          </p>
        </div>
        <Badge variant={provider.approval_status === "approved" ? "default" : provider.approval_status === "rejected" || provider.approval_status === "suspended" ? "destructive" : "secondary"}>
          {APPROVAL_LABEL[provider.approval_status] ?? provider.approval_status}
        </Badge>
      </div>

      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <p><span className="text-muted-foreground">Services:</span> {(provider.services ?? []).join(", ") || "—"}</p>
        <p><span className="text-muted-foreground">Areas:</span> {(provider.service_areas ?? []).join(", ") || "—"}</p>
        <p><span className="text-muted-foreground">Hours:</span> {provider.operating_hours || provider.availability || "—"}</p>
        <p><span className="text-muted-foreground">Rate:</span> {provider.hourly_rate ? `R${Number(provider.hourly_rate).toFixed(0)}/hr` : "—"}</p>
        {provider.registration_number && <p><span className="text-muted-foreground">Registration:</span> {provider.registration_number}</p>}
        {provider.bank_name && <p><span className="text-muted-foreground">Bank:</span> {provider.bank_name}</p>}
        {provider.provider_type !== "individual" && <p><span className="text-muted-foreground">Staff:</span> {myStaff.length}</p>}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">Documents</p>
        {required.map((r) => {
          const doc = myDocs.find((d) => d.doc_key === r.key);
          return (
            <div key={r.key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2 text-sm">
              <span>{r.label} — <span className="text-muted-foreground">{doc ? doc.status : "not uploaded"}</span></span>
              {doc && (
                <span className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openDoc(doc.id)}>View</Button>
                  <Button size="sm" variant="ghost" onClick={() => reviewDoc(doc.id, "approved")}>Accept</Button>
                  <Button size="sm" variant="ghost" onClick={() => reviewDoc(doc.id, "rejected")}>Reject</Button>
                </span>
              )}
              {!doc && (
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={wanted.includes(r.label)}
                    onChange={(e) => setWanted((w) => e.target.checked ? [...w, r.label] : w.filter((x) => x !== r.label))}
                  />
                  request
                </label>
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`reason-${provider.id}`}>Reason / note (used for reject, suspend and document requests)</Label>
        <Textarea id={`reason-${provider.id}`} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      </div>

      <div className="flex flex-wrap gap-2">
        {provider.approval_status !== "approved" && <Button size="sm" disabled={busy} onClick={() => act("approve")}>Approve</Button>}
        <Button size="sm" variant="outline" disabled={busy} onClick={() => act("request_documents")}>Request documents</Button>
        {provider.approval_status !== "rejected" && <Button size="sm" variant="destructive" disabled={busy} onClick={() => act("reject")}>Reject</Button>}
        {provider.approval_status === "approved" && <Button size="sm" variant="destructive" disabled={busy} onClick={() => act("suspend")}>Suspend</Button>}
        {["suspended", "rejected"].includes(provider.approval_status) && <Button size="sm" disabled={busy} onClick={() => act("reactivate")}>Reactivate</Button>}
      </div>

      {myEvents.length > 0 && (
        <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
          <p className="font-semibold">History</p>
          {myEvents.slice(0, 5).map((e) => (
            <p key={e.id} className="text-muted-foreground">
              {new Date(e.created_at).toLocaleString()} — {e.action.replace("_", " ")}{e.reason ? `: ${e.reason}` : ""}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function RequestCard({ request, approved, onChanged }: { request: any; approved: any[]; onChanged: () => void }) {
  const [providerId, setProviderId] = useState<string>("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [busy, setBusy] = useState(false);
  const latest = (request.homecare_assignments ?? []).slice().sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1))[0];

  const assign = async () => {
    if (!providerId) { toast.error("Choose a provider"); return; }
    setBusy(true);
    try {
      await adminAssignHomecare({ data: {
        requestId: request.id, providerId,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      } });
      toast.success("Provider assigned");
      onChanged();
    } catch (e: any) { toast.error(e?.message ?? "Could not assign"); }
    setBusy(false);
  };

  return (
    <div className="healthcare-card p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{request.service_type}</p>
          <p className="text-xs text-muted-foreground">{request.address}</p>
          {request.preferred_at && <p className="text-xs text-muted-foreground">Preferred: {new Date(request.preferred_at).toLocaleString()}</p>}
          {request.duration_hours && <p className="text-xs text-muted-foreground">{request.duration_hours} hours</p>}
        </div>
        <Badge variant={request.status === "confirmed" ? "default" : "secondary"}>{REQUEST_LABEL[request.status] ?? request.status}</Badge>
      </div>
      {request.description && <p className="text-sm">{request.description}</p>}
      {latest && <p className="text-xs text-muted-foreground">Visit status: {ASSIGNMENT_LABEL[latest.status] ?? latest.status}</p>}

      {request.status === "quote_accepted" && (
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
          <div className="space-y-1">
            <Label>Coordinate an approved provider</Label>
            <Select value={providerId} onValueChange={setProviderId}>
              <SelectTrigger><SelectValue placeholder="Choose after confirming coverage" /></SelectTrigger>
              <SelectContent>
                {approved.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.business_name || p.full_name || p.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Schedule</Label>
            <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </div>
          <Button onClick={assign} disabled={busy || !providerId}>Coordinate visit</Button>
        </div>
      )}
    </div>
  );
}
