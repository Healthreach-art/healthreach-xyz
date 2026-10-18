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
  accepted: "Provider accepted",
  declined: "Declined",
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed — awaiting customer",
  confirmed: "Customer confirmed",
  cancelled: "Cancelled",
};

export const REQUEST_LABEL: Record<string, string> = {
  pending_review: "Request received — awaiting coordinator review",
  quote_pending: "Quote ready — awaiting your response",
  quote_accepted: "Quote accepted — coordinator confirming next steps",
  quote_declined: "Quote declined",
  assigned: "Provider assigned",
  accepted: "Provider accepted",
  scheduled: "Scheduled",
  in_progress: "Visit in progress",
  completed: "Completed — please confirm",
  confirmed: "Customer confirmed",
  cancelled: "Cancelled",
  rejected: "Declined",
};

export function isHomecareServiceActive(service: { is_active?: boolean | null; archived_at?: string | null; deleted_at?: string | null } | null | undefined) {
  if (!service) return false;
  return service.is_active !== false && !service.archived_at && !service.deleted_at;
}

export function isHomecareServicePriceValid(price: unknown) {
  return typeof price === "number" && Number.isFinite(price) && price >= 0;
}

export function canAccessHomecareRequest(userId: string | null | undefined, requestPatientId: string | null | undefined, role: string | null | undefined) {
  if (!userId || !requestPatientId) return false;
  if (role === "admin" || role === "homecare_operations") return true;
  return role === "patient" && userId === requestPatientId;
}

export function canAccessHomecareConversation(userId: string | null | undefined, requestPatientId: string | null | undefined, role: string | null | undefined) {
  return canAccessHomecareRequest(userId, requestPatientId, role);
}

export function canConfirmHomecareBooking(payload: {
  status?: string | null;
  payment_status?: string | null;
  payment_verified_at?: string | null;
  payment_verified?: boolean | null;
}) {
  const status = payload.status ?? "";
  if (status === "confirmed") return true;
  const paymentStatus = payload.payment_status ?? "pending";
  const paymentVerified = payload.payment_verified ?? Boolean(payload.payment_verified_at);
  return paymentStatus === "paid" && paymentVerified;
}

export type HomecareBookingFilter =
  | "incoming"
  | "pending_review"
  | "awaiting_payment"
  | "confirmed"
  | "active"
  | "completed"
  | "cancelled"
  | "past";

export function filterHomecareRequestsForCoordinator<T extends { status: string }>(
  requests: T[],
  filter: HomecareBookingFilter,
): T[] {
  switch (filter) {
    case "incoming":
      return requests.filter((request) => request.status === "pending_review");
    case "pending_review":
      return requests.filter((request) => request.status === "pending_review");
    case "awaiting_payment":
      return requests.filter((request) => ["quote_pending", "quote_accepted"].includes(request.status));
    case "confirmed":
      return requests.filter((request) => ["confirmed", "assigned", "accepted", "scheduled", "in_progress"].includes(request.status));
    case "active":
      return requests.filter((request) => ["assigned", "accepted", "scheduled", "in_progress"].includes(request.status));
    case "completed":
      return requests.filter((request) => request.status === "completed");
    case "cancelled":
      return requests.filter((request) => ["cancelled", "declined", "rejected"].includes(request.status));
    case "past":
      return requests.filter((request) => ["completed", "confirmed", "cancelled", "declined", "rejected"].includes(request.status));
    default:
      return requests;
  }
}

export function getHomecareStatusSummary<T extends { status: string }>(requests: T[]) {
  return {
    incoming: requests.filter((request) => request.status === "pending_review").length,
    awaitingPayment: requests.filter((request) => ["quote_pending", "quote_accepted"].includes(request.status)).length,
    confirmed: requests.filter((request) => ["quote_accepted", "assigned", "accepted", "scheduled", "in_progress", "confirmed"].includes(request.status)).length,
    active: requests.filter((request) => ["assigned", "accepted", "scheduled", "in_progress"].includes(request.status)).length,
    completed: requests.filter((request) => request.status === "completed").length,
    cancelled: requests.filter((request) => ["cancelled", "declined", "rejected"].includes(request.status)).length,
  };
}
