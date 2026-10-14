import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { useAuth } from "@/hooks/useAuth";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";
import { useEffect, useState } from "react";
import { fetchVerification, isVerificationComplete } from "@/components/PatientVerificationCard";
import {
  Users, MapPin, LifeBuoy, Wallet, CreditCard, ChevronRight, LogOut, RefreshCw,
  ShieldCheck, Lock, FileText, ClipboardList, Bell, KeyRound, MessageCircle, type LucideIcon,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/patient/account")({
  head: () => ({
    meta: [
      { title: "My Account — HealthReachCare" },
      { name: "description", content: "Manage your HealthReachCare profile, payments and preferences." },
      { property: "og:title", content: "My Account — HealthReachCare" },
      { property: "og:description", content: "Manage your HealthReachCare profile and settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <RoleGuard allow="patient"><AccountPage /></RoleGuard>,
});

type Item = { to: string; label: string; icon: LucideIcon };
const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: "Wallet & Payments",
    items: [
      { to: "/dashboard/patient/wallet", label: "HealthReachCare Wallet", icon: Wallet },
      { to: "/dashboard/patient/payment-methods", label: "Payment Methods & Cards", icon: CreditCard },
      { to: "/dashboard/patient/medical-aid", label: "Medical Aid Details", icon: ShieldCheck },
    ],
  },
  {
    title: "Orders & Care",
    items: [
      { to: "/dashboard/patient/orders", label: "Medication Orders", icon: ClipboardList },
      { to: "/dashboard/patient/prescriptions", label: "Prescriptions & Documents", icon: FileText },
      { to: "/dashboard/patient/reminders", label: "Medication Reminders", icon: Bell },
    ],
  },
  {
    title: "Places & Family",
    items: [
      { to: "/dashboard/patient/addresses", label: "Saved Delivery Addresses", icon: MapPin },
      { to: "/dashboard/patient/family", label: "Family & Dependents", icon: Users },
    ],
  },
  {
    title: "Security & Privacy",
    items: [
      { to: "/privacy", label: "Privacy & POPIA Preferences", icon: Lock },
      { to: "/forgot-password", label: "Change or reset password", icon: KeyRound },
    ],
  },
  {
    title: "Support",
    items: [
      { to: "/dashboard/patient/support", label: "Customer Support", icon: LifeBuoy },
    ],
  },
];

function AccountPage() {
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();
  const [verified, setVerified] = useState(false);
  useEffect(() => {
    if (!user?.id) return;
    fetchVerification(user.id).then((value) => setVerified(value?.status === "approved" && isVerificationComplete(value)));
  }, [user?.id]);
  const name = profile?.full_name || "Patient";
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Account</h1>
        <p className="text-sm text-muted-foreground">Manage your profile, payments, and preferences.</p>
      </div>

      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
          {name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="font-semibold text-foreground">{name}</p>
          <p className="text-sm text-muted-foreground">{profile?.email || user?.email || "No email available"}</p>
        </div>
        <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${verified ? "bg-healthcare-green/10 text-healthcare-green" : "bg-muted text-muted-foreground"}`}>
          <ShieldCheck className="h-3.5 w-3.5" /> {verified ? "Verified patient" : "Patient account"}
        </span>
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

      <a href="https://wa.me/27797285078?text=Hi%20HealthReachCare%2C%20I%20need%20support." target="_blank" rel="noreferrer" className="flex items-center gap-3 border border-border px-4 py-3 text-sm hover:bg-accent">
        <MessageCircle className="h-5 w-5 text-primary" /><span className="flex-1">Chat with support on WhatsApp</span><ChevronRight className="h-4 w-4 text-muted-foreground" />
      </a>
      <section>
        <h2 className="mb-2 text-sm font-semibold text-primary">Account safety</h2>
        <DeleteAccountButton variant="inline" />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-primary">Session</h2>
        <div className="space-y-3">
          <button
            onClick={async () => { await signOut(); navigate({ to: "/login" }); }}
            className="flex w-full items-center gap-3 rounded-2xl border border-destructive/40 px-4 py-3 text-sm font-medium text-destructive hover:bg-destructive/5"
          >
            <LogOut className="h-5 w-5" /> Sign out
          </button>
        </div>
      </section>
    </div>
  );
}
