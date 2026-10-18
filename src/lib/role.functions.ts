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
    "homecare_operations",
  ]),
});

export type RegisteredRole = z.infer<typeof roleInput>["role"];

export const registerSelfServiceRole = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input) => roleInput.parse(input))
  .handler(async ({ data, context }) => {
    const email = typeof context.claims.email === "string"
      ? context.claims.email.trim().toLowerCase()
      : "";
    const isVerified = context.claims.email_verified === true;
    if (data.role === "homecare_operations") {
      if (email !== "support@healthreachcare.co.za" || !isVerified) {
        throw new Error("Only the verified HealthReachCare support account can register for home care operations.");
      }
      const { data: existingRole, error: roleError } = await firestoreAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId)
        .eq("role", data.role)
        .maybeSingle();
      if (roleError) throw roleError;
      if (existingRole) return { ok: true };
    } else if (data.role === "admin") {
      if (email !== "admin@healthreachcare.co.za" || !isVerified) {
        throw new Error("Admin role assignment is restricted to the verified bootstrap administrator.");
      }
    } else {
      if (![
        "patient",
        "pharmacy",
        "hospital",
        "driver",
        "doctor",
        "homecare_company",
      ].includes(data.role)) {
        throw new Error("Unsupported self-service role.");
      }

      const { data: existingRoles, error: rolesError } = await firestoreAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId);
      if (rolesError) throw rolesError;
      if (existingRoles?.some((row) => row.role === data.role)) return { ok: true };
      if (existingRoles?.length) throw new Error("This account already has a different role.");

      if (data.role !== "patient") {
        const { data: profile, error: profileError } = await firestoreAdmin
          .from("profiles")
          .select("user_id, approval_status, organization_name")
          .eq("user_id", context.userId)
          .maybeSingle();
        if (profileError) throw profileError;
        if (
          !profile
          || profile.user_id !== context.userId
          || !["pending", "under_review"].includes(String(profile.approval_status))
        ) {
          throw new Error("A pending provider application is required for this role.");
        }

        const providerCollection = data.role === "pharmacy"
          ? "pharmacies"
          : data.role === "driver"
            ? "drivers"
            : data.role === "doctor"
              ? "doctors"
              : data.role === "homecare_company"
                ? "homecare_providers"
                : null;
        if (providerCollection) {
          const { data: provider, error: providerError } = await firestoreAdmin
            .from(providerCollection)
            .select("user_id, status")
            .eq("user_id", context.userId)
            .maybeSingle();
          if (providerError) throw providerError;
          if (!provider || provider.user_id !== context.userId || provider.status !== "pending_review") {
            throw new Error("A matching pending provider application is required for this role.");
          }
        } else if (data.role === "hospital" && typeof profile.organization_name !== "string") {
          throw new Error("A hospital application with an organization name is required.");
        }
      }
    }

    const { error } = await firestoreAdmin.from("user_roles").insert({
      id: `${context.userId}_${data.role}`,
      user_id: context.userId,
      role: data.role,
      created_at: new Date().toISOString(),
    });
    if (error) {
      const { data: registeredRole, error: lookupError } = await firestoreAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId)
        .eq("role", data.role)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (!registeredRole) throw error;
    }
    return { ok: true };
  });
