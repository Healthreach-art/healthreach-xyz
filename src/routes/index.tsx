import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import {
  Pill,
  Building2,
  Truck,
  ShieldCheck,
  Heart,
  Clock,
  Users,
  CreditCard,
  Activity,
} from "lucide-react";
import heroBg from "@/assets/hero-bg.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HEALTHREACH — Order Medication & Manage Care in South Africa" },
      { name: "description", content: "Order medication from verified South African pharmacies, upload prescriptions, track deliveries live, and coordinate care — all in one HEALTHREACH account." },
      { property: "og:title", content: "HEALTHREACH — Order Medication & Manage Care in South Africa" },
      { property: "og:description", content: "Order medication, upload prescriptions, track deliveries live, and coordinate care across pharmacies, hospitals and drivers." },
      { property: "og:url", content: "https://healthreachhub.lovable.app/" },
    ],
    links: [
      { rel: "canonical", href: "https://healthreachhub.lovable.app/" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "HEALTHREACH",
          url: "https://healthreachhub.lovable.app/",
          email: "info@healthreach.co.za",
          telephone: "+27-79-728-5078",
          address: {
            "@type": "PostalAddress",
            addressLocality: "Cape Town",
            addressCountry: "ZA",
          },
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "HEALTHREACH",
          url: "https://healthreachhub.lovable.app/",
        }),
      },
    ],
  }),
  component: HomePage,
});

const features = [
  {
    icon: Pill,
    title: "Medication Ordering",
    description: "Search, compare, and order medications from verified pharmacies with ease.",
  },
  {
    icon: Building2,
    title: "Inventory Management",
    description: "Real-time stock tracking and automated alerts for pharmacies and hospitals.",
  },
  {
    icon: Heart,
    title: "Patient Care",
    description: "Coordinate patient care with digital prescriptions and treatment records.",
  },
  {
    icon: Truck,
    title: "Delivery Tracking",
    description: "Real-time delivery tracking from pharmacy to your doorstep.",
  },
  {
    icon: CreditCard,
    title: "Secure Payments",
    description: "Multiple payment options including cards, EFT, and mobile payments.",
  },
  {
    icon: ShieldCheck,
    title: "Data Security",
    description: "Enterprise-grade encryption protecting all patient and payment data.",
  },
];

const roles = [
  {
    icon: Users,
    title: "Patients",
    description: "Order medication, track deliveries, and manage your health records.",
    color: "bg-primary/10 text-primary",
  },
  {
    icon: Pill,
    title: "Pharmacies",
    description: "Manage inventory, fulfill orders, and process prescriptions efficiently.",
    color: "bg-healthcare-teal/20 text-healthcare-teal",
  },
  {
    icon: Building2,
    title: "Hospitals",
    description: "Issue digital prescriptions and coordinate patient care seamlessly.",
    color: "bg-healthcare-green/20 text-healthcare-green",
  },
  {
    icon: Truck,
    title: "Drivers",
    description: "Accept deliveries, navigate routes, and confirm drop-offs on the go.",
    color: "bg-healthcare-sky/20 text-healthcare-sky",
  },
  {
    icon: Activity,
    title: "Administrators",
    description: "Oversee the entire platform with analytics, user management, and reports.",
    color: "bg-accent text-accent-foreground",
  },
];

const steps = [
  { step: "1", title: "Sign Up", description: "Create your account and select your role." },
  { step: "2", title: "Connect", description: "Link with pharmacies, hospitals, or delivery services." },
  { step: "3", title: "Manage", description: "Order medication, manage inventory, or coordinate care." },
  { step: "4", title: "Track", description: "Monitor orders, deliveries, and health records in real-time." },
];

function HomePage() {
  const { user, role, loading } = useAuth();
  if (!loading && user && role) {
    return <Navigate to={`/dashboard/${role}` as any} />;
  }
  return (
    <div>
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={heroBg}
            alt=""
            className="h-full w-full object-cover"
            width={1920}
            height={1080}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-foreground/80 via-foreground/60 to-foreground/30" />
        </div>
        <div className="relative container-narrow px-4 sm:px-6 py-24 sm:py-32 lg:py-40">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/20 px-4 py-1.5 text-sm font-medium text-primary-foreground backdrop-blur-sm">
              <Clock className="h-4 w-4" />
              Healthcare, simplified
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-primary-foreground leading-[1.1]">
              Your Central Hub for Integrated Healthcare
            </h1>
            <p className="mt-6 text-lg text-primary-foreground/80 leading-relaxed max-w-xl">
              Connecting patients, pharmacies, hospitals, and delivery services in one seamless platform. Order medication, coordinate care, and track everything in real-time.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link to="/login">
                <Button variant="hero" size="xl">
                  Sign In
                </Button>
              </Link>
              <Link to="/signup">
                <Button variant="heroOutline" size="xl" className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground">
                  Create an account
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="section-padding bg-background">
        <div className="container-narrow">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
              Everything You Need
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              A comprehensive platform designed to streamline every aspect of healthcare management.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title} className="healthcare-card p-6">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Role Cards Section */}
      <section className="section-padding bg-muted/40">
        <div className="container-narrow">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
              Built for Every Role
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              Tailored dashboards and workflows for each participant in the healthcare ecosystem.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {roles.map((role) => (
              <div key={role.title} className="healthcare-card p-6 flex flex-col">
                <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-lg ${role.color}`}>
                  <role.icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{role.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed flex-1">{role.description}</p>
                <Button variant="ghost" size="sm" className="mt-4 w-fit text-primary">
                  Learn more →
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="section-padding bg-background">
        <div className="container-narrow">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
              How It Works
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              Get started in minutes with a simple, intuitive process.
            </p>
          </div>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((item) => (
              <div key={item.step} className="text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full healthcare-gradient text-xl font-bold text-primary-foreground">
                  {item.step}
                </div>
                <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Become a Partner */}
      <section className="section-padding bg-healthcare-light/40">
        <div className="container-narrow">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">Become a Partner</h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              Grow your pharmacy or earn on the road — join the HEALTHREACH network.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
            <div className="healthcare-card p-6 flex flex-col items-start">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-healthcare-green/15 text-healthcare-green">
                <Pill className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Become a Pharmacy</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed flex-1">
                Reach more patients, manage inventory, and fulfill orders with our pharmacy dashboard.
              </p>
              <Link to="/signup" search={{ role: "pharmacy" } as any} className="mt-4">
                <Button variant="default">Apply as Pharmacy</Button>
              </Link>
            </div>
            <div className="healthcare-card p-6 flex flex-col items-start">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-healthcare-teal/20 text-healthcare-teal">
                <Truck className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Become a Driver</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed flex-1">
                Deliver medication across your area, set your own hours, and get paid weekly.
              </p>
              <Link to="/signup" search={{ role: "driver" } as any} className="mt-4">
                <Button variant="default">Apply as Driver</Button>
              </Link>
            </div>
            <div className="healthcare-card p-6 flex flex-col items-start">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Stethoscope className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Register as a Doctor</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed flex-1">
                HPCSA-registered? Self-register, upload your legal documents, and start taking bookings once verified.
              </p>
              <Link to="/signup" search={{ role: "doctor" } as any} className="mt-4">
                <Button variant="default">Apply as Doctor</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="section-padding healthcare-gradient">
        <div className="container-narrow text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-primary-foreground">
            Ready to Transform Healthcare?
          </h2>
          <p className="mt-4 text-lg text-primary-foreground/80 max-w-xl mx-auto">
            Join thousands of healthcare professionals and patients already using HEALTHREACH.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link to="/signup">
              <Button variant="heroOutline" size="xl" className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground">
                Sign Up Free
              </Button>
            </Link>
            <Link to="/contact">
              <Button variant="ghost" size="xl" className="text-primary-foreground hover:bg-primary-foreground/10">
                Contact Sales
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
