export const HOMECARE_SERVICES = [
  "Elderly care",
  "Post-operative care",
  "Wound care",
  "Chronic medication support",
  "Physiotherapy assistance",
  "Palliative care",
  "Baby & maternity care",
  "Disability support",
  "Nursing visits",
  "Companion care",
] as const;

export const HOMECARE_COMPANY_DOCS = [
  { key: "business_registration", label: "Business registration (CIPC)" },
  { key: "tax_clearance", label: "Tax clearance / tax number letter" },
  { key: "proof_of_address", label: "Proof of business address" },
  { key: "bank_confirmation", label: "Bank confirmation letter" },
  { key: "professional_indemnity", label: "Professional indemnity cover" },
  { key: "staff_qualifications", label: "Staff qualifications / registrations" },
] as const;

export const HOMECARE_INDIVIDUAL_DOCS = [
  { key: "id_document", label: "Identity document" },
  { key: "qualification", label: "Qualification certificate" },
  { key: "professional_registration", label: "Professional registration (e.g. SANC)" },
  { key: "police_clearance", label: "Police clearance certificate" },
  { key: "proof_of_address", label: "Proof of address" },
  { key: "bank_confirmation", label: "Bank confirmation letter" },
] as const;

export function docsFor(providerType: string | null | undefined) {
  return providerType === "individual" ? HOMECARE_INDIVIDUAL_DOCS : HOMECARE_COMPANY_DOCS;
}

export const APPROVAL_LABEL: Record<string, string> = {
  pending: "Pending review",
  under_review: "Documents requested",
  approved: "Approved",
  rejected: "Rejected",
  suspended: "Suspended",
  expired: "Expired",
};

export const ASSIGNMENT_LABEL: Record<string, string> = {
  offered: "Awaiting provider",
  accepted: "Accepted",
  declined: "Declined",
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed — awaiting customer",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
};

export const REQUEST_LABEL: Record<string, string> = {
  pending_review: "Waiting for admin review",
  assigned: "Provider assigned",
  accepted: "Provider accepted",
  scheduled: "Scheduled",
  in_progress: "Visit in progress",
  completed: "Completed — please confirm",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  rejected: "Declined",
};
