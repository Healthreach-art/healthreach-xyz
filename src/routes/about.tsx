import { createFileRoute } from "@tanstack/react-router";
import { Heart, Target, Users, Globe } from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Us — HEALTHREACH" },
      { name: "description", content: "Learn about HEALTHREACH's mission to transform healthcare delivery across South Africa." },
      { property: "og:title", content: "About Us — HEALTHREACH" },
      { property: "og:description", content: "Our mission is to make healthcare accessible, efficient, and transparent for everyone." },
      { property: "og:url", content: "https://healthreachhub.lovable.app/about" },
    ],
    links: [{ rel: "canonical", href: "https://healthreachhub.lovable.app/about" }],
  }),
  component: AboutPage,
});

const values = [
  {
    icon: Heart,
    title: "Patient-First",
    description: "Every decision we make starts with what's best for patients and their health outcomes.",
  },
  {
    icon: Target,
    title: "Precision",
    description: "We ensure accuracy in prescriptions, inventory, and deliveries — because in healthcare, details matter.",
  },
  {
    icon: Users,
    title: "Collaboration",
    description: "We bring together patients, pharmacies, hospitals, and drivers into one connected ecosystem.",
  },
  {
    icon: Globe,
    title: "Accessibility",
    description: "Making quality healthcare management available to everyone, everywhere in South Africa.",
  },
];

function AboutPage() {
  return (
    <div>
      <section className="section-padding healthcare-gradient">
        <div className="container-narrow text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-primary-foreground">About HEALTHREACH</h1>
          <p className="mt-4 text-lg text-primary-foreground/80 max-w-2xl mx-auto">
            We're on a mission to make healthcare delivery seamless, transparent, and accessible across South Africa.
          </p>
        </div>
      </section>

      <section className="section-padding bg-background">
        <div className="container-narrow">
          <div className="grid gap-12 lg:grid-cols-2 items-center">
            <div>
              <h2 className="text-3xl font-bold text-foreground">Our Mission</h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                HEALTHREACH was founded with a simple yet powerful vision: to bridge the gap between patients and healthcare providers through technology. We believe that everyone deserves timely access to medication and quality healthcare coordination.
              </p>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                Our platform connects the entire healthcare value chain — from doctors issuing digital prescriptions, to pharmacies managing inventory, to delivery drivers ensuring medications reach patients safely and on time.
              </p>
            </div>
            <div className="rounded-2xl bg-muted/50 p-8 border border-border">
              <div className="grid grid-cols-2 gap-6 text-center">
                <div>
                  <div className="text-3xl font-bold text-primary">500+</div>
                  <div className="mt-1 text-sm text-muted-foreground">Pharmacies</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-primary">50K+</div>
                  <div className="mt-1 text-sm text-muted-foreground">Patients</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-primary">100+</div>
                  <div className="mt-1 text-sm text-muted-foreground">Hospitals</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-primary">1K+</div>
                  <div className="mt-1 text-sm text-muted-foreground">Delivery Drivers</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-padding bg-muted/40">
        <div className="container-narrow">
          <h2 className="text-3xl font-bold text-foreground text-center mb-12">Our Values</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((value) => (
              <div key={value.title} className="healthcare-card p-6 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <value.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{value.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{value.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
