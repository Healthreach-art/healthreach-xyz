import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — HEALTHREACH" },
      { name: "description", content: "The rules and responsibilities for using the HEALTHREACH platform in South Africa." },
      { property: "og:title", content: "Terms of Service — HEALTHREACH" },
      { property: "og:description", content: "Terms governing patient, pharmacy, and driver use of HEALTHREACH." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  const updated = "20 May 2026";
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container-narrow px-4 sm:px-6 py-16">
        <article className="prose prose-slate max-w-3xl mx-auto">
          <h1 className="text-4xl font-bold text-foreground mb-2">Terms of Service</h1>
          <p className="text-sm text-muted-foreground mb-8">Last updated: {updated}</p>

          <Section title="1. Acceptance of terms">
            By creating a HEALTHREACH account, you agree to these terms. If you do not agree, do not use the service.
          </Section>

          <Section title="2. Eligibility">
            You must be 18 or older, or use the service under the supervision of a parent or guardian. Pharmacies and drivers must hold valid South African registrations and licences.
          </Section>

          <Section title="3. Medical disclaimer">
            HEALTHREACH is a logistics and ordering platform — not a medical provider. Information from our AI assistant is for guidance only and is not a substitute for professional medical advice. Always consult a registered healthcare practitioner.
          </Section>

          <Section title="4. Prescriptions">
            You may only upload prescriptions issued to you by a licensed practitioner. Uploading another person's prescription or a falsified document is fraud and will be reported.
          </Section>

          <Section title="5. Payments and refunds">
            All prices are shown in South African Rand (ZAR) and include applicable taxes. Refunds are processed automatically when an order is cancelled because no pharmacy can fulfil it. Delivered orders are non-refundable unless the medication was incorrect or damaged on arrival.
          </Section>

          <Section title="6. Pharmacy obligations">
            Pharmacies must hold valid SAHPRA / SAPC registration, dispense only what is prescribed, accept or decline incoming offers within 60 seconds, and complete orders accurately. Repeated breaches may result in removal from the platform.
          </Section>

          <Section title="7. Driver obligations">
            Drivers must verify the patient's 4-digit pickup code before handing over medication, follow road rules, and protect the cold chain for temperature-sensitive items.
          </Section>

          <Section title="8. Prohibited use">
            You may not use HEALTHREACH to traffic controlled substances outside a valid prescription, scrape data, reverse-engineer the platform, or harass other users.
          </Section>

          <Section title="9. Liability">
            To the extent permitted by South African law, HEALTHREACH is not liable for indirect or consequential losses. Our total liability is capped at the value of your most recent order.
          </Section>

          <Section title="10. Changes">
            We may update these terms. Material changes will be notified in-app or by email at least 14 days before taking effect.
          </Section>

          <Section title="11. Governing law">
            These terms are governed by the laws of the Republic of South Africa. Disputes are subject to the jurisdiction of the courts of Johannesburg.
          </Section>

          <Section title="12. Contact">
            <a className="text-primary" href="mailto:legal@healthreach.co.za">legal@healthreach.co.za</a>
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
