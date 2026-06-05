import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Star, Loader2 } from "lucide-react";
import { toast } from "sonner";

type PromptKind =
  | { source: "order"; orderId: string; pharmacyId: string | null; driverId: string | null; label: string }
  | { source: "doctor_appointment"; appointmentId: string; doctorId: string; label: string }
  | { source: "pharmacy_appointment"; appointmentId: string; pharmacyId: string; label: string };

interface Targets {
  pharmacy?: { id: string; name: string };
  driver?: { id: string; name: string };
  doctor?: { id: string; name: string };
}

const COMPLETED_ORDER = new Set(["delivered", "completed"]);
const COMPLETED_APPT = new Set(["completed", "fulfilled", "done"]);

/**
 * Auto-popup rating prompt for patients. Listens for order / appointment
 * status flips to completed/delivered and prompts a 1-5 star rating per
 * participant (pharmacy, driver, doctor).
 */
export function ServiceRatingPrompt() {
  const { user, role } = useAuth();
  const [prompt, setPrompt] = useState<PromptKind | null>(null);
  const [targets, setTargets] = useState<Targets>({});
  const [stars, setStars] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || role !== "patient") return;

    async function loadTargets(p: PromptKind) {
      setLoading(true);
      const t: Targets = {};
      const ids: { id: string; key: keyof Targets }[] = [];
      if (p.source === "order") {
        if (p.pharmacyId) ids.push({ id: p.pharmacyId, key: "pharmacy" });
        if (p.driverId) ids.push({ id: p.driverId, key: "driver" });
      } else if (p.source === "doctor_appointment") {
        ids.push({ id: p.doctorId, key: "doctor" });
      } else {
        ids.push({ id: p.pharmacyId, key: "pharmacy" });
      }
      if (ids.length) {
        const { data } = await supabase.from("profiles").select("user_id, full_name")
          .in("user_id", ids.map((i) => i.id));
        for (const { id, key } of ids) {
          const row = (data ?? []).find((d: any) => d.user_id === id);
          (t as any)[key] = { id, name: row?.full_name || (key === "doctor" ? "Doctor" : key === "driver" ? "Driver" : "Pharmacy") };
        }
      }

      setTargets(t);
      setLoading(false);
    }

    async function maybePrompt(p: PromptKind) {
      // Check if a rating already exists for any of the target types tied to this source.
      const orderId = p.source === "order" ? p.orderId : null;
      const appointmentId = p.source !== "order" ? (p as any).appointmentId : null;
      const q = supabase.from("ratings").select("target_type").eq("patient_id", user!.id);
      const { data: existing } = orderId
        ? await q.eq("order_id", orderId)
        : await q.eq("appointment_id", appointmentId);
      const rated = new Set((existing ?? []).map((r: any) => r.target_type));
      // If everything is already rated, skip.
      const needed = p.source === "order"
        ? ["pharmacy", "driver"]
        : p.source === "doctor_appointment" ? ["doctor"] : ["pharmacy"];
      const unrated = needed.filter((t) => !rated.has(t));
      if (unrated.length === 0) return;

      setPrompt(p);
      setStars({});
      setComments({});
      await loadTargets(p);
    }

    const channel = supabase
      .channel(`rating-prompt-${user.id}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `patient_id=eq.${user.id}` },
        (payload) => {
          const n: any = payload.new;
          const o: any = payload.old;
          if (n.status === o.status) return;
          if (!COMPLETED_ORDER.has(n.status)) return;
          // pull driver from deliveries
          supabase.from("deliveries").select("driver_id").eq("order_id", n.id).maybeSingle()
            .then(({ data }) => {
              maybePrompt({
                source: "order",
                orderId: n.id,
                pharmacyId: n.pharmacy_id ?? null,
                driverId: (data as any)?.driver_id ?? null,
                label: n.medication_name || "your order",
              });
            });
        })
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "doctor_appointments", filter: `patient_id=eq.${user.id}` },
        (payload) => {
          const n: any = payload.new;
          const o: any = payload.old;
          if (n.status === o.status) return;
          if (!COMPLETED_APPT.has(n.status)) return;
          maybePrompt({
            source: "doctor_appointment",
            appointmentId: n.id,
            doctorId: n.doctor_id,
            label: "your consultation",
          });
        })
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "pharmacy_appointments", filter: `patient_id=eq.${user.id}` },
        (payload) => {
          const n: any = payload.new;
          const o: any = payload.old;
          if (n.status === o.status) return;
          if (!COMPLETED_APPT.has(n.status)) return;
          maybePrompt({
            source: "pharmacy_appointment",
            appointmentId: n.id,
            pharmacyId: n.pharmacy_id,
            label: "your pharmacy visit",
          });
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, role]);

  async function submit() {
    if (!prompt || !user) return;
    const rows: any[] = [];
    for (const key of Object.keys(targets) as (keyof Targets)[]) {
      const t = targets[key];
      if (!t) continue;
      const s = stars[key];
      if (!s) continue;
      rows.push({
        patient_id: user.id,
        target_id: t.id,
        target_type: key,
        stars: s,
        comment: comments[key] ?? "",
        order_id: prompt.source === "order" ? prompt.orderId : null,
        appointment_id: prompt.source !== "order" ? (prompt as any).appointmentId : null,
        appointment_type: prompt.source === "doctor_appointment" ? "doctor"
          : prompt.source === "pharmacy_appointment" ? "pharmacy" : null,
      });
    }
    if (rows.length === 0) { setPrompt(null); return; }
    setSubmitting(true);
    const { error } = await supabase.from("ratings").insert(rows);
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Thanks for rating — your feedback was sent.");
    setPrompt(null);
  }

  if (!prompt) return null;
  const targetKeys = Object.keys(targets) as (keyof Targets)[];

  return (
    <Dialog open={!!prompt} onOpenChange={(o) => !o && setPrompt(null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rate {prompt.label}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            {targetKeys.map((key) => {
              const t = targets[key]!;
              const current = stars[key] ?? 0;
              return (
                <div key={key} className="rounded-lg border border-border p-3 space-y-2">
                  <p className="text-sm font-semibold capitalize">{key}: <span className="font-normal">{t.name}</span></p>
                  <div className="flex gap-1">
                    {[1,2,3,4,5].map((n) => (
                      <button key={n} type="button"
                        onClick={() => setStars((s) => ({ ...s, [key]: n }))}
                        className="p-1" aria-label={`${n} star`}>
                        <Star className={`h-7 w-7 ${n <= current ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                      </button>
                    ))}
                  </div>
                  <textarea
                    placeholder="Optional comment"
                    value={comments[key] ?? ""}
                    onChange={(e) => setComments((c) => ({ ...c, [key]: e.target.value }))}
                    rows={2} maxLength={500}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                  />
                </div>
              );
            })}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => setPrompt(null)}>Later</Button>
          <Button onClick={submit} disabled={submitting || targetKeys.every((k) => !stars[k])}>
            {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : "Submit rating"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
