import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { useAuth } from "@/hooks/useAuth";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";
import {
  CalendarCheck, Home, Pill, Truck, FileText, Stethoscope, Bell, ClipboardList,
  Users, MapPin, LifeBuoy, Wallet, CreditCard, ChevronRight, LogOut, RefreshCw,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/patient/account")({
  head: () => ({
    meta: [
      { title: "My Account — HealthReachCare" },
      { name: "description", content: "Manage your HealthReachCare profile, care services, addresses and account settings." },
      { property: "og:title", content: "My Account — HealthReachCare" },
      { property: "og:description", content: "Manage your HealthReachCare profile and settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <RoleGuard allow="patient"><AccountPage /></RoleGuard>,
});

type Item = { to: string; label: string; icon: typeof Home };
const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: "Care and services",
    items: [
      { to: "/dashboard/patient/find", label: "Book Appointment", icon: CalendarCheck },
      { to: "/dashboard/patient/homecare", label: "Home Care", icon: Home },
      { to: "/dashboard/patient/search", label: "Order Medicine", icon: Pill },
      { to: "/dashboard/patient/orders", label: "Orders & Deliveries", icon: Truck },
      { to: "/dashboard/patient/prescriptions", label: "Prescriptions & Documents", icon: FileText },
      { to: "/dashboard/patient/consultations", label: "My Consultations", icon: Stethoscope },
      { to: "/dashboard/patient/reminders", label: "Reminders", icon: Bell },
    ],
  },
  {
    title: "Personal and health information",
    items: [
      { to: "/dashboard/patient/activity", label: "Health Records", icon: ClipboardList },
      { to: "/dashboard/patient/family", label: "Family Profiles", icon: Users },
      { to: "/dashboard/patient/addresses", label: "Addresses", icon: MapPin },
      { to: "/dashboard/patient/medical-aid", label: "Medical Aid", icon: CreditCard },
      { to: "/dashboard/patient/wallet", label: "Wallet", icon: Wallet },
    ],
  },
  {
    title: "Help and account management",
    items: [{ to: "/dashboard/patient/support", label: "Support", icon: LifeBuoy }],
  },
];

function AccountPage() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const name = profile?.full_name || "Patient";
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Account</h1>
        <p className="text-sm text-muted-foreground">Manage your profile, settings and preferences.</p>
      </div>

      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
          {name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="font-semibold text-foreground">{name}</p>
          <p className="text-sm text-primary">Patient</p>
        </div>
      </div>

      <Link to="/dashboard/patient/orders" className="flex items-center gap-3 rounded-2xl bg-healthcare-mint/30 p-4">
        <RefreshCw className="h-8 w-8 text-healthcare-green" />
        <div>
          <p className="font-semibold text-foreground">Refill made easy!</p>
          <p className="text-sm text-muted-foreground">Reorder your medications in just one click.</p>
          <p className="mt-1 text-sm font-semibold text-healthcare-green">Reorder Now →</p>
        </div>
      </Link>

      {SECTIONS.map((s) => (
        <section key={s.title}>
          <h2 className="mb-2 text-sm font-semibold text-primary">{s.title}</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {s.items.map((it) => (
              <li key={it.to + it.label}>
                <Link to={it.to} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-accent">
                  <it.icon className="h-5 w-5 text-primary" />
                  <span className="flex-1 text-foreground">{it.label}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <button
        onClick={async () => { await signOut(); navigate({ to: "/login" }); }}
        className="flex w-full items-center gap-3 rounded-2xl border border-destructive/40 px-4 py-3 text-sm font-medium text-destructive hover:bg-destructive/5"
      >
        <LogOut className="h-5 w-5" /> Sign out
      </button>
      <DeleteAccountButton variant="inline" />
    </div>
  );
}
