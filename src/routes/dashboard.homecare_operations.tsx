import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { RoleGuard } from "@/components/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Bell,
  BriefcaseMedical,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock3,
  HomeIcon,
  Loader2,
  LogOut,
  MapPin,
  MessageSquareText,
  Settings2,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Trash2,
  UserCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { firestoreClient } from "@/lib/firestore-client";
import { useAuth } from "@/hooks/useAuth";
import {
  adminAssignHomecare,
  issueHomecareQuote,
  listHomecareOperationsRequests,
  listHomecareProvidersForOperations,
} from "@/lib/homecare.functions";
import {
  HOMECARE_SERVICES,
  REQUEST_LABEL,
  filterHomecareRequestsForCoordinator,
  getHomecareStatusSummary,
  isHomecareServicePriceValid,
} from "@/lib/homecare";
import { HomecareServiceChat } from "@/components/HomecareServiceChat";

interface RequestRow {
  id: string;
  patient_id: string;
  patient_name: string | null;
  patient_phone: string | null;
  patient_email: string | null;
  reference_number: string | null;
  service_type: string;
  description: string | null;
  address: string;
  preferred_at: string | null;
  duration_hours: number | null;
  status: string;
  quote_amount: number | null;
  quote_currency: string | null;
  quote_details: string | null;
  created_at: string | null;
}

interface ProviderRow {
  id: string;
  business_name: string | null;
  full_name: string | null;
  services: string[] | null;
  service_areas: string[] | null;
}

interface AssignmentRow {
  id: string;
  request_id: string | null;
  patient_id?: string | null;
  provider_id: string | null;
  status: string | null;
  created_at: string | null;
  scheduled_at: string | null;
}

interface ServiceCatalogEntry {
  id: string;
  name: string;
  description: string;
  price: number;
  active: boolean;
  created_at: string;
}

type CoordinatorView = "home" | "bookings" | "messages" | "account";
type BookingFilter =
  | "incoming"
  | "awaiting_patient"
  | "awaiting_coordinator"
  | "confirmed"
  | "active"
  | "completed"
  | "cancelled"
  | "past";

const STORAGE_KEY = "healthreach-homecare-services";
const DEFAULT_CATALOG: ServiceCatalogEntry[] = HOMECARE_SERVICES.map((service, index) => ({
  id: `service-${index + 1}`,
  name: service,
  description: "Homecare service available to patients through HealthReachCare.",
  price: 0,
  active: true,
  created_at: new Date().toISOString(),
}));

const BOOKING_FILTERS: Array<{ id: BookingFilter; label: string }> = [
  { id: "incoming", label: "Incoming" },
  { id: "awaiting_patient", label: "Awaiting patient" },
  { id: "awaiting_coordinator", label: "Awaiting coordinator" },
  { id: "confirmed", label: "Confirmed" },
  { id: "active", label: "Active" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
  { id: "past", label: "Past" },
];

function readServiceCatalog() {
  if (typeof window === "undefined") return DEFAULT_CATALOG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CATALOG;
    const parsed = JSON.parse(raw) as ServiceCatalogEntry[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_CATALOG;
    return parsed.map((entry) => ({
      id: String(entry.id ?? crypto.randomUUID()),
      name: String(entry.name ?? "Unnamed service").trim(),
      description: String(entry.description ?? ""),
      price: Number(entry.price) || 0,
      active: entry.active !== false,
      created_at: String(entry.created_at ?? new Date().toISOString()),
    })).filter((entry) => entry.name.length > 0);
  } catch {
    return DEFAULT_CATALOG;
  }
}

export const Route = createFileRoute("/dashboard/homecare_operations")({
  head: () => ({ meta: [{ title: "Home Care Operations — HealthReachCare" }] }),
  component: () => <RoleGuard allow="homecare_operations"><HomecareOperationsPage /></RoleGuard>,
});

function HomecareOperationsPage() {
  const { user, profile, signOut } = useAuth();
  const listRequests = useServerFn(listHomecareOperationsRequests);
  const listProviders = useServerFn(listHomecareProvidersForOperations);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<CoordinatorView>("home");
  const [bookingFilter, setBookingFilter] = useState<BookingFilter>("incoming");
  const [serviceCatalog, setServiceCatalog] = useState<ServiceCatalogEntry[]>(() => readServiceCatalog());
  const [serviceName, setServiceName] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [servicePrice, setServicePrice] = useState("0");
  const [serviceActive, setServiceActive] = useState(true);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    setProviderError(null);
    setLoading(true);
    try {
      const result = await listRequests();
      setRequests(result.requests as RequestRow[]);
      try {
        const providerResult = await listProviders();
        setProviders(providerResult.providers as ProviderRow[]);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not load approved homecare providers.";
        setProviderError(message);
        toast.error(message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load home care requests.";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [listProviders, listRequests]);

  const loadAssignments = useCallback(async () => {
    setAssignmentsError(null);
    setAssignmentsLoading(true);
    try {
      const { data, error } = await firestoreClient
        .from("homecare_assignments")
        .select("id, request_id, patient_id, provider_id, status, scheduled_at, created_at")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      setAssignments((data ?? []) as AssignmentRow[]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load home care conversations.";
      setAssignmentsError(message);
    } finally {
      setAssignmentsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadAssignments(); }, [loadAssignments]);

  useEffect(() => {
    const channel = firestoreClient.channel("homecare-operations-requests")
      .on("postgres_changes", { event: "*", schema: "public", table: "homecare_requests" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "homecare_assignments" }, () => void loadAssignments())
      .subscribe();
    return () => { void firestoreClient.removeChannel(channel); };
  }, [load, loadAssignments]);

  const persistCatalog = useCallback((nextCatalog: ServiceCatalogEntry[]) => {
    setServiceCatalog(nextCatalog);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextCatalog));
    }
  }, []);

  const saveService = useCallback(() => {
    const name = serviceName.trim();
    const description = serviceDescription.trim();
    const parsedPrice = Number(servicePrice);
    if (!name) {
      toast.error("Give the service a clear name before saving.");
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      toast.error("Enter a valid, non-negative service price.");
      return;
    }
    const nextCatalog = editingServiceId
      ? serviceCatalog.map((service) => service.id === editingServiceId ? {
          ...service,
          name,
          description,
          price: parsedPrice,
          active: serviceActive,
        } : service)
      : [
          ...serviceCatalog,
          {
            id: `service-${Date.now()}`,
            name,
            description,
            price: parsedPrice,
            active: serviceActive,
            created_at: new Date().toISOString(),
          },
        ];
    persistCatalog(nextCatalog);
    setServiceName("");
    setServiceDescription("");
    setServicePrice("0");
    setServiceActive(true);
    setEditingServiceId(null);
    toast.success(editingServiceId ? "Service updated." : "Service added to the coordinator catalogue.");
  }, [editingServiceId, persistCatalog, serviceActive, serviceCatalog, serviceDescription, serviceName, servicePrice]);

  const removeService = useCallback((serviceId: string) => {
    const service = serviceCatalog.find((entry) => entry.id === serviceId);
    if (!service) return;
    const hasBookingHistory = requests.some((request) => request.service_type === service.name && [
      "pending_review",
      "quote_pending",
      "quote_accepted",
      "assigned",
      "accepted",
      "scheduled",
      "in_progress",
      "confirmed",
    ].includes(request.status));
    if (hasBookingHistory) {
      const nextCatalog = serviceCatalog.map((entry) => entry.id === serviceId ? { ...entry, active: false } : entry);
      persistCatalog(nextCatalog);
      toast.info("The service was deactivated instead of removed so existing bookings remain preserved.");
      return;
    }
    persistCatalog(serviceCatalog.filter((entry) => entry.id !== serviceId));
    toast.success("Service removed from the coordinator catalogue.");
  }, [persistCatalog, requests, serviceCatalog]);

  const toggleService = useCallback((serviceId: string) => {
    const nextCatalog = serviceCatalog.map((entry) => entry.id === serviceId ? { ...entry, active: !entry.active } : entry);
    persistCatalog(nextCatalog);
    toast.success("Service availability updated.");
  }, [persistCatalog, serviceCatalog]);

  const editService = useCallback((service: ServiceCatalogEntry) => {
    setEditingServiceId(service.id);
    setServiceName(service.name);
    setServiceDescription(service.description);
    setServicePrice(String(service.price));
    setServiceActive(service.active);
  }, []);

  const activeStats = useMemo(() => getHomecareStatusSummary(requests), [requests]);
  const filteredRequests = useMemo(() => filterHomecareRequestsForCoordinator(requests, bookingFilter), [bookingFilter, requests]);
  const todayMessageThreads = assignments
    .map((assignment) => ({
      assignment,
      request: requests.find((request) => request.id === assignment.request_id),
    }))
    .filter((thread) => Boolean(thread.request))
    .slice(0, 6);

  const dashboardStats = useMemo(() => [
    { label: "New incoming", value: String(activeStats.incoming), tone: "text-emerald-700", icon: Sparkles },
    { label: "Awaiting patient", value: String(activeStats.awaitingPatient), tone: "text-amber-600", icon: Clock3 },
    { label: "Awaiting coordinator", value: String(activeStats.awaitingCoordinator), tone: "text-emerald-700", icon: Bell },
    { label: "Coordinated", value: String(activeStats.confirmed), tone: "text-emerald-700", icon: CheckCircle2 },
  ], [activeStats]);

  if (loading) return <div className="flex justify-center py-16" role="status" aria-label="Loading homecare requests"><Loader2 className="h-6 w-6 animate-spin text-emerald-700" /></div>;
  if (loadError) {
    return (
      <div className="min-h-[65vh] bg-emerald-50/30 px-4 py-10 sm:px-6">
        <section className="mx-auto max-w-2xl rounded-2xl border border-red-200 bg-white p-6 shadow-sm" role="alert">
          <h1 className="text-lg font-semibold text-slate-900">Homecare requests could not be loaded</h1>
          <p className="mt-2 text-sm text-slate-600">{loadError}</p>
          <Button variant="outline" className="mt-4" onClick={() => void load()}>Try again</Button>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-emerald-50/30">
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <nav aria-label="Coordinator dashboard" className="mb-6 grid grid-cols-2 gap-2 rounded-2xl border border-emerald-100 bg-white p-2 shadow-sm sm:grid-cols-4">
          {[
            { id: "home", label: "Home", icon: HomeIcon },
            { id: "bookings", label: "Bookings", icon: CalendarClock },
            { id: "messages", label: "Messages", icon: MessageSquareText },
            { id: "account", label: "Account", icon: Settings2 },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveView(id as CoordinatorView)}
              aria-current={activeView === id ? "page" : undefined}
              className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${activeView === id ? "bg-emerald-700 text-white shadow-sm" : "text-slate-600 hover:bg-emerald-50 hover:text-emerald-900"}`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
            ))}
        </nav>

        {activeView === "home" && (
          <div className="space-y-6">
            <section className="grid gap-4 md:grid-cols-4">
              {dashboardStats.map(({ label, value, tone, icon: Icon }) => (
                <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">{label}</span>
                    <Icon className={`h-5 w-5 ${tone}`} />
                  </div>
                  <div className="mt-3 text-3xl font-bold text-slate-900">{value}</div>
                </div>
              ))}
            </section>

            <section>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-slate-900">Incoming queue</h2>
                  <Badge variant="secondary">{activeStats.incoming} waiting</Badge>
                </div>
                <div className="space-y-4">
                  {requests.filter((request) => request.status === "pending_review").length === 0 ? (
                    <p className="text-sm text-slate-500">No incoming requests in the queue. New patient requests will appear here automatically.</p>
                  ) : (
                    requests.filter((request) => request.status === "pending_review").slice(0, 4).map((request) => (
                      <div key={request.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-medium text-slate-900">{request.service_type}</p>
                            <p className="text-xs text-slate-500">{request.patient_name || `Patient ${request.patient_id}`} · {request.reference_number || `Request ${request.id.slice(0, 8).toUpperCase()}`}</p>
                          </div>
                          <Badge variant="outline">{REQUEST_LABEL[request.status] ?? request.status}</Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-600">
                          <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {request.address}</span>
                          {request.preferred_at && <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> {new Date(request.preferred_at).toLocaleString()}</span>}
                        </div>
                        {request.description && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{request.description}</p>}
                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-xs text-slate-500">{request.duration_hours ? `${request.duration_hours}h` : "Flexible"}</span>
                          <Button size="sm" variant="outline" onClick={() => setActiveView("bookings")}>Review</Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </section>
          </div>
        )}

        {activeView === "bookings" && (
          <div className="space-y-6">
            {providerError && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
                <p>Approved providers could not be loaded: {providerError}</p>
                <Button variant="outline" size="sm" onClick={() => void load()}>Retry</Button>
              </div>
            )}
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {dashboardStats.map(({ label, value, tone, icon: Icon }) => (
                <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-500">{label}</p>
                    <Icon className={`h-5 w-5 ${tone}`} />
                  </div>
                  <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
                </div>
              ))}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {BOOKING_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setBookingFilter(filter.id)}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${bookingFilter === filter.id ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-900"}`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </section>

            <RequestSection title="Booking list" requests={filteredRequests} providers={providers} onChanged={load} />
          </div>
        )}

        {activeView === "messages" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">Patient conversations</h2>
              <Badge variant="outline">{assignmentsError ? "Unavailable" : `${todayMessageThreads.length} active threads`}</Badge>
            </div>
            {assignmentsError && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
                <p>{assignmentsError}</p>
                <Button variant="outline" size="sm" onClick={() => void loadAssignments()}>Retry</Button>
              </div>
            )}
            <div className="space-y-3">
              {assignmentsLoading ? (
                <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading conversations…</p>
              ) : assignmentsError ? null : todayMessageThreads.length === 0 ? (
                <p className="text-sm text-slate-500">No live service conversations are currently active. Once a request is assigned and accepted, messages will appear here.</p>
              ) : (
                todayMessageThreads.map(({ assignment, request }) => (
                  <div key={assignment.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium text-slate-900">{request?.service_type ?? "Homecare request"}</p>
                        <p className="text-sm text-slate-600">Patient {request?.patient_id ?? assignment.patient_id ?? "—"} · {request?.address ?? "Visit details queued"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{assignment.status ?? "active"}</Badge>
                        <HomecareServiceChat
                          assignmentId={assignment.id}
                          assignmentStatus={assignment.status ?? "accepted"}
                          counterpart={request?.service_type ?? "Patient"}
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeView === "account" && (
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-emerald-100 p-2 text-emerald-800"><UserCircle2 className="h-5 w-5" /></div>
                  <div>
                    <p className="text-sm text-slate-500">Coordinator account</p>
                    <h2 className="text-lg font-semibold text-slate-900">{profile?.full_name || user?.user_metadata?.full_name || "Operations access"}</h2>
                  </div>
                </div>
                <Button variant="outline" onClick={() => void signOut()} className="gap-2">
                  <LogOut className="h-4 w-4" /> Sign out
                </Button>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Access</p>
                  <p className="mt-2 flex items-center gap-2 text-sm font-medium text-slate-900"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Homecare operations</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Service area</p>
                  <p className="mt-2 text-sm font-medium text-slate-900">{profile?.organization_name || "Metro and regional coverage"}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Alerts</p>
                  <p className="mt-2 text-sm font-medium text-slate-900">{activeStats.incoming} requests pending review</p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-900">Manage services</h2>
                <Badge variant="secondary">{serviceCatalog.filter((service) => service.active).length} active</Badge>
              </div>
              <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-1">
                  <Label>Service name</Label>
                  <Input value={serviceName} onChange={(event) => setServiceName(event.target.value)} placeholder="Night care support" />
                </div>
                <div className="space-y-1">
                  <Label>Standard price (ZAR)</Label>
                  <Input type="number" min="0" step="0.01" value={servicePrice} onChange={(event) => setServicePrice(event.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select value={String(serviceActive)} onValueChange={(value) => setServiceActive(value === "true")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Active</SelectItem>
                      <SelectItem value="false">Inactive / hidden</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2 xl:col-span-3 space-y-1">
                  <Label>Notes</Label>
                  <Textarea value={serviceDescription} onChange={(event) => setServiceDescription(event.target.value)} placeholder="Service overview, availability and coverage notes" />
                </div>
                <div className="md:col-span-2 xl:col-span-3 flex justify-end">
                  <Button onClick={saveService} className="bg-emerald-700 text-white hover:bg-emerald-800">
                    {editingServiceId ? "Save service" : "Add service"}
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {serviceCatalog.map((service) => {
                  const liveBookings = requests.filter((request) => request.service_type === service.name && [
                    "pending_review",
                    "quote_pending",
                    "quote_accepted",
                    "assigned",
                    "accepted",
                    "scheduled",
                    "in_progress",
                    "confirmed",
                  ].includes(request.status));
                  const validPrice = isHomecareServicePriceValid(service.price);
                  return (
                    <div key={service.id} className={`rounded-xl border p-3 ${service.active ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-900">{service.name}</p>
                          <p className="text-xs text-slate-500">{service.description || "Standard service offering"}</p>
                        </div>
                        <Badge variant={service.active ? "secondary" : "outline"}>{service.active ? "Active" : "Inactive"}</Badge>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
                        <span>{validPrice ? `ZAR ${Number(service.price).toFixed(2)}` : "Price pending"}</span>
                        <span>{liveBookings.length} live records</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => editService(service)}>Edit</Button>
                        <Button variant="outline" size="sm" onClick={() => toggleService(service.id)}>{service.active ? "Deactivate" : "Activate"}</Button>
                        <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => removeService(service.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Organisation details</h2>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-emerald-700" /> Coordinated service desk</div>
                <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-emerald-700" /> Mon–Sun with after-hours triage</div>
                <div className="flex items-center gap-2"><Bell className="h-4 w-4 text-emerald-700" /> Automated request and quote alerts</div>
              </div>
            </section>
          </div>
        )}
      </main>

    </div>
  );
}

function whatsappNumber(phone: string | null) {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = `27${digits.slice(1)}`;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

function requestStatusClass(status: string) {
  if (["quote_accepted", "assigned", "accepted", "scheduled", "in_progress", "confirmed"].includes(status)) {
    return "bg-emerald-100 text-emerald-900";
  }
  if (["pending_review", "quote_pending"].includes(status)) {
    return "bg-amber-100 text-amber-900";
  }
  return "bg-slate-100 text-slate-700";
}

function RequestSection({ title, requests, providers, onChanged }: {
  title: string;
  requests: RequestRow[];
  providers: ProviderRow[];
  onChanged: () => void;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-900">{title} <span className="text-sm font-normal text-slate-500">({requests.length})</span></h2>
      {requests.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">No requests in this queue.</p>}
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
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold text-slate-900">{request.service_type}</p>
          <p className="text-xs text-slate-500">{request.patient_name || `Patient ${request.patient_id}`} · {request.reference_number || `Request ${request.id.slice(0, 8).toUpperCase()}`}</p>
          <p className="mt-1 text-sm text-slate-600">{request.address}</p>
          {request.created_at && <p className="mt-1 text-xs text-slate-500">Submitted: {new Date(request.created_at).toLocaleString()}</p>}
          {request.patient_phone && <p className="mt-1 text-xs text-slate-500">Patient phone: {request.patient_phone}</p>}
          {request.preferred_at && <p className="mt-1 text-xs text-slate-500">Preferred: {new Date(request.preferred_at).toLocaleString()}</p>}
          {request.duration_hours != null && <p className="text-xs text-slate-500">Requested duration: {request.duration_hours} hours</p>}
        </div>
        <Badge variant="secondary" className={requestStatusClass(request.status)}>{REQUEST_LABEL[request.status] ?? request.status}</Badge>
      </div>
      {request.description && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{request.description}</p>}

      {request.status === "pending_review" && (
        <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-500">
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
          <Button onClick={submitQuote} disabled={saving || details.trim().length < 3} className="bg-emerald-700 text-white hover:bg-emerald-800">
            {saving ? "Sending…" : "Send quote for patient approval"}
          </Button>
        </div>
      )}

      {request.quote_amount != null && request.status !== "pending_review" && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-slate-700">
          <p className="font-semibold">Quote: {request.quote_currency ?? "ZAR"} {Number(request.quote_amount).toFixed(2)}</p>
          {request.quote_details && <p className="mt-1 whitespace-pre-wrap">{request.quote_details}</p>}
          <p className="mt-2 text-xs text-slate-500">This quote is not a payment. Patient acceptance and provider coordination are recorded separately; this workflow does not collect or verify payment.</p>
        </div>
      )}

      {request.status === "quote_accepted" && (
        <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-500">The patient accepted the quote. Confirm service scope, provider coverage, and availability before recording coordination. This does not process payment.</p>
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
            <Button onClick={coordinateVisit} disabled={saving || providers.length === 0} className="bg-emerald-700 text-white hover:bg-emerald-800">
              {saving ? "Saving…" : "Record coordination"}
            </Button>
          </div>
          {selectedProvider && (
            <p className="text-xs text-slate-500">
              On file — services: {selectedProvider.services?.length ? selectedProvider.services.join(", ") : "No services recorded"}; service areas: {selectedProvider.service_areas?.length ? selectedProvider.service_areas.join(", ") : "No coverage areas recorded"}. Verify this request is within the provider&apos;s current coverage before coordinating.
            </p>
          )}
          {providers.length === 0 && <p className="text-xs text-slate-500">No approved, active providers are currently available to the coordinator.</p>}
        </div>
      )}
    </article>
  );
}
