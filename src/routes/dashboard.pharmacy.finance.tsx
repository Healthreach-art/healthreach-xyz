import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { PharmacyFinance } from "@/components/PharmacyFinance";

export const Route = createFileRoute("/dashboard/pharmacy/finance")({
  head: () => ({ meta: [{ title: "Finance — HealthReachCare" }] }),
  component: () => (
    <RoleGuard allow="pharmacy">
      <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Finance</h1>
          <p className="text-sm text-muted-foreground">Earnings, payouts, and bank details.</p>
        </div>
        <PharmacyFinance />
      </div>
    </RoleGuard>
  ),
});
