import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle, Clock, Loader2, MapPin, MessageCircle, Phone, RefreshCw, Settings, Truck, Search, Boxes, ClipboardList, FilePlus2, PackageCheck, ShieldCheck, UserRound, type LucideIcon } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Brand } from "@/components/Brand";
import { requestMedicationPayment } from "@/lib/marketplace-payments.functions";

interface Order {
  id: string;
  order_group_id: string | null;
  patient_id: string;
  medication_name: string;
  quantity: number;
  status: string;
  total_amount: number;
  payment_status?: string;
  payment_reference?: string;
  created_at: string;
  prescription_upload_id?: string | null;
  delivery_address?: string | null;
  recipient_name?: string | null;
  recipient_phone?: string | null;
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
  const requestPayment = useServerFn(requestMedicationPayment);
  const [activeTab, setActiveTab] = useState<PharmacyTab>("home");
  const [orders, setOrders] = useState<Order[]>([]);
  const [groups, setGroups] = useState<GroupedOrder<Order>[]>([]);
  const [pickupCodes, setPickupCodes] = useState<Record<string, string>>({});
  const [patients, setPatients] = useState<Record<string, { name: string; phone: string | null }>>({});
  const [prescriptions, setPrescriptions] = useState<PrescriptionUpload[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [metadata, setMetadata] = useState<PharmacyMetadata | null>(null);
  const [inventoryCount, setInventoryCount] = useState(0);
  const [orderFilter, setOrderFilter] = useState<"all" | "pending" | "processing" | "completed">("all");
  const [orderSearch, setOrderSearch] = useState("");
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [prescriptionDialogOpen, setPrescriptionDialogOpen] = useState(false);
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
    const isIndexError = (e: { message?: string; code?: string } | null | undefined) =>
      !!e && (e.code === "42P10" || /index|order by/i.test(e.message ?? ""));
    const ordersQuery = () => firestoreClient.from("orders").select("*").eq("pharmacy_id", user.id);
    const [initialOrdersResult, branchResult, profileResult, initialPxResult, inventoryResult] = await Promise.all([
      (isDemo ? ordersQuery() : ordersQuery().eq("is_demo", false)).order("created_at", { ascending: false }),
      firestoreClient.from("pharmacy_branches").select("id, name, address, latitude, longitude, is_primary, is_active").eq("pharmacy_id", user.id),
      firestoreClient.from("profiles").select("license_number, premises_license_number, opening_hours, phone").eq("user_id", user.id).maybeSingle(),
      firestoreClient.from("prescription_uploads").select("*").eq("pharmacy_id", user.id).not("order_id", "is", null).order("created_at", { ascending: false }),
      firestoreClient.from("medications").select("id, stock_quantity, is_active").eq("pharmacy_id", user.id).eq("is_demo", false),
    ]);
    let ordersResult = initialOrdersResult;
    let pxResult = initialPxResult;
    // Fallback: if a composite index is missing or still building, query without sorting and sort in memory.
    if (isIndexError(ordersResult.error)) {
      const retry = await ordersQuery();
      if (!retry.error) {
        const rows = ((retry.data ?? []) as Order[]).filter((o) => isDemo || !(o as { is_demo?: boolean }).is_demo).sort(byNewest);
        ordersResult = { ...retry, data: rows } as typeof ordersResult;
      }
    }
    if (isIndexError(pxResult.error)) {
      const retry = await firestoreClient.from("prescription_uploads").select("*").eq("pharmacy_id", user.id).not("order_id", "is", null);
      if (!retry.error) pxResult = { ...retry, data: [...(retry.data ?? [])].sort(byNewest) } as typeof pxResult;
    }
    if (ordersResult.error) toast.error(`Could not load orders: ${ordersResult.error.message}`);
    if (branchResult.error) toast.error(`Could not load branches: ${branchResult.error.message}`);
    if (profileResult.error) toast.error(`Could not load pharmacy details: ${profileResult.error.message}`);
    if (pxResult.error) toast.error(`Could not load prescriptions: ${pxResult.error.message}`);
    if (inventoryResult.error) toast.error(`Could not load inventory metrics: ${inventoryResult.error.message}`);

    const orderRows = (ordersResult.data ?? []) as Order[];
    setOrders(orderRows);
    setGroups(await groupAndHydrate(orderRows));
    setInventoryCount((inventoryResult.data ?? []).filter((medication) => medication.is_active && Number(medication.stock_quantity) > 0).length);
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
    setPatients(Object.fromEntries(orderRows.map((order) => [
      order.patient_id,
      { name: order.recipient_name || "Patient", phone: order.recipient_phone || null },
    ])));
    setLoading(false);
    setHasLoaded(true);
  }

  useEffect(() => {
    if (!user) return;
    void loadDashboard();
    const channel = firestoreClient
      .channel(`pharmacy-terminal-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `pharmacy_id=eq.${user.id}` }, () => { void loadDashboard(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "prescription_uploads", filter: `pharmacy_id=eq.${user.id}&order_id=neq.null` }, () => { void loadDashboard(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "pharmacy_branches", filter: `pharmacy_id=eq.${user.id}` }, () => { void loadDashboard(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "medications", filter: `pharmacy_id=eq.${user.id}` }, () => { void loadDashboard(); })
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
    if (!group.items.every(item => item.payment_status === "paid" && item.payment_reference)) { toast.error("Patient payment must be verified before delivery."); return; }
    if (!user || !(await setGroupStatus(group, "ready"))) return;
    const firstOrder = group.items[0];
    if (!firstOrder) return;
    try {
      const result = await dispatchDrivers({ data: { orderId: firstOrder.id } });
      if (result.waiting || result.assigned) toast.info("Driver dispatch updated.");
      else if ((result.inserted ?? 0) > 0) toast.success("Order ready — driver request sent.");
      else toast.warning("Order ready. No online drivers are nearby yet.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Driver dispatch failed.");
    }
    await loadDashboard();
  }

  const primaryBranch = branches.find((branch) => branch.is_primary) ?? branches[0] ?? null;
  const today = new Date().toDateString();
  const completedTodayCount = orders.filter((order) => order.status === "completed" && new Date(order.created_at).toDateString() === today).length;
  const processingCount = orders.filter((order) => ["accepted", "preparing"].includes(order.status)).length;
  const selectedGroup = groups.find((group) => group.key === selectedGroupKey) ?? null;
  const pharmacyName = profile?.organization_name || profile?.full_name || "";
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";
  const filteredGroups = groups.filter((group) => {
    const statusMatches = orderFilter === "all" ||
      (orderFilter === "pending" && group.status === "pending") ||
      (orderFilter === "processing" && ["accepted", "preparing"].includes(group.status)) ||
      (orderFilter === "completed" && ["completed", "delivered"].includes(group.status));
    if (!statusMatches) return false;
    const query = orderSearch.trim().toLowerCase();
    return !query || [
      group.key,
      ...group.items.flatMap((item) => [item.medication_name, item.recipient_name ?? "", patients[item.patient_id]?.name ?? ""]),
    ].some((value) => value.toLowerCase().includes(query));
  });
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
            <div className="flex items-center gap-3">
              <Brand />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pharmacy terminal</p>
                <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">{pharmacyName}</h1>
                <p className="mt-1 text-xs text-muted-foreground">SAPC premises registration: {metadata?.premises_license_number || metadata?.license_number || "Not provided"}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${primaryBranch?.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                <span className={`h-2 w-2 rounded-full ${primaryBranch?.is_active ? "animate-pulse bg-emerald-500" : "bg-slate-400"}`} />
                {primaryBranch?.is_active ? `Open · ${metadata?.opening_hours || "08:00 - 20:00"}` : "Closed"}
              </span>
              <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${approvalStatus === "approved" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                {approvalStatus === "approved" ? <ShieldCheck className="mr-1 inline h-3.5 w-3.5" /> : <Clock className="mr-1 inline h-3.5 w-3.5" />}
                {approvalStatus === "approved" ? "Verified" : "Pending Verification"}
              </span>
              <button
                type="button"
                disabled={statusBusy}
                onClick={toggleOpen}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${primaryBranch?.is_active ? "border-healthcare-green/30 bg-healthcare-green/10 text-healthcare-green" : "border-slate-400/30 bg-slate-500/10 text-slate-600 dark:text-slate-300"}`}
              >
                {statusBusy ? "Updating…" : primaryBranch?.is_active ? "Update status" : "Open pharmacy"}
              </button>
              <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}><Settings className="h-4 w-4" /> Settings</Button>
              <Button variant="ghost" size="sm" onClick={signOut}>Sign out</Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-5 sm:px-6">
        {activeTab === "home" && (
          <div className="space-y-5">
            <section className="rounded-2xl bg-emerald-700 p-5 text-white shadow-sm sm:p-7">
              <p className="text-sm font-medium text-emerald-50">{greeting}, {profile?.organization_name || "Pharmacy Team"}</p>
              <h2 className="mt-1 text-2xl font-bold">Here is what’s happening at your pharmacy today.</h2>
              <p className="mt-2 text-sm text-emerald-50">Live order, inventory and prescription activity from your pharmacy.</p>
            </section>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Pending Orders" value={pendingCount} />
              <Metric label="Processing / Preparing" value={processingCount} />
              <Metric label="Completed Today" value={completedTodayCount} />
              <Metric label="Active Medications / In-Stock" value={inventoryCount} />
            </section>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <QuickAction icon={FilePlus2} title="New Prescription" detail="Review prescription requests" onClick={() => setPrescriptionDialogOpen(true)} />
              <QuickAction icon={Boxes} title="Check Stock" detail="Manage medicines and quantities" onClick={() => setActiveTab("inventory")} />
              <QuickAction icon={ClipboardList} title="View Orders" detail="Review live patient orders" onClick={() => setActiveTab("orders")} />
              <QuickAction icon={MessageCircle} title="Message Patients" detail="Open a patient order conversation" onClick={() => {
                const latest = groups.find((group) => group.items.length > 0);
                if (latest) setChatOrderId(latest.primaryOrderId);
                else toast.info("Patient conversations will appear with your orders.");
              }} />
            </section>
            <OrderList
              groups={filteredGroups.slice(0, 5)}
              loading={loading}
              orderFilter={orderFilter}
              setOrderFilter={setOrderFilter}
              orderSearch={orderSearch}
              setOrderSearch={setOrderSearch}
              patients={patients}
              onOpen={setSelectedGroupKey}
              title="Recent Orders"
              subtitle="Latest orders grouped by patient package."
              onRefresh={() => void loadDashboard()}
            />
          </div>
        )}

        {activeTab === "orders" && (
          <>
            <PharmacyOffersInbox />
            <OrderList groups={filteredGroups} loading={loading} orderFilter={orderFilter} setOrderFilter={setOrderFilter} orderSearch={orderSearch} setOrderSearch={setOrderSearch} patients={patients} onOpen={setSelectedGroupKey} title="Orders" subtitle="Incoming and active orders, grouped by patient package." onRefresh={() => void loadDashboard()} />
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
        {activeTab === "profile" && (
          <section className="healthcare-card space-y-5 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><UserRound className="h-5 w-5" /></span>
              <div><h2 className="text-lg font-semibold text-slate-900">{pharmacyName}</h2><p className="text-sm text-muted-foreground">Pharmacy profile and terminal settings</p></div>
            </div>
            <dl className="grid gap-3 rounded-xl border border-border/60 p-4 sm:grid-cols-2">
              <ProfileDetail label="Contact number" value={metadata?.phone || profile?.phone} />
              <ProfileDetail label="Operating hours" value={metadata?.opening_hours} />
              <ProfileDetail label="SAPC registration" value={metadata?.license_number} />
              <ProfileDetail label="Premises registration" value={metadata?.premises_license_number} />
              <ProfileDetail label="Primary branch" value={primaryBranch?.name} />
              <ProfileDetail label="Address" value={primaryBranch?.address || profile?.address} />
            </dl>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setActiveTab("branch")}><MapPin className="mr-2 h-4 w-4" /> Branch settings</Button>
              <Button variant="outline" onClick={() => setActiveTab("finance")}><PackageCheck className="mr-2 h-4 w-4" /> Finance</Button>
              <Button variant="outline" onClick={() => setSettingsOpen(true)}><Settings className="mr-2 h-4 w-4" /> Account settings</Button>
              <Button variant="ghost" onClick={signOut}>Sign out</Button>
            </div>
          </section>
        )}
      </main>

      <PharmacyBottomNav activeTab={activeTab} onChange={(tab) => {
        if (tab === "rx") {
          setPrescriptionDialogOpen(true);
          return;
        }
        setActiveTab(tab);
      }} pendingCount={pendingCount} />
      <OrderChatDialog orderId={chatOrderId} orderLabel={chatOrderId ? `Order ${chatOrderId.slice(0, 8)}` : ""} onClose={() => setChatOrderId(null)} />
      <Dialog open={prescriptionDialogOpen} onOpenChange={setPrescriptionDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-xl">
          <DialogHeader><DialogTitle>Prescription requests</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Review prescription records submitted to this pharmacy. Prescription authoring is not available in the current pharmacy workflow.</p>
          {prescriptions.filter((script) => ["pending", "reupload_requested"].includes(script.status)).length === 0
            ? <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">There are no prescription requests awaiting review.</p>
            : <div className="space-y-3">{prescriptions.filter((script) => ["pending", "reupload_requested"].includes(script.status)).map((script) => (
              <article key={script.id} className="rounded-xl border border-border p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div><p className="text-sm font-semibold">{patients[script.patient_id]?.name || "Patient"}</p><p className="text-xs text-muted-foreground">{new Date(script.created_at).toLocaleString()}</p></div>
                  <PrescriptionStatusBadge status={script.status} />
                </div>
                <PharmacyReviewActions row={script} onChanged={() => void loadDashboard()} />
              </article>
            ))}</div>}
          <Button variant="outline" onClick={() => { setPrescriptionDialogOpen(false); setActiveTab("rx"); }}>Open prescription inbox</Button>
        </DialogContent>
      </Dialog>
      <Dialog open={!!selectedGroup} onOpenChange={(open) => { if (!open) setSelectedGroupKey(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-xl">
          <DialogHeader><DialogTitle>Order {selectedGroup?.key.slice(0, 8)}</DialogTitle></DialogHeader>
          {selectedGroup && (() => {
            const patient = patients[selectedGroup.items[0]?.patient_id];
            const address = selectedGroup.group?.delivery_address || selectedGroup.items[0]?.delivery_address;
            return <div className="space-y-4">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="font-semibold">{patient?.name || "Patient"}</p>
                {patient?.phone && <a className="mt-1 inline-flex items-center gap-1 text-sm text-emerald-700" href={`tel:${patient.phone}`}><Phone className="h-3.5 w-3.5" />{patient.phone}</a>}
                {address && <p className="mt-2 flex items-start gap-1.5 text-sm text-muted-foreground"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{address}</p>}
                <p className="mt-2 text-sm text-muted-foreground">Method: {address ? "Delivery" : "Pickup / collection"}</p>
                <p className="mt-1 text-sm capitalize text-muted-foreground">Status: {selectedGroup.status.replace(/_/g, " ")}</p>
                {pickupCodes[selectedGroup.primaryOrderId] && <p className="mt-2 text-sm font-semibold text-emerald-700">Pickup code: {pickupCodes[selectedGroup.primaryOrderId]}</p>}
              </div>
              <ul className="space-y-2">{selectedGroup.items.map((item) => <li key={item.id} className="flex justify-between gap-3 text-sm"><span>{item.medication_name} × {item.quantity}</span><span>R{Number(item.total_amount).toFixed(2)}</span></li>)}</ul>
              <p className="flex justify-between border-t pt-3 font-semibold"><span>Order total</span><span>R{selectedGroup.total.toFixed(2)}</span></p>
              <p className="text-sm font-semibold">Payment: {selectedGroup.items.every(item => item.payment_status === "paid") ? "Verified" : "Awaiting patient payment"}</p>
              {selectedGroup.group?.id && !selectedGroup.items.every(item => item.payment_status === "paid") && <Button variant="outline" onClick={async () => {
                if (!selectedGroup.group?.id) return;
                try { await requestPayment({ data: { targetId: selectedGroup.group.id } }); toast.success("Payment request sent to the patient."); }
                catch (error) { toast.error(error instanceof Error ? error.message : "Could not request payment."); }
              }}>Request patient payment</Button>}
              <div className="flex flex-wrap gap-2">
                {selectedGroup.status === "pending" && <Button onClick={() => { void acceptAndPack(selectedGroup); setSelectedGroupKey(null); }}>Accept &amp; Pack</Button>}
                {["accepted", "preparing"].includes(selectedGroup.status) && <Button disabled={!selectedGroup.items.every(item => item.payment_status === "paid")} onClick={() => { void readyForDriver(selectedGroup); setSelectedGroupKey(null); }}><Truck className="mr-2 h-4 w-4" />Dispatch Driver</Button>}
                <Button variant="outline" onClick={() => { setChatOrderId(selectedGroup.primaryOrderId); setSelectedGroupKey(null); }}><MessageCircle className="mr-2 h-4 w-4" />Open Chat</Button>
              </div>
            </div>;
          })()}
        </DialogContent>
      </Dialog>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border border-border/60 bg-white p-4 shadow-sm"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate text-2xl font-bold text-slate-900">{value}</p></div>;
}

function QuickAction({ icon: Icon, title, detail, onClick }: { icon: LucideIcon; title: string; detail: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-28 items-start gap-3 rounded-xl border border-border/60 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700"><Icon className="h-5 w-5" /></span>
      <span><span className="block font-semibold text-slate-900">{title}</span><span className="mt-1 block text-xs text-muted-foreground">{detail}</span></span>
    </button>
  );
}

function ProfileDetail({ label, value }: { label: string; value?: string | null }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-slate-900">{value || "Not provided"}</dd></div>;
}

function OrderList({
  groups,
  loading,
  orderFilter,
  setOrderFilter,
  orderSearch,
  setOrderSearch,
  patients,
  onOpen,
  title,
  subtitle,
  onRefresh,
}: {
  groups: GroupedOrder<Order>[];
  loading: boolean;
  orderFilter: "all" | "pending" | "processing" | "completed";
  setOrderFilter: (filter: "all" | "pending" | "processing" | "completed") => void;
  orderSearch: string;
  setOrderSearch: (value: string) => void;
  patients: Record<string, { name: string; phone: string | null }>;
  onOpen: (groupKey: string) => void;
  title: string;
  subtitle: string;
  onRefresh: () => void;
}) {
  const filters = [
    { id: "all", label: "All" },
    { id: "pending", label: "Pending" },
    { id: "processing", label: "Processing" },
    { id: "completed", label: "Completed" },
  ] as const;
  return (
    <section className="rounded-2xl border border-border/60 bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold text-slate-900">{title}</h2><p className="text-sm text-muted-foreground">{subtitle}</p></div>
        <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading}>
          {loading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />} Refresh
        </Button>
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" aria-label="Filter orders by status">
          {filters.map(({ id, label }) => <button key={id} type="button" aria-pressed={orderFilter === id} onClick={() => setOrderFilter(id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${orderFilter === id ? "border-emerald-600 bg-emerald-600 text-white" : "border-border bg-white text-slate-600 hover:border-emerald-300"}`}>{label}</button>)}
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} aria-label="Search orders" placeholder="Search order, patient or medicine..." className="rounded-xl pl-9" />
        </div>
      </div>
      {loading && <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>}
      {!loading && groups.length === 0 && <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">No orders match this filter.</p>}
      <div className="space-y-3">
        {groups.map((group) => {
          const patient = patients[group.items[0]?.patient_id];
          const statusClass = group.status === "pending" ? "bg-blue-50 text-blue-800" :
            ["accepted", "preparing"].includes(group.status) ? "bg-amber-50 text-amber-800" :
            ["completed", "delivered"].includes(group.status) ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700";
          return (
            <article key={group.key} className="rounded-xl border border-border/60 p-4 transition hover:border-emerald-200">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{patient?.name || "Patient"}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Order {group.key.slice(0, 8)} · {new Date(group.created_at).toLocaleString()}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusClass}`}>{group.status.replace(/_/g, " ")}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-800">{group.items.map((item) => item.medication_name).join(", ")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{group.items.length} medicine item{group.items.length === 1 ? "" : "s"} · Total R{group.total.toFixed(2)}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => onOpen(group.key)}>View Order</Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
