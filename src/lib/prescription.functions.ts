import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";
import { firestoreAdmin } from "@/lib/firestore-admin";
import { isMedicineExpired } from "@/lib/medicine-catalog";

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
  .middleware([requireFirebaseAuth])
  .inputValidator((input) => cartSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const medIds = Array.from(new Set(data.items.map((i) => i.medId)));

    const { data: meds, error: medErr } = await firestoreAdmin
      .from("medications_public")
      .select("id, name, pharmacy_id, requires_prescription, stock_quantity, expiry_date, is_active, is_demo")
      .in("id", medIds);
    if (medErr) throw new Error(medErr.message);

    const issues: ValidationIssue[] = [];
    const now = Date.now();

    for (const it of data.items) {
      const med = meds?.find((m: any) => m.id === it.medId);
      if (
        !med
        || med.is_active !== true
        || med.is_demo !== false
        || Number(med.stock_quantity) <= 0
        || isMedicineExpired(med.expiry_date)
      ) {
        issues.push({ medId: it.medId, reason: "unknown_medication", message: "Medicine no longer available." });
        continue;
      }
      if (!med.requires_prescription) continue;

      let upload: any = null;
      if (it.prescriptionUploadId) {
        const { data: u } = await firestoreAdmin
          .from("prescription_uploads")
          .select("id, status, expires_at, pharmacy_id, patient_id, repeats_total, repeats_used, fraud_score")
          .eq("id", it.prescriptionUploadId)
          .maybeSingle();
        upload = u;
      }
      if (!upload) {
        // Fall back to any approved prescription in the patient's library that
        // isn't already locked to a different pharmacy.
        const { data: us } = await firestoreAdmin
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
  .middleware([requireFirebaseAuth])
  .inputValidator((input) => z.object({ uploadId: z.string().uuid(), pharmacyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: prescription, error: readError } = await firestoreAdmin
      .from("prescription_uploads")
      .select("id, patient_id, pharmacy_id")
      .eq("id", data.uploadId)
      .maybeSingle();
    if (readError) throw readError;
    if (!prescription) throw new Error("Prescription was not found.");
    if (prescription.patient_id !== context.userId) {
      throw new Error("Not authorized to claim this prescription.");
    }
    if (prescription.pharmacy_id && prescription.pharmacy_id !== data.pharmacyId) {
      throw new Error("Prescription is already claimed by a different pharmacy.");
    }
    const { error } = await firestoreAdmin
      .from("prescription_uploads")
      .update({ pharmacy_id: data.pharmacyId })
      .eq("id", data.uploadId);
    if (error) throw error;
    return { ok: true };
  });

/**
 * Consume one repeat and issue a unique dispense token (RX-XXXXXXXXXX).
 * Called after a successful payment for an Rx-required item.
 */
export const consumePrescription = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input) => z.object({ uploadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: upload, error: readError } = await firestoreAdmin
      .from("prescription_uploads")
      .select("id, patient_id, repeats_total, repeats_used, status, expires_at, dispensed_at")
      .eq("id", data.uploadId)
      .maybeSingle();
    if (readError) throw readError;
    if (!upload) throw new Error("Prescription was not found.");
    if (upload.patient_id !== context.userId) {
      throw new Error("Not authorized to consume this prescription.");
    }
    if (upload.status !== "approved") throw new Error("Prescription is not approved.");
    if (upload.expires_at && new Date(upload.expires_at).getTime() < Date.now()) {
      throw new Error("Prescription expired.");
    }
    const total = Number(upload.repeats_total ?? 0);
    const used = Number(upload.repeats_used ?? 0);
    if (total > 0 && used >= total) throw new Error("Prescription has no repeats remaining.");
    const token = `RX-${crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
    const now = new Date().toISOString();
    const { error } = await firestoreAdmin
      .from("prescription_uploads")
      .update({
        repeats_used: used + 1,
        dispense_token: token,
        last_dispensed_at: now,
        dispensed_at: upload.dispensed_at ?? now,
        dispensed_by: context.userId,
        updated_at: now,
      })
      .eq("id", data.uploadId);
    if (error) throw error;
    const { error: auditError } = await firestoreAdmin.from("prescription_audit_log").insert({
      prescription_upload_id: data.uploadId,
      actor_id: context.userId,
      action: "dispensed",
      notes: `token=${token}`,
    });
    if (auditError) throw auditError;
    return { token };
  });
