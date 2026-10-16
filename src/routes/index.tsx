import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import {
  Pill,
  Truck,
  ShieldCheck,
  Heart,
  Clock,
  HousePlus,
  Stethoscope,
  Users,
  CalendarCheck as CalendarCheckIcon,
} from "lucide-react";
import heroAsset from "@/assets/hero-delivery.png.asset.json";
const heroBg = heroAsset.url;
import tileMed from "@/assets/tile-order-medicine.png";
import tileRx from "@/assets/tile-upload-prescription.png";
import tileTrack from "@/assets/tile-track-delivery.png";
import tileAppt from "@/assets/tile-book-appointment.png";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HealthReachCare | Healthcare and Medicine Access" },
      { name: "description", content: "HealthReachCare connects South African patients with verified pharmacies, doctors and home-care providers — order medicine, upload prescriptions and track deliveries." },
      { property: "og:title", content: "HealthReachCare | Healthcare and Medicine Access" },
      { property: "og:description", content: "Connect with verified South African pharmacies, doctors and home-care providers. Order medicine, upload prescriptions and track deliveries." },
      { property: "og:url", content: "https://healthreachcare.co.za/" },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://healthreachcare.co.za/og-image.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://healthreachcare.co.za/og-image.png" },
    ],
    links: [
      { rel: "canonical", href: "https://healthreachcare.co.za/" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "HealthReachCare",
          url: "https://healthreachcare.co.za/",
          logo: "https://healthreachcare.co.za/icon-512.png",
          email: "support@healthreachcare.co.za",
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
          name: "HealthReachCare",
          url: "https://healthreachcare.co.za/",
        }),
      },
    ],
  }),
  component: HomePage,
});

const features = [
  {
    icon: Pill,
    img: tileMed,
    title: "Medication Ordering",
    description: "Search, compare, and order medications from verified pharmacies with ease.",
  },
  {
    icon: CalendarCheckIcon,
    img: tileAppt,
    title: "Book Appointments",
    description: "Book doctors and pharmacists in minutes — in-person or virtual.",
  },
  {
    icon: Users,
    img: tileRx,
    title: "Prescriptions & Care",
    description: "Upload prescriptions, manage refills, and coordinate patient care.",
  },
  {
    icon: Truck,
    img: tileTrack,
    title: "Delivery Tracking",
    description: "Real-time delivery tracking from pharmacy to your doorstep.",
  },
  {
    icon: ShieldCheck,
    img: undefined,
    title: "Secure & Compliant",
    description: "Enterprise-grade encryption protecting all patient and payment data.",
  },
];

const roles = [
  {
    icon: Pill,
    title: "Pharmacy",
    description: "Manage prescriptions, medicine orders and deliveries.",
    to: "/for-pharmacies",
  },
  {
    icon: HousePlus,
    title: "Homecare Provider",
    description: "Manage homecare services, bookings, staff and patient visits.",
    to: "/signup",
    search: { role: "homecare_company" },
  },
  {
    icon: Stethoscope,
    title: "Doctors",
    description: "Manage consultations, appointments, patient records and prescriptions.",
    to: "/for-doctors",
  },
  {
    icon: Heart,
    title: "Patients",
    description: "Access healthcare services, prescriptions, appointments and medicine deliveries.",
    to: "/for-patients",
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
    <div className="overflow-x-hidden">
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
        <div className="relative container-narrow px-4 sm:px-6 py-16 sm:py-24 lg:py-36">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/20 px-3 py-1.5 text-xs sm:text-sm font-medium text-primary-foreground backdrop-blur-sm">
              <Clock className="h-4 w-4 shrink-0" />
              Healthcare, simplified
            </div>
            <h1 className="text-3xl sm:text-5xl break-words lg:text-6xl font-bold tracking-tight text-primary-foreground leading-[1.1]">
              HealthReachCare
            </h1>
            <p className="mt-4 sm:mt-6 text-base sm:text-lg text-primary-foreground/80 leading-relaxed max-w-xl">
              Your central hub for integrated healthcare. Connect with doctors, pharmacies, home care providers, hospitals, and delivery services in one seamless platform.
            </p>
            <div className="mt-6 sm:mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
              <Link to="/login" className="w-full sm:w-auto">
                <Button variant="hero" size="xl" className="w-full sm:w-auto">
                  Sign In
                </Button>
              </Link>
              <Link to="/signup" className="w-full sm:w-auto">
                <Button variant="heroOutline" size="xl" className="w-full sm:w-auto border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground">
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
              <div key={feature.title} className="healthcare-card overflow-hidden flex flex-col">
                {feature.img ? (
                  <div className="relative h-40 w-full overflow-hidden bg-muted">
                    <img src={feature.img} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div className="h-40 w-full healthcare-gradient flex items-center justify-center">
                    <feature.icon className="h-12 w-12 text-primary-foreground" />
                  </div>
                )}
                <div className="p-6">
                  <div className="mb-3 flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <feature.icon className="h-4 w-4 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">{feature.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
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
          <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
            {roles.map((role) => (
              <Link
                key={role.title}
                to={role.to as any}
                search={role.search as any}
                className="group h-full rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md"
              >
                <div className="flex h-full flex-col justify-between">
                  <div>
                    <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <role.icon className="h-6 w-6" />
                    </div>
                    <h3 className="text-xl font-bold text-foreground">{role.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{role.description}</p>
                  </div>
                  <span className="mt-6 inline-flex text-sm font-semibold text-primary transition-transform group-hover:translate-x-1">Get Started →</span>
                </div>
              </Link>
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
              Grow your pharmacy or earn on the road — join the HealthReachCare network.
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
            Join thousands of healthcare professionals and patients already using HealthReachCare.
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
