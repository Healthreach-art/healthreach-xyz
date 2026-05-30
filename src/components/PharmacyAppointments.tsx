import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Calendar, User, CheckCircle2, XCircle, Phone, Video, MapPin } from "lucide-react";
import { toast } from "sonner";

interface Appt {
  id: string;
  patient_id: string;
  reason: string;
  preferred_at: string;
  status: string;
  mode: string;
  pharmacist_notes: string | null;
  created_at: string;
}

type Filter = "pending" | "confirmed" | "completed" | "cancelled" | "all";

export function PharmacyAppointments() {
  const { user } = useAuth();
  const [appts, setAppts] = useState<Appt[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("pending");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [patients, setPatients] = useState<Record<string, { name: string; phone: string }>>({});

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("pharmacy_appointments")
      .select("*")
      .eq("pharmacy_id", user.id)
      .order("preferred_at", { ascending: false });
    const rows = (data ?? []) as Appt[];
    setAppts(rows);
    const pids = Array.from(new Set(rows.map((a) => a.patient_id)));
    if (pids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, full_name, phone")
        .in("user_id", pids);
      const map: Record<string, { name: string; phone: string }> = {};
      (profs ?? []).forEach((p: any) => { map[p.user_id] = { name: p.full_name || "Patient", phone: p.phone || "" }; });
      setPatients(map);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    if (!user) return;
    const ch = supabase
      .channel(`pharmacy-appts-${user.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "pharmacy_appointments", filter: `pharmacy_id=eq.${user.id}` },
        () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function setStatus(a: Appt, status: "confirmed" | "cancelled" | "completed") {
    setSavingId(a.id);
    const { error } = await supabase
      .from("pharmacy_appointments")
      .update({
        status,
        pharmacist_notes: notes[a.id] ?? a.pharmacist_notes ?? "",
      })
      .eq("id", a.id);
    setSavingId(null);
    if (error) { toast.error(error.message); return; }
    toast.success(
      status === "confirmed" ? "Appointment confirmed" :
      status === "cancelled" ? "Appointment cancelled" :
      "Marked as completed",
    );
  }

  const counts = {
    pending: appts.filter((a) => a.status === "pending").length,
    confirmed: appts.filter((a) => a.status === "confirmed").length,
    completed: appts.filter((a) => a.status === "completed").length,
    cancelled: appts.filter((a) => a.status === "cancelled").length,
    all: appts.length,
  };
  const visible = filter === "all" ? appts : appts.filter((a) => a.status === filter);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["pending", "confirmed", "completed", "cancelled", "all"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-semibold border transition ${
              filter === f
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            {f[0].toUpperCase() + f.slice(1)} · {counts[f]}
          </button>
        ))}
      </div>

      {visible.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          <Calendar className="mx-auto mb-2 h-6 w-6 opacity-50" />
          No {filter === "all" ? "" : filter} appointments.
        </div>
      )}

      <div className="space-y-3">
        {visible.map((a) => {
          const p = patients[a.patient_id];
          const when = new Date(a.preferred_at);
          const ModeIcon = a.mode === "video" ? Video : a.mode === "phone" ? Phone : MapPin;
          return (
            <div key={a.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-foreground truncate">{p?.name || "Patient"}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Calendar className="h-3 w-3" />
                    {when.toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}
                    <span className="mx-1">·</span>
                    <ModeIcon className="h-3 w-3" />
                    {a.mode === "in_person" ? "In-person" : a.mode === "phone" ? "Phone" : "Video"}
                  </p>
                  {p?.phone && a.status === "confirmed" && (
                    <a href={`tel:${p.phone}`} className="text-xs text-primary hover:underline mt-0.5 inline-block">
                      Call {p.phone}
                    </a>
                  )}
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${
                  a.status === "confirmed" ? "bg-healthcare-green/15 text-healthcare-green" :
                  a.status === "cancelled" ? "bg-destructive/15 text-destructive" :
                  a.status === "completed" ? "bg-muted text-muted-foreground" :
                  "bg-healthcare-sky/15 text-healthcare-sky"
                }`}>
                  {a.status}
                </span>
              </div>

              {a.reason && (
                <div className="rounded-lg bg-muted/40 p-3 text-sm text-foreground">
                  <span className="text-xs font-semibold text-muted-foreground block mb-1">Reason</span>
                  {a.reason}
                </div>
              )}

              {(a.status === "pending" || a.status === "confirmed") && (
                <div className="space-y-2">
                  <Textarea
                    rows={2}
                    placeholder="Pharmacist notes (optional, visible to patient)"
                    value={notes[a.id] ?? a.pharmacist_notes ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [a.id]: e.target.value }))}
                  />
                  <div className="flex flex-wrap gap-2">
                    {a.status === "pending" && (
                      <Button size="sm" disabled={savingId === a.id} onClick={() => setStatus(a, "confirmed")}>
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Confirm
                      </Button>
                    )}
                    {a.status === "confirmed" && (
                      <Button size="sm" variant="outline" disabled={savingId === a.id} onClick={() => setStatus(a, "completed")}>
                        Mark completed
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" disabled={savingId === a.id} onClick={() => setStatus(a, "cancelled")}>
                      <XCircle className="h-4 w-4 mr-1" /> Decline
                    </Button>
                  </div>
                </div>
              )}

              {a.pharmacist_notes && a.status !== "pending" && a.status !== "confirmed" && (
                <div className="text-xs text-muted-foreground border-t border-border pt-2">
                  <span className="font-semibold">Notes:</span> {a.pharmacist_notes}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
