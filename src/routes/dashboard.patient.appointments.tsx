import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarCheck, MapPin, Clock, CheckCircle2, Building2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/patient/appointments")({
  head: () => ({ meta: [{ title: "Book Appointment — HEALTHREACH" }] }),
  component: () => (
    <RoleGuard allow="patient">
      <Page />
    </RoleGuard>
  ),
});

interface Pharmacy { user_id: string; organization_name: string; address: string }
interface Appt {
  id: string; pharmacy_id: string; reason: string; preferred_at: string;
  status: string; mode: string; pharmacist_notes: string;
}

function Page() {
  const { user } = useAuth();
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [pharmaciesById, setPharmaciesById] = useState<Record<string, Pharmacy>>({});
  const [appts, setAppts] = useState<Appt[]>([]);
  const [pharmacyId, setPharmacyId] = useState("");
  const [mode, setMode] = useState("in_person");
  const [reason, setReason] = useState("");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadPharmacies() {
    const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "pharmacy");
    const ids = (roles ?? []).map((r: any) => r.user_id);
    if (!ids.length) return;
    const { data } = await supabase
      .from("profiles")
      .select("user_id, organization_name, address, approval_status")
      .in("user_id", ids)
      .eq("approval_status", "approved");
    const list = ((data ?? []) as any[]).map((p) => ({
      user_id: p.user_id,
      organization_name: p.organization_name || "Pharmacy",
      address: p.address || "",
    }));
    setPharmacies(list);
    const map: Record<string, Pharmacy> = {};
    list.forEach((p) => (map[p.user_id] = p));
    setPharmaciesById(map);
  }
  async function loadAppts() {
    if (!user) return;
    const { data } = await supabase
      .from("pharmacy_appointments")
      .select("*")
      .eq("patient_id", user.id)
      .order("preferred_at", { ascending: false });
    setAppts((data ?? []) as Appt[]);
  }
  useEffect(() => { loadPharmacies(); loadAppts(); }, [user]);

  async function book() {
    if (!user) return;
    if (!pharmacyId) return toast.error("Choose a pharmacy");
    if (!when) return toast.error("Choose a date & time");
    setBusy(true);
    const { error } = await supabase.from("pharmacy_appointments").insert({
      patient_id: user.id,
      pharmacy_id: pharmacyId,
      reason: reason.trim(),
      preferred_at: new Date(when).toISOString(),
      mode,
      status: "pending",
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Appointment requested");
    setReason(""); setWhen(""); setPharmacyId("");
    loadAppts();
  }

  async function cancel(id: string) {
    await supabase.from("pharmacy_appointments").update({ status: "cancelled" }).eq("id", id);
    toast.success("Appointment cancelled");
    loadAppts();
  }

  return (
    <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <CalendarCheck className="h-6 w-6 text-primary" /> Book an Appointment with a Pharmacist
        </h1>
        <p className="text-sm text-muted-foreground">Choose a pharmacy, pick a time, and we'll confirm by message.</p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-4 shadow-sm">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Pharmacy</Label>
            <Select value={pharmacyId} onValueChange={setPharmacyId}>
              <SelectTrigger><SelectValue placeholder="Select a pharmacy" /></SelectTrigger>
              <SelectContent>
                {pharmacies.map((p) => (
                  <SelectItem key={p.user_id} value={p.user_id}>
                    {p.organization_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {pharmacyId && pharmaciesById[pharmacyId]?.address && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {pharmaciesById[pharmacyId].address}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Preferred date & time</Label>
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Appointment type</Label>
          <Select value={mode} onValueChange={setMode}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="in_person">In-person at pharmacy</SelectItem>
              <SelectItem value="phone">Phone consultation</SelectItem>
              <SelectItem value="video">Video consultation</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Reason</Label>
          <Textarea
            rows={3}
            placeholder="e.g. Medication review, chronic script renewal, side-effect question…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <Button onClick={book} disabled={busy} className="bg-primary text-primary-foreground">
          {busy ? "Booking…" : "Request appointment"}
        </Button>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-bold text-foreground">Your appointments</h2>
        {appts.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            No appointments yet. Book your first one above.
          </div>
        )}
        {appts.map((a) => {
          const ph = pharmaciesById[a.pharmacy_id];
          return (
            <div key={a.id} className="rounded-2xl border border-border bg-card p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-foreground">{ph?.organization_name ?? "Pharmacy"}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Clock className="h-3 w-3" /> {new Date(a.preferred_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}
                  <span className="mx-1">•</span>
                  {a.mode === "in_person" ? "In-person" : a.mode === "phone" ? "Phone" : "Video"}
                </p>
                {a.reason && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.reason}</p>}
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                a.status === "confirmed" ? "bg-healthcare-green/15 text-healthcare-green" :
                a.status === "cancelled" ? "bg-destructive/15 text-destructive" :
                "bg-healthcare-sky/15 text-healthcare-sky"
              }`}>
                {a.status === "confirmed" && <CheckCircle2 className="h-3 w-3 inline mr-1" />}
                {a.status}
              </span>
              {a.status === "pending" && (
                <Button size="sm" variant="outline" onClick={() => cancel(a.id)}>Cancel</Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
