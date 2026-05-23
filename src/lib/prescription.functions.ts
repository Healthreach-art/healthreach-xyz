import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const UUID_LOOSE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const uuidLoose = z.string().regex(UUID_LOOSE, "Invalid UUID");

const cartSchema = z.object({
  items: z
    .array(
      z.object({
        medId: uuidLoose,
        pharmacyId: uuidLoose,
        prescriptionUploadId: uuidLoose.optional().nullable(),
      })
    )
    .min(1)
    .max(50),
});

export interface ValidationIssue {
  medId: string;
  reason:
    | "missing"
    | "expired"
    | "rejected"
    | "pending"
    | "wrong_pharmacy"
    | "unknown_medication"
    | "no_repeats"
    | "high_risk";
  message: string;
  uploadId?: string;
  expiresAt?: string | null;
  repeatsRemaining?: number;
}

/**
 * Backend prescription validity + refill enforcement.
 * Checks approval, expiry, pharmacy match, repeats remaining, and fraud risk.
 */
export const validateCartPrescriptions = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input) => cartSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const medIds = Array.from(new Set(data.items.map((i) => i.medId)));

    const { data: meds, error: medErr } = await supabase
      .from("medications")
      .select("id, name, pharmacy_id, requires_prescription, stock_quantity")
      .in("id", medIds);
    if (medErr) throw new Error(medErr.message);

    const issues: ValidationIssue[] = [];
    const now = Date.now();

    for (const it of data.items) {
      const med = meds?.find((m: any) => m.id === it.medId);
      if (!med) {
        issues.push({ medId: it.medId, reason: "unknown_medication", message: "Medicine no longer available." });
        continue;
      }
      if (!med.requires_prescription) continue;

      let upload: any = null;
      if (it.prescriptionUploadId) {
        const { data: u } = await supabase
          .from("prescription_uploads")
          .select("id, status, expires_at, pharmacy_id, patient_id, repeats_total, repeats_used, fraud_score")
          .eq("id", it.prescriptionUploadId)
          .maybeSingle();
        upload = u;
      }
      if (!upload) {
        // Fall back to any approved prescription in the patient's library that
        // isn't already locked to a different pharmacy.
        const { data: us } = await supabase
          .from("prescription_uploads")
          .select("id, status, expires_at, pharmacy_id, patient_id, repeats_total, repeats_used, fraud_score")
          .eq("patient_id", userId)
          .eq("status", "approved")
          .or(`pharmacy_id.is.null,pharmacy_id.eq.${it.pharmacyId}`)
          .order("created_at", { ascending: false })
          .limit(1);
        upload = us?.[0];
      }

      if (!upload) {
        issues.push({ medId: it.medId, reason: "missing", message: `${med.name} needs a prescription. Add one to your library first.` });
        continue;
      }
      if (upload.patient_id !== userId) {
        issues.push({ medId: it.medId, reason: "missing", message: "Prescription does not belong to you." });
        continue;
      }
      // Library prescriptions (pharmacy_id null) are fine; pharmacy-locked ones must match.
      if (upload.pharmacy_id && upload.pharmacy_id !== it.pharmacyId) {
        issues.push({ medId: it.medId, reason: "wrong_pharmacy", message: `${med.name} prescription is already locked to another pharmacy.`, uploadId: upload.id });
        continue;
      }
      if (upload.status === "rejected") {
        issues.push({ medId: it.medId, reason: "rejected", message: `${med.name} prescription was rejected.`, uploadId: upload.id });
        continue;
      }
      if (upload.status !== "approved") {
        issues.push({ medId: it.medId, reason: "pending", message: `${med.name} prescription is still awaiting verification.`, uploadId: upload.id });
        continue;
      }
      if (upload.expires_at && new Date(upload.expires_at).getTime() < now) {
        issues.push({ medId: it.medId, reason: "expired", message: `${med.name} prescription expired. Please upload a fresh one.`, uploadId: upload.id, expiresAt: upload.expires_at });
        continue;
      }
      if (upload.fraud_score >= 75) {
        issues.push({ medId: it.medId, reason: "high_risk", message: `${med.name} prescription flagged high risk — pharmacist re-review required.`, uploadId: upload.id });
        continue;
      }
      const remaining = (upload.repeats_total ?? 0) - (upload.repeats_used ?? 0);
      if ((upload.repeats_total ?? 0) > 0 && remaining <= 0) {
        issues.push({ medId: it.medId, reason: "no_repeats", message: `${med.name} has no repeats remaining. Doctor renewal required.`, uploadId: upload.id, repeatsRemaining: 0 });
        continue;
      }
    }

    return { valid: issues.length === 0, issues };
  });

/**
 * Claim a library prescription for a specific pharmacy at order time. Idempotent;
 * raises if already locked to a different pharmacy.
 */
export const claimPrescriptionForPharmacy = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input) => z.object({ uploadId: z.string().uuid(), pharmacyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("claim_prescription_for_pharmacy", {
      _upload_id: data.uploadId,
      _pharmacy_id: data.pharmacyId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Consume one repeat and issue a unique dispense token (RX-XXXXXXXXXX).
 * Called after a successful payment for an Rx-required item.
 */
export const consumePrescription = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input) => z.object({ uploadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: token, error } = await supabase.rpc("consume_prescription_repeat", { _upload_id: data.uploadId });
    if (error) throw new Error(error.message);
    return { token: token as string };
  });
