import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { RoleGuard } from "@/components/RoleGuard";
import { useAuth } from "@/hooks/useAuth";
import { firestoreClient } from "@/lib/firestore-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { AddressPicker, type PickedAddress } from "@/components/AddressPicker";
import { toast } from "sonner";
import {
  Building2, CalendarClock, CheckCircle2, ClipboardList, HomeIcon, Loader2, LogOut, Trash2, Upload, XCircle,
} from "lucide-react";
import { docsFor, APPROVAL_LABEL, ASSIGNMENT_LABEL, HOMECARE_SERVICES } from "@/lib/homecare";
import { getHomecareDocumentUrl, getMyHomecareBanking, saveMyHomecareBanking } from "@/lib/homecare.functions";
import { PLATFORM_RULES } from "@/lib/platform-rules";
import { HomecareBottomNav, type HomecareTerminalTab } from "@/components/HomecareBottomNav";

export const Route = createFileRoute("/dashboard/homecare_company")({
  head: () => ({
    meta: [
      { title: "Home Care Dashboard — HealthReachCare" },
      { name: "description", content: "Manage your HealthReachCare home care profile, documents, staff and visit assignments." },
      { property: "og:title", content: "Home Care Dashboard — HealthReachCare" },
      { property: "og:description", content: "Manage your home care profile, documents, staff and assignments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <RoleGuard allow="homecare_company"><HomecareProviderPage /></RoleGuard>,
});

type Provider = any;

function HomecareProviderPage() {
  const { user, signOut } = useAuth();
  const [provider, setProvider] = useState<Provider | null>(null);
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<HomecareTerminalTab>("overview");
  const [statusBusy, setStatusBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    let { data: p } = await firestoreClient.from("homecare_providers")
      .select("*")
      .eq("user_id", user.id).maybeSingle();
    if (!p) {
      // first visit: create the provider's own onboarding record (pending admin review)
      const now = new Date().toISOString();
      const fresh = {
        id: user.id, user_id: user.id, email: user.email ?? null,
        provider_type: "company", status: "pending_review", approval_status: "pending_review",
        is_active: false, services: [], service_areas: [], certifications: [],
        requested_documents: [], service_radius_km: 25, created_at: now, updated_at: now,
      };
      const { error } = await firestoreClient.from("homecare_providers").insert(fresh as never);
      if (!error) p = fresh as any;
    }
    if (p) {
      p = {
        ...p,
        provider_type: p.provider_type ?? (p.homecare_type === "individual" ? "individual" : "company"),
        business_name: p.business_name ?? p.organization_name ?? null,
        approval_status: p.approval_status ?? p.status ?? "pending_review",
      };
    }
    setProvider(p);
    if (p) {
      const [{ data: d }, { data: s }, { data: a }] = await Promise.all([
        firestoreClient.from("homecare_documents").select("*").eq("provider_id", p.id).order("created_at", { ascending: false }),
        firestoreClient.from("homecare_staff").select("*").eq("company_id", p.id).order("created_at", { ascending: false }),
        firestoreClient.from("homecare_assignments").select("*, homecare_requests(*)").eq("provider_id", p.id).order("created_at", { ascending: false }),
      ]);
      setDocs(d ?? []); setStaff(s ?? []); setAssignments(a ?? []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!provider?.id) return;
    const ch = firestoreClient.channel(`hc-provider-${provider.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "homecare_assignments", filter: `provider_id=eq.${provider.id}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "homecare_providers", filter: `id=eq.${provider.id}` }, () => void load())
      .subscribe();
    return () => { firestoreClient.removeChannel(ch); };
  }, [provider?.id, load]);

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!provider) {
    return (
      <div className="container-narrow px-4 py-10">
        <div className="healthcare-card p-6 text-center">
          <p className="font-semibold">We couldn't find your home care record.</p>
          <p className="text-sm text-muted-foreground mt-1">We could not set up your home care profile automatically. Please try again, or contact support.</p>
          <Button className="mt-4" onClick={() => { setLoading(true); void load(); }}>Try again</Button>
        </div>
      </div>
    );
  }

  const status = provider.approval_status as string;
  const requested: string[] = Array.isArray(provider.requested_documents) ? provider.requested_documents : [];
  const offeredCount = assignments.filter((assignment) => assignment.status === "offered").length;
  const activeVisitCount = assignments.filter((assignment) => ["accepted", "scheduled", "in_progress"].includes(assignment.status)).length;
  const completedCount = assignments.filter((assignment) => ["completed", "confirmed"].includes(assignment.status)).length;
  const navTab: HomecareTerminalTab = provider.provider_type === "individual" && activeTab === "staff" ? "profile" : activeTab;

  const toggleAvailability = async () => {
    if (status !== "approved") {
      toast.error("Availability can only be changed after your provider account is approved.");
      return;
    }
    setStatusBusy(true);
    const { error } = await firestoreClient.from("homecare_providers")
      .update({ is_active: !provider.is_active })
      .eq("id", provider.id);
    setStatusBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(provider.is_active ? "You are paused and will not receive new assignments." : "You are available for new assignments.");
    await load();
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="border-b border-border bg-card px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Home care provider terminal</p>
              <h1 className="mt-1 flex items-center gap-2 text-xl font-bold sm:text-2xl">
                <HomeIcon className="h-5 w-5 text-primary" />
                {provider.business_name || provider.full_name || provider.email}
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">{provider.provider_type === "individual" ? "Independent provider" : "Home care company"} · {APPROVAL_LABEL[status] ?? status}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={status === "approved" ? provider.is_active ? "default" : "secondary" : status === "rejected" || status === "suspended" ? "destructive" : "secondary"}>
                {status === "approved" ? provider.is_active ? "Available for assignments" : "Paused" : APPROVAL_LABEL[status] ?? status}
              </Badge>
              <Button size="sm" variant={provider.is_active ? "outline" : "default"} disabled={statusBusy || status !== "approved"} onClick={toggleAvailability}>
                {statusBusy ? "Updating…" : status !== "approved" ? "Verification required" : provider.is_active ? "Pause new assignments" : "Go available"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void signOut()}><LogOut className="mr-1 h-4 w-4" /> Sign out</Button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <TerminalMetric label="New offers" value={offeredCount} icon={ClipboardList} />
            <TerminalMetric label="Active visits" value={activeVisitCount} icon={CalendarClock} />
            <TerminalMetric label="Completed visits" value={completedCount} icon={CheckCircle2} />
          </div>
        </div>
      </header>

      {status !== "approved" && (
        <div className="mx-auto mt-4 max-w-6xl px-4 sm:px-6"><div className="healthcare-card p-4 text-sm">
          <p className="font-semibold">Your account is not active yet.</p>
          <p className="text-muted-foreground mt-1">
            An administrator reviews every home care provider before any customer visit can be assigned.
            Complete your details and upload your documents below.
          </p>
          {provider.rejection_reason && <p className="mt-2 text-destructive">Reason: {provider.rejection_reason}</p>}
          {requested.length > 0 && (
            <p className="mt-2">Still needed: <span className="font-semibold">{requested.join(", ")}</span></p>
          )}
        </div></div>
      )}

      <Tabs value={navTab} onValueChange={(tab) => setActiveTab(tab as HomecareTerminalTab)}>
        <main className="mx-auto max-w-6xl space-y-4 px-4 py-5 sm:px-6">
          <TabsContent value="overview" className="mt-0 space-y-4">
            <section className="healthcare-card p-5">
              <div className="flex items-start gap-3">
                <Building2 className="mt-0.5 h-5 w-5 text-primary" />
                <div>
                  <h2 className="font-semibold">Operational status</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {provider.is_active && status === "approved"
                      ? "You are visible for matching and can receive new visit assignments."
                      : status !== "approved"
                        ? "Complete verification before you can receive assignments."
                        : "You are paused and will not receive new assignments."}
                  </p>
                  {provider.operating_hours && <p className="mt-2 text-xs text-muted-foreground">Operating hours: {provider.operating_hours}</p>}
                  {provider.availability && <p className="mt-1 text-xs text-muted-foreground">Weekly availability: {provider.availability}</p>}
                </div>
              </div>
            </section>
            <section className="healthcare-card p-5">
              <h2 className="mb-3 font-semibold">Latest visits</h2>
              {assignments.length ? <AssignmentsPanel assignments={assignments.slice(0, 3)} provider={provider} onChanged={load} /> : <p className="text-sm text-muted-foreground">No visit assignments yet.</p>}
            </section>
          </TabsContent>
          <TabsContent value="assignments" className="mt-0">
            <section className="mb-4 flex items-center justify-between gap-3">
              <div><h2 className="text-lg font-semibold">Visit assignments</h2><p className="text-sm text-muted-foreground">Review requests, confirm visits, and update visit progress.</p></div>
              <Button size="sm" variant="outline" onClick={() => void load()}>Refresh</Button>
            </section>
            <AssignmentsPanel assignments={assignments} provider={provider} onChanged={load} />
          </TabsContent>
          <TabsContent value="documents" className="mt-0">
            <DocumentsPanel provider={provider} docs={docs} onChanged={load} requested={requested} />
          </TabsContent>
          {provider.provider_type !== "individual" && (
            <TabsContent value="staff" className="mt-0">
              <StaffPanel provider={provider} staff={staff} onChanged={load} />
            </TabsContent>
          )}
          <TabsContent value="profile" className="mt-0">
            <ProfileForm provider={provider} onSaved={load} />
          </TabsContent>
        </main>
      </Tabs>
      <HomecareBottomNav activeTab={navTab} onChange={setActiveTab} showTeam={provider.provider_type !== "individual"} />
    </div>
  );
}

function TerminalMetric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof ClipboardList }) {
  return <div className="rounded-lg border border-border bg-background px-3 py-2"><div className="flex items-center gap-1.5 text-[10px] text-muted-foreground sm:text-xs"><Icon className="h-3.5 w-3.5" />{label}</div><p className="mt-0.5 text-sm font-bold sm:text-lg">{value}</p></div>;
}

/* ---------------- profile ---------------- */

function ProfileForm({ provider, onSaved }: { provider: any; onSaved: () => void }) {
  const saveBanking = useServerFn(saveMyHomecareBanking);
  const isCompany = provider.provider_type !== "individual";
  const [form, setForm] = useState({
    business_name: provider.business_name ?? "",
    full_name: provider.full_name ?? "",
    registration_number: provider.registration_number ?? "",
    contact_person: provider.contact_person ?? "",
    phone: provider.phone ?? "",
    email: provider.email ?? "",
    operating_hours: provider.operating_hours ?? "",
    availability: provider.availability ?? "",
    pricing_notes: provider.pricing_notes ?? "",
    hourly_rate: provider.hourly_rate ?? "",
    service_radius_km: provider.service_radius_km ?? 25,
    qualifications: provider.qualifications ?? "",
    service_areas: (provider.service_areas ?? []).join(", "),
    certifications: (provider.certifications ?? []).join(", "),
    bank_name: "",
    account_holder: "",
    account_number: "",
    branch_code: "",
  });
  const [services, setServices] = useState<string[]>(provider.services ?? []);
  const [bankingLoaded, setBankingLoaded] = useState(false);
  const [address, setAddress] = useState<PickedAddress | null>(
    provider.address ? { address: provider.address, lat: provider.latitude, lng: provider.longitude } as PickedAddress : null,
  );

  // banking details are protected: they are only readable through this owner-scoped server call
  useEffect(() => {
    let cancelled = false;
    void getMyHomecareBanking().then((b) => {
      if (cancelled) return;
      setForm((f) => ({ ...f, ...b }));
      setBankingLoaded(true);
    }).catch((error: unknown) => {
      if (!cancelled) toast.error(error instanceof Error ? `Could not load banking details: ${error.message}` : "Could not load banking details.");
    });
    return () => { cancelled = true; };
  }, []);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // save on blur so nothing is lost on refresh
  const saveField = async (patch: Record<string, unknown>) => {
    const { error } = await firestoreClient.from("homecare_providers").update(patch as never).eq("id", provider.id);
    if (error) toast.error(error.message);
  };

  const toggleService = async (s: string) => {
    const next = services.includes(s) ? services.filter((x) => x !== s) : [...services, s];
    setServices(next);
    await saveField({ services: next });
  };

  const saveAddress = async (a: PickedAddress | null) => {
    setAddress(a);
    if (a?.lat != null && a.lng != null) await saveField({ address: a.address, latitude: a.lat, longitude: a.lng });
  };

  const saveAll = async () => {
    if (!bankingLoaded) {
      toast.error("Wait for banking details to load before saving.");
      return;
    }
    const { error } = await firestoreClient.from("homecare_providers").update({
      business_name: form.business_name,
      full_name: form.full_name,
      registration_number: form.registration_number || null,
      contact_person: form.contact_person || null,
      phone: form.phone || null,
      email: form.email,
      operating_hours: form.operating_hours,
      availability: form.availability,
      pricing_notes: form.pricing_notes || null,
      hourly_rate: form.hourly_rate === "" ? null : Number(form.hourly_rate),
      service_radius_km: Number(form.service_radius_km) > 0 ? Number(form.service_radius_km) : 25,
      qualifications: form.qualifications || null,
      service_areas: String(form.service_areas).split(",").map((s: string) => s.trim()).filter(Boolean),
      certifications: String(form.certifications).split(",").map((s: string) => s.trim()).filter(Boolean),
      services,
      ...(address?.lat != null && address.lng != null ? { address: address.address, latitude: address.lat, longitude: address.lng } : {}),
    }).eq("id", provider.id);
    if (error) { toast.error(error.message); return; }
    try {
      await saveBanking({ data: {
        bank_name: form.bank_name,
        account_holder: form.account_holder,
        account_number: form.account_number,
        branch_code: form.branch_code,
      } });
    } catch (bankError) {
      toast.error(bankError instanceof Error ? `Profile saved, but banking details were not saved: ${bankError.message}` : "Profile saved, but banking details were not saved.");
      return;
    }
    toast.success("Saved");
    onSaved();
  };

  const field = (key: keyof typeof form, label: string, opts: { type?: string; placeholder?: string } = {}) => (
    <div className="space-y-2">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        type={opts.type ?? "text"}
        value={String(form[key] ?? "")}
        placeholder={opts.placeholder}
        onChange={(e) => set(key, e.target.value)}
        onBlur={() => {
          if (["bank_name", "account_holder", "account_number", "branch_code"].includes(key)) return;
          const value = form[key];
          void saveField({
            [key]: key === "hourly_rate"
              ? (form.hourly_rate === "" ? null : Number(form.hourly_rate))
              : key === "service_radius_km"
                ? (Number(form.service_radius_km) > 0 ? Number(form.service_radius_km) : 25)
                : key === "service_areas" || key === "certifications"
                  ? String(value).split(",").map((item) => item.trim()).filter(Boolean)
                  : value || null,
          });
        }}
      />
    </div>
  );

  return (
    <div className="healthcare-card p-5 space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {isCompany ? (
          <>
            {field("business_name", "Business name")}
            {field("registration_number", "Company registration number")}
            {field("contact_person", "Contact person")}
          </>
        ) : (
          <>
            {field("full_name", "Full name")}
            {field("qualifications", "Qualifications")}
          </>
        )}
        {field("email", "Email", { type: "email" })}
        {field("phone", "Phone", { type: "tel", placeholder: "+27 71 123 4567" })}
        {isCompany ? field("operating_hours", "Operating hours", { placeholder: "Mon–Fri 08:00–17:00" })
                   : field("availability", "Weekly availability", { placeholder: "Mon–Sat, 07:00–19:00" })}
        {field("hourly_rate", "Rate per hour (R)", { type: "number" })}
        {field("service_areas", "Service areas", { placeholder: "Sandton, Midrand, Randburg" })}
        {field("certifications", "Certifications", { placeholder: "SANC, First aid level 3" })}
        {field("service_radius_km", "Maximum distance you will travel (km)", { type: "number", placeholder: "25" })}
      </div>

      <div className="space-y-2">
        <Label>Address (pinned on the map)</Label>
        <AddressPicker value={address} onChange={saveAddress} placeholder="Start typing your real street address…" />
        <p className="text-[11px] text-muted-foreground">
          A verified pin is required before an administrator can approve you. Customers only see you if they are inside
          the maximum distance you are willing to travel.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Services offered</Label>
        <div className="flex flex-wrap gap-2">
          {HOMECARE_SERVICES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleService(s)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                services.includes(s) ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="pricing_notes">Pricing notes</Label>
        <Textarea
          id="pricing_notes"
          value={form.pricing_notes}
          onChange={(e) => set("pricing_notes", e.target.value)}
          onBlur={() => saveField({ pricing_notes: form.pricing_notes || null })}
          placeholder="e.g. R250 per hour, minimum 4 hours, night shift R300 per hour"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {field("bank_name", "Bank")}
        {field("account_holder", "Account holder")}
        {field("account_number", "Account number")}
        {field("branch_code", "Branch code")}
      </div>

      <Button onClick={saveAll}>Save all details</Button>
    </div>
  );
}

/* ---------------- documents ---------------- */

function DocumentsPanel({ provider, docs, onChanged, requested }:
  { provider: any; docs: any[]; onChanged: () => void; requested: string[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const required = docsFor(provider.provider_type);

  const upload = async (docKey: string, file: File) => {
    if (file.size > 10 * 1024 * 1024) { toast.error("File must be 10 MB or smaller"); return; }
    const okTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!okTypes.includes(file.type)) { toast.error("Please upload a JPG, PNG, WEBP or PDF"); return; }
    setBusy(docKey);
    const ext = file.name.split(".").pop() ?? "bin";
    const path = `${provider.user_id}/${docKey}-${Date.now()}.${ext}`;
    const { error: upErr } = await firestoreClient.storage.from("homecare-docs").upload(path, file, { upsert: false });
    if (upErr) { setBusy(null); toast.error(upErr.message); return; }
    const existing = docs.find((d) => d.doc_key === docKey);
    const { error } = existing
      ? await firestoreClient.from("homecare_documents").update({ file_path: path, mime_type: file.type, status: "pending", notes: null }).eq("id", existing.id)
      : await firestoreClient.from("homecare_documents").insert({ provider_id: provider.id, doc_key: docKey, file_path: path, mime_type: file.type });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Uploaded");
    onChanged();
  };

  const open = async (id: string) => {
    try {
      const { url } = await getHomecareDocumentUrl({ data: { documentId: id } });
      window.open(url, "_blank", "noopener");
    } catch (e: any) { toast.error(e?.message ?? "Could not open document"); }
  };

  const remove = async (doc: any) => {
    await firestoreClient.storage.from("homecare-docs").remove([doc.file_path]);
    const { error } = await firestoreClient.from("homecare_documents").delete().eq("id", doc.id);
    if (error) { toast.error(error.message); return; }
    onChanged();
  };

  return (
    <div className="healthcare-card p-5 space-y-3">
      <p className="text-sm text-muted-foreground">
        Every file is stored privately. Only you and an administrator can open it, through a short-lived link.
      </p>
      {required.map((r) => {
        const doc = docs.find((d) => d.doc_key === r.key);
        const isRequested = requested.includes(r.label) || requested.includes(r.key);
        return (
          <div key={r.key} className={`rounded-xl border p-3 ${isRequested ? "border-destructive/50" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold flex items-center gap-2">
                  {doc ? <CheckCircle2 className="h-4 w-4 text-healthcare-green" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}
                  {r.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {doc ? `Uploaded · ${doc.status}${doc.notes ? ` · ${doc.notes}` : ""}` : isRequested ? "Requested by admin" : "Not uploaded"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {doc && <Button variant="outline" size="sm" onClick={() => open(doc.id)}>View</Button>}
                {doc && <Button variant="ghost" size="icon" onClick={() => remove(doc)} aria-label="Remove"><Trash2 className="h-4 w-4" /></Button>}
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium">
                  {busy === r.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                  {doc ? "Replace" : "Upload"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(r.key, f); e.currentTarget.value = ""; }}
                  />
                </label>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- staff ---------------- */

function StaffPanel({ provider, staff, onChanged }: { provider: any; staff: any[]; onChanged: () => void }) {
  const [full_name, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [job_title, setJobTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!full_name.trim() || !email.trim()) { toast.error("Name and email are required"); return; }
    setSaving(true);
    const { error } = await firestoreClient.from("homecare_staff").insert({
      company_id: provider.id, full_name: full_name.trim(), email: email.trim().toLowerCase(),
      phone: phone || null, job_title: job_title || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setFullName(""); setEmail(""); setPhone(""); setJobTitle("");
    toast.success("Staff member added. Ask them to sign up with this email address.");
    onChanged();
  };

  const toggle = async (row: any) => {
    const { error } = await firestoreClient.from("homecare_staff").update({ is_active: !row.is_active }).eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    onChanged();
  };

  const remove = async (row: any) => {
    const { error } = await firestoreClient.from("homecare_staff").delete().eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    onChanged();
  };

  return (
    <div className="space-y-4">
      <div className="healthcare-card p-5 space-y-3">
        <p className="font-semibold text-sm">Invite a staff member</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2"><Label>Full name</Label><Input value={full_name} onChange={(e) => setFullName(e.target.value)} /></div>
          <div className="space-y-2"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-2"><Label>Phone</Label><Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="space-y-2"><Label>Job title</Label><Input value={job_title} onChange={(e) => setJobTitle(e.target.value)} /></div>
        </div>
        <Button onClick={add} disabled={saving}>{saving ? "Adding…" : "Add staff member"}</Button>
        <p className="text-[11px] text-muted-foreground">
          Staff only ever see their own profile, their schedule and the visits assigned to them. They can never become administrators.
        </p>
      </div>

      <div className="healthcare-card p-5 space-y-2">
        <p className="font-semibold text-sm">Your staff ({staff.length})</p>
        {staff.length === 0 && <p className="text-sm text-muted-foreground">No staff yet.</p>}
        {staff.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
            <div>
              <p className="text-sm font-semibold">{s.full_name} {s.job_title && <span className="text-muted-foreground font-normal">· {s.job_title}</span>}</p>
              <p className="text-xs text-muted-foreground">{s.email}{s.phone ? ` · ${s.phone}` : ""}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={s.is_active ? "default" : "secondary"}>{s.is_active ? "Active" : "Inactive"}</Badge>
              <Button variant="outline" size="sm" onClick={() => toggle(s)}>{s.is_active ? "Deactivate" : "Activate"}</Button>
              <Button variant="ghost" size="icon" onClick={() => remove(s)} aria-label="Remove"><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- assignments ---------------- */

function kmBetween(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

/** Suburb-level location, used before the provider accepts the job. */
function suburbOf(address?: string | null) {
  if (!address) return "Location shared once accepted";
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join(", ") : parts[0];
}

function AssignmentsPanel({ assignments, provider, onChanged }: { assignments: any[]; provider: any; onChanged: () => void }) {
  const update = async (row: any, patch: Record<string, unknown>) => {
    const { error } = await firestoreClient.from("homecare_assignments").update(patch as never).eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    onChanged();
  };

  if (assignments.length === 0) {
    return <div className="healthcare-card p-6 text-center text-sm text-muted-foreground">No assignments yet. An administrator assigns customer visits to you.</div>;
  }

  return (
    <div className="space-y-3">
      {assignments.map((a) => {
        const r = a.homecare_requests;
        const pending = a.status === "offered";
        const when = a.scheduled_at ?? r?.preferred_at ?? null;
        const travelKm = provider?.latitude != null && provider?.longitude != null && r?.latitude != null && r?.longitude != null
          ? kmBetween(Number(provider.latitude), Number(provider.longitude), Number(r.latitude), Number(r.longitude))
          : null;
        const charge = a.amount == null ? null : Number(a.amount);
        const fee = charge == null ? null : Math.round(charge * PLATFORM_RULES.PLATFORM_FEE_PCT * 100) / 100;
        const earnings = charge == null || fee == null ? null : Math.round((charge - fee) * 100) / 100;
        return (
          <div key={a.id} className="healthcare-card p-4 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{r?.service_type ?? "Home care visit"}</p>
                <p className="text-xs text-muted-foreground">{pending ? suburbOf(r?.address) : r?.address}</p>
                {r?.preferred_at && <p className="text-xs text-muted-foreground">Preferred: {new Date(r.preferred_at).toLocaleString()}</p>}
                {a.scheduled_at && <p className="text-xs text-muted-foreground">Scheduled: {new Date(a.scheduled_at).toLocaleString()}</p>}
              </div>
              <Badge variant={a.status === "confirmed" ? "default" : "secondary"}>{ASSIGNMENT_LABEL[a.status] ?? a.status}</Badge>
            </div>

            <div className="grid gap-x-4 gap-y-1 rounded-xl border p-3 text-xs sm:grid-cols-2">
              <p><span className="text-muted-foreground">Service: </span><span className="font-semibold">{r?.service_type ?? "—"}</span></p>
              <p><span className="text-muted-foreground">Area: </span><span className="font-semibold">{suburbOf(r?.address)}</span></p>
              <p><span className="text-muted-foreground">Date: </span><span className="font-semibold">{when ? new Date(when).toLocaleDateString() : "To be confirmed"}</span></p>
              <p><span className="text-muted-foreground">Time: </span><span className="font-semibold">{when ? new Date(when).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "To be confirmed"}</span></p>
              <p><span className="text-muted-foreground">Expected duration: </span><span className="font-semibold">{r?.duration_hours ? `${r.duration_hours} hour(s)` : "Not given"}</span></p>
              <p><span className="text-muted-foreground">Travel distance: </span><span className="font-semibold">{travelKm != null ? `≈ ${travelKm} km` : "Unknown"}</span></p>
              <p><span className="text-muted-foreground">Customer charge: </span><span className="font-semibold">{charge != null ? `R ${charge.toFixed(2)}` : "To be confirmed"}</span></p>
              <p><span className="text-muted-foreground">Service fee ({Math.round(PLATFORM_RULES.PLATFORM_FEE_PCT * 100)}%): </span><span className="font-semibold">{fee != null ? `R ${fee.toFixed(2)}` : "—"}</span></p>
              <p className="sm:col-span-2"><span className="text-muted-foreground">Your earnings: </span><span className="font-bold">{earnings != null ? `R ${earnings.toFixed(2)}` : "To be confirmed"}</span></p>
            </div>

            {r?.description && <p className="text-sm">{r.description}</p>}
            <div className="flex flex-wrap gap-2">
              {a.status === "offered" && (
                <>
                  <Button size="sm" onClick={() => update(a, { status: "accepted", accepted_at: new Date().toISOString() })}>Accept</Button>
                  <Button size="sm" variant="outline" onClick={() => update(a, { status: "declined", declined_reason: "Declined by provider" })}>Decline</Button>
                </>
              )}
              {a.status === "accepted" && (
                <Button size="sm" onClick={() => update(a, { status: "scheduled" })}>Confirm schedule</Button>
              )}
              {a.status === "scheduled" && (
                <Button size="sm" onClick={() => update(a, { status: "in_progress" })}>Start visit</Button>
              )}
              {a.status === "in_progress" && (
                <Button size="sm" onClick={() => update(a, { status: "completed", completed_at: new Date().toISOString() })}>Mark completed</Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
