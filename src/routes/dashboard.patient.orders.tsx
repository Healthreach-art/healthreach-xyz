import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { OrderHistory } from "@/components/OrderHistory";

export const Route = createFileRoute("/dashboard/patient/orders")({
  head: () => ({ meta: [{ title: "My Orders — HealthReachCareCare" }] }),
  component: () => (
    <RoleGuard allow="patient">
      <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Orders</h1>
          <p className="text-sm text-muted-foreground">Active, recent and full order history.</p>
        </div>
        <OrderHistory />
      </div>
    </RoleGuard>
  ),
});
