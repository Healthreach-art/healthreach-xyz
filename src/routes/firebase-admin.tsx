import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Loader2, LogOut, ShieldCheck, CheckCircle, XCircle, FileQuestion, Ban,
  FileText, ExternalLink, ChevronDown, ChevronUp, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/firebase-admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin Control Centre — HealthReachCare" },
      { name: "description", content: "HealthReachCare admin control centre for profiles, roles, documents and providers." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FirebaseAdminPage,
});

type Row = Record<string, unknown> & { id: string };
type TabId =
  | "profiles"
  | "user_roles"
  | "doctors"
  | "pharmacies"
  | "drivers"
  | "homecare_providers"
  | "bookings"
  | "homecare_requests"
  | "orders"
  | "payments";

const TABS: { id: TabId; label: string; provider: boolean }[] = [
  { id: "profiles", label: "Profiles", provider: false },
  { id: "user_roles", label: "Roles", provider: false },
  { id: "doctors", label: "Doctors", provider: true },
  { id: "pharmacies", label: "Pharmacies", provider: true },
  { id: "drivers", label: "Drivers", provider: true },
  { id: "homecare_providers", label: "Home care", provider: true },
  { id: "bookings", label: "Appointments", provider: false },
  { id: "homecare_requests", label: "Patient requests", provider: false },
  { id: "orders", label: "Orders", provider: false },
  { id: "payments", label: "Payments", provider: false },
];

const BOOTSTRAP_ADMIN = "admin@healthreachcare.co.za";

function str(v: unknown) {
  if (v == null) return "—";
  if (typeof v === "object" && v && "toDate" in v) {
    try { return (v as { toDate: () => Date }).toDate().toLocaleString(); } catch { return "—"; }
  }
  return String(v);
}

function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  if (s === "approved") return "default";
  if (s === "rejected" || s === "suspended") return "destructive";
  return "secondary";
}

const DOCUMENT_LABELS: Record<string, string> = {
  hpcsa_cert_path: "HPCSA registration certificate",
  malpractice_cert_path: "Medical malpractice cover",
  malpractice_doc_url: "Medical malpractice cover",
  qualification_paths: "Qualifications",
  license_path: "License",
  id_document_path: "Identity document",
  selfie_path: "Selfie holding ID",
  vehicle_photo_path: "Vehicle photo",
  pharmacist_cert_path: "Pharmacist registration certificate",
  business_reg_path: "Business registration",
  tax_cert_path: "Tax certificate",
  proof_of_address_path: "Proof of address",
  bank_confirmation_path: "Bank confirmation",
};

function providerRowsFor(tab: TabId, data: Record<TabId, Row[]>): Row[] {
  const providerRoles: Partial<Record<TabId, string[]>> = {
    doctors: ["doctor"],
    pharmacies: ["pharmacy"],
    drivers: ["driver"],
    homecare_providers: ["homecare_company", "homecare_individual"],
  };
  const roles = providerRoles[tab];
  if (!roles) return data[tab] ?? [];

  const profiles = new Map(
    data.profiles.map((profile) => [String(profile.user_id ?? profile.id), profile]),
  );
  const providerRows = new Map<string, Row>();
  for (const provider of data[tab] ?? []) {
    const userId = String(provider.user_id ?? provider.userId ?? provider.id);
    const profile = profiles.get(userId);
    const sourceStatus = profile?.approval_status ?? provider.approval_status ?? provider.status ?? "pending_review";
    providerRows.set(userId, {
      ...(profile ?? {}),
      ...provider,
      id: provider.id,
      user_id: userId,
      status: provider.status === "documents_requested"
        ? provider.status
        : sourceStatus === "pending" || sourceStatus === "under_review"
          ? "pending_review"
          : sourceStatus,
    });
  }
  for (const assignment of data.user_roles) {
    if (!roles.includes(String(assignment.role))) continue;
    const userId = String(assignment.user_id ?? assignment.userId ?? "");
    const profile = profiles.get(userId);
    if (!userId || !profile || providerRows.has(userId)) continue;
    const profileStatus = profile.approval_status ?? "pending_review";
    providerRows.set(userId, {
      ...profile,
      id: userId,
      user_id: userId,
      status: profileStatus === "pending" || profileStatus === "under_review"
        ? "pending_review"
        : profileStatus,
    });
  }
  return [...providerRows.values()];
}

function getDocuments(row: Row) {
  return Object.entries(row).flatMap(([key, value]) => {
    if (key !== "file_path" && key !== "certifications" && !/(?:_path|_paths|_url)$/.test(key)) return [];
    const values = Array.isArray(value) ? value : key === "certifications" && value && typeof value === "object"
      ? Object.entries(value).map(([name, path]) => ({ name, path }))
      : [value];
    return values.flatMap((item, index) => {
      const itemPath = typeof item === "string"
        ? item
        : item && typeof item === "object"
          ? String((item as Record<string, unknown>).path ?? (item as Record<string, unknown>).url ?? (item as Record<string, unknown>).file_path ?? (item as Record<string, unknown>).name ?? "")
          : "";
      if (!itemPath.trim()) return [];
      const label = key === "file_path"
        ? String(row.doc_key ?? row.document_type ?? "Uploaded document").replace(/_/g, " ")
        : key === "certifications"
          ? typeof item === "object" && item && "name" in item ? String(item.name) : "Certification"
        : DOCUMENT_LABELS[key] ?? key
        .replace(/_(?:path|paths|url)$/, "")
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
      return [{ key: `${key}-${index}`, label: values.length > 1 && key !== "certifications" ? `${label} ${index + 1}` : label, path: itemPath.trim() }];
    });
  });
}

function DocumentReviewPanel({ tab, row }: { tab: TabId; row: Row }) {
  const rowDocuments = useMemo(() => getDocuments(row), [row]);
  const [relatedRecords, setRelatedRecords] = useState<Row[]>([]);
  const [profile, setProfile] = useState<Row | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    void (async () => {
      const lookup = tab === "doctors"
        ? { table: "doctor_documents", field: "doctor_user_id", id: row.userId ?? row.user_id ?? row.id }
        : tab === "pharmacies"
          ? { table: "pharmacy_documents", field: "pharmacy_id", id: row.userId ?? row.user_id ?? row.id }
          : tab === "drivers"
            ? { table: "driver_documents", field: "driver_id", id: row.userId ?? row.user_id ?? row.id }
            : tab === "homecare_providers"
              ? { table: "homecare_documents", field: "provider_id", id: row.id }
              : null;
      if (lookup) {
        try {
          const { firestoreClient } = await import("@/lib/firestore-client");
          const [documentsResult, profileResult] = await Promise.all([
            firestoreClient.from(lookup.table).select("*").eq(lookup.field, lookup.id),
            firestoreClient.from("profiles").select("*").eq("user_id", row.userId ?? row.user_id ?? row.id).maybeSingle(),
          ]);
          const records = Array.isArray(documentsResult.data) ? documentsResult.data : documentsResult.data ? [documentsResult.data] : [];
          if (active) setRelatedRecords(records as Row[]);
          if (active) setProfile(profileResult.data as Row | null);
        } catch {
          if (active) setRelatedRecords([]);
          if (active) setProfile(null);
        }
      } else {
        setRelatedRecords([]);
        setProfile(null);
      }
    })();
    return () => { active = false; };
  }, [row, tab]);

  const documents = useMemo(() => {
    const unique = new Map<string, ReturnType<typeof getDocuments>[number]>();
    for (const document of [...rowDocuments, ...relatedRecords.flatMap(getDocuments)]) {
      if (!unique.has(document.path)) unique.set(document.path, document);
    }
    return [...unique.values()];
  }, [relatedRecords, rowDocuments]);

  const identifiers: [string, unknown][] = tab === "doctors"
    ? [["HPCSA number", row.hpcsa_number ?? relatedRecords[0]?.hpcsa_number]]
    : tab === "pharmacies"
      ? [["SAPC license", profile?.license_number], ["Pharmacist certificate", profile?.pharmacist_council_number]]
      : tab === "drivers"
        ? [
          ["Driver license", row.driver_license_number ?? profile?.driver_license_number ?? relatedRecords[0]?.driver_license_number ?? (relatedRecords[0]?.license_path ? "Document submitted" : null)],
          ["Vehicle registration", row.vehicle_registration ?? relatedRecords[0]?.vehicle_registration],
        ]
        : tab === "homecare_providers"
          ? [["CIPC registration", row.registration_number ?? row.cipc_registration_number ?? profile?.business_reg_number]]
          : [];

  useEffect(() => {
    let active = true;
    void (async () => {
      const next: Record<string, string> = {};
      const bucket = tab === "doctors" ? "doctor-docs" : tab === "pharmacies" ? "pharmacy-docs" : tab === "drivers" ? "driver-docs" : tab === "homecare_providers" ? "homecare-docs" : null;
      const [{ firestoreClient }, { getDocumentUrl }] = await Promise.all([
        import("@/lib/firestore-client"),
        import("@/lib/firebase-documents"),
      ]);
      await Promise.all(documents.map(async (document) => {
        try {
          const parsed = new URL(document.path);
          if (parsed.protocol === "https:" || parsed.protocol === "http:") {
            next[document.key] = parsed.href;
            return;
          }
        } catch { /* Storage object paths are not absolute URLs. */ }
        try {
          if (bucket) {
            const { data } = await firestoreClient.storage.from(bucket).createSignedUrl(document.path);
            if (data?.signedUrl) {
              next[document.key] = data.signedUrl;
              return;
            }
          }
          next[document.key] = await getDocumentUrl(document.path);
        } catch { /* Keep the original path visible if a file cannot be resolved. */ }
      }));
      if (active) setLinks(next);
    })();
    return () => { active = false; };
  }, [documents, tab]);

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-border bg-muted/40 p-3">
      {identifiers.some(([, value]) => value != null && String(value).trim()) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {identifiers.filter(([, value]) => value != null && String(value).trim()).map(([label, value]) => (
            <span key={label}>{label}: <strong className="text-foreground">{str(value)}</strong></span>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {documents.length ? documents.map((document) => (
          <div key={document.key} className="min-w-0 rounded border border-border bg-background p-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium">{document.label}</span>
              {links[document.key] && <a href={links[document.key]} target="_blank" rel="noopener noreferrer" aria-label={`Open ${document.label}`}><ExternalLink className="h-3 w-3 text-muted-foreground" /></a>}
            </div>
            <div className="mt-1 break-all text-muted-foreground">{document.path}</div>
          </div>
        )) : (
          <div className="col-span-full flex items-center gap-2 text-xs text-muted-foreground">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <span>No documents submitted. Use &quot;Request documents&quot; to notify the provider.</span>
          </div>
        )}
      </div>
    </div>
  );
}

function FirebaseAdminPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<"checking" | "denied" | "ok">("checking");
  const [adminUid, setAdminUid] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [tab, setTab] = useState<TabId>("doctors");
  const [data, setData] = useState<Record<TabId, Row[]>>({
    profiles: [], user_roles: [], doctors: [], pharmacies: [], drivers: [], homecare_providers: [],
    bookings: [], homecare_requests: [], orders: [], payments: [],
  });
  const [errors, setErrors] = useState<Partial<Record<TabId, string>>>({});
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [expandedDocs, setExpandedDocs] = useState<Record<string, boolean>>({});

  // Auth gate (Firebase session + admin role).
  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      const { onFirebaseAuthChange } = await import("@/lib/firebase-auth");
      const { getUserRoles } = await import("@/lib/firestore");
      unsub = await onFirebaseAuthChange(async (u) => {
        if (!u) { setState("denied"); return; }
        const roles: string[] = await getUserRoles(u.uid).catch((): string[] => []);
        const isAdmin = roles.includes("admin") || u.email?.toLowerCase() === BOOTSTRAP_ADMIN;
        if (!isAdmin) { setState("denied"); return; }

        if (!roles.includes("admin")) {
          const { grantRole } = await import("@/lib/firestore");
          await grantRole(u.uid, "admin").catch(() => {});
        }

        const { fsGet, fsSet } = await import("@/lib/firestore");
        if (!(await fsGet("profiles", u.uid).catch(() => null))) {
          await fsSet("profiles", u.uid, { email: u.email, fullName: u.displayName ?? "Administrator", createdAt: new Date().toISOString() }).catch(() => {});
        }
        setAdminUid(u.uid);
        setAdminEmail(u.email ?? "");
        setState("ok");
      });
    })();
    return () => unsub?.();
  }, []);

  // Live Firestore data.
  useEffect(() => {
    if (state !== "ok") return;
    const unsubs: (() => void)[] = [];
    (async () => {
      const { fsSubscribe } = await import("@/lib/firestore");
      for (const t of TABS) {
        try {
          const u = await fsSubscribe<Record<string, unknown>>(t.id, [], (rows) => {
            setData((d) => ({ ...d, [t.id]: rows as Row[] }));
          });
          unsubs.push(u);
        } catch (e) {
          setErrors((er) => ({ ...er, [t.id]: e instanceof Error ? e.message : "Could not load" }));
        }
      }
    })();
    return () => unsubs.forEach((u) => u());
  }, [state]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = providerRowsFor(tab, data);
    if (!q) return list;
    return list.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
  }, [data, tab, search]);

  const isProviderTab = TABS.find((t) => t.id === tab)?.provider;

  async function act(row: Row, status: "approved" | "rejected" | "documents_requested" | "suspended") {
    const noteInput = window.prompt("Review note (optional):");
    if (noteInput === null) return;
    const note = noteInput.trim() || undefined;
    setBusy(row.id + status);
    try {
      const { setProviderStatus, notify } = await import("@/lib/firestore");
      await setProviderStatus(tab, row.id, status, adminUid, note);
      const target = (row.userId as string) || (row.user_id as string) || row.id;
      await notify(target, "Application status update", `Your HealthReachCare status has been updated to: ${status.replace("_", " ")}.`).catch(() => {});
      toast.success(`Marked ${status.replace("_", " ")}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(null);
    }
  }

  async function signOut() {
    const { firebaseSignOut } = await import("@/lib/firebase-auth");
    await firebaseSignOut();
    navigate({ to: "/login", search: { mode: "admin" }, replace: true });
  }

  if (state === "checking") {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (state === "denied") {
    return (
      <div className="mx-auto max-w-md p-8 text-center space-y-4">
        <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Admin sign-in required</h1>
        <p className="text-muted-foreground">Please sign in with an admin account to access the control centre.</p>
        <Button onClick={() => navigate({ to: "/login", search: { mode: "admin" } })}>Go to admin sign in</Button>
      </div>
    );
  }

  return (
    <div className="container-narrow px-4 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Admin Control Centre</h1>
          <p className="text-sm text-muted-foreground">Signed in as {adminEmail} · live database</p>
        </div>
        <Button variant="outline" size="sm" onClick={signOut} className="gap-1"><LogOut className="h-4 w-4" /> Sign out</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {TABS.map((t) => {
          const list = providerRowsFor(t.id, data);
          const pending = t.provider ? list.filter((r) => r.status === "pending_review").length : 0;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-lg border p-3 text-left transition-colors ${tab === t.id ? "border-primary bg-accent" : "border-border bg-card hover:bg-accent/50"}`}
            >
              <div className="text-sm text-muted-foreground">{t.label}</div>
              <div className="text-2xl font-semibold">{list.length}</div>
              {pending > 0 && <div className="text-xs font-semibold text-primary">{pending} pending</div>}
            </button>
          );
        })}
      </div>

      <Input placeholder="Search records…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />

      {errors[tab] && <p className="text-sm text-destructive">{errors[tab]}</p>}

      <div className="space-y-4">
        {rows.length === 0 && <p className="text-muted-foreground py-8 text-center">No  records in this section.</p>}
        {rows.map((r) => {
          const isExpanded = expandedDocs[r.id];

          return (
            <div key={r.id} className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-base truncate">
                    {str(r.name ?? r.fullName ?? r.organization_name ?? r.email ?? r.service ?? r.medicationName ?? r.role ?? r.id)}
                  </div>
                  <div className="text-sm text-muted-foreground break-all">
                    {tab === "user_roles" ? `User ID: ${str(r.userId || r.user_id)}` : str(r.email)}
                    {r.phone ? ` · Tel: ${str(r.phone)}` : ""}
                  </div>

                  {/* Professional IDs / Numbers */}
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {r.practice_number ? <span>Practice No: <strong className="text-foreground">{str(r.practice_number)}</strong></span> : null}
                    {r.specialty ? <span>Specialty: <strong className="text-foreground">{str(r.specialty)}</strong></span> : null}
                    {r.vehicle_type ? <span>Vehicle: <strong className="text-foreground">{str(r.vehicle_type)}</strong></span> : null}
                  </div>

                  {r.scheduledAt || r.date ? <div className="text-sm text-muted-foreground">Date/Time: {str(r.scheduledAt ?? r.date)}</div> : null}
                  {r.amount != null ? <div className="text-sm text-muted-foreground">Amount: R{str(r.amount)}</div> : null}
                  {r.address ? <div className="text-sm text-muted-foreground">Address: {str(r.address)}</div> : null}
                  {r.reviewNote ? <div className="text-xs text-destructive mt-1 font-medium">Review Note: {str(r.reviewNote)}</div> : null}
                </div>
                <div className="flex items-center gap-2">
                  {tab === "user_roles" && <Badge variant="outline">{str(r.role)}</Badge>}
                  {r.status ? <Badge variant={statusVariant(String(r.status))}>{String(r.status).replace("_", " ")}</Badge> : null}
                </div>
              </div>

              {/* Document Review Panel */}
              {isProviderTab && (
                <div className="pt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setExpandedDocs((prev) => ({ ...prev, [r.id]: !prev[r.id] }))}
                    className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    View Verification Documents
                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>

                  {isExpanded && <DocumentReviewPanel tab={tab} row={r} />}
                </div>
              )}

              {/* Provider Approval Lifecycle Actions */}
              {isProviderTab && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" disabled={!!busy || r.status === "approved"} onClick={() => act(r, "approved")} className="gap-1">
                    <CheckCircle className="h-4 w-4" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act(r, "documents_requested")} className="gap-1">
                    <FileQuestion className="h-4 w-4" /> Request documents
                  </Button>
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act(r, "rejected")} className="gap-1">
                    <XCircle className="h-4 w-4" /> Reject
                  </Button>
                  <Button size="sm" variant="ghost" disabled={!!busy || r.status === "suspended"} onClick={() => act(r, "suspended")} className="gap-1 text-muted-foreground hover:text-destructive">
                    <Ban className="h-4 w-4" /> Suspend
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
