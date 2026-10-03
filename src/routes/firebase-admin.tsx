import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, LogOut, ShieldCheck, CheckCircle, XCircle, FileQuestion, Ban } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/firebase-admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin Control Centre — HealthReachCare" },
      { name: "description", content: "HealthReachCare admin control centre for profiles, roles and providers." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FirebaseAdminPage,
});

type Row = Record<string, unknown> & { id: string };
type TabId = "profiles" | "user_roles" | "doctors" | "pharmacies" | "homecare_providers";

const TABS: { id: TabId; label: string; provider: boolean }[] = [
  { id: "profiles", label: "Profiles", provider: false },
  { id: "user_roles", label: "Roles", provider: false },
  { id: "doctors", label: "Doctors", provider: true },
  { id: "pharmacies", label: "Pharmacies", provider: true },
  { id: "homecare_providers", label: "Home care", provider: true },
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

function FirebaseAdminPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<"checking" | "denied" | "ok">("checking");
  const [adminUid, setAdminUid] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [tab, setTab] = useState<TabId>("doctors");
  const [data, setData] = useState<Record<TabId, Row[]>>({
    profiles: [], user_roles: [], doctors: [], pharmacies: [], homecare_providers: [],
  });
  const [errors, setErrors] = useState<Partial<Record<TabId, string>>>({});
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

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
        // Make sure the bootstrap admin has a role record.
        if (!roles.includes("admin")) {
          const { grantRole } = await import("@/lib/firestore");
          await grantRole(u.uid, "admin").catch(() => {});
        }
        setAdminUid(u.uid);
        setAdminEmail(u.email ?? "");
        setState("ok");
      });
    })();
    return () => unsub?.();
  }, []);

  // Live data.
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
    const list = data[tab];
    if (!q) return list;
    return list.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
  }, [data, tab, search]);

  const isProviderTab = TABS.find((t) => t.id === tab)?.provider;

  async function act(row: Row, status: "approved" | "rejected" | "documents_requested" | "suspended") {
    let note: string | undefined;
    if (status !== "approved") {
      note = window.prompt("Reason / note for this decision:") ?? undefined;
      if (note === undefined) return;
    }
    setBusy(row.id + status);
    try {
      const { setProviderStatus, notify } = await import("@/lib/firestore");
      await setProviderStatus(tab, row.id, status, adminUid, note);
      const target = (row.userId as string) || row.id;
      await notify(target, "Application update", `Your HealthReachCare application status is now: ${status.replace("_", " ")}.`).catch(() => {});
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
        <p className="text-muted-foreground">Please sign in with an admin account to open the control centre.</p>
        <Button onClick={() => navigate({ to: "/login", search: { mode: "admin" } })}>Go to admin sign in</Button>
      </div>
    );
  }

  return (
    <div className="container-narrow px-4 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Admin Control Centre</h1>
          <p className="text-sm text-muted-foreground">Signed in as {adminEmail} · live data</p>
        </div>
        <Button variant="outline" size="sm" onClick={signOut} className="gap-1"><LogOut className="h-4 w-4" /> Sign out</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {TABS.map((t) => {
          const pending = t.provider ? data[t.id].filter((r) => r.status === "pending_review").length : 0;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-lg border p-3 text-left transition-colors ${tab === t.id ? "border-primary bg-accent" : "border-border bg-card hover:bg-accent/50"}`}
            >
              <div className="text-sm text-muted-foreground">{t.label}</div>
              <div className="text-2xl font-semibold">{data[t.id].length}</div>
              {pending > 0 && <div className="text-xs text-primary">{pending} pending</div>}
            </button>
          );
        })}
      </div>

      <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />

      {errors[tab] && <p className="text-sm text-destructive">{errors[tab]}</p>}

      <div className="space-y-3">
        {rows.length === 0 && <p className="text-muted-foreground py-8 text-center">No records yet.</p>}
        {rows.map((r) => (
          <div key={r.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {str(r.name ?? r.fullName ?? r.email ?? r.role ?? r.id)}
                </div>
                <div className="text-sm text-muted-foreground break-all">
                  {tab === "user_roles" ? `User ${str(r.userId)}` : str(r.email)}
                  {r.phone ? ` · ${str(r.phone)}` : ""}
                </div>
                {r.address ? <div className="text-sm text-muted-foreground">{str(r.address)}</div> : null}
                {r.reviewNote ? <div className="text-xs text-muted-foreground mt-1">Note: {str(r.reviewNote)}</div> : null}
              </div>
              <div className="flex items-center gap-2">
                {tab === "user_roles" && <Badge variant="outline">{str(r.role)}</Badge>}
                {r.status ? <Badge variant={statusVariant(String(r.status))}>{String(r.status).replace("_", " ")}</Badge> : null}
              </div>
            </div>
            {isProviderTab && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" disabled={!!busy || r.status === "approved"} onClick={() => act(r, "approved")} className="gap-1"><CheckCircle className="h-4 w-4" /> Approve</Button>
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act(r, "documents_requested")} className="gap-1"><FileQuestion className="h-4 w-4" /> Request documents</Button>
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act(r, "rejected")} className="gap-1"><XCircle className="h-4 w-4" /> Reject</Button>
                <Button size="sm" variant="ghost" disabled={!!busy || r.status === "suspended"} onClick={() => act(r, "suspended")} className="gap-1"><Ban className="h-4 w-4" /> Suspend</Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
