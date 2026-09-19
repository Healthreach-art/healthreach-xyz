import { createFileRoute, Link } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { PharmacyInventoryPanel } from "@/components/PharmacyInventoryPanel";

export const Route = createFileRoute("/dashboard/pharmacy/low-stock")({
  head: () => ({ meta: [{ title: "Low Stock — HealthReachCare Pharmacy" }] }),
  component: () => (
    <RoleGuard allow="pharmacy">
      <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Low Stock</h1>
            <p className="text-sm text-muted-foreground">Items at or below 10 units. Top them up to keep listings live.</p>
          </div>
          <Link to="/dashboard/pharmacy/inventory" className="text-sm text-primary font-semibold hover:underline">
            View full inventory →
          </Link>
        </div>
        <PharmacyInventoryPanel lowStockOnly />
      </div>
    </RoleGuard>
  ),
});
