export interface PrescriptionEligibilityRecord {
  status: string;
  expires_at?: string | null;
  repeats_total?: number | null;
  repeats_used?: number | null;
  fraud_score?: number | null;
}

export type PrescriptionValidity = {
  state: "valid" | "expiring" | "expired" | "pending";
  days: number | null;
};

const MS_DAY = 86_400_000;

export function prescriptionValidity(
  prescription: PrescriptionEligibilityRecord,
  now = Date.now(),
): PrescriptionValidity {
  if (prescription.status !== "approved") return { state: "pending", days: null };
  if (!prescription.expires_at) return { state: "valid", days: null };
  const expiry = new Date(prescription.expires_at).getTime();
  if (!Number.isFinite(expiry)) return { state: "expired", days: null };
  const days = Math.floor((expiry - now) / MS_DAY);
  if (expiry < now) return { state: "expired", days };
  if (days <= 14) return { state: "expiring", days };
  return { state: "valid", days };
}

export function isPrescriptionRefillEligible(
  prescription: PrescriptionEligibilityRecord,
  now = Date.now(),
) {
  const validity = prescriptionValidity(prescription, now);
  const total = prescription.repeats_total ?? 0;
  const used = prescription.repeats_used ?? 0;
  return (validity.state === "valid" || validity.state === "expiring")
    && (total <= 0 || used < total)
    && (prescription.fraud_score ?? 0) < 75;
}
