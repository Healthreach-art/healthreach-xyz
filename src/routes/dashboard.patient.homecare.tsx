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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AddressPicker, type PickedAddress } from "@/components/AddressPicker";
import { toast } from "sonner";
import { ArrowLeft,  HomeIcon, Loader2 } from "lucide-react";
import { HOMECARE_SERVICES, REQUEST_LABEL, ASSIGNMENT_LABEL } from "@/lib/homecare";
import { PatientAddressHeader } from "@/components/PatientAddressHeader";
import { PATIENT_ADDRESS_CHANGED, readPatientAddress, type PatientAddress } from "@/lib/patient-address";

interface HomecareProvider {
  id: string;
  provider_type: string | null;
  business_name: string | null;
  full_name: string | null;
  address: string | null;
  services: string[] | null;
  service_areas: string[] | null;
  hourly_rate: number | null;
}
interface HomecareAssignment {
  id: string;
  created_at: string;
  scheduled_at: string | null;
  status: string;
  homecare_staff: { full_name: string | null; job_title: string | null } | null;
}
interface HomecareRequest {
  id: string;
  service_type: string;
  description: string | null;
  address: string;
  preferred_at: string | null;
  status: string;
  homecare_assignments: HomecareAssignment[];
  homecare_providers: HomecareProvider & { phone: string | null; approval_status: string | null } | null;
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
  const [requests, setRequests] = useState<HomecareRequest[]>([]);
  const [providers, setProviders] = useState<HomecareProvider[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
  const [serviceType, setServiceType] = useState<string>(HOMECARE_SERVICES[0]);
  const [description, setDescription] = useState("");
  const [preferredAt, setPreferredAt] = useState("");
  const [hours, setHours] = useState("4");
  const [address, setAddress] = useState<PickedAddress | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await firestoreClient
      .from("homecare_requests")
      .select("*, homecare_assignments(*, homecare_staff(full_name, job_title)), homecare_providers(business_name, full_name, phone, provider_type, approval_status)")
      .eq("patient_id", user.id).order("created_at", { ascending: false });
      setRequests((data ?? []) as unknown as HomecareRequest[]);
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
    let cancelled = false;
    firestoreClient.from("homecare_providers")
      .select("id, provider_type, business_name, full_name, address, services, service_areas, hourly_rate")
      .eq("approval_status", "approved").eq("is_active", true).limit(60)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { toast.error(`Could not load home care providers: ${error.message}`); return; }
        setProviders(data ?? []);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const ch = firestoreClient.channel(`hc-patient-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "homecare_requests", filter: `patient_id=eq.${user.id}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "homecare_assignments" }, () => void load())
      .subscribe();
    return () => { firestoreClient.removeChannel(ch); };
  }, [user?.id, load]);

  const submit = async () => {
    const addr = address ?? (profile?.address ? { address: profile.address } as PickedAddress : null);
    if (!addr?.address) { toast.error("Please give the address for the visit"); return; }
    setSaving(true);
    const { data: created, error } = await firestoreClient.from("homecare_requests").insert({
      patient_id: user!.id,
      service_type: serviceType,
      description,
      address: addr.address,
      latitude: addr.lat ?? null,
      longitude: addr.lng ?? null,
      preferred_at: preferredAt ? new Date(preferredAt).toISOString() : null,
      duration_hours: hours ? Number(hours) : null,
    }).select("id").single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    if (created?.id) {
      void import("@/lib/firestore-sync").then(({ mirrorRecord }) =>
        mirrorRecord("homecare_requests", created.id, {
          service: serviceType, description, address: addr.address,
          lat: addr.lat ?? null, lng: addr.lng ?? null,
          scheduledAt: preferredAt ? new Date(preferredAt).toISOString() : null,
          durationHours: hours ? Number(hours) : null, status: "requested",
        }),
      );
    }
    setDescription(""); setPreferredAt("");
    toast.success("Request sent. An administrator will review it and assign a provider.");
    load();
  };

  const confirmVisit = async (assignmentId: string) => {
    const { error } = await firestoreClient.from("homecare_assignments")
      .update({ status: "confirmed", patient_confirmed_at: new Date().toISOString() }).eq("id", assignmentId);
    if (error) { toast.error(error.message); return; }
    toast.success("Thank you — visit confirmed");
    load();
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
        <p className="text-sm text-muted-foreground">Request a verified nurse, caregiver, or home-care visit. Every request is reviewed before a provider is assigned.</p>
      </div>

      <section className="space-y-3" aria-labelledby="homecare-providers-title">
        <h2 id="homecare-providers-title" className="text-lg font-semibold">Available home care providers</h2>
        {providers.length === 0 ? <p className="text-sm text-muted-foreground">No verified home care providers are currently listed in your area.</p> : (
          <div className="grid gap-3 sm:grid-cols-2">
            {providers.map((provider) => (
              <article key={provider.id} className="healthcare-card p-4">
                <p className="font-semibold">{provider.provider_type === "individual" ? provider.full_name || provider.business_name : provider.business_name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{provider.provider_type === "individual" ? "Individual caregiver" : "Home care company"}{provider.address ? ` · ${provider.address}` : ""}</p>
                {(provider.services ?? []).length > 0 && <p className="mt-2 text-sm">{(provider.services ?? []).join(", ")}</p>}
                {(provider.service_areas ?? []).length > 0 && <p className="mt-1 text-xs text-muted-foreground">Areas: {(provider.service_areas ?? []).join(", ")}</p>}
                {provider.hourly_rate != null && <p className="mt-2 text-sm font-semibold">R{Number(provider.hourly_rate).toFixed(2)}/hr</p>}
                <Badge className="mt-3">Verified &amp; active</Badge>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="healthcare-card p-5 space-y-4">
        <p className="font-semibold text-sm">New request</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Service needed</Label>
            <Select value={serviceType} onValueChange={setServiceType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {HOMECARE_SERVICES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="preferred">Preferred date & time</Label>
            <Input id="preferred" type="datetime-local" value={preferredAt} onChange={(e) => setPreferredAt(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hours">Hours needed</Label>
            <Input id="hours" type="number" min="1" max="24" value={hours} onChange={(e) => setHours(e.target.value)} />
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
          const latest = (r.homecare_assignments ?? []).slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
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
              {r.homecare_providers && (
                <div className="rounded-xl border p-3 space-y-1 text-sm">
                  <p>
                    Provider: <span className="font-semibold">{r.homecare_providers.business_name || r.homecare_providers.full_name}</span>
                    <span className="text-muted-foreground">
                      {" "}· {r.homecare_providers.provider_type === "individual" ? "Individual carer" : "Home care company"}
                    </span>
                  </p>
                  <p className="text-xs">
                    Verification:{" "}
                    <span className={r.homecare_providers.approval_status === "approved" ? "font-semibold text-healthcare-green" : "font-semibold"}>
                      {r.homecare_providers.approval_status === "approved" ? "Approved by HealthReachCare" : (r.homecare_providers.approval_status ?? "Pending review")}
                    </span>
                  </p>
                  {latest?.homecare_staff?.full_name && (
                    <p className="text-xs">
                      Caregiver: <span className="font-semibold">{latest.homecare_staff.full_name}</span>
                      {latest.homecare_staff.job_title ? ` · ${latest.homecare_staff.job_title}` : ""}
                    </p>
                  )}
                  {r.homecare_providers.phone && <p className="text-xs text-muted-foreground">Contact: {r.homecare_providers.phone}</p>}
                  <p className="text-xs text-muted-foreground">Service: {r.service_type}</p>
                  <p className="text-xs text-muted-foreground">
                    Scheduled: {latest?.scheduled_at ? new Date(latest.scheduled_at).toLocaleString() : r.preferred_at ? `${new Date(r.preferred_at).toLocaleString()} (requested)` : "To be confirmed"}
                  </p>
                </div>
              )}
              {latest && <p className="text-xs text-muted-foreground">Visit status: {ASSIGNMENT_LABEL[latest.status] ?? latest.status}</p>}
              {latest?.status === "completed" && (
                <Button size="sm" onClick={() => confirmVisit(latest.id)}>Confirm the visit happened</Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
    </>
  );
}
