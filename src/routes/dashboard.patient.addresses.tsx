import { ArrowLeft, Home } from "lucide-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { AddressBook } from "@/components/AddressBook";

export const Route = createFileRoute("/dashboard/patient/addresses")({
  head: () => ({ meta: [{ title: "Saved Addresses — HealthReachCare" }] }),
  component: () => (
    <RoleGuard allow="patient">
        <Link to="/dashboard/patient" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Dashboard
        </Link>
      <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Saved Addresses</h1>
          <p className="text-sm text-muted-foreground">Manage delivery locations.</p>
        </div>
        <AddressBook />
      </div>
    </RoleGuard>
  ),
});
