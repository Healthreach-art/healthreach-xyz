import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CreditCard } from "lucide-react";
import { SettingsDialog } from "@/components/SettingsDialog";

export const Route = createFileRoute("/dashboard/patient/payment-methods")({
  head: () => ({ meta: [{ title: "Payment Methods — HEALTHREACH" }] }),
  component: () => <RoleGuard allow="patient"><Page /></RoleGuard>,
});

function Page() {
  const [open, setOpen] = useState(false);
  return (
    <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Payment Methods</h1>
        <p className="text-sm text-muted-foreground">Saved cards for one-tap checkout.</p>
      </div>
      <div className="healthcare-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <CreditCard className="h-5 w-5 text-primary" />
          <p className="text-sm text-foreground">Manage your saved payment methods.</p>
        </div>
        <Button onClick={() => setOpen(true)}>Open payment settings</Button>
      </div>
      <SettingsDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
