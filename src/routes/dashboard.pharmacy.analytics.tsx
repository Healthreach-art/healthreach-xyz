import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { PharmacyAnalytics } from "@/components/PharmacyAnalytics";

export const Route = createFileRoute("/dashboard/pharmacy/analytics")({
  head: () => ({ meta: [{ title: "Analytics — HealthReachCare" }] }),
  component: () => (
    <RoleGuard allow="pharmacy">
      <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
          <p className="text-sm text-muted-foreground">Performance and revenue insights for your pharmacy.</p>
        </div>
        <PharmacyAnalytics />
      </div>
    </RoleGuard>
  ),
});
