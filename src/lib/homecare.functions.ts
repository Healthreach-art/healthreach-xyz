import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";

const uuid = z.string().regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);

async function assertAdmin(userId: string) {
  const { firestoreAdmin } = await import("@/lib/firestore-admin");
  const { data } = await firestoreAdmin
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Admin only");
  return firestoreAdmin;
}

async function assertHomecareOperations(userId: string) {
  const { firestoreAdmin } = await import("@/lib/firestore-admin");
  const [{ data: admin, error: adminError }, { data: operator, error: operatorError }] = await Promise.all([
    firestoreAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle(),
    firestoreAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "homecare_operations").maybeSingle(),
  ]);
  if (adminError) throw new Error(adminError.message);
  if (operatorError) throw new Error(operatorError.message);
  if (!admin && !operator) throw new Error("Home care operations role required.");
  return firestoreAdmin;
}

export const submitHomecareRequest = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d) => z.object({
    serviceType: z.string().trim().min(2).max(120),
    description: z.string().trim().max(5000).default(""),
    address: z.string().trim().min(5).max(500),
    latitude: z.number().finite().min(-90).max(90).nullable().optional(),
    longitude: z.number().finite().min(-180).max(180).nullable().optional(),
    preferredAt: z.string().datetime({ offset: true }).nullable().optional(),
    durationHours: z.number().int().min(1).max(24).nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    if (context.claims.email_verified !== true) throw new Error("Verify your email before requesting home care.");
    if (data.preferredAt && Date.parse(data.preferredAt) <= Date.now()) {
      throw new Error("Choose a preferred visit time in the future.");
    }
    const { firestoreAdmin } = await import("@/lib/firestore-admin");
    const { data: created, error } = await firestoreAdmin.rpc("create_homecare_request", {
      _service_type: data.serviceType,
      _description: data.description,
      _address: data.address,
      _latitude: data.latitude ?? null,
      _longitude: data.longitude ?? null,
      _preferred_at: data.preferredAt ?? null,
      _duration_hours: data.durationHours ?? null,
    });
    if (error) throw new Error(error.message);
    const request = created as { id?: unknown; referenceNumber?: unknown } | null;
    if (typeof request?.id !== "string" || typeof request.referenceNumber !== "string") {
      throw new Error("The home care request service returned an invalid response.");
    }
    return { id: request.id, referenceNumber: request.referenceNumber };
  });

export const reorderCompletedHomecare = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d) => z.object({
    requestId: uuid,
    assignmentId: z.string().trim().min(1).max(128),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { firestoreAdmin } = await import("@/lib/firestore-admin");
    const { data: patientRole, error: roleError } = await firestoreAdmin
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "patient").maybeSingle();
    if (roleError) throw new Error(roleError.message);
    if (!patientRole) throw new Error("A patient account is required to reorder home care.");

    const [{ data: request, error: requestError }, { data: assignment, error: assignmentError }] = await Promise.all([
      firestoreAdmin.from("homecare_requests").select("*").eq("id", data.requestId).maybeSingle(),
      firestoreAdmin.from("homecare_assignments").select("*").eq("id", data.assignmentId).maybeSingle(),
    ]);
    if (requestError) throw new Error(requestError.message);
    if (assignmentError) throw new Error(assignmentError.message);
    if (!request || request.patient_id !== context.userId) {
      throw new Error("That home care request is not available to your account.");
    }
    if (
      !assignment
      || assignment.request_id !== request.id
      || !["completed", "confirmed"].includes(String(assignment.status))
    ) {
      throw new Error("Only a completed home care service can be reordered.");
    }

    const { data: created, error } = await firestoreAdmin.rpc("create_homecare_request", {
      _service_type: request.service_type,
      _description: request.description ?? "",
      _address: request.address,
      _latitude: request.latitude ?? null,
      _longitude: request.longitude ?? null,
      _preferred_at: null,
      _duration_hours: request.duration_hours ?? null,
    });
    if (error) throw new Error(error.message);
    const result = created as { id?: unknown } | null;
    if (typeof result?.id !== "string") throw new Error("A new home care request could not be created.");
    return { id: result.id };
  });

export const listHomecareOperationsRequests = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const firestoreAdmin = await assertHomecareOperations(context.userId);
    const { data: requests, error } = await firestoreAdmin
      .from("homecare_requests").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const patientIds = [...new Set((requests ?? []).map((request) => request.patient_id))];
    const patientProfiles = new Map<string, { full_name?: string | null; phone?: string | null; email?: string | null }>();
    for (let offset = 0; offset < patientIds.length; offset += 30) {
      const { data: profiles, error: profileError } = await firestoreAdmin
        .from("profiles")
        .select("user_id, full_name, phone, email")
        .in("user_id", patientIds.slice(offset, offset + 30));
      if (profileError) throw new Error(profileError.message);
      for (const profile of profiles ?? []) {
        patientProfiles.set(profile.user_id, profile);
      }
    }

    return {
      requests: (requests ?? []).map((request) => {
        const profile = patientProfiles.get(request.patient_id);
        return {
          ...request,
          patient_name: profile?.full_name ?? null,
          patient_phone: profile?.phone ?? null,
          patient_email: profile?.email ?? null,
        };
      }),
    };
  });

export const listHomecareProvidersForOperations = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const firestoreAdmin = await assertHomecareOperations(context.userId);
    const { data, error } = await firestoreAdmin
      .from("homecare_providers")
      .select("id, business_name, full_name, provider_type, services, service_areas")
      .eq("approval_status", "approved")
      .eq("is_active", true)
      .order("business_name");
    if (error) throw new Error(error.message);
    return { providers: data ?? [] };
  });

export const issueHomecareQuote = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d) => z.object({
    requestId: uuid,
    amount: z.number().finite().nonnegative().max(1_000_000),
    details: z.string().trim().min(3).max(2000),
  }).parse(d))
  .handler(async ({ data }) => {
    const { firestoreAdmin } = await import("@/lib/firestore-admin");
    const { data: result, error } = await firestoreAdmin.rpc("issue_homecare_quote", {
      _request_id: data.requestId,
      _amount: data.amount,
      _details: data.details,
    });
    if (error) throw new Error(`Could not issue quote: ${error.message}`);
    if (!result || typeof result !== "object" || !("ok" in result) || result.ok !== true) {
      throw new Error("The home care quote service returned an invalid response.");
    }
    return { ok: true };
  });

export const respondToHomecareQuote = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d) => z.object({
    requestId: uuid,
    response: z.enum(["accept", "decline"]),
  }).parse(d))
  .handler(async ({ data }) => {
    const { firestoreAdmin } = await import("@/lib/firestore-admin");
    const { data: result, error } = await firestoreAdmin.rpc("respond_homecare_quote", {
      _request_id: data.requestId,
      _response: data.response,
    });
    if (error) throw new Error(`Could not record quote response: ${error.message}`);
    const response = result as { status?: unknown } | null;
    if (response?.status !== "quote_accepted" && response?.status !== "quote_declined") {
      throw new Error("The home care quote service returned an invalid response.");
    }
    return { status: response.status };
  });

export const grantHomecareOperationsRole = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().trim().min(1).max(128) }).parse(d))
  .handler(async ({ data, context }) => {
    const firestoreAdmin = await assertAdmin(context.userId);
    const { data: profile, error: profileError } = await firestoreAdmin
      .from("profiles").select("user_id").eq("user_id", data.userId).maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!profile) throw new Error("No HealthReachCare profile exists for that user ID.");
    const { data: existing, error: roleError } = await firestoreAdmin
      .from("user_roles").select("role").eq("user_id", data.userId).eq("role", "homecare_operations").maybeSingle();
    if (roleError) throw new Error(roleError.message);
    if (existing) return { ok: true, alreadyAssigned: true };

    const { error } = await firestoreAdmin.from("user_roles").insert({
      id: `${data.userId}_homecare_operations`,
      user_id: data.userId,
      role: "homecare_operations",
    });
    if (error) throw new Error(error.message);
    const { error: auditError } = await firestoreAdmin.from("admin_audit_log").insert({
      admin_id: context.userId,
      action: "homecare.operations_role.grant",
      target_type: "user",
      target_id: data.userId,
    });
    if (auditError) throw new Error(auditError.message);
    return { ok: true, alreadyAssigned: false };
  });

/** Admin-only, explicit conversion of the verified support account to a provider-only role. */
export const provisionHomecareProviderAccount = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().trim().min(1).max(128) }).parse(d))
  .handler(async ({ data, context }) => {
    const firestoreAdmin = await assertAdmin(context.userId);
    const { error } = await firestoreAdmin.rpc("provision_homecare_provider_account", {
      _user_id: data.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin: full home care provider list with documents + approval history. */
export const adminListHomecare = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const firestoreAdmin = await assertAdmin(context.userId);
    const [{ data: providers }, { data: docs }, { data: events }, { data: staff }] = await Promise.all([
      firestoreAdmin.from("homecare_providers").select("*").order("created_at", { ascending: false }),
      firestoreAdmin.from("homecare_documents").select("*").order("created_at", { ascending: false }),
      firestoreAdmin.from("homecare_approval_events").select("*").order("created_at", { ascending: false }),
      firestoreAdmin.from("homecare_staff").select("*").order("created_at", { ascending: false }),
    ]);
    return {
      providers: providers ?? [],
      documents: docs ?? [],
      events: events ?? [],
      staff: staff ?? [],
    };
  });

/** Admin: approve / reject / request documents / suspend / reactivate. */
export const adminReviewHomecare = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d) =>
    z.object({
      providerId: uuid,
      action: z.enum(["approve", "reject", "request_documents", "suspend", "reactivate"]),
      reason: z.string().max(1000).optional(),
      requestedDocuments: z.array(z.string().min(1).max(120)).max(30).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firestoreAdmin = await assertAdmin(context.userId);
    const ts = new Date().toISOString();

    const { data: provider } = await firestoreAdmin
      .from("homecare_providers").select("*").eq("id", data.providerId).maybeSingle();
    if (!provider) throw new Error("Provider not found");
    if (provider.user_id === context.userId) throw new Error("You cannot review your own provider account");

    const patch: Record<string, unknown> = { updated_at: ts };
    let title = "";
    let body = "";

    if (data.action === "approve") {
      if (provider.latitude == null || provider.longitude == null) {
        throw new Error("This provider has no verified address pin yet, so they cannot be approved.");
      }
      // same rule as doctors and drivers: required documents must be reviewed and approved first
      const { docsFor } = await import("@/lib/homecare");
      const required = docsFor(provider.provider_type);
      const { data: docRows } = await firestoreAdmin
        .from("homecare_documents").select("doc_key, status").eq("provider_id", data.providerId);
      const missing = required.filter((r) => {
        const row = (docRows ?? []).find((d) => d.doc_key === r.key);
        return !row || row.status !== "approved";
      });
      if (missing.length > 0) {
        throw new Error(`Approve these documents first: ${missing.map((m) => m.label).join(", ")}`);
      }
      patch.approval_status = "approved";
      patch.is_active = true;
      patch.approved_by = context.userId;
      patch.approved_at = ts;
      patch.rejection_reason = null;
      patch.requested_documents = [];
      title = "Home care account approved";
      body = "Your HealthReachCare home care account is approved. You can now receive assignments.";
    } else if (data.action === "reject") {
      patch.approval_status = "rejected";
      patch.is_active = false;
      patch.rejection_reason = data.reason ?? "Application rejected";
      title = "Home care application rejected";
      body = `Your application was rejected. ${data.reason ?? "Please review your details and documents."}`;
    } else if (data.action === "request_documents") {
      patch.approval_status = "under_review";
      patch.is_active = false;
      patch.requested_documents = data.requestedDocuments ?? [];
      title = "More documents needed";
      body = `Please upload: ${(data.requestedDocuments ?? []).join(", ") || "the requested documents"}.`;
    } else if (data.action === "suspend") {
      patch.approval_status = "suspended";
      patch.is_active = false;
      patch.rejection_reason = data.reason ?? "Suspended by administrator";
      title = "Home care account suspended";
      body = `Your account has been suspended. ${data.reason ?? ""}`.trim();
    } else {
      patch.approval_status = "approved";
      patch.is_active = true;
      patch.rejection_reason = null;
      title = "Home care account reactivated";
      body = "Your account is active again and can receive assignments.";
    }

    const { error } = await firestoreAdmin.from("homecare_providers").update(patch as never).eq("id", data.providerId);
    if (error) throw new Error(error.message);

    // keep the shared profile approval status in step so dashboard gates agree
    await firestoreAdmin.from("profiles")
      .update({ approval_status: patch.approval_status as never, updated_at: ts })
      .eq("user_id", provider.user_id);

    await firestoreAdmin.from("homecare_approval_events").insert({
      provider_id: data.providerId,
      admin_id: context.userId,
      admin_email: context.claims?.email ?? null,
      action: data.action,
      reason: data.reason ?? null,
      requested_documents: data.requestedDocuments ?? null,
    });

    await firestoreAdmin.from("admin_audit_log").insert({
      admin_id: context.userId,
      action: `homecare.${data.action}`,
      target_type: "homecare_provider",
      target_id: data.providerId,
      payload: { reason: data.reason ?? null, requested_documents: data.requestedDocuments ?? null },
    });

    await firestoreAdmin.from("notifications").insert({
      user_id: provider.user_id,
      category: "system",
      title,
      body,
      link: "/dashboard/homecare_company",
    });

    return { ok: true };
  });

/** Admin: review a single uploaded home care document. */
export const adminReviewHomecareDocument = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d) =>
    z.object({
      documentId: uuid,
      status: z.enum(["approved", "rejected", "pending"]),
      notes: z.string().max(1000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firestoreAdmin = await assertAdmin(context.userId);
    const { error } = await firestoreAdmin.from("homecare_documents").update({
      status: data.status,
      notes: data.notes ?? null,
      reviewed_by: context.userId,
      reviewed_at: new Date().toISOString(),
    }).eq("id", data.documentId);
    if (error) throw new Error(error.message);
    await firestoreAdmin.from("admin_audit_log").insert({
      admin_id: context.userId,
      action: `homecare.document.${data.status}`,
      target_type: "homecare_document",
      target_id: data.documentId,
      payload: { notes: data.notes ?? null },
    });
    return { ok: true };
  });

/**
 * Short-lived private link to a sensitive home care document.
 * Only an admin or a member of the owning provider may open it, and
 * every open is recorded in the audit log.
 */
export const getHomecareDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d) => z.object({ documentId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { firestoreAdmin } = await import("@/lib/firestore-admin");

    const { data: doc } = await firestoreAdmin
      .from("homecare_documents").select("id, file_path, provider_id").eq("id", data.documentId).maybeSingle();
    if (!doc) throw new Error("Document not found");

    const { data: adminRow } = await firestoreAdmin
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();

    let allowed = !!adminRow;
    if (!allowed) {
      const { data: prov } = await firestoreAdmin
        .from("homecare_providers").select("user_id").eq("id", doc.provider_id).maybeSingle();
      allowed = prov?.user_id === context.userId;
      if (!allowed) {
        const { data: st } = await firestoreAdmin
          .from("homecare_staff").select("id").eq("company_id", doc.provider_id).eq("user_id", context.userId).maybeSingle();
        allowed = !!st;
      }
    }
    if (!allowed) throw new Error("Not authorised to open this document");

    const requestUrl = getRequest()?.url;
    if (!requestUrl) throw new Error("Could not determine request origin.");
    const { createAuthorizedPrivateFileUrl } = await import("@/lib/r2-storage.server");
    const url = await createAuthorizedPrivateFileUrl(
      {
        userId: context.userId,
        email: typeof context.claims.email === "string" ? context.claims.email : null,
        authorization: `Bearer ${context.idToken}`,
      },
      requestUrl,
      "homecare-docs",
      doc.file_path,
      120,
    );

    await firestoreAdmin.from("admin_audit_log").insert({
      admin_id: context.userId,
      action: "homecare.document.view",
      target_type: "homecare_document",
      target_id: doc.id,
      payload: { provider_id: doc.provider_id },
    });

    return { url };
  });

/** Coordinator: record an approved provider after a patient accepts the quote. */
export const adminAssignHomecare = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d) =>
    z.object({
      requestId: uuid,
      providerId: uuid,
      scheduledAt: z.string().datetime({ offset: true }).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { firestoreAdmin } = await import("@/lib/firestore-admin");
    const { data: result, error } = await firestoreAdmin.rpc("coordinate_homecare_request", {
      _request_id: data.requestId,
      _provider_id: data.providerId,
      _scheduled_at: data.scheduledAt ?? null,
    });
    if (error) throw new Error(`Could not coordinate the visit: ${error.message}`);
    const assignment = result as { assignmentId?: unknown } | null;
    if (typeof assignment?.assignmentId !== "string") {
      throw new Error("The home care coordination service returned an invalid response.");
    }
    return { ok: true, assignmentId: assignment.assignmentId };
  });

/**
 * Owner-only read of a provider's own banking details.
 * Banking columns are not readable through the Data API at all, so this is the
 * single authorised path and it is scoped to the signed-in owner.
 */
export const getMyHomecareBanking = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { firestoreAdmin } = await import("@/lib/firestore-admin");
    const { data } = await firestoreAdmin
      .from("homecare_providers")
      .select("bank_name, account_holder, account_number, branch_code")
      .eq("user_id", context.userId)
      .maybeSingle();
    return {
      bank_name: data?.bank_name ?? "",
      account_holder: data?.account_holder ?? "",
      account_number: data?.account_number ?? "",
      branch_code: data?.branch_code ?? "",
    };
  });

/** Owner-only update of a provider's protected banking details. */
export const saveMyHomecareBanking = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d) => z.object({
    bank_name: z.string().max(120).optional(),
    account_holder: z.string().max(160).optional(),
    account_number: z.string().max(80).optional(),
    branch_code: z.string().max(40).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { firestoreAdmin } = await import("@/lib/firestore-admin");
    const { data: provider, error: providerError } = await firestoreAdmin
      .from("homecare_providers")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (providerError) throw new Error(providerError.message);
    if (!provider) throw new Error("Home care provider profile not found.");
    const { error } = await firestoreAdmin
      .from("homecare_providers")
      .update({
        bank_name: data.bank_name?.trim() || null,
        account_holder: data.account_holder?.trim() || null,
        account_number: data.account_number?.trim() || null,
        branch_code: data.branch_code?.trim() || null,
      })
      .eq("id", provider.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
