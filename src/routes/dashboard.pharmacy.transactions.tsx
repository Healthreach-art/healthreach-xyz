import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { TransactionHistory } from "@/components/TransactionHistory";

export const Route = createFileRoute("/dashboard/pharmacy/transactions")({
  head: () => ({ meta: [{ title: "Transactions — HealthReachCareCare" }] }),
  component: () => (
    <RoleGuard allow="pharmacy">
      <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Transactions</h1>
          <p className="text-sm text-muted-foreground">All payments received and their breakdown.</p>
        </div>
        <TransactionHistory role="pharmacy" />
      </div>
    </RoleGuard>
  ),
});
