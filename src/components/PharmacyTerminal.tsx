import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle, Clock, Loader2, MapPin, MessageCircle, Phone, RefreshCw, Settings, Truck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { firestoreClient } from "@/lib/firestore-client";
import { groupAndHydrate, type GroupedOrder } from "@/lib/orderGroups";
import { dispatchOrderToNearbyDrivers } from "@/lib/driver-dispatch.functions";
import { Button } from "@/components/ui/button";
import { OrderChatDialog } from "@/components/OrderChatDialog";
import { PharmacyBottomNav, type PharmacyTab } from "@/components/PharmacyBottomNav";
import { PharmacyInventoryPanel } from "@/components/PharmacyInventoryPanel";
import { PharmacyBranchesManager } from "@/components/PharmacyBranchesManager";
import { PharmacyFinance } from "@/components/PharmacyFinance";
import { PharmacyReviewActions, PrescriptionStatusBadge, type PrescriptionUpload } from "@/components/PrescriptionVerification";
import { PharmacyOffersInbox } from "@/components/PharmacyOffersInbox";
import { SettingsDialog } from "@/components/SettingsDialog";
import { toast } from "sonner";
import { PrescriptionBadge } from "@/components/PrescriptionBadge";

interface Order {
  id: string;
  order_group_id: string | null;
  patient_id: string;
  medication_name: string;
  quantity: number;
  status: string;
  total_amount: number;
  created_at: string;
  prescription_upload_id?: string | null;
  delivery_address?: string | null;
  priority?: boolean | null;
  scheduled_for?: string | null;
}

interface Branch {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  is_primary: boolean;
  is_active: boolean;
}

interface PharmacyMetadata {
  license_number: string | null;
  premises_license_number: string | null;
  opening_hours: string | null;
  phone: string | null;
}

export function PharmacyTerminal() {
  const { user, profile, approvalStatus, isDemo, signOut, loading: authLoading } = useAuth();
  const dispatchDrivers = useServerFn(dispatchOrderToNearbyDrivers);
  const [activeTab, setActiveTab] = useState<PharmacyTab>("orders");
  const [orders, setOrders] = useState<Order[]>([]);
  const [groups, setGroups] = useState<GroupedOrder<Order>[]>([]);
  const [pickupCodes, setPickupCodes] = useState<Record<string, string>>({});
  const [patients, setPatients] = useState<Record<string, { name: string; phone: string | null }>>({});
  const [prescriptions, setPrescriptions] = useState<PrescriptionUpload[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [metadata, setMetadata] = useState<PharmacyMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatOrderId, setChatOrderId] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const lastPendingCount = useRef<number | null>(null);

  const pendingCount = orders.filter((order) => order.status === "pending").length;

  async function loadDashboard() {
    if (!user) return;
    setLoading(true);
    const byNewest = (a: { created_at?: string | null }, b: { created_at?: string | null }) =>
      String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
    const isIndexError = (e: { message?: string } | null | undefined) => !!e?.message && /index/i.test(e.message);
    const ordersQuery = () => firestoreClient.from("orders").select("*").eq("pharmacy_id", user.id);
    let [ordersResult, branchResult, profileResult, pxResult] = await Promise.all([
      (isDemo ? ordersQuery() : ordersQuery().eq("is_demo", false)).order("created_at", { ascending: false }),
      firestoreClient.from("pharmacy_branches").select("id, name, address, latitude, longitude, is_primary, is_active").eq("pharmacy_id", user.id),
      firestoreClient.from("profiles").select("license_number, premises_license_number, opening_hours, phone").eq("user_id", user.id).maybeSingle(),
      firestoreClient.from("prescription_uploads").select("*").eq("pharmacy_id", user.id).order("created_at", { ascending: false }),
    ]);
    // Fallback: if a composite index is missing or still building, query without sorting and sort in memory.
    if (isIndexError(ordersResult.error)) {
      const retry = await ordersQuery();
      if (!retry.error) {
        const rows = ((retry.data ?? []) as Order[]).filter((o) => isDemo || !(o as { is_demo?: boolean }).is_demo).sort(byNewest);
        ordersResult = { ...retry, data: rows } as typeof ordersResult;
      }
    }
    if (isIndexError(pxResult.error)) {
      const retry = await firestoreClient.from("prescription_uploads").select("*").eq("pharmacy_id", user.id);
      if (!retry.error) pxResult = { ...retry, data: [...(retry.data ?? [])].sort(byNewest) } as typeof pxResult;
    }
    if (ordersResult.error) toast.error(`Could not load orders: ${ordersResult.error.message}`);
    if (branchResult.error) toast.error(`Could not load branches: ${branchResult.error.message}`);
    if (profileResult.error) toast.error(`Could not load pharmacy details: ${profileResult.error.message}`);
    if (pxResult.error) toast.error(`Could not load prescriptions: ${pxResult.error.message}`);

    const orderRows = (ordersResult.data ?? []) as Order[];
    setOrders(orderRows);
    setGroups(await groupAndHydrate(orderRows));
    if (orderRows.length) {
      const { data: deliveries, error } = await firestoreClient
        .from("deliveries")
        .select("order_id, pickup_code")
        .in("order_id", orderRows.map((order) => order.id));
      if (error) toast.error(`Could not load pickup codes: ${error.message}`);
      setPickupCodes(Object.fromEntries((deliveries ?? []).filter((delivery) => !!delivery.pickup_code).map((delivery) => [delivery.order_id, delivery.pickup_code as string])));
    } else {
      setPickupCodes({});
    }
    setBranches((branchResult.data ?? []) as Branch[]);
    setMetadata((profileResult.data as PharmacyMetadata | null) ?? null);
    setPrescriptions((pxResult.data ?? []) as PrescriptionUpload[]);
    const patientIds = Array.from(new Set(orderRows.map((order) => order.patient_id)));
    const prescriptionPatientIds = (pxResult.data ?? []).map((script) => script.patient_id);
    const contactIds = Array.from(new Set([...patientIds, ...prescriptionPatientIds]));
    if (contactIds.length) {
      const { data: patientRows, error } = await firestoreClient
        .from("profiles")
        .select("user_id, full_name, phone")
        .in("user_id", contactIds);
      if (error) toast.error(`Could not load patient contact details: ${error.message}`);
      setPatients(Object.fromEntries((patientRows ?? []).map((row) => [
        row.user_id,
        { name: row.full_name || "Patient", phone: row.phone },
      ])));
    } else {
      setPatients({});
    }
    setLoading(false);
    setHasLoaded(true);
  }

  useEffect(() => {
    if (!user) return;
    void loadDashboard();
    const channel = firestoreClient
      .channel(`pharmacy-terminal-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `pharmacy_id=eq.${user.id}` }, () => { void loadDashboard(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "prescription_uploads", filter: `pharmacy_id=eq.${user.id}` }, () => { void loadDashboard(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "pharmacy_branches", filter: `pharmacy_id=eq.${user.id}` }, () => { void loadDashboard(); })
      .subscribe();
    return () => { void firestoreClient.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isDemo]);

  useEffect(() => {
    if (!hasLoaded) return;
    if (lastPendingCount.current === null) {
      lastPendingCount.current = pendingCount;
      return;
    }
    if (lastPendingCount.current !== null && pendingCount > lastPendingCount.current) {
      try {
        const context = new window.AudioContext();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = 880;
        gain.gain.value = 0.12;
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.15);
        oscillator.onended = () => { void context.close(); };
      } catch (error) {
        console.warn("Could not play new-order notification:", error);
      }
    }
    lastPendingCount.current = pendingCount;
  }, [hasLoaded, pendingCount]);

  async function setGroupStatus(group: GroupedOrder<Order>, status: "accepted" | "preparing" | "ready") {
    const ids = group.items.map((item) => item.id);
    const { error } = await firestoreClient.from("orders").update({ status }).in("id", ids);
    if (error) { toast.error(error.message); return false; }
    if (group.group?.id) {
      const { error: groupError } = await firestoreClient.from("order_groups" as never).update({ status } as never).eq("id", group.group.id);
      if (groupError) { toast.error(groupError.message); return false; }
    }
    await loadDashboard();
    return true;
  }

  async function acceptAndPack(group: GroupedOrder<Order>) {
    if (!(await setGroupStatus(group, "accepted"))) return;
    toast.success("Order accepted — it is ready to pack.");
  }

  async function readyForDriver(group: GroupedOrder<Order>) {
    if (!user || !(await setGroupStatus(group, "ready"))) return;
    const firstOrder = group.items[0];
    try {
      const result = await dispatchDrivers({ data: { orderId: firstOrder.id } });
      if (result.waiting || result.assigned) toast.info("Driver dispatch updated.");
      else if ((result.inserted ?? 0) > 0) toast.success("Order ready — driver request sent.");
      else toast.warning("Order ready. No online drivers are nearby yet.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Driver dispatch failed.");
    }
    const code = String(Math.floor(1000 + Math.random() * 9000));
    let { data: delivery } = await firestoreClient.from("deliveries").select("id").eq("order_id", firstOrder.id).maybeSingle();
    if (!delivery) {
      const { data: inserted, error } = await firestoreClient.from("deliveries").insert({
        order_id: firstOrder.id,
        status: "assigned",
        pickup_code: code,
        pickup_address: primaryBranch?.address || profile?.address || profile?.organization_name || "Pharmacy",
        delivery_address: group.group?.delivery_address || firstOrder.delivery_address || "",
        estimated_time: "30-45 minutes",
      }).select("id").maybeSingle();
      if (error) toast.error(`Could not create pickup code: ${error.message}`);
      delivery = inserted;
    }
    if (delivery) {
      if (delivery.id) {
        const { error } = await firestoreClient.from("deliveries").update({ pickup_code: code }).eq("id", delivery.id);
        if (error) toast.error(`Could not create pickup code: ${error.message}`);
        else toast.success(`Pickup code ${code} generated`);
      }
    }
    await loadDashboard();
  }

  const primaryBranch = branches.find((branch) => branch.is_primary) ?? branches[0] ?? null;
  const dispatchedCount = orders.filter((order) => ["ready", "assigned", "picked_up", "in_transit", "delivered"].includes(order.status)).length;
  const today = new Date().toDateString();
  const revenueToday = orders
    .filter((order) => order.status !== "cancelled" && new Date(order.created_at).toDateString() === today)
    .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);

  async function toggleOpen() {
    if (!primaryBranch) {
      toast.error("Add a branch before changing your operating status.");
      setActiveTab("branch");
      return;
    }
    setStatusBusy(true);
    const { error } = await firestoreClient.from("pharmacy_branches").update({ is_active: !primaryBranch.is_active }).eq("id", primaryBranch.id);
    setStatusBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(primaryBranch.is_active ? "Dispensary closed" : "Dispensary open");
    await loadDashboard();
  }

  if (!authLoading && !isDemo && approvalStatus !== "approved") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="healthcare-card max-w-md p-8 text-center">
          <Clock className="mx-auto mb-4 h-10 w-10 text-primary" />
          <h1 className="text-xl font-bold">{approvalStatus === "under_review" ? "Application under review" : "Complete pharmacy verification"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Your pharmacy must be approved before it can receive marketplace orders.</p>
          <Button asChild className="mt-5"><a href="/pharmacy/onboarding">Open verification</a></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="border-b border-border bg-card px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dispensary terminal</p>
              <h1 className="mt-1 text-xl font-bold text-foreground sm:text-2xl">{profile?.organization_name || "My Pharmacy"}</h1>
              <p className="mt-1 text-xs text-muted-foreground">SAPC premises registration: {metadata?.premises_license_number || metadata?.license_number || "Not provided"}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={statusBusy}
                onClick={toggleOpen}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${primaryBranch?.is_active ? "border-healthcare-green/30 bg-healthcare-green/10 text-healthcare-green" : "border-slate-400/30 bg-slate-500/10 text-slate-600 dark:text-slate-300"}`}
              >
                {statusBusy ? "Updating…" : primaryBranch?.is_active ? "● Open & Dispensing" : "● Closed"}
              </button>
              <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}><Settings className="h-4 w-4" /> Settings</Button>
              <Button variant="ghost" size="sm" onClick={signOut}>Sign out</Button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Metric label="New orders" value={pendingCount} />
            <Metric label="Dispatched" value={dispatchedCount} />
            <Metric label="Today's revenue" value={`R ${revenueToday.toFixed(2)}`} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-5 sm:px-6">
        {activeTab === "orders" && (
          <>
            <PharmacyOffersInbox />
            <section className="healthcare-card p-4 sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Dispensary queue</h2>
                  <p className="text-xs text-muted-foreground">Incoming and active orders, grouped by patient package.</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => void loadDashboard()} disabled={loading}>
                  {loading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />} Refresh
                </Button>
              </div>
              {loading && <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
              {!loading && groups.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No orders in your queue.</p>}
              <div className="space-y-3">
                {groups.map((group) => {
                  const patient = patients[group.items[0]?.patient_id];
                  const address = group.group?.delivery_address || group.items[0]?.delivery_address || "Delivery address not provided";
                  return (
                    <article key={group.key} className="rounded-xl border border-border bg-background p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">{patient?.name || "Patient"}</p>
                          <p className="text-xs text-muted-foreground">Order {group.key.slice(0, 8)} · {new Date(group.created_at).toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {group.priority && <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-1 text-[10px] font-bold text-destructive"><AlertTriangle className="h-3 w-3" /> Priority</span>}
                          <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold capitalize text-primary">{group.status.replace(/_/g, " ")}</span>
                        </div>
                      </div>
                      {pickupCodes[group.primaryOrderId] && <p className="mt-2 text-xs font-semibold text-primary">Driver pickup code: <span className="font-mono tracking-widest">{pickupCodes[group.primaryOrderId]}</span></p>}
                      <ul className="my-3 space-y-1 text-sm">
                        {group.items.map((item) => <li key={item.id} className="flex justify-between gap-2"><span className="inline-flex flex-wrap items-center gap-2">{item.medication_name} × {item.quantity}<PrescriptionBadge prescriptionAttached={!!item.prescription_upload_id} /></span><span className="text-muted-foreground">R {Number(item.total_amount).toFixed(2)}</span></li>)}
                      </ul>
                      <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />{address}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {group.status === "pending" && <Button size="sm" onClick={() => void acceptAndPack(group)}><CheckCircle className="mr-1 h-3.5 w-3.5" /> Accept &amp; Pack</Button>}
                        {["accepted", "preparing"].includes(group.status) && <Button size="sm" variant="secondary" onClick={() => void readyForDriver(group)}><Truck className="mr-1 h-3.5 w-3.5" /> Ready for Driver</Button>}
                        <Button size="sm" variant="outline" onClick={() => setChatOrderId(group.primaryOrderId)}><MessageCircle className="mr-1 h-3.5 w-3.5" /> Contact Patient</Button>
                        {patient?.phone && <Button asChild size="sm" variant="ghost"><a href={`tel:${patient.phone}`}><Phone className="mr-1 h-3.5 w-3.5" /> Call</a></Button>}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {activeTab === "inventory" && <PharmacyInventoryPanel />}
        {activeTab === "rx" && (
          <section className="healthcare-card p-4 sm:p-6">
            <h2 className="mb-4 text-lg font-semibold">Prescription inbox</h2>
            {prescriptions.length === 0 ? <p className="text-center text-sm text-muted-foreground">No uploaded prescriptions yet.</p> : (
              <div className="space-y-4">
                {prescriptions.map((script) => (
                  <article key={script.id} className="rounded-xl border border-border p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div><p className="font-medium">{patients[script.patient_id]?.name || `Patient ${script.patient_id.slice(0, 8)}`}</p><p className="text-xs text-muted-foreground">{new Date(script.created_at).toLocaleString()}</p></div>
                      <PrescriptionStatusBadge status={script.status} />
                    </div>
                    {["pending", "reupload_requested"].includes(script.status) ? <PharmacyReviewActions row={script} onChanged={() => void loadDashboard()} /> : script.pharmacist_notes && <p className="text-sm text-muted-foreground">Notes: {script.pharmacist_notes}</p>}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
        {activeTab === "branch" && (
          <div className="space-y-4">
            <section className="healthcare-card p-5">
              <h2 className="mb-3 text-lg font-semibold">Branch &amp; operating details</h2>
              <p className="text-sm text-muted-foreground">{primaryBranch?.address || profile?.address || "Add a verified pharmacy address below."}</p>
              {primaryBranch && <p className="mt-1 text-xs text-muted-foreground">Validated coordinates: {primaryBranch.latitude.toFixed(5)}, {primaryBranch.longitude.toFixed(5)}</p>}
              <p className="mt-3 text-xs text-muted-foreground">Operating hours: {metadata?.opening_hours || "Set hours in pharmacy settings."}</p>
            </section>
            <PharmacyBranchesManager />
          </div>
        )}
        {activeTab === "finance" && (
          <div className="space-y-4">
            <PharmacyFinance />
            <section className="healthcare-card p-5">
              <h2 className="text-lg font-semibold">Banking &amp; settlements</h2>
              <p className="mt-1 text-sm text-muted-foreground">Settlement references are shown with each completed payment above. No pharmacy bank account details are currently stored on this profile.</p>
              <p className="mt-2 text-xs text-muted-foreground">To update payout details, contact HealthReachCare support.</p>
            </section>
          </div>
        )}
      </main>

      <PharmacyBottomNav activeTab={activeTab} onChange={setActiveTab} pendingCount={pendingCount} />
      <OrderChatDialog orderId={chatOrderId} orderLabel={chatOrderId ? `Order ${chatOrderId.slice(0, 8)}` : ""} onClose={() => setChatOrderId(null)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg border border-border bg-background px-3 py-2"><p className="text-[10px] text-muted-foreground sm:text-xs">{label}</p><p className="mt-0.5 truncate text-sm font-bold sm:text-lg">{value}</p></div>;
}
