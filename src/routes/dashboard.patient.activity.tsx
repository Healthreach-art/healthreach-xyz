import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { firestoreClient } from "@/lib/firestore-client";
import { useAuth } from "@/hooks/useAuth";
import { CalendarDays, ChevronRight, ClipboardList, FileText, HousePlus, Loader2, Pill, RefreshCw, Stethoscope } from "lucide-react";

export const Route = createFileRoute("/dashboard/patient/activity")({
  head: () => ({ meta: [{ title: "Health Records — HealthReachCare" }] }),
  component: () => <RoleGuard allow="patient"><Page /></RoleGuard>,
});

type ActivityFilter = "All" | "Appointments" | "Orders" | "Prescriptions" | "Home Care";
type ActivityKind = "appointment" | "order" | "prescription" | "homecare";
type DataRow = Record<string, unknown> & { id: string };

interface ActivityItem {
  id: string;
  kind: ActivityKind;
  title: string;
  detail: string;
  occurredAt: Date | null;
  status: string;
}

const FILTERS: ActivityFilter[] = ["All", "Appointments", "Orders", "Prescriptions", "Home Care"];

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    try {
      const date = value.toDate();
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
    } catch {
      return null;
    }
  }
  if (value && typeof value === "object" && "seconds" in value && typeof value.seconds === "number") {
    const date = new Date(value.seconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: Date | null) {
  if (!value) return "Date unavailable";
  const date = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(value);
  const time = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }).format(value);
  return `${date} · ${time}`;
}

function statusLabel(value: unknown, fallback = "Status unavailable") {
  const status = typeof value === "string" ? value.toLowerCase().replace(/_/g, " ") : "";
  if (!status) return fallback;
  if (["delivered", "completed", "successful", "success"].includes(status)) return status === "completed" ? "Completed" : status === "successful" || status === "success" ? "Successful" : "Delivered";
  if (["scheduled", "confirmed", "assigned"].includes(status)) return "Scheduled";
  if (["processed", "approved", "active"].includes(status)) return "Processed";
  if (["processing", "accepted", "in transit", "out for delivery"].includes(status)) return "Processing";
  if (["reviewing", "under review", "pending review"].includes(status)) return "Reviewing";
  if (status === "requested" || status === "pending") return "Pending";
  return status.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(status: string) {
  if (["Delivered", "Completed", "Successful"].includes(status)) return "bg-emerald-100 text-emerald-800";
  if (status === "Scheduled") return "bg-violet-100 text-violet-800";
  if (status === "Processed") return "bg-sky-100 text-sky-800";
  if (status === "Processing") return "bg-blue-100 text-blue-800";
  return "bg-muted text-muted-foreground";
}

function iconFor(kind: ActivityKind) {
  if (kind === "appointment") return Stethoscope;
  if (kind === "order") return Pill;
  if (kind === "prescription") return FileText;
  return HousePlus;
}

function matchesFilter(kind: ActivityKind, filter: ActivityFilter) {
  if (filter === "All") return true;
  if (filter === "Appointments") return kind === "appointment";
  if (filter === "Orders") return kind === "order";
  if (filter === "Prescriptions") return kind === "prescription";
  return kind === "homecare";
}

function Page() {
  const { user } = useAuth();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [filter, setFilter] = useState<ActivityFilter>("All");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const requestId = useRef(0);

  const loadActivities = useCallback(async () => {
    const currentRequest = ++requestId.current;
    if (!user) {
      setActivities([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    try {
      const [ordersResult, prescriptionsResult, bookingsResult, homecareResult] = await Promise.all([
        firestoreClient.from("orders").select("*").eq("patient_id", user.id).order("created_at", { ascending: false }).limit(50),
        firestoreClient.from("prescriptions").select("*").eq("patient_id", user.id).order("created_at", { ascending: false }).limit(50),
        firestoreClient.from("bookings").select("*").eq("patient_id", user.id).order("created_at", { ascending: false }).limit(50),
        firestoreClient.from("homecare_requests").select("*").eq("patient_id", user.id).order("created_at", { ascending: false }).limit(50),
      ]);
      if (currentRequest !== requestId.current) return;
      const failedResult = [ordersResult, prescriptionsResult, bookingsResult, homecareResult].find((result) => result.error);
      if (failedResult?.error) throw failedResult.error;

      const orders = (ordersResult.data ?? []) as DataRow[];
      const prescriptions = (prescriptionsResult.data ?? []) as DataRow[];
      const bookings = (bookingsResult.data ?? []) as DataRow[];
      const homecareRequests = (homecareResult.data ?? []) as DataRow[];
      const items: ActivityItem[] = [
        ...orders.map((row) => ({
          id: `order-${row.id}`,
          kind: "order" as const,
          title: row.delivery_id ? "Delivery" : "Medicine Order",
          detail: [row.medication_name, row.quantity ? `Qty ${row.quantity}` : null, row.pharmacy_name].filter(Boolean).join(" · ") || "Medicine order",
          occurredAt: asDate(row.created_at ?? row.createdAt),
          status: statusLabel(row.status),
        })),
        ...prescriptions.map((row) => ({
          id: `prescription-${row.id}`,
          kind: "prescription" as const,
          title: "Prescription Uploaded",
          detail: [row.medication_name, row.doctor_name ? `Dr ${row.doctor_name}` : null, row.dosage].filter(Boolean).join(" · ") || "Prescription added to your records",
          occurredAt: asDate(row.created_at ?? row.createdAt),
          status: statusLabel(row.status ?? (row.is_active ? "processed" : null)),
        })),
        ...bookings.map((row) => {
          const source = String(row.source ?? "").toLowerCase();
          const service = String(row.service ?? row.service_type ?? "").toLowerCase();
          const isHomecare = service.includes("home") || service.includes("care");
          const isWhatsApp = source.includes("whatsapp");
          return {
            id: `${isHomecare ? "homecare" : "appointment"}-${row.id}`,
            kind: isHomecare ? "homecare" as const : "appointment" as const,
            title: isWhatsApp ? "WhatsApp Booking" : isHomecare ? "Home Care Request" : "Doctor Consultation",
            detail: String(row.summary ?? row.details ?? row.specialty ?? row.service ?? "Booking request"),
            occurredAt: asDate(row.scheduled_at ?? row.scheduledAt ?? row.created_at ?? row.createdAt),
            status: statusLabel(row.status),
          };
        }),
        ...homecareRequests.map((row) => ({
          id: `homecare-${row.id}`,
          kind: "homecare" as const,
          title: "Home Care Request",
          detail: [row.service_type, row.description].filter(Boolean).join(" · ") || "Home care visit",
          occurredAt: asDate(row.created_at ?? row.createdAt ?? row.preferred_at),
          status: statusLabel(row.status),
        })),
      ];
      const uniqueActivities = new Map(items.map((item) => [item.id, item]));
      setActivities(Array.from(uniqueActivities.values())
        .sort((a, b) => (b.occurredAt?.getTime() ?? 0) - (a.occurredAt?.getTime() ?? 0)));
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      console.error("[patient-activity] Could not load patient activity.", error);
      setLoadError(true);
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadActivities();
    return () => { requestId.current += 1; };
  }, [loadActivities]);

  const visibleActivities = useMemo(() => activities.filter((item) => matchesFilter(item.kind, filter)), [activities, filter]);
  const activeCount = activities.filter((item) => !["Delivered", "Completed", "Successful", "Cancelled"].includes(item.status)).length;
  const completedCount = activities.length - activeCount;
  const emptyLinks = {
    All: { to: "/dashboard/patient/find", label: "Find a doctor" },
    Appointments: { to: "/dashboard/patient/find", label: "Book an appointment" },
    Orders: { to: "/dashboard/patient/search", label: "Search medicines" },
    Prescriptions: { to: "/dashboard/patient/prescriptions", label: "View prescriptions" },
    "Home Care": { to: "/dashboard/patient/homecare", label: "Request home care" },
  } satisfies Record<ActivityFilter, { to: string; label: string }>;

  return (
    <div className="container-narrow space-y-6 px-4 py-8 pb-24 sm:px-6">
      <section className="overflow-hidden rounded-3xl bg-primary p-5 text-primary-foreground shadow-sm sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-primary-foreground/80">Your HealthReachCare journey</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold sm:text-3xl"><ClipboardList className="h-6 w-6" /> Activities</h1>
            <p className="mt-2 max-w-xl text-sm text-primary-foreground/85">Track orders, appointments, prescriptions and homecare updates together.</p>
          </div>
          <button type="button" onClick={() => void loadActivities()} disabled={loading} aria-label="Refresh activities"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary-foreground/25 bg-primary-foreground/10 transition hover:bg-primary-foreground/20 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </section>

      {!loading && !loadError && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Activity summary">
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">All activities</p>
            <p className="mt-1 text-2xl font-bold text-foreground tabular-nums">{activities.length}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">In progress</p>
            <p className="mt-1 text-2xl font-bold text-foreground tabular-nums">{activeCount}</p>
          </div>
          <div className="col-span-2 rounded-2xl border border-border bg-card p-4 sm:col-span-1">
            <p className="text-xs font-medium text-muted-foreground">Completed</p>
            <p className="mt-1 text-2xl font-bold text-foreground tabular-nums">{completedCount}</p>
          </div>
        </section>
      )}

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-2" role="group" aria-label="Filter activities">
          {FILTERS.map((item) => (
            <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${filter === item ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
              {item}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : loadError ? (
        <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
          <h2 className="font-semibold text-foreground">We couldn’t load your activities.</h2>
          <p className="mt-1 text-sm text-muted-foreground">Your health records are still safe. Please try again.</p>
          <button type="button" onClick={() => void loadActivities()} className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Try again
          </button>
        </div>
      ) : visibleActivities.length ? (
        <div className="space-y-3">
          {visibleActivities.map((item) => {
            const Icon = iconFor(item.kind);
            return (
              <article key={item.id} className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/30 sm:gap-4 sm:p-5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <h2 className="max-w-full truncate text-sm font-semibold text-foreground">{item.title}</h2>
                  <p className="max-w-full truncate text-sm text-muted-foreground">{item.detail}</p>
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />{formatDate(item.occurredAt)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className={`max-w-28 truncate rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(item.status)}`}>{item.status}</span>
                  <ChevronRight className="hidden h-4 w-4 text-muted-foreground sm:block" />
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><ClipboardList className="h-6 w-6" /></div>
          <h2 className="font-semibold text-foreground">No {filter === "All" ? "activities" : filter.toLowerCase()} yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">Your care updates will appear here as you use HealthReachCare.</p>
          <Link to={emptyLinks[filter].to} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
            {emptyLinks[filter].label}<ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
