export type PaymentProof = { status?: string; reference?: string; amount?: number; currency?: string; metadata?: Record<string, unknown> };

export function matchesMarketplacePayment(proof: PaymentProof | undefined, expected: { reference: string; amount: number; patientId: string; targetId: string; kind: string }) {
  return !!proof && proof.status === "success" && proof.currency === "ZAR"
    && proof.reference === expected.reference && proof.amount === expected.amount
    && Number.isSafeInteger(expected.amount) && expected.amount > 0
    && proof.metadata?.patient_id === expected.patientId
    && proof.metadata?.target_id === expected.targetId && proof.metadata?.payment_kind === expected.kind;
}

export function canDeliverPaidOrder(order: Record<string, unknown>) {
  return order.payment_status === "paid" && typeof order.payment_reference === "string"
    && order.payment_reference.length > 0 && order.status === "ready";
}