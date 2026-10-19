import { createFileRoute } from "@tanstack/react-router";
import { BookingJourney } from "@/components/BookingJourney";

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
  component: () => (
    <main className="min-h-screen bg-primary/5 px-4 py-8">
      <div className="mx-auto max-w-[1600px]"><BookingJourney /></div>
    </main>
  ),
});
