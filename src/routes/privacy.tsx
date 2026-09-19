import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — HealthReachCareCare" },
      { name: "description", content: "How HealthReachCareCare collects, uses, and protects your personal and health information under POPIA." },
      { property: "og:title", content: "Privacy Policy — HealthReachCareCare" },
      { property: "og:description", content: "Our commitment to protecting patient health data under South African POPIA law." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const updated = "20 May 2026";
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container-narrow px-4 sm:px-6 py-16">
        <article className="prose prose-slate max-w-3xl mx-auto">
          <h1 className="text-4xl font-bold text-foreground mb-2">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground mb-8">Last updated: {updated}</p>

          <Section title="1. Who we are">
            HealthReachCareCare ("we", "us") operates the healthreachcare.co.za platform connecting patients, pharmacies, and drivers across South Africa. We comply with the Protection of Personal Information Act (POPIA, Act 4 of 2013).
          </Section>

          <Section title="2. Information we collect">
            <ul className="list-disc pl-5 space-y-1">
              <li><b>Account data:</b> name, email, phone, role.</li>
              <li><b>Health data:</b> prescriptions you upload, medication orders, reminders.</li>
              <li><b>Location data:</b> delivery addresses and (with consent) live location during delivery.</li>
              <li><b>Payment data:</b> card tokens via our payment provider — we never store full card numbers.</li>
            </ul>
          </Section>

          <Section title="3. How we use your information">
            <ul className="list-disc pl-5 space-y-1">
              <li>To fulfil your medication orders and route them to nearby pharmacies.</li>
              <li>To verify prescriptions and prevent fraud.</li>
              <li>To send order, delivery, and payment notifications.</li>
              <li>To improve the platform and provide customer support.</li>
            </ul>
          </Section>

          <Section title="4. Sharing your data">
            We share only what is necessary with the pharmacy fulfilling your order, the driver delivering it, and our payment processor. We never sell your data.
          </Section>

          <Section title="5. Data security">
            All data is encrypted in transit (TLS) and at rest. Access is restricted by Row Level Security and role-based controls. Prescription files are stored in private buckets accessible only to you and your chosen pharmacy.
          </Section>

          <Section title="6. Your rights under POPIA">
            You may access, correct, or delete your personal information at any time from your account settings, or by emailing <a className="text-primary" href="mailto:support@healthreachcare.co.za">support@healthreachcare.co.za</a>. You may also lodge a complaint with the Information Regulator of South Africa.
          </Section>

          <Section title="7. Data retention">
            Health and order records are retained for 6 years as required by South African healthcare regulations. Account data is deleted within 30 days of account closure, except where law requires longer retention.
          </Section>

          <Section title="8. Contact">
            Information Officer — <a className="text-primary" href="mailto:support@healthreachcare.co.za">support@healthreachcare.co.za</a> · Cape Town, South Africa.
          </Section>
        </article>
      </main>
      <Footer />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-xl font-semibold text-foreground mb-2">{title}</h2>
      <div className="text-sm text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}
