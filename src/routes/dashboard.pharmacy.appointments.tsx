import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { PharmacyAppointments } from "@/components/PharmacyAppointments";

export const Route = createFileRoute("/dashboard/pharmacy/appointments")({
  head: () => ({ meta: [{ title: "Appointments — HEALTHREACH" }] }),
  component: () => (
    <RoleGuard allow="pharmacy">
      <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Appointments</h1>
          <p className="text-sm text-muted-foreground">Manage patient appointment requests.</p>
        </div>
        <PharmacyAppointments />
      </div>
    </RoleGuard>
  ),
});
