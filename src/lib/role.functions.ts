import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";
import { firestoreAdmin } from "@/lib/firestore-admin";

const roleInput = z.object({
  role: z.enum([
    "patient",
    "pharmacy",
    "hospital",
    "driver",
    "doctor",
    "admin",
    "homecare_company",
    "homecare_staff",
  ]),
});

export type RegisteredRole = z.infer<typeof roleInput>["role"];

export const registerSelfServiceRole = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input) => roleInput.parse(input))
  .handler(async ({ data }) => {
    const { error } = await firestoreAdmin.rpc("register_self_service_role", {
      _role: data.role,
    });
    if (error) throw error;
    return { ok: true };
  });
