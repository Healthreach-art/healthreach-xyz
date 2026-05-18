import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const cartSchema = z.object({
  items: z
    .array(
      z.object({
        medId: z.string().uuid(),
        pharmacyId: z.string().uuid(),
        prescriptionUploadId: z.string().uuid().optional().nullable(),
      })
    )
    .min(1)
    .max(50),
});

export interface ValidationIssue {
  medId: string;
  reason: "missing" | "expired" | "rejected" | "pending" | "wrong_pharmacy" | "unknown_medication";
  message: string;
  uploadId?: string;
  expiresAt?: string | null;
}

/**
 * Backend prescription validity + refill enforcement.
 * - Verifies each Rx-required item has an approved, non-expired upload at the same pharmacy.
 * - Returns valid:false with per-item reasons when any check fails.
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

      // Locate a valid Rx upload: explicit attachment first, otherwise any approved
      // upload by this patient for this pharmacy that isn't expired.
      let upload: any = null;
      if (it.prescriptionUploadId) {
        const { data: u } = await supabase
          .from("prescription_uploads")
          .select("id, status, expires_at, pharmacy_id, patient_id")
          .eq("id", it.prescriptionUploadId)
          .maybeSingle();
        upload = u;
      }
      if (!upload) {
        const { data: us } = await supabase
          .from("prescription_uploads")
          .select("id, status, expires_at, pharmacy_id, patient_id")
          .eq("patient_id", userId)
          .eq("pharmacy_id", it.pharmacyId)
          .eq("status", "approved")
          .order("created_at", { ascending: false })
          .limit(1);
        upload = us?.[0];
      }

      if (!upload) {
        issues.push({
          medId: it.medId,
          reason: "missing",
          message: `${med.name} needs a prescription. Upload one for this pharmacy.`,
        });
        continue;
      }
      if (upload.patient_id !== userId) {
        issues.push({ medId: it.medId, reason: "missing", message: "Prescription does not belong to you." });
        continue;
      }
      if (upload.pharmacy_id !== it.pharmacyId) {
        issues.push({
          medId: it.medId,
          reason: "wrong_pharmacy",
          message: `${med.name} prescription is for a different pharmacy.`,
          uploadId: upload.id,
        });
        continue;
      }
      if (upload.status === "rejected") {
        issues.push({ medId: it.medId, reason: "rejected", message: `${med.name} prescription was rejected.`, uploadId: upload.id });
        continue;
      }
      if (upload.status !== "approved") {
        issues.push({
          medId: it.medId,
          reason: "pending",
          message: `${med.name} prescription is still awaiting pharmacist review.`,
          uploadId: upload.id,
        });
        continue;
      }
      if (upload.expires_at && new Date(upload.expires_at).getTime() < now) {
        issues.push({
          medId: it.medId,
          reason: "expired",
          message: `${med.name} prescription expired. Please upload a fresh one.`,
          uploadId: upload.id,
          expiresAt: upload.expires_at,
        });
        continue;
      }
    }

    return { valid: issues.length === 0, issues };
  });
