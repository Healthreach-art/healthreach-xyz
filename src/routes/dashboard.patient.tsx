import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ShoppingCart, Package, Clock, CreditCard, Search, Pill,
  FileText, MapPin, Loader2, Stethoscope, Store, Star, MessageCircle, Settings,
  Bell, ChevronDown, User as UserIcon, LifeBuoy, Repeat, Heart, Baby, Thermometer, Sparkles, Bandage,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { OrderChatDialog } from "@/components/OrderChatDialog";
import { DeliveryMap } from "@/components/DeliveryMap";
import { SettingsDialog } from "@/components/SettingsDialog";
import { TransactionHistory } from "@/components/TransactionHistory";
import { MedicationReminders } from "@/components/MedicationReminders";
import { AddressBook } from "@/components/AddressBook";
import { OrderHistory } from "@/components/OrderHistory";
import { PrescriptionStatusBadge, PrescriptionUploader, getPrescriptionFileUrl, type PrescriptionUpload } from "@/components/PrescriptionVerification";
import pharmacy1 from "@/assets/pharmacy-1.jpg";
import pharmacy2 from "@/assets/pharmacy-2.jpg";
import pharmacy3 from "@/assets/pharmacy-3.jpg";
import pharmacy4 from "@/assets/pharmacy-4.jpg";
import patientHero from "@/assets/patient-hero.jpg";
import medGeneric from "@/assets/med-generic.jpg";
import { customerPrice } from "@/lib/pricing";

const PHARMACY_IMAGES = [pharmacy1, pharmacy2, pharmacy3, pharmacy4];
function pharmacyImage(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PHARMACY_IMAGES[h % PHARMACY_IMAGES.length];
}

import { RoleGuard } from "@/components/RoleGuard";

export const Route = createFileRoute("/dashboard/patient")({
  head: () => ({ meta: [{ title: "Patient Dashboard — HEALTHREACH" }] }),
  component: () => <RoleGuard allow="patient"><PatientDashboard /></RoleGuard>,
});

interface Pharmacy {
  user_id: string;
  organization_name: string | null;
  full_name: string;
  address: string | null;
}

interface Med {
  id: string;
  pharmacy_id: string;
  name: string;
  price: number;
  stock_quantity: number;
  requires_prescription?: boolean | null;
}
interface Order {
  id: string;
  medication_name: string;
  status: string;
  total_amount: number;
  created_at: string;
}
interface Prescription {
  id: string;
  medication_name: string;
  dosage: string | null;
  doctor_name: string;
  is_active: boolean | null;
  created_at: string;
}

const statusColors: Record<string, string> = {
  pending: "bg-accent text-accent-foreground",
  accepted: "bg-healthcare-sky/20 text-healthcare-sky",
  preparing: "bg-accent text-primary",
  ready: "bg-healthcare-mint/30 text-healthcare-green",
  out_for_delivery: "bg-primary/10 text-primary",
  delivered: "bg-healthcare-green/20 text-healthcare-green",
  cancelled: "bg-destructive/10 text-destructive",
};

function PatientDashboard() {
  const { user, profile, signOut } = useAuth();
  const [search, setSearch] = useState("");
  const [pharmacySearch, setPharmacySearch] = useState("");
  const [meds, setMeds] = useState<Med[]>([]);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [pxUploads, setPxUploads] = useState<PrescriptionUpload[]>([]);
  const [rxFor, setRxFor] = useState<Med | null>(null);
  const [loading, setLoading] = useState(true);
  const [openPharmacy, setOpenPharmacy] = useState<Pharmacy | null>(null);
  const [chatOrderId, setChatOrderId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeDelivery, setActiveDelivery] = useState<{ orderId: string; pickup: string | null; dropoff: string | null; status: string } | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [savedCards, setSavedCards] = useState(0);
  const [pharmacySort, setPharmacySort] = useState<"rating" | "delivery" | "name">("rating");
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [minRating, setMinRating] = useState(0);

  // Deterministic mock metadata for each pharmacy (rating, delivery time, open status)
  function pharmacyMeta(id: string) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    const rating = Number((4.0 + ((h % 100) / 100)).toFixed(1));
    const deliveryMin = 15 + (h % 6) * 5;
    const isOpen = (h % 7) !== 0;
    return { rating, deliveryMin, deliveryLabel: `${deliveryMin}–${deliveryMin + 10} min`, isOpen };
  }

  useEffect(() => {
    if (!user) return;
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null)
      .then(({ count }) => setUnreadNotifs(count ?? 0));
    supabase.from("saved_payment_methods").select("id", { count: "exact", head: true }).eq("user_id", user.id)
      .then(({ count }) => setSavedCards(count ?? 0));
  }, [user]);

  const CATEGORIES = [
    { key: "Pain Relief", icon: Heart, terms: ["pain", "ibuprofen", "paracetamol", "panado", "aspirin"] },
    { key: "Cold & Flu", icon: Thermometer, terms: ["cold", "flu", "cough", "sinus", "med-lemon"] },
    { key: "Vitamins", icon: Sparkles, terms: ["vitamin", "supplement", "omega", "magnesium"] },
    { key: "Baby Care", icon: Baby, terms: ["baby", "infant", "nappy", "calpol"] },
    { key: "First Aid", icon: Bandage, terms: ["bandage", "plaster", "antiseptic", "wound", "burn"] },
  ];
  const activeCategory = CATEGORIES.find((c) => c.key === category);
  const cartCount = orders.filter((o) => o.status === "pending").length;

  // Restore scroll to URL hash on load / refresh
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace("#", "");
    if (!hash) return;
    const tryScroll = () => {
      const el = document.getElementById(hash);
      if (el) el.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "start" });
    };
    const t = setTimeout(tryScroll, 300);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    async function load() {
      const tasks: Promise<unknown>[] = [
        (async () => {
          const { data } = await supabase
            .from("medications")
            .select("id, pharmacy_id, name, price, stock_quantity, requires_prescription")
            .gt("stock_quantity", 0)
            .order("name");
          setMeds((data ?? []) as Med[]);
        })(),
        (async () => {
          const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "pharmacy");
          const ids = (roles ?? []).map((r) => r.user_id);
          if (ids.length === 0) { setPharmacies([]); return; }
          const { data: profs } = await supabase
            .from("profiles")
            .select("user_id, organization_name, full_name, address, approval_status")
            .in("user_id", ids)
            .eq("approval_status", "approved");
          setPharmacies((profs ?? []) as Pharmacy[]);
        })(),
      ];
      if (user) {
        tasks.push(
          (async () => {
            const { data } = await supabase
              .from("orders")
              .select("id, medication_name, status, total_amount, created_at")
              .eq("patient_id", user.id)
              .order("created_at", { ascending: false });
            setOrders((data ?? []) as Order[]);
          })(),
          (async () => {
            const { data } = await supabase
              .from("prescriptions")
              .select("id, medication_name, dosage, doctor_name, is_active, created_at")
              .eq("patient_id", user.id)
              .order("created_at", { ascending: false });
            setPrescriptions((data ?? []) as Prescription[]);
          })(),
          (async () => {
            const { data } = await supabase
              .from("prescription_uploads")
              .select("*")
              .eq("patient_id", user.id)
              .order("created_at", { ascending: false });
            setPxUploads((data ?? []) as PrescriptionUpload[]);
          })()
        );
      }
      await Promise.all(tasks);

      // Active delivery (most recent non-delivered)
      if (user) {
        const { data: act } = await supabase
          .from("orders").select("id").eq("patient_id", user.id).order("created_at", { ascending: false }).limit(1);
        if (act?.[0]) {
          const { data: del } = await supabase
            .from("deliveries").select("pickup_address, delivery_address, status").eq("order_id", act[0].id).maybeSingle();
          if (del) setActiveDelivery({ orderId: act[0].id, pickup: del.pickup_address, dropoff: del.delivery_address, status: del.status });
        }
      }
      setLoading(false);
    }
    load();

    if (!user) return;

    async function refreshOrders() {
      const { data } = await supabase
        .from("orders")
        .select("id, medication_name, status, total_amount, created_at")
        .eq("patient_id", user!.id)
        .order("created_at", { ascending: false });
      setOrders((data ?? []) as Order[]);
    }

    const statusLabels: Record<string, string> = {
      picked_up: "Your order has been picked up by the driver 📦",
      in_transit: "Your order is on the way! 🚗",
      delivered: "Your order has been delivered ✅",
    };

    const channel = supabase
      .channel(`patient-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `patient_id=eq.${user.id}` }, () => {
        refreshOrders();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, async (payload) => {
        const newRow = payload.new as { order_id: string; status: string; pickup_address?: string; delivery_address?: string };
        const oldRow = payload.old as { status?: string };
        const { data: order } = await supabase
          .from("orders")
          .select("id, patient_id, medication_name")
          .eq("id", newRow.order_id)
          .maybeSingle();
        if (!order || order.patient_id !== user.id) return;
        setActiveDelivery({ orderId: newRow.order_id, pickup: newRow.pickup_address ?? null, dropoff: newRow.delivery_address ?? null, status: newRow.status });
        if (newRow.status !== oldRow.status) {
          const msg = statusLabels[newRow.status];
          if (msg) { toast.success(msg, { description: order.medication_name }); refreshOrders(); }
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "prescriptions", filter: `patient_id=eq.${user.id}` }, async () => {
        const { data } = await supabase
          .from("prescriptions")
          .select("id, medication_name, dosage, doctor_name, is_active, created_at")
          .eq("patient_id", user!.id)
          .order("created_at", { ascending: false });
        setPrescriptions((data ?? []) as Prescription[]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "prescription_uploads", filter: `patient_id=eq.${user.id}` }, async () => {
        const { data } = await supabase
          .from("prescription_uploads")
          .select("*")
          .eq("patient_id", user!.id)
          .order("created_at", { ascending: false });
        setPxUploads((data ?? []) as PrescriptionUpload[]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const filteredMeds = meds.filter((m) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || m.name.toLowerCase().includes(q);
    const matchesCat = !activeCategory || activeCategory.terms.some((t) => m.name.toLowerCase().includes(t));
    return matchesSearch && matchesCat;
  });

  const totalOrders = orders.length;
  const activeOrders = orders.filter((o) => !["delivered", "cancelled"].includes(o.status)).length;
  const pendingDelivery = orders.filter((o) => ["accepted", "preparing", "ready", "out_for_delivery"].includes(o.status)).length;
  const totalSpent = orders.filter((o) => o.status !== "cancelled").reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const activePrescriptions = prescriptions.filter((p) => p.is_active !== false);

  // Approved prescription upload exists for a given (medication, pharmacy) pair
  function hasApprovedRx(med: Med) {
    return pxUploads.some((u) =>
      u.status === "approved" &&
      u.pharmacy_id === med.pharmacy_id &&
      (u.medication_id === med.id || u.medication_id === null) &&
      (!u.expires_at || new Date(u.expires_at) > new Date())
    );
  }
  function rxStatusFor(med: Med) {
    return pxUploads.find((u) =>
      u.pharmacy_id === med.pharmacy_id &&
      (u.medication_id === med.id || u.medication_id === null) &&
      ["pending", "rejected", "reupload_requested"].includes(u.status)
    );
  }

  return (
    <div className="container-narrow px-4 sm:px-6 py-8">
      {/* Top app bar */}
      <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 mb-6 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-3">
          <div className="flex items-center gap-2 shrink-0">
            <div className="h-8 w-8 rounded-lg healthcare-gradient flex items-center justify-center">
              <Pill className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="hidden sm:inline font-bold text-foreground">HEALTHREACH</span>
          </div>

          <button
            onClick={() => {
              document.getElementById("address")?.scrollIntoView({ behavior: "smooth", block: "start" });
              history.replaceState(null, "", "#address");
            }}
            className="flex items-center gap-1.5 min-w-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs sm:text-sm hover:bg-accent transition-colors"
          >
            <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="truncate max-w-[140px] sm:max-w-[220px] text-foreground">
              {profile?.address?.split(",")[0] || "Set delivery address"}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </button>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <button
              aria-label="Notifications"
              onClick={() => { document.getElementById("orders")?.scrollIntoView({ behavior: "smooth" }); }}
              className="relative h-9 w-9 rounded-full hover:bg-accent flex items-center justify-center"
            >
              <Bell className="h-4 w-4 text-foreground" />
              {unreadNotifs > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                  {unreadNotifs > 9 ? "9+" : unreadNotifs}
                </span>
              )}
            </button>
            <button
              aria-label="Cart"
              onClick={() => { document.getElementById("orders")?.scrollIntoView({ behavior: "smooth" }); }}
              className="relative h-9 w-9 rounded-full hover:bg-accent flex items-center justify-center"
            >
              <ShoppingCart className="h-4 w-4 text-foreground" />
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-9 w-9 rounded-full bg-primary/10 hover:bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm">
                  {(profile?.full_name || "P").charAt(0).toUpperCase()}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate">{profile?.full_name || "Patient"}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                  <Settings className="h-4 w-4" /> Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => document.getElementById("address")?.scrollIntoView({ behavior: "smooth" })}>
                  <MapPin className="h-4 w-4" /> Delivery address
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => document.getElementById("payments")?.scrollIntoView({ behavior: "smooth" })}>
                  <CreditCard className="h-4 w-4" /> Payment methods
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => document.getElementById("support")?.scrollIntoView({ behavior: "smooth" })}>
                  <LifeBuoy className="h-4 w-4" /> Support
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Welcome back, {profile?.full_name?.split(" ")[0] || "there"} 👋</h1>
        <p className="text-sm text-muted-foreground">Order medicine and get it delivered fast.</p>
      </div>

      {/* Hero banner */}
      <div className="relative overflow-hidden rounded-2xl mb-6 h-44 sm:h-56">
        <img src={patientHero} alt="Medicine delivered to your door" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-primary/80 via-primary/50 to-transparent" />
        <div className="relative z-10 h-full flex flex-col justify-center px-6 sm:px-10 text-primary-foreground">
          <p className="text-xs uppercase tracking-wider opacity-90">Delivered in 30 min</p>
          <h2 className="text-2xl sm:text-3xl font-bold mt-1">Order medicine, get it fast.</h2>
          <p className="text-sm opacity-90 mt-1">Browse pharmacies near {profile?.address?.split(",")[0] || "you"} and chat with your driver in real time.</p>
        </div>
      </div>

      {/* Big search bar */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search medicines, pharmacies, brands…"
          className="w-full h-12 sm:h-14 rounded-2xl border border-border bg-card pl-12 pr-4 text-sm sm:text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Quick categories */}
      <div className="mb-8">
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
          {CATEGORIES.map((c) => {
            const active = category === c.key;
            return (
              <button
                key={c.key}
                onClick={() => setCategory(active ? null : c.key)}
                className={`flex flex-col items-center gap-1.5 shrink-0 rounded-2xl border p-3 w-20 sm:w-24 transition-all hover:-translate-y-0.5 ${
                  active ? "border-primary bg-primary/10" : "border-border bg-card hover:shadow-md"
                }`}
              >
                <div className={`h-10 w-10 rounded-full flex items-center justify-center ${active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
                  <c.icon className="h-5 w-5" />
                </div>
                <span className="text-[11px] sm:text-xs font-medium text-foreground text-center leading-tight">{c.key}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Stats */}
      {/* Stats — clicking updates the URL hash and smooth-scrolls to the section */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {[
          { icon: ShoppingCart, label: "Total Orders", value: String(totalOrders), color: "text-primary", target: "orders" },
          { icon: Package, label: "Active Orders", value: String(activeOrders), color: "text-healthcare-teal", target: "orders" },
          { icon: Clock, label: "Pending Delivery", value: String(pendingDelivery), color: "text-healthcare-sky", target: "orders" },
          { icon: CreditCard, label: "Total Spent", value: `R ${totalSpent.toFixed(0)}`, color: "text-healthcare-green", target: "orders" },
        ].map((stat) => (
          <a
            key={stat.label}
            href={`#${stat.target}`}
            onClick={(e) => {
              e.preventDefault();
              const el = document.getElementById(stat.target);
              if (el) {
                history.replaceState(null, "", `#${stat.target}`);
                el.scrollIntoView({ behavior: "smooth", block: "start" });
              }
            }}
            className="healthcare-card p-5 transition-all hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-xl font-bold text-foreground">{stat.value}</p>
              </div>
            </div>
          </a>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Search Medications */}
        <div className="lg:col-span-3 space-y-6">
          {/* Browse Pharmacies (Uber Eats style) */}
          <div className="healthcare-card p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Store className="h-5 w-5 text-primary" /> Browse Pharmacies
              <span className="ml-auto text-xs font-normal text-muted-foreground">{pharmacies.length} nearby</span>
            </h2>
            <input
              type="text"
              placeholder="Search pharmacies by name or area..."
              value={pharmacySearch}
              onChange={(e) => setPharmacySearch(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-4 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring mb-3"
            />
            <div className="flex flex-wrap items-center gap-2 mb-4 text-xs">
              <span className="text-muted-foreground">Sort:</span>
              {([
                { k: "rating", l: "Top rated" },
                { k: "delivery", l: "Fastest" },
                { k: "name", l: "A–Z" },
              ] as const).map((o) => (
                <button
                  key={o.k}
                  onClick={() => setPharmacySort(o.k)}
                  className={`px-2.5 py-1 rounded-full border ${pharmacySort === o.k ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:bg-accent"}`}
                >{o.l}</button>
              ))}
              <span className="mx-1 h-4 w-px bg-border" />
              <button
                onClick={() => setOpenNowOnly((v) => !v)}
                className={`px-2.5 py-1 rounded-full border ${openNowOnly ? "border-healthcare-green bg-healthcare-green/10 text-healthcare-green" : "border-border bg-card hover:bg-accent"}`}
              >Open now</button>
              <button
                onClick={() => setMinRating((r) => (r >= 4.5 ? 0 : r + 0.5))}
                className={`px-2.5 py-1 rounded-full border ${minRating > 0 ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:bg-accent"}`}
              >★ {minRating > 0 ? `${minRating.toFixed(1)}+` : "Any"}</button>
            </div>
            {loading && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
            {!loading && pharmacies.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6">No pharmacies onboarded yet.</p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {pharmacies
                .filter((p) => {
                  const q = pharmacySearch.toLowerCase();
                  const matchesText = !q || (p.organization_name || p.full_name).toLowerCase().includes(q) || (p.address ?? "").toLowerCase().includes(q);
                  const m = pharmacyMeta(p.user_id);
                  return matchesText && (!openNowOnly || m.isOpen) && m.rating >= minRating;
                })
                .sort((a, b) => {
                  const ma = pharmacyMeta(a.user_id);
                  const mb = pharmacyMeta(b.user_id);
                  if (pharmacySort === "rating") return mb.rating - ma.rating;
                  if (pharmacySort === "delivery") return ma.deliveryMin - mb.deliveryMin;
                  return (a.organization_name || a.full_name).localeCompare(b.organization_name || b.full_name);
                })
                .map((p) => {
                  const count = meds.filter((m) => m.pharmacy_id === p.user_id).length;
                  const name = p.organization_name || p.full_name;
                  const m = pharmacyMeta(p.user_id);
                  return (
                    <button
                      key={p.user_id}
                      onClick={() => setOpenPharmacy(p)}
                      className="group text-left rounded-xl border border-border bg-card overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5"
                    >
                      <div className="relative h-32 overflow-hidden">
                        <img src={pharmacyImage(p.user_id)} alt={name} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                        <div className="absolute top-2 left-2 rounded-full bg-background/90 backdrop-blur px-2 py-0.5 text-[10px] font-semibold text-healthcare-green flex items-center gap-1">
                          <Star className="h-2.5 w-2.5 fill-current" /> {m.rating.toFixed(1)}
                        </div>
                        <div className="absolute top-2 right-2 flex items-center gap-1">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${m.isOpen ? "bg-healthcare-green/90 text-white" : "bg-muted text-muted-foreground"}`}>
                            {m.isOpen ? "Open" : "Closed"}
                          </span>
                        </div>
                        <div className="absolute bottom-2 right-2 rounded-full bg-background/90 backdrop-blur px-2 py-0.5 text-[10px] font-medium text-foreground">
                          {m.deliveryLabel}
                        </div>
                      </div>
                      <div className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground line-clamp-1">{name}</p>
                          <span className="flex items-center gap-0.5 text-xs text-healthcare-green shrink-0">
                            <Star className="h-3 w-3 fill-current" /> {m.rating.toFixed(1)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{p.address || "Johannesburg"}</p>
                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{count} item{count === 1 ? "" : "s"}</span>
                          <span className="text-primary font-medium group-hover:underline">View shop →</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Search Medications across all pharmacies */}
          <div className="healthcare-card p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" /> Search All Medications
            </h2>
            <input
              type="text"
              placeholder="Search across every pharmacy..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-4 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring mb-4"
            />
            {loading && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
            {!loading && filteredMeds.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6">No medications match. Try a different search.</p>
            )}
            <div className="space-y-3">
              {filteredMeds.slice(0, 20).map((med) => {
                const ph = pharmacies.find((p) => p.user_id === med.pharmacy_id);
                return (
                  <div key={med.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div className="flex items-center gap-3">
                      <img src={medGeneric} alt="" loading="lazy" className="h-12 w-12 rounded-lg object-cover" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{med.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {ph?.organization_name || ph?.full_name || "Pharmacy"} · {med.stock_quantity} in stock
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-foreground">R {customerPrice(med.price).toFixed(2)}</span>
                        {med.requires_prescription && !hasApprovedRx(med) ? (
                          <Button size="sm" variant="outline" onClick={() => setRxFor(med)}>
                            <Stethoscope className="h-3.5 w-3.5" /> Upload Rx
                          </Button>
                        ) : (
                          <Button size="sm" variant="default" asChild>
                            <Link
                              to="/payment"
                              search={{ medId: med.id, name: med.name, price: Number(med.price), pharmacyId: med.pharmacy_id, qty: 1 }}
                            >
                              Order
                            </Link>
                          </Button>
                        )}
                      </div>
                      {med.requires_prescription && (
                        <span className="text-[10px] uppercase tracking-wide text-healthcare-sky">
                          {hasApprovedRx(med) ? "Rx approved ✓" : (rxStatusFor(med)?.status.replace("_", " ") ?? "Rx required")}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Prescriptions */}
          <div id="prescriptions" className="healthcare-card p-6 scroll-mt-24">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-primary" /> My Prescriptions
              {activePrescriptions.length > 0 && (
                <span className="ml-auto text-xs font-normal text-muted-foreground">{activePrescriptions.length} active</span>
              )}
            </h2>
            {loading && <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
            {!loading && prescriptions.length === 0 && (
              <p className="text-sm text-muted-foreground">No prescriptions on file. A hospital can issue one for you.</p>
            )}
            <div className="space-y-3">
              {prescriptions.slice(0, 5).map((p) => (
                <div key={p.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{p.medication_name}</p>
                      {p.dosage && <p className="text-xs text-muted-foreground">{p.dosage}</p>}
                      <p className="text-xs text-muted-foreground mt-0.5">Dr. {p.doctor_name || "—"} • {new Date(p.created_at).toLocaleDateString()}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${p.is_active === false ? "bg-muted text-muted-foreground" : "bg-healthcare-green/20 text-healthcare-green"}`}>
                      {p.is_active === false ? "inactive" : "active"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Prescription Uploads (verification status) */}
          <div className="healthcare-card p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> Prescription Uploads
              {pxUploads.length > 0 && (
                <span className="ml-auto text-xs font-normal text-muted-foreground">{pxUploads.length} total</span>
              )}
            </h2>
            {pxUploads.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No prescription uploads yet. When you order an Rx-required medicine you'll be prompted to upload one here.
              </p>
            )}
            <div className="space-y-3">
              {pxUploads.slice(0, 6).map((u) => {
                const ph = pharmacies.find((p) => p.user_id === u.pharmacy_id);
                const med = meds.find((m) => m.id === u.medication_id);
                return (
                  <div key={u.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {med?.name || "Prescription"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {ph?.organization_name || ph?.full_name || "Pharmacy"} · {new Date(u.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <PrescriptionStatusBadge status={u.status} />
                    </div>
                    {(u.status === "rejected" || u.status === "reupload_requested") && u.pharmacist_notes && (
                      <p className="mt-2 text-xs text-destructive">Pharmacist: {u.pharmacist_notes}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={async () => {
                          try {
                            const url = await getPrescriptionFileUrl(u.file_path);
                            window.open(url, "_blank", "noopener,noreferrer");
                          } catch (e: any) { toast.error(e?.message || "Could not open file"); }
                        }}
                      >View prescription</Button>
                      {(u.status === "rejected" || u.status === "reupload_requested") && med && (
                        <Button size="sm" className="h-7 text-xs" onClick={() => setRxFor(med)}>
                          Re-upload
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recent Orders */}
          <div id="orders" className="healthcare-card p-6 scroll-mt-24">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> Recent Orders
            </h2>
            {orders.length === 0 && !loading && (
              <p className="text-sm text-muted-foreground">You haven't placed any orders yet.</p>
            )}
            <div className="space-y-3">
              {orders.slice(0, 5).map((order) => (
                <div key={order.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono text-muted-foreground">{order.id.slice(0, 8)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[order.status] ?? "bg-accent"}`}>
                      {order.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground">{order.medication_name}</p>
                  <div className="flex items-center justify-between mt-1 gap-2">
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span>{new Date(order.created_at).toLocaleDateString()}</span>
                      <span>R {Number(order.total_amount).toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setChatOrderId(order.id)}>
                        <MessageCircle className="h-3 w-3" /> Chat
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" asChild>
                        <Link to="/payment" search={{ medId: undefined, pharmacyId: undefined, name: order.medication_name, price: Number(order.total_amount), qty: 1 }}>
                          <Repeat className="h-3 w-3" /> Reorder
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>


          {/* Active order timeline + ETA */}
          {activeDelivery && <ActiveOrderTimeline status={activeDelivery.status} />}

          {/* Live delivery mini-map */}
          {activeDelivery && (
            <div className="healthcare-card p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Live Delivery</h2>
                <span className="text-[11px] capitalize text-muted-foreground">{activeDelivery.status.replace(/_/g, " ")}</span>
              </div>
              <DeliveryMap orderId={activeDelivery.orderId} pickup={activeDelivery.pickup} dropoff={activeDelivery.dropoff} status={activeDelivery.status} className="h-44 w-full rounded-lg overflow-hidden" />
              <Button asChild size="sm" variant="outline" className="w-full mt-3"><Link to="/track">Open full tracker</Link></Button>
            </div>
          )}

          {/* Transactions */}
          <TransactionHistory role="patient" />

          {/* Saved delivery address */}
          <div id="address" className="scroll-mt-24"><SavedAddressCard /></div>

          {/* Refill reminders */}
          <div className="healthcare-card p-6">
            <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <Repeat className="h-5 w-5 text-primary" /> Refill Reminders
            </h2>
            {activePrescriptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active prescriptions to refill.</p>
            ) : (
              <div className="space-y-2">
                {activePrescriptions.slice(0, 3).map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{p.medication_name}</p>
                      <p className="text-xs text-muted-foreground">{p.dosage || "As prescribed"}</p>
                    </div>
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/payment" search={{ medId: undefined, pharmacyId: undefined, name: p.medication_name, price: 120, qty: 1 }}>
                        Refill
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payment methods */}
          <div id="payments" className="healthcare-card p-6 scroll-mt-24">
            <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" /> Payment Methods
            </h2>
            <p className="text-sm text-muted-foreground mb-3">
              {savedCards > 0
                ? `You have ${savedCards} saved payment method${savedCards === 1 ? "" : "s"}.`
                : "No saved cards yet. Add one at checkout for faster orders."}
            </p>
            <Button size="sm" variant="outline" className="w-full" onClick={() => setSettingsOpen(true)}>
              Manage payment methods
            </Button>
          </div>

          {/* Customer support */}
          <div id="support" className="healthcare-card p-6 scroll-mt-24">
            <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <LifeBuoy className="h-5 w-5 text-primary" /> Customer Support
            </h2>
            <p className="text-sm text-muted-foreground mb-3">Need help with an order or prescription? Our team is here 7 days a week.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="outline" asChild><a href="tel:+27800123456">Call us</a></Button>
              <Button size="sm" variant="default" asChild><Link to="/contact">Contact</Link></Button>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="healthcare-card p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-3">
              <Link
                to="/dashboard/patient"
                hash="prescriptions"
                className="flex flex-col items-center gap-2 rounded-lg border border-border p-4 transition-colors hover:bg-accent"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById("prescriptions")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                <Stethoscope className="h-5 w-5 text-primary" />
                <span className="text-xs font-medium text-foreground">Prescriptions</span>
              </Link>
              <Link to="/track" className="flex flex-col items-center gap-2 rounded-lg border border-border p-4 transition-colors hover:bg-accent">
                <MapPin className="h-5 w-5 text-primary" />
                <span className="text-xs font-medium text-foreground">Track Delivery</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Pharmacy detail dialog */}
      <Dialog open={!!openPharmacy} onOpenChange={(o) => !o && setOpenPharmacy(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Store className="h-5 w-5 text-primary" />
              {openPharmacy?.organization_name || openPharmacy?.full_name}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">{openPharmacy?.address || "Johannesburg"}</p>
          </DialogHeader>
          {openPharmacy && (
            <div className="relative -mx-6 -mt-2 h-36 overflow-hidden">
              <img src={pharmacyImage(openPharmacy.user_id)} alt="" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-background/95 to-transparent" />
            </div>
          )}
          <div className="space-y-2 mt-2">
            {openPharmacy && meds.filter((m) => m.pharmacy_id === openPharmacy.user_id).length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">No medications in stock at this pharmacy.</p>
            )}
            {openPharmacy && meds.filter((m) => m.pharmacy_id === openPharmacy.user_id).map((med) => (
              <div key={med.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="flex items-center gap-3">
                  <img src={medGeneric} alt="" loading="lazy" className="h-12 w-12 rounded-lg object-cover" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{med.name}</p>
                    <p className="text-xs text-muted-foreground">{med.stock_quantity} in stock</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">R {customerPrice(med.price).toFixed(2)}</span>
                  {med.requires_prescription && !hasApprovedRx(med) ? (
                    <Button size="sm" variant="outline" onClick={() => { setRxFor(med); setOpenPharmacy(null); }}>
                      <Stethoscope className="h-3.5 w-3.5" /> Upload Rx
                    </Button>
                  ) : (
                    <Button size="sm" asChild>
                      <Link to="/payment" search={{ medId: med.id, name: med.name, price: Number(med.price), pharmacyId: med.pharmacy_id, qty: 1 }}>
                        Order
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <OrderChatDialog orderId={chatOrderId} orderLabel={chatOrderId ? `Order ${chatOrderId.slice(0, 8)}` : ""} onClose={() => setChatOrderId(null)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Prescription upload dialog */}
      <Dialog open={!!rxFor} onOpenChange={(o) => !o && setRxFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-primary" /> Upload prescription
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {rxFor?.name} requires a valid prescription. Upload an image or PDF — your assigned pharmacy will verify it within minutes.
            </p>
          </DialogHeader>
          {rxFor && (
            <PrescriptionUploader
              pharmacyId={rxFor.pharmacy_id}
              medicationId={rxFor.id}
              onUploaded={() => setRxFor(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SavedAddressCard() {
  const { user } = useAuth();
  const [address, setAddress] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("address").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { setAddress(data?.address ?? ""); setLoaded(true); });
  }, [user]);

  async function save() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ address }).eq("user_id", user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Delivery address saved");
  }

  return (
    <div className="healthcare-card p-6">
      <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
        <MapPin className="h-5 w-5 text-primary" /> Delivery Address
      </h2>
      <textarea
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="Street, suburb, city, postcode"
        rows={2}
        disabled={!loaded}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <Button size="sm" className="mt-3 w-full" disabled={!loaded || saving} onClick={save}>
        {saving ? "Saving..." : "Save Address"}
      </Button>
      <p className="mt-2 text-xs text-muted-foreground">Used as the default delivery address at checkout.</p>
    </div>
  );
}

const TIMELINE_STEPS: { key: string; label: string }[] = [
  { key: "assigned", label: "Driver assigned" },
  { key: "picked_up", label: "Picked up from pharmacy" },
  { key: "in_transit", label: "On the way" },
  { key: "delivered", label: "Delivered" },
];

function ActiveOrderTimeline({ status }: { status: string }) {
  const idx = Math.max(0, TIMELINE_STEPS.findIndex((s) => s.key === status));
  const stepsLeft = TIMELINE_STEPS.length - 1 - idx;
  const eta = status === "delivered" ? "Delivered" : `~${stepsLeft * 8 + 4} min`;
  return (
    <div className="healthcare-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" /> Order Timeline
        </h2>
        <span className="text-xs font-medium text-primary">ETA {eta}</span>
      </div>
      <ol className="space-y-2">
        {TIMELINE_STEPS.map((s, i) => {
          const done = i <= idx;
          const active = i === idx && status !== "delivered";
          return (
            <li key={s.key} className="flex items-center gap-3 text-xs">
              <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold ${done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"} ${active ? "ring-2 ring-primary/30 animate-pulse" : ""}`}>
                {i + 1}
              </span>
              <span className={done ? "text-foreground font-medium" : "text-muted-foreground"}>{s.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
