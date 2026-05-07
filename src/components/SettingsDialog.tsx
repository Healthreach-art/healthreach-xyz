import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Loader2, Trash2, Upload, ShieldCheck, Bell, User as UserIcon, Plus, Check } from "lucide-react";

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
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="profile"><UserIcon className="h-3.5 w-3.5 mr-1" />Profile</TabsTrigger>
            <TabsTrigger value="notifications"><Bell className="h-3.5 w-3.5 mr-1" />Alerts</TabsTrigger>
            <TabsTrigger value="security"><ShieldCheck className="h-3.5 w-3.5 mr-1" />Security</TabsTrigger>
          </TabsList>
          <TabsContent value="profile" className="pt-4"><ProfileTab userId={user?.id} initial={profile} /></TabsContent>
          <TabsContent value="notifications" className="pt-4"><NotificationsTab userId={user?.id} /></TabsContent>
          <TabsContent value="security" className="pt-4"><SecurityTab email={user?.email} /></TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ProfileTab({ userId, initial }: { userId?: string; initial: any }) {
  const [fullName, setFullName] = useState(initial?.full_name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initial?.avatar_url ?? null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Addresses
  const [addresses, setAddresses] = useState<any[]>([]);
  const [newStreet, setNewStreet] = useState("");
  const [newLabel, setNewLabel] = useState("Home");
  const [adding, setAdding] = useState(false);
  const [legacyAddress, setLegacyAddress] = useState<string>("");

  useEffect(() => {
    if (!userId) return;
    supabase.from("profiles").select("full_name, phone, address, avatar_url").eq("user_id", userId).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setFullName(data.full_name ?? "");
        setPhone(data.phone ?? "");
        setAvatarUrl(data.avatar_url ?? null);
        setLegacyAddress(data.address ?? "");
      });
    loadAddresses();
  }, [userId]);

  async function loadAddresses() {
    if (!userId) return;
    const { data } = await supabase.from("user_addresses").select("*").eq("user_id", userId).order("is_default", { ascending: false }).order("created_at", { ascending: true });
    const list = data ?? [];
    setAddresses(list);
    // Migrate legacy single address: if profile.address exists but no rows, seed one.
    if (list.length === 0 && legacyAddress?.trim()) {
      const { data: ins } = await supabase.from("user_addresses").insert({ user_id: userId, label: "Home", street: legacyAddress, is_default: true }).select().single();
      if (ins) setAddresses([ins]);
    }
  }

  async function addAddress() {
    if (!userId || !newStreet.trim()) { toast.error("Enter a street address"); return; }
    setAdding(true);
    const isFirst = addresses.length === 0;
    const { data, error } = await supabase.from("user_addresses").insert({
      user_id: userId, label: newLabel || "Other", street: newStreet.trim(), is_default: isFirst,
    }).select().single();
    setAdding(false);
    if (error) { toast.error(error.message); return; }
    setNewStreet(""); setNewLabel("Home");
    if (isFirst) await supabase.from("profiles").update({ address: data.street }).eq("user_id", userId);
    await loadAddresses();
    toast.success("Address added");
  }

  async function setDefault(id: string, street: string) {
    if (!userId) return;
    await supabase.from("user_addresses").update({ is_default: true }).eq("id", id);
    await supabase.from("profiles").update({ address: street }).eq("user_id", userId);
    await loadAddresses();
    toast.success("Default address updated");
  }

  async function removeAddress(id: string) {
    await supabase.from("user_addresses").delete().eq("id", id);
    await loadAddresses();
  }

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
    const { error } = await supabase.from("profiles").update({ full_name: fullName, phone }).eq("user_id", userId);
    setSaving(false);
    if (error) toast.error(error.message); else toast.success("Profile saved");
  }

  return (
    <div className="space-y-5">
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
      <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save profile"}</Button>

      <div className="space-y-2 pt-2 border-t border-border">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Delivery addresses</Label>
          <span className="text-xs text-muted-foreground">Default address is used at checkout</span>
        </div>
        <div className="space-y-2">
          {addresses.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-md border border-border p-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {a.label} {a.is_default && <span className="ml-1 inline-flex items-center text-[10px] uppercase tracking-wide text-primary"><Check className="h-3 w-3 mr-0.5" />Default</span>}
                </p>
                <p className="text-xs text-muted-foreground truncate">{a.street}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!a.is_default && <Button size="sm" variant="ghost" onClick={() => setDefault(a.id, a.street)}>Use</Button>}
                <Button size="icon" variant="ghost" onClick={() => removeAddress(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </div>
          ))}
          {addresses.length === 0 && <p className="text-xs text-muted-foreground">No addresses yet. Add one below.</p>}
        </div>
        <div className="rounded-md border border-dashed border-border p-3 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <Input className="col-span-1" placeholder="Label (Home, Work...)" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
            <Input className="col-span-2" placeholder="Street, suburb, city" value={newStreet} onChange={(e) => setNewStreet(e.target.value)} />
          </div>
          <Button size="sm" onClick={addAddress} disabled={adding}><Plus className="h-3.5 w-3.5 mr-1" />Add address</Button>
        </div>
      </div>
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

function SecurityTab({ email }: { email?: string }) {
  const [pwd, setPwd] = useState(""); const [savingPwd, setSavingPwd] = useState(false);
  const [newEmail, setNewEmail] = useState(email ?? ""); const [savingEmail, setSavingEmail] = useState(false);

  useEffect(() => { if (email) setNewEmail(email); }, [email]);

  async function changePassword() {
    if (pwd.length < 8) { toast.error("Min 8 characters"); return; }
    setSavingPwd(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setSavingPwd(false);
    if (error) toast.error(error.message); else { toast.success("Password updated"); setPwd(""); }
  }
  async function changeEmail() {
    if (!newEmail || newEmail === email) { toast.error("Enter a new email"); return; }
    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    setSavingEmail(false);
    if (error) toast.error(error.message); else toast.success("Confirmation sent to new email");
  }
  async function signOutAll() {
    const { error } = await supabase.auth.signOut({ scope: "others" });
    if (error) toast.error(error.message); else toast.success("Other sessions signed out");
  }
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Email address</Label>
        <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
        <Button size="sm" onClick={changeEmail} disabled={savingEmail}>{savingEmail ? "Sending..." : "Update email"}</Button>
        <p className="text-xs text-muted-foreground">A confirmation link is sent to the new address.</p>
      </div>
      <div className="space-y-2 pt-2 border-t border-border">
        <Label>New password</Label>
        <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="At least 8 characters" />
        <Button size="sm" onClick={changePassword} disabled={savingPwd}>{savingPwd ? "Updating..." : "Change password"}</Button>
      </div>
      <Button variant="outline" size="sm" onClick={signOutAll}>Sign out other devices</Button>
    </div>
  );
}
