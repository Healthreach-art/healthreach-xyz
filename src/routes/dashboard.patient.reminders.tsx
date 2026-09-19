import { createFileRoute, Link } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { MedicationReminders } from "@/components/MedicationReminders";

export const Route = createFileRoute("/dashboard/patient/reminders")({
  head: () => ({ meta: [{ title: "Reminders & Refills — HealthReachCare" }] }),
  component: () => (
    <RoleGuard allow="patient">
      <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
      <Link to="/dashboard/patient" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to Dashboard
      </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reminders & Refills</h1>
          <p className="text-sm text-muted-foreground">Never miss a dose or refill.</p>
        </div>
        <MedicationReminders />
      </div>
    </RoleGuard>
  ),
});
