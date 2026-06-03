import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, CalendarCheck, DoorOpen, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { PHARMACY_SERVICES } from "@/lib/services";
import { useServerFn } from "@tanstack/react-start";
import { normalizeServices } from "@/lib/normalize-services.functions";

export function PharmacyBookingSettings() {
  const { user } = useAuth();
  const normalize = useServerFn(normalizeServices);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [apptsOn, setApptsOn] = useState(true);
  const [walkinsOn, setWalkinsOn] = useState(true);
  const [services, setServices] = useState<string[]>([]);
  const [hours, setHours] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("appointments_enabled, walkins_enabled, services, opening_hours, services_description, services_tags")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setApptsOn(data.appointments_enabled ?? true);
        setWalkinsOn(data.walkins_enabled ?? true);
        setServices((data.services as string[]) ?? []);
        setHours(data.opening_hours ?? "");
        setDescription(data.services_description ?? "");
        setTags((data.services_tags as string[]) ?? []);
      }
      setLoading(false);
    })();
  }, [user]);

  const toggleService = (s: string) => {
    setServices((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const runNormalize = async () => {
    if (description.trim().length < 10) {
      toast.error("Add a longer description first so the AI has something to work with");
      return;
    }
    setAiBusy(true);
    try {
      const r = await normalize({ data: { text: description.trim(), kind: "pharmacy" } });
      const merged = Array.from(new Set([...services, ...r.services]));
      setServices(merged);
      const mergedTags = Array.from(new Set([...tags, ...r.subspecialties, ...r.keywords]));
      setTags(mergedTags.slice(0, 60));
      toast.success(`AI added ${r.services.length} services + ${r.keywords.length + r.subspecialties.length} keywords`);
    } catch (e: any) {
      toast.error(e?.message ?? "AI normalize failed");
    } finally {
      setAiBusy(false);
    }
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        appointments_enabled: apptsOn,
        walkins_enabled: walkinsOn,
        services,
        opening_hours: hours.slice(0, 500),
        services_description: description.slice(0, 8000),
        services_tags: tags,
      })
      .eq("user_id", user.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Booking settings saved");
  };

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="healthcare-card p-5 space-y-4">
        <h3 className="text-base font-bold">How patients can reach you</h3>

        <div className="flex items-start gap-3 p-3 rounded-xl border border-border">
          <CalendarCheck className="h-5 w-5 mt-0.5 text-primary" />
          <div className="flex-1">
            <Label className="font-semibold">Accept appointments</Label>
            <p className="text-xs text-muted-foreground">Patients can request a date & time on your public page.</p>
          </div>
          <Switch checked={apptsOn} onCheckedChange={setApptsOn} />
        </div>

        <div className="flex items-start gap-3 p-3 rounded-xl border border-border">
          <DoorOpen className="h-5 w-5 mt-0.5 text-primary" />
          <div className="flex-1">
            <Label className="font-semibold">Allow walk-ins</Label>
            <p className="text-xs text-muted-foreground">Show your address & hours so patients can drop in.</p>
          </div>
          <Switch checked={walkinsOn} onCheckedChange={setWalkinsOn} />
        </div>

        <div>
          <Label htmlFor="hours">Opening hours</Label>
          <Textarea id="hours" rows={2} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Mon–Fri 08:00–18:00, Sat 09:00–13:00" />
        </div>
      </div>

      <div className="healthcare-card p-5 space-y-3">
        <div>
          <h3 className="text-base font-bold">Services offered</h3>
          <p className="text-xs text-muted-foreground">Pick the common ones below, then describe anything else in plain English. AI will turn it into search tags.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {PHARMACY_SERVICES.map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => toggleService(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${services.includes(s) ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-accent"}`}
            >{s}</button>
          ))}
        </div>

        <div className="pt-2">
          <Label htmlFor="desc">Describe everything else you offer (as long as you like)</Label>
          <Textarea
            id="desc" rows={5} value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="E.g. We do diabetic foot checks, anti-malarial travel kits, weight-loss coaching, asthma pump training, baby clinic on Tuesdays, INR monitoring for blood-thinner patients…"
            maxLength={8000}
          />
          <div className="mt-2 flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={runNormalize} disabled={aiBusy}>
              {aiBusy ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Analysing…</> : <><Sparkles className="h-3 w-3 mr-1" /> Build search tags</>}
            </Button>
            <span className="text-[11px] text-muted-foreground">{description.length}/8000</span>
          </div>
          {tags.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] uppercase font-bold text-muted-foreground mb-1">Search tags ({tags.length})</p>
              <div className="flex flex-wrap gap-1">
                {tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-[11px]">
                    {t}
                    <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`Remove ${t}`}><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Button onClick={save} disabled={saving}>
        {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving…</> : <><Save className="h-4 w-4 mr-1" /> Save</>}
      </Button>
    </div>
  );
}
