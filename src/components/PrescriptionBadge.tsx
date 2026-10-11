import { FileText } from "lucide-react";

export function PrescriptionBadge({
  requiresPrescription = false,
  prescriptionAttached = false,
}: {
  requiresPrescription?: boolean | null;
  prescriptionAttached?: boolean | null;
}) {
  if (!requiresPrescription && !prescriptionAttached) return null;
  const label = prescriptionAttached ? "Rx attached" : "Rx required";
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-300">
      <FileText className="h-3 w-3" />
      {label}
    </span>
  );
}
