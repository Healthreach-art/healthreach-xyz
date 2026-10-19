export function matchesDoctorPayment(payment: { status?: string; reference?: string; amount?: number; currency?: string; metadata?: Record<string, unknown> } | undefined, reference: string, appointmentId: string, expectedCents: number) {
  return !!payment && payment.status === "success" && payment.reference === reference && payment.currency === "ZAR"
    && Number.isSafeInteger(expectedCents) && expectedCents > 0 && payment.amount === expectedCents
    && payment.metadata?.appointment_id === appointmentId && payment.metadata?.payment_type === "doctor_booking_fee";
}