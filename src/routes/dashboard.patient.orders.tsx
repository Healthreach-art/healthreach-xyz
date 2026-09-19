import { ArrowLeft } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { OrderHistory } from "@/components/OrderHistory";

export const Route = createFileRoute("/dashboard/patient/orders")({
  head: () => ({ meta: [{ title: "My Orders — HealthReachCare" }] }),
  component: () => (
    <RoleGuard allow="patient">
        <Link to="/dashboard/patient" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Dashboard
        </Link>
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
