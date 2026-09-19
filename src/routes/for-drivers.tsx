import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Bike, MapPin, Wallet, ShieldCheck, Clock, Star } from "lucide-react";

export const Route = createFileRoute("/for-drivers")({
  head: () => ({
    meta: [
      { title: "For Drivers — HealthReachCare" },
      { name: "description", content: "Earn flexibly delivering medications across South Africa. Daily payouts, smart routing, and clear pickup codes." },
      { property: "og:title", content: "For Drivers — HealthReachCare" },
      { property: "og:description", content: "Flexible medication delivery work. Daily ZAR payouts and live route navigation." },
    ],
  }),
  component: ForDriversPage,
});

const features = [
  { icon: Bike, title: "Flexible shifts", body: "Go online when it suits you. Accept or skip every delivery offer." },
  { icon: MapPin, title: "Live routing", body: "Pickup and drop-off navigation with real-time patient location updates." },
  { icon: Wallet, title: "Daily payouts", body: "Earnings settled to your bank every day. Track wallet, tips, and bonuses." },
  { icon: ShieldCheck, title: "Verified handoff", body: "4-digit patient pickup code confirms successful delivery — no disputes." },
  { icon: Clock, title: "Quick onboarding", body: "Upload ID, licence, and vehicle papers — approved within 24 hours." },
  { icon: Star, title: "Build your rating", body: "On-time, polite, and accurate deliveries unlock priority offers." },
];

function ForDriversPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <section className="container-narrow px-4 sm:px-6 py-16">
          <div className="max-w-2xl">
            <span className="inline-block text-xs font-semibold uppercase tracking-wider text-primary mb-3">For Drivers</span>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">Deliver care. Earn flexibly.</h1>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Become a HealthReachCare driver and deliver medications to patients in your area. Daily payouts, your schedule, your hustle.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg"><Link to="/signup" search={{ role: "driver" }}>Become a driver</Link></Button>
              <Button asChild size="lg" variant="outline"><Link to="/driver/onboarding">Onboarding</Link></Button>
            </div>
            <p className="text-xs text-muted-foreground mt-3">Requirements: South African ID, valid driver's licence, and a registered vehicle.</p>
          </div>
        </section>

        <section className="container-narrow px-4 sm:px-6 pb-20">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="healthcare-card p-6">
                <div className="h-10 w-10 rounded-lg bg-healthcare-sky/15 flex items-center justify-center mb-3">
                  <f.icon className="h-5 w-5 text-healthcare-sky" />
                </div>
                <h3 className="font-semibold text-foreground mb-1">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
