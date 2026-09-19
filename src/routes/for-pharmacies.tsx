import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Store, Package, TrendingUp, Bell, ShieldCheck, Receipt } from "lucide-react";

export const Route = createFileRoute("/for-pharmacies")({
  head: () => ({
    meta: [
      { title: "For Pharmacies — HealthReachCare" },
      { name: "description", content: "Reach more patients, manage stock, accept orders in real time, and grow with HealthReachCare." },
      { property: "og:title", content: "For Pharmacies — HealthReachCare" },
      { property: "og:description", content: "Online storefront, live orders, prescription verification, and analytics for South African pharmacies." },
    ],
  }),
  component: ForPharmaciesPage,
});

const features = [
  { icon: Store, title: "Your online storefront", body: "Patients within your service radius find your pharmacy first — auto-assigned by distance and stock." },
  { icon: Bell, title: "Real-time order requests", body: "Get 60 seconds to accept incoming orders. Escalates to the next pharmacy if you pass." },
  { icon: Package, title: "Inventory management", body: "Track stock, set low-stock alerts, and pause out-of-stock medicines instantly." },
  { icon: ShieldCheck, title: "Prescription verification", body: "Approve, reject, or request re-uploads with built-in fraud scoring and audit logs." },
  { icon: Receipt, title: "Invoicing & payouts", body: "Automatic invoices on every delivered order. Daily ZAR settlement to your bank." },
  { icon: TrendingUp, title: "Analytics", body: "Revenue, top medications, accept rate, and delivery times — all in one dashboard." },
];

function ForPharmaciesPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <section className="container-narrow px-4 sm:px-6 py-16">
          <div className="max-w-2xl">
            <span className="inline-block text-xs font-semibold uppercase tracking-wider text-primary mb-3">For Pharmacies</span>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">More patients. Less admin.</h1>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Join the HealthReachCare network and start receiving orders from patients in your area — with delivery already handled.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg"><Link to="/signup" search={{ role: "pharmacy" }}>Register pharmacy</Link></Button>
              <Button asChild size="lg" variant="outline"><Link to="/contact">Talk to sales</Link></Button>
            </div>
            <p className="text-xs text-muted-foreground mt-3">Approval required — our team verifies licensed pharmacies within 24 hours.</p>
          </div>
        </section>

        <section className="container-narrow px-4 sm:px-6 pb-20">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="healthcare-card p-6">
                <div className="h-10 w-10 rounded-lg bg-healthcare-teal/15 flex items-center justify-center mb-3">
                  <f.icon className="h-5 w-5 text-healthcare-teal" />
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
