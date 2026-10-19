import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";

const target = z.object({ kind: z.enum(["homecare", "medication"]), targetId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/) });

export const initializeMarketplacePayment = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth]).inputValidator(input => target.parse(input))
  .handler(async ({ data }) => {
    const { firestoreAdmin } = await import("@/lib/firestore-admin");
    const result = await firestoreAdmin.rpc("initialize_marketplace_payment", { _kind: data.kind, _target_id: data.targetId });
    if (result.error) throw result.error;
    return result.data as { paid: boolean; reference: string; amount?: number; url?: string };
  });

export const verifyMarketplacePayment = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth]).inputValidator(input => target.extend({ reference: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/) }).parse(input))
  .handler(async ({ data }) => {
    const { firestoreAdmin } = await import("@/lib/firestore-admin");
    const result = await firestoreAdmin.rpc("verify_marketplace_payment", { _kind: data.kind, _target_id: data.targetId, _reference: data.reference });
    if (result.error) throw result.error;
    return result.data as { paid: boolean; reference: string };
  });

export const requestMedicationPayment = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth]).inputValidator(input => z.object({ targetId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/) }).parse(input))
  .handler(async ({ data }) => {
    const { firestoreAdmin } = await import("@/lib/firestore-admin");
    const result = await firestoreAdmin.rpc("request_medication_payment", { _target_id: data.targetId });
    if (result.error) throw result.error;
    return result.data as { ok: boolean; alreadyPaid: boolean };
  });