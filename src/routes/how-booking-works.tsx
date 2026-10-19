import { createFileRoute, Link } from "@tanstack/react-router";
import { Stethoscope, Home } from "lucide-react";
import journey from "@/assets/booking-journey.png";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/how-booking-works")({
  head: () => ({
    meta: [
      { title: "How Booking Works — Doctors & Home Care | HealthReachCare" },
      { name: "description", content: "See every step of booking a doctor appointment or home care service on HealthReachCare, from choosing a need to saving your favourite provider." },
      { property: "og:title", content: "How Booking Works on HealthReachCare" },
      { property: "og:description", content: "Step-by-step doctor appointment and home care booking journey." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HowBookingWorks,
});

function HowBookingWorks() {
  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <h1 className="text-2xl font-bold text-foreground md:text-3xl">How booking works</h1>
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
          <img src={journey} alt="Doctor booking and home care booking process, step by step" className="min-w-[900px] w-full" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button asChild size="lg">
            <Link to="/doctors"><Stethoscope className="mr-2 h-5 w-5" />Book a Doctor</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/dashboard/patient/homecare"><Home className="mr-2 h-5 w-5" />Book Home Care</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
