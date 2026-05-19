import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useServerFn } from "@tanstack/react-start";
import { findPharmaciesForProblem } from "@/lib/ai-pharmacy.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sparkles, MapPin, Clock, CheckCircle2, Building2, Stethoscope, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/patient/appointments")({
  head: () => ({ meta: [{ title: "AI Pharmacist Finder — HEALTHREACH" }] }),
  component: () => (<RoleGuard allow="patient"><Page /></RoleGuard>),
});

interface Match { pharmacy_id: string; name: string; address: string; match_reason: string; confidence: number }
interface Appt {
  id: string; pharmacy_id: string; reason: string; preferred_at: string;
  status: string; mode: string; pharmacist_notes: string;
}

function Page() {
  const { user } = useAuth();
  const findFn = useServerFn(findPharmaciesForProblem);

  const [problem, setProblem] = useState("");
  const [finding, setFinding] = useState(false);
  const [summary, setSummary] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [phMap, setPhMap] = useState<Record<string, { name: string; address: string }>>({});

  // Booking dialog
  const [booking, setBooking] = useState<Match | null>(null);
  const [when, setWhen] = useState("");
  const [mode, setMode] = useState("in_person");
  const [busy, setBusy] = useState(false);

  async function loadAppts() {
    if (!user) return;
    const { data } = await supabase
      .from("pharmacy_appointments")
      .select("*")
      .eq("patient_id", user.id)
      .order("preferred_at", { ascending: false });
    const list = (data ?? []) as Appt[];
    setAppts(list);
    const ids = Array.from(new Set(list.map((a) => a.pharmacy_id)));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id, organization_name, address").in("user_id", ids);
      const m: Record<string, { name: string; address: string }> = {};
      (profs ?? []).forEach((p: any) => { m[p.user_id] = { name: p.organization_name || "Pharmacy", address: p.address || "" }; });
      setPhMap(m);
    }
  }
  useEffect(() => { loadAppts(); }, [user]);

  async function runFind() {
    if (problem.trim().length < 5) return toast.error("Please describe your problem first");
    setFinding(true); setMatches([]); setSummary("");
    try {
      const res = await findFn({ data: { problem: problem.trim() } });
      setSummary(res.summary); setMatches(res.matches);
      if (!res.matches.length) toast("No matching pharmacies yet.");
    } catch (e: any) {
      toast.error(e?.message || "Could not find pharmacies");
    } finally { setFinding(false); }
  }

  function openBooking(m: Match, prefill?: { reason?: string; mode?: string }) {
    setBooking(m);
    setWhen("");
    setMode(prefill?.mode || "in_person");
    if (prefill?.reason) setProblem(prefill.reason);
  }

  async function confirmBooking() {
    if (!user || !booking) return;
    if (!when) return toast.error("Pick a date & time");
    setBusy(true);
    const { error } = await supabase.from("pharmacy_appointments").insert({
      patient_id: user.id, pharmacy_id: booking.pharmacy_id,
      reason: problem.trim().slice(0, 1000), preferred_at: new Date(when).toISOString(),
      mode, status: "pending",
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Appointment requested at ${booking.name}`);
    setBooking(null);
    loadAppts();
  }

  async function cancel(id: string) {
    await supabase.from("pharmacy_appointments").update({ status: "cancelled" }).eq("id", id);
    toast.success("Appointment cancelled"); loadAppts();
  }

  function rebook(a: Appt) {
    const ph = phMap[a.pharmacy_id];
    openBooking({
      pharmacy_id: a.pharmacy_id,
      name: ph?.name || "Pharmacy",
      address: ph?.address || "",
      match_reason: "Previous visit",
      confidence: 100,
    }, { reason: a.reason, mode: a.mode });
  }

  return (
    <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Stethoscope className="h-6 w-6 text-primary" /> AI Pharmacist Finder
        </h1>
        <p className="text-sm text-muted-foreground">Describe your problem. Our AI matches you with pharmacists who can help.</p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-4 shadow-sm">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1"><Sparkles className="h-4 w-4 text-primary" /> What's bothering you?</Label>
          <Textarea rows={4} placeholder="e.g. I've had a sore throat and fever for 3 days, and need advice on what to take…" value={problem} onChange={(e) => setProblem(e.target.value)} />
        </div>
        <Button onClick={runFind} disabled={finding} className="bg-primary text-primary-foreground">
          {finding ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Finding pharmacists…</>) : (<><Sparkles className="h-4 w-4 mr-2" />Find pharmacists with AI</>)}
        </Button>

        {summary && (
          <div className="rounded-xl bg-primary/5 border border-primary/15 p-3 text-sm text-foreground">{summary}</div>
        )}

        {matches.length > 0 && (
          <div className="space-y-2 pt-1">
            {matches.map((m) => (
              <div key={m.pharmacy_id} className="rounded-xl border border-border p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="h-11 w-11 rounded-xl bg-healthcare-mint/30 flex items-center justify-center shrink-0">
                  <Building2 className="h-6 w-6 text-healthcare-teal" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-foreground">{m.name}</p>
                  {m.address && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3" />{m.address}</p>}
                  <p className="text-xs text-foreground/80 mt-1">{m.match_reason}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-healthcare-green/15 text-healthcare-green">{m.confidence}% match</span>
                  <Button size="sm" onClick={() => openBooking(m)}>Book</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-bold text-foreground">Your appointments</h2>
        {appts.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            No appointments yet.
          </div>
        )}
        {appts.map((a) => {
          const ph = phMap[a.pharmacy_id];
          return (
            <div key={a.id} className="rounded-2xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-foreground truncate">{ph?.name ?? "Pharmacy"}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Clock className="h-3 w-3" /> {new Date(a.preferred_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}
                  <span className="mx-1">•</span>{a.mode === "in_person" ? "In-person" : a.mode === "phone" ? "Phone" : "Video"}
                </p>
                {a.reason && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.reason}</p>}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                  a.status === "confirmed" ? "bg-healthcare-green/15 text-healthcare-green" :
                  a.status === "cancelled" ? "bg-destructive/15 text-destructive" :
                  "bg-healthcare-sky/15 text-healthcare-sky"
                }`}>
                  {a.status === "confirmed" && <CheckCircle2 className="h-3 w-3 inline mr-1" />}{a.status}
                </span>
                <Button size="sm" variant="outline" onClick={() => rebook(a)}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Rebook
                </Button>
                {a.status === "pending" && (
                  <Button size="sm" variant="ghost" onClick={() => cancel(a.id)}>Cancel</Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!booking} onOpenChange={(o) => !o && setBooking(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /> Book at {booking?.name}</DialogTitle>
            <DialogDescription>{booking?.address}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Preferred date & time</Label><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></div>
            <div>
              <Label>Appointment type</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_person">In-person</SelectItem>
                  <SelectItem value="phone">Phone consultation</SelectItem>
                  <SelectItem value="video">Video consultation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Reason</Label><Textarea rows={3} value={problem} onChange={(e) => setProblem(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button onClick={confirmBooking} disabled={busy}>{busy ? "Booking…" : "Confirm booking"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
