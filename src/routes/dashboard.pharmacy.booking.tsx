import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { PharmacyBookingSettings } from "@/components/PharmacyBookingSettings";

export const Route = createFileRoute("/dashboard/pharmacy/booking")({
  head: () => ({ meta: [{ title: "Booking Setup — HEALTHREACH" }] }),
  component: () => (
    <RoleGuard allow="pharmacy">
      <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Booking setup</h1>
          <p className="text-sm text-muted-foreground">Configure how patients can book appointments with you.</p>
        </div>
        <PharmacyBookingSettings />
      </div>
    </RoleGuard>
  ),
});
