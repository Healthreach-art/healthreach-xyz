import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Bell, Plus, Trash2, Pill, AlarmClock, Calendar as CalendarIcon, BellRing, CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import {
  useReminderNotifications,
  requestNotificationPermission,
  downloadReminderIcs,
} from "@/hooks/useReminderNotifications";

interface Reminder {
  id: string;
  medication_name: string;
  dosage: string;
  frequency: string;
  time_of_day: string | null;
  next_refill_date: string | null;
  days_supply: number | null;
  is_chronic: boolean;
  active: boolean;
}

const empty = {
  medication_name: "",
  dosage: "",
  frequency: "daily",
  time_of_day: "08:00",
  next_refill_date: "",
  days_supply: 30,
  is_chronic: false,
};

export function MedicationReminders() {
  const { user } = useAuth();
  const [items, setItems] = useState<Reminder[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...empty });
  const [saving, setSaving] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission>("default");

  useReminderNotifications();

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setPerm(Notification.permission);
  }, []);

  async function enableAlarms() {
    const result = await requestNotificationPermission();
    setPerm(result);
    if (result === "granted") {
      toast.success("Reminder alarms enabled on this device");
    } else if (result === "denied") {
      toast.error("Notifications blocked. Enable them in your browser settings, or use 'Add to calendar'.");
    }
  }

  async function load() {
    if (!user) return;
    const { data } = await supabase
      .from("medication_reminders")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setItems((data ?? []) as Reminder[]);
  }
  useEffect(() => { load(); }, [user]);

  async function save() {
    if (!user) return;
    if (!form.medication_name.trim()) { toast.error("Medication name required"); return; }
    setSaving(true);
    const { error } = await supabase.from("medication_reminders").insert({
      user_id: user.id,
      medication_name: form.medication_name.trim(),
      dosage: form.dosage.trim(),
      frequency: form.frequency,
      time_of_day: form.time_of_day || null,
      next_refill_date: form.next_refill_date || null,
      days_supply: Number(form.days_supply) || 30,
      is_chronic: form.is_chronic,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Reminder added");
    setOpen(false);
    setForm({ ...empty });
    load();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("medication_reminders").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Reminder removed"); load(); }
  }

  async function toggle(r: Reminder) {
    await supabase.from("medication_reminders").update({ active: !r.active }).eq("id", r.id);
    load();
  }

  function refillStatus(r: Reminder) {
    if (!r.next_refill_date) return null;
    const days = Math.ceil((new Date(r.next_refill_date).getTime() - Date.now()) / 86400000);
    if (days < 0) return { text: "Refill overdue", tone: "text-destructive" };
    if (days <= 3) return { text: `Refill in ${days}d`, tone: "text-destructive" };
    if (days <= 7) return { text: `Refill in ${days}d`, tone: "text-healthcare-sky" };
    return { text: `Refill in ${days}d`, tone: "text-muted-foreground" };
  }

  return (
    <div className="healthcare-card p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" /> Reminders & Refills
        </h2>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>

      {/* Alarm permission banner */}
      <div
        className={`mb-3 rounded-lg border p-3 text-xs flex items-start gap-2 ${
          perm === "granted"
            ? "border-healthcare-green/40 bg-healthcare-green/5 text-healthcare-green"
            : "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400"
        }`}
      >
        <BellRing className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          {perm === "granted" ? (
            <p>
              <strong>Device alarms enabled.</strong> You'll get a real notification at each dose time
              when this app is open or installed as a PWA. For alarms when the app is fully closed,
              tap "Add to calendar" on a reminder to use your phone's native alarm.
            </p>
          ) : perm === "denied" ? (
            <p>
              Notifications are blocked. Enable them in your browser settings, or use
              <strong> Add to calendar</strong> on a reminder to set a native phone/PC alarm.
            </p>
          ) : (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span>Enable device alarms so your phone/PC rings at each dose time.</span>
              <Button size="sm" className="h-7 text-xs" onClick={enableAlarms}>
                Enable alarms
              </Button>
            </div>
          )}
        </div>
      </div>


      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reminders yet. Add one to get refill alerts and dose nudges.</p>
      ) : (
        <div className="space-y-2">
          {items.map((r) => {
            const refill = refillStatus(r);
            return (
              <div key={r.id} className={`rounded-lg border p-3 ${r.active ? "border-border" : "border-dashed border-border/60 opacity-60"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Pill className="h-3.5 w-3.5 text-primary" />
                      <p className="text-sm font-medium truncate">{r.medication_name}</p>
                      {r.is_chronic && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-healthcare-mint/30 text-healthcare-green">chronic</span>}
                    </div>
                    {r.dosage && <p className="text-xs text-muted-foreground">{r.dosage}</p>}
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1"><AlarmClock className="h-3 w-3" /> {r.frequency}{r.time_of_day ? ` • ${r.time_of_day.slice(0,5)}` : ""}</span>
                      {refill && <span className={`flex items-center gap-1 ${refill.tone}`}><CalendarIcon className="h-3 w-3" /> {refill.text}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => toggle(r)}>
                      {r.active ? "Pause" : "Resume"}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => remove(r.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add reminder</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Medication name" value={form.medication_name} onChange={(e) => setForm({ ...form, medication_name: e.target.value })} />
            <Input placeholder="Dosage (e.g. 1 tablet)" value={form.dosage} onChange={(e) => setForm({ ...form, dosage: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
                <option value="daily">Daily</option>
                <option value="twice_daily">Twice daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              <Input type="time" value={form.time_of_day} onChange={(e) => setForm({ ...form, time_of_day: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Next refill date</label>
                <Input type="date" value={form.next_refill_date} onChange={(e) => setForm({ ...form, next_refill_date: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Days supply</label>
                <Input type="number" min={1} value={form.days_supply} onChange={(e) => setForm({ ...form, days_supply: Number(e.target.value) })} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_chronic} onChange={(e) => setForm({ ...form, is_chronic: e.target.checked })} />
              Chronic medication
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
