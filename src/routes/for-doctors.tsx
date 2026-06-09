import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { CalendarCheck, ClipboardCheck, FileText, MessageSquareText, ShieldCheck, Stethoscope } from "lucide-react";

export const Route = createFileRoute("/for-doctors")({
  head: () => ({
    meta: [
      { title: "For Doctors — HEALTHREACH" },
      { name: "description", content: "HPCSA-registered doctors can join HEALTHREACH, upload verification documents, take bookings, and support patients online." },
      { property: "og:title", content: "For Doctors — HEALTHREACH" },
      { property: "og:description", content: "Doctor verification, appointment bookings, digital care notes, and provider messaging for South African clinicians." },
    ],
  }),
  component: ForDoctorsPage,
});

const features = [
  { icon: ShieldCheck, title: "HPCSA verification", body: "Upload your HPCSA certificate, ID, qualifications, and malpractice cover for admin approval." },
  { icon: CalendarCheck, title: "Appointment bookings", body: "Receive patient bookings, manage availability, and track upcoming consultations." },
  { icon: FileText, title: "Digital prescriptions", body: "Create prescriptions and care notes that connect patients to verified pharmacy fulfilment." },
  { icon: MessageSquareText, title: "Ask a provider", body: "Message patients when an active appointment or order thread needs follow-up." },
  { icon: ClipboardCheck, title: "Verification status", body: "See upload progress, document status, approval updates, and rejection notes from your dashboard." },
  { icon: Stethoscope, title: "Clinical profile", body: "Show your specialities, consultation fee, location, and services once verified." },
];

function ForDoctorsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <section className="container-narrow px-4 sm:px-6 py-16">
          <div className="max-w-2xl">
            <span className="inline-block text-xs font-semibold uppercase tracking-wider text-primary mb-3">For Doctors</span>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">Bring your practice onto HEALTHREACH.</h1>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              HPCSA-registered doctors can self-register, upload legal documents, receive approval updates, and start taking patient bookings.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg"><Link to="/signup" search={{ role: "doctor" }}>Register as doctor</Link></Button>
              <Button asChild size="lg" variant="outline"><Link to="/doctors">View doctor directory</Link></Button>
            </div>
            <p className="text-xs text-muted-foreground mt-3">Approval required — doctors must provide HPCSA, ID, qualification, and malpractice documents before operating.</p>
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