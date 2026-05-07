import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Loader2, Trash2, Upload, ShieldCheck, Bell, User as UserIcon, CreditCard } from "lucide-react";

interface Props { open: boolean; onClose: () => void; }

export function SettingsDialog({ open, onClose }: Props) {
  const { user, profile } = useAuth();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="profile" className="mt-2">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="profile"><UserIcon className="h-3.5 w-3.5 mr-1" />Profile</TabsTrigger>
            <TabsTrigger value="notifications"><Bell className="h-3.5 w-3.5 mr-1" />Alerts</TabsTrigger>
            <TabsTrigger value="payment"><CreditCard className="h-3.5 w-3.5 mr-1" />Payment</TabsTrigger>
            <TabsTrigger value="security"><ShieldCheck className="h-3.5 w-3.5 mr-1" />Security</TabsTrigger>
          </TabsList>
          <TabsContent value="profile" className="pt-4"><ProfileTab userId={user?.id} initial={profile} /></TabsContent>
          <TabsContent value="notifications" className="pt-4"><NotificationsTab userId={user?.id} /></TabsContent>
          <TabsContent value="payment" className="pt-4"><PaymentMethodsTab userId={user?.id} /></TabsContent>
          <TabsContent value="security" className="pt-4"><SecurityTab email={user?.email} /></TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ProfileTab({ userId, initial }: { userId?: string; initial: any }) {
  const [fullName, setFullName] = useState(initial?.full_name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initial?.avatar_url ?? null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    supabase.from("profiles").select("full_name, phone, address, avatar_url").eq("user_id", userId).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setFullName(data.full_name ?? "");
        setPhone(data.phone ?? "");
        setAddress(data.address ?? "");
        setAvatarUrl(data.avatar_url ?? null);
      });
  }, [userId]);

  async function handleAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setUploading(true);
    const path = `${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (upErr) { setUploading(false); toast.error(upErr.message); return; }
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    await supabase.from("profiles").update({ avatar_url: pub.publicUrl }).eq("user_id", userId);
    setAvatarUrl(pub.publicUrl);
    setUploading(false);
    toast.success("Profile picture updated");
  }

  async function save() {
    if (!userId) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ full_name: fullName, phone, address }).eq("user_id", userId);
    setSaving(false);
    if (error) toast.error(error.message); else toast.success("Profile saved");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16">
          {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
          <AvatarFallback>{(fullName || "U").slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <label className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm cursor-pointer hover:bg-accent">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          <span>{uploading ? "Uploading..." : "Change photo"}</span>
          <input type="file" accept="image/*" className="hidden" onChange={handleAvatar} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Full name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+27 ..." /></div>
      </div>
      <div className="space-y-1.5"><Label>Address</Label><Textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} /></div>
      <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button>
    </div>
  );
}

function NotificationsTab({ userId }: { userId?: string }) {
  const [prefs, setPrefs] = useState({ email_orders: true, email_promotions: false, sms_orders: true, push_orders: true });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!userId) return;
    supabase.from("notification_preferences").select("*").eq("user_id", userId).maybeSingle()
      .then(({ data }) => { if (data) setPrefs({ email_orders: data.email_orders, email_promotions: data.email_promotions, sms_orders: data.sms_orders, push_orders: data.push_orders }); setLoading(false); });
  }, [userId]);

  async function update(key: keyof typeof prefs, value: boolean) {
    if (!userId) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    await supabase.from("notification_preferences").upsert({ user_id: userId, ...next });
  }

  if (loading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  const rows: Array<[keyof typeof prefs, string, string]> = [
    ["email_orders", "Order updates (email)", "Status changes, delivery confirmations"],
    ["sms_orders", "Order updates (SMS)", "Text alerts when your order moves"],
    ["push_orders", "Push notifications", "Live updates in the app"],
    ["email_promotions", "Promotions & offers", "Discounts and seasonal updates"],
  ];
  return (
    <div className="space-y-4">
      {rows.map(([k, label, desc]) => (
        <div key={k} className="flex items-center justify-between rounded-lg border border-border p-3">
          <div><p className="text-sm font-medium">{label}</p><p className="text-xs text-muted-foreground">{desc}</p></div>
          <Switch checked={prefs[k]} onCheckedChange={(v) => update(k, v)} />
        </div>
      ))}
    </div>
  );
}

function PaymentMethodsTab({ userId }: { userId?: string }) {
  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [brand, setBrand] = useState("Visa"); const [last4, setLast4] = useState(""); const [exp, setExp] = useState("");
  useEffect(() => {
    if (!userId) return;
    supabase.from("saved_payment_methods").select("*").eq("user_id", userId).order("created_at", { ascending: false })
      .then(({ data }) => { setCards(data ?? []); setLoading(false); });
  }, [userId]);

  async function add() {
    if (!userId || last4.length !== 4 || !/^\d{2}\/\d{2}$/.test(exp)) { toast.error("Enter last 4 and MM/YY"); return; }
    const [m, y] = exp.split("/");
    setAdding(true);
    const { data, error } = await supabase.from("saved_payment_methods").insert({ user_id: userId, brand, last4, exp_month: parseInt(m), exp_year: 2000 + parseInt(y) }).select().single();
    setAdding(false);
    if (error) { toast.error(error.message); return; }
    setCards([data, ...cards]); setLast4(""); setExp(""); toast.success("Card saved");
  }
  async function remove(id: string) {
    await supabase.from("saved_payment_methods").delete().eq("id", id);
    setCards(cards.filter((c) => c.id !== id));
  }
  return (
    <div className="space-y-4">
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">No saved cards.</p>
      ) : cards.map((c) => (
        <div key={c.id} className="flex items-center justify-between rounded-lg border border-border p-3">
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-primary" />
            <div><p className="text-sm font-medium">{c.brand} •••• {c.last4}</p><p className="text-xs text-muted-foreground">Expires {String(c.exp_month).padStart(2, "0")}/{String(c.exp_year).slice(-2)}</p></div>
          </div>
          <Button size="icon" variant="ghost" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      ))}
      <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
        <p className="text-xs text-muted-foreground">Add a card (last 4 digits only — full numbers are tokenized at checkout).</p>
        <div className="grid grid-cols-3 gap-2">
          <select value={brand} onChange={(e) => setBrand(e.target.value)} className="rounded-md border border-input bg-background px-2 text-sm h-9">
            <option>Visa</option><option>Mastercard</option><option>Amex</option>
          </select>
          <Input placeholder="Last 4" maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))} />
          <Input placeholder="MM/YY" maxLength={5} value={exp} onChange={(e) => setExp(e.target.value)} />
        </div>
        <Button size="sm" onClick={add} disabled={adding}>Save card</Button>
      </div>
    </div>
  );
}

function SecurityTab({ email }: { email?: string }) {
  const [pwd, setPwd] = useState(""); const [saving, setSaving] = useState(false);
  async function changePassword() {
    if (pwd.length < 8) { toast.error("Min 8 characters"); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setSaving(false);
    if (error) toast.error(error.message); else { toast.success("Password updated"); setPwd(""); }
  }
  async function signOutAll() {
    const { error } = await supabase.auth.signOut({ scope: "others" });
    if (error) toast.error(error.message); else toast.success("Other sessions signed out");
  }
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border p-3">
        <p className="text-xs text-muted-foreground">Account email</p>
        <p className="text-sm font-medium">{email}</p>
      </div>
      <div className="space-y-2">
        <Label>New password</Label>
        <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="At least 8 characters" />
        <Button size="sm" onClick={changePassword} disabled={saving}>{saving ? "Updating..." : "Change password"}</Button>
      </div>
      <Button variant="outline" size="sm" onClick={signOutAll}>Sign out other devices</Button>
    </div>
  );
}
