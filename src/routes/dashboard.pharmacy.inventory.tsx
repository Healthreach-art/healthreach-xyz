import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { PharmacyInventoryPanel } from "@/components/PharmacyInventoryPanel";

export const Route = createFileRoute("/dashboard/pharmacy/inventory")({
  head: () => ({ meta: [{ title: "Inventory — HEALTHREACH Pharmacy" }] }),
  component: () => (
    <RoleGuard allow="pharmacy">
      <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inventory</h1>
          <p className="text-sm text-muted-foreground">Manage medications, stock levels, prices, batches and expiries.</p>
        </div>
        <PharmacyInventoryPanel />
      </div>
    </RoleGuard>
  ),
});
