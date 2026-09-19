import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Pill, Clock, ShieldCheck, Truck, Bell, Stethoscope } from "lucide-react";

export const Route = createFileRoute("/for-patients")({
  head: () => ({
    meta: [
      { title: "For Patients — HealthReachCare" },
      { name: "description", content: "Order prescriptions, set medication reminders, and get medicines delivered to your door across South Africa." },
      { property: "og:title", content: "For Patients — HealthReachCare" },
      { property: "og:description", content: "Prescriptions, reminders, and same-day medicine delivery in South Africa." },
    ],
  }),
  component: ForPatientsPage,
});

const features = [
  { icon: Pill, title: "Order medication", body: "Search nearby pharmacies, upload your script, and check out securely in ZAR." },
  { icon: Truck, title: "Same-day delivery", body: "Drivers dispatched from the closest pharmacy with stock — live tracking included." },
  { icon: Bell, title: "Smart reminders", body: "Never miss a dose. Schedule reminders for every medication on your plan." },
  { icon: Stethoscope, title: "AI health assistant", body: "Get medication info, interaction warnings, and triage guidance any time." },
  { icon: ShieldCheck, title: "Private & secure", body: "Your health data is encrypted and only shared with pharmacies you choose." },
  { icon: Clock, title: "Repeat prescriptions", body: "Approved scripts auto-refill up to 5 times — no admin, no waiting rooms." },
];

function ForPatientsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <section className="container-narrow px-4 sm:px-6 py-16">
          <div className="max-w-2xl">
            <span className="inline-block text-xs font-semibold uppercase tracking-wider text-primary mb-3">For Patients</span>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">Healthcare that comes to you.</h1>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Order prescriptions, manage reminders, and receive medication on the same day — all from one secure account.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg"><Link to="/signup" search={{ role: "patient" }}>Create patient account</Link></Button>
              <Button asChild size="lg" variant="outline"><Link to="/login">Sign in</Link></Button>
            </div>
          </div>
        </section>

        <section className="container-narrow px-4 sm:px-6 pb-20">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="healthcare-card p-6">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                  <f.icon className="h-5 w-5 text-primary" />
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
