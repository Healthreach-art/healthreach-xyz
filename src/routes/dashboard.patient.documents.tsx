import { createFileRoute, Link } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { PatientVerificationCard } from "@/components/PatientVerificationCard";
import { FileText, ArrowLeft, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/dashboard/patient/documents")({
  head: () => ({ meta: [{ title: "My documents — HEALTHREACH" }] }),
  component: () => (
    <RoleGuard allow="patient">
      <DocumentsPage />
    </RoleGuard>
  ),
});

function DocumentsPage() {
  return (
    <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link to="/dashboard/patient" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
          </Link>
          <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" /> My documents
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Upload your identity documents once. They'll auto-attach to every prescription order — no need to send them again at checkout.
          </p>
        </div>
      </div>

      <PatientVerificationCard />

      <div className="rounded-2xl border border-border bg-card p-5 text-xs text-muted-foreground space-y-2">
        <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4 text-healthcare-green" /> How your documents are used
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Only the pharmacy you order from and HEALTHREACH admins can see your documents.</li>
          <li>Stored encrypted; never shared with drivers or other patients.</li>
          <li>Required by South African pharmacy law for scheduled medication dispensing.</li>
          <li>To order on behalf of someone else, add them to <Link to="/dashboard/patient/family" className="underline">Family Profiles</Link> and upload their ID + selfie there.</li>
        </ul>
      </div>
    </div>
  );
}
