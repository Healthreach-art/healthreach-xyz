import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";

export interface PublicationResult {
  published: number;
  skipped: Array<{ id: string; name: string; reason: string }>;
  nextCursor: string | null;
}

export const publishExistingMedicines = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input) => z.object({
    medicationId: z.string().min(1).max(128).regex(/^[^/]+$/).optional(),
    afterId: z.string().min(1).max(128).regex(/^[^/]+$/).optional(),
  }).parse(input))
  .handler(async ({ data }) => {
    const { firestoreAdmin } = await import("@/lib/firestore-admin");
    const result = await firestoreAdmin.rpc("publish_existing_medicines", {
      _medication_id: data.medicationId,
      _after_id: data.afterId,
    });
    if (result.error) throw new Error(result.error.message);
    return result.data as PublicationResult;
  });