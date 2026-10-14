import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, HousePlus, Search, Stethoscope, Pill } from "lucide-react";
import { RoleGuard } from "@/components/RoleGuard";
import { PatientAddressHeader } from "@/components/PatientAddressHeader";

const POPULAR_SERVICES = [
  { name: "General Practitioner", description: "Everyday health concerns" },
  { name: "Paediatrician", description: "Healthcare for children" },
  { name: "Cardiologist", description: "Heart and circulation" },
  { name: "Diabetes Care", description: "Support for ongoing care" },
  { name: "Wound care", description: "Nursing and dressing visits", homecare: true },
];

export const Route = createFileRoute("/dashboard/patient/search")({
  head: () => ({ meta: [{ title: "Search Services — HealthReachCare" }] }),
  component: () => <RoleGuard allow="patient"><SearchPage /></RoleGuard>,
});

function SearchPage() {
  return (
    <>
      <PatientAddressHeader />
      <main className="container-narrow space-y-7 px-4 py-8 pb-24 sm:px-6">
        <header>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Find a health service</h1>
          <p className="mt-1 text-sm text-muted-foreground">Choose a care team or service to get started.</p>
        </header>
        <nav aria-label="Patient services" className="grid gap-3 sm:grid-cols-3">
          <ServiceLink to="/dashboard/patient/find" icon={Stethoscope} title="Doctors & Specialists" detail="Find and book a doctor" tone="sky" />
          <ServiceLink to="/dashboard/patient/medications" icon={Pill} title="Order Medication & Pharmacy" detail="Browse available medicines" tone="green" />
          <ServiceLink to="/dashboard/patient/homecare" icon={HousePlus} title="Home Care & Nursing" detail="Request care at home" tone="teal" />
        </nav>
        <section aria-labelledby="popular-services-title">
          <h2 id="popular-services-title" className="mb-3 text-base font-bold text-foreground sm:text-lg">Popular Medical Services</h2>
          <div className="divide-y divide-border border border-border bg-card">
            {POPULAR_SERVICES.map((service) => (
              <Link key={service.name} to={service.homecare ? "/dashboard/patient/homecare" : "/dashboard/patient/find"} search={service.homecare ? undefined : { q: service.name }} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-primary/10 text-primary">{service.homecare ? <HousePlus className="h-4 w-4" /> : <Search className="h-4 w-4" />}</span>
                <span className="min-w-0 flex-1"><strong className="block text-sm text-foreground">{service.name}</strong><span className="text-xs text-muted-foreground">{service.description}</span></span>
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

function ServiceLink({ to, icon: Icon, title, detail, tone }: {
  to: "/dashboard/patient/find" | "/dashboard/patient/medications" | "/dashboard/patient/homecare";
  icon: typeof Stethoscope;
  title: string;
  detail: string;
  tone: "sky" | "green" | "teal";
}) {
  const colors = { sky: "border-sky-200 bg-sky-50 text-sky-900", green: "border-emerald-200 bg-emerald-50 text-emerald-950", teal: "border-teal-200 bg-teal-50 text-teal-950" };
  return <Link to={to} className={`group flex min-w-0 items-center gap-3 border p-4 transition-colors hover:brightness-95 ${colors[tone]}`}><Icon className="h-5 w-5 shrink-0" /><span className="min-w-0 flex-1"><strong className="block text-sm">{title}</strong><span className="text-xs opacity-75">{detail}</span></span><ChevronRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" /></Link>;
}
