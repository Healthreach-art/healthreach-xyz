import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { TransactionHistory } from "@/components/TransactionHistory";

export const Route = createFileRoute("/dashboard/patient/transactions")({
  head: () => ({ meta: [{ title: "Transactions — HealthReachCareCare" }] }),
  component: () => (
    <RoleGuard allow="patient">
      <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Transaction History</h1>
          <p className="text-sm text-muted-foreground">All your payments and receipts.</p>
        </div>
        <TransactionHistory role="patient" />
      </div>
    </RoleGuard>
  ),
});
