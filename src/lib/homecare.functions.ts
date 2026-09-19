import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Admin only");
  return supabaseAdmin;
}

/** Admin: full home care provider list with documents + approval history. */
export const adminListHomecare = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    const [{ data: providers }, { data: docs }, { data: events }, { data: staff }] = await Promise.all([
      supabaseAdmin.from("homecare_providers").select("*").order("created_at", { ascending: false }),
      supabaseAdmin.from("homecare_documents").select("*").order("created_at", { ascending: false }),
      supabaseAdmin.from("homecare_approval_events").select("*").order("created_at", { ascending: false }),
      supabaseAdmin.from("homecare_staff").select("*").order("created_at", { ascending: false }),
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
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      providerId: uuid,
      action: z.enum(["approve", "reject", "request_documents", "suspend", "reactivate"]),
      reason: z.string().max(1000).optional(),
      requestedDocuments: z.array(z.string().min(1).max(120)).max(30).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    const ts = new Date().toISOString();

    const { data: provider } = await supabaseAdmin
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
      const { data: docRows } = await supabaseAdmin
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

    const { error } = await supabaseAdmin.from("homecare_providers").update(patch as never).eq("id", data.providerId);
    if (error) throw new Error(error.message);

    // keep the shared profile approval status in step so dashboard gates agree
    await supabaseAdmin.from("profiles")
      .update({ approval_status: patch.approval_status as never, updated_at: ts })
      .eq("user_id", provider.user_id);

    await supabaseAdmin.from("homecare_approval_events").insert({
      provider_id: data.providerId,
      admin_id: context.userId,
      admin_email: context.claims?.email ?? null,
      action: data.action,
      reason: data.reason ?? null,
      requested_documents: data.requestedDocuments ?? null,
    });

    await supabaseAdmin.from("admin_audit_log").insert({
      admin_id: context.userId,
      action: `homecare.${data.action}`,
      target_type: "homecare_provider",
      target_id: data.providerId,
      payload: { reason: data.reason ?? null, requested_documents: data.requestedDocuments ?? null },
    });

    await supabaseAdmin.from("notifications").insert({
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
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      documentId: uuid,
      status: z.enum(["approved", "rejected", "pending"]),
      notes: z.string().max(1000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("homecare_documents").update({
      status: data.status,
      notes: data.notes ?? null,
      reviewed_by: context.userId,
      reviewed_at: new Date().toISOString(),
    }).eq("id", data.documentId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("admin_audit_log").insert({
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
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ documentId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: doc } = await supabaseAdmin
      .from("homecare_documents").select("id, file_path, provider_id").eq("id", data.documentId).maybeSingle();
    if (!doc) throw new Error("Document not found");

    const { data: adminRow } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();

    let allowed = !!adminRow;
    if (!allowed) {
      const { data: prov } = await supabaseAdmin
        .from("homecare_providers").select("user_id").eq("id", doc.provider_id).maybeSingle();
      allowed = prov?.user_id === context.userId;
      if (!allowed) {
        const { data: st } = await supabaseAdmin
          .from("homecare_staff").select("id").eq("company_id", doc.provider_id).eq("user_id", context.userId).maybeSingle();
        allowed = !!st;
      }
    }
    if (!allowed) throw new Error("Not authorised to open this document");

    const { data: signed, error } = await supabaseAdmin.storage
      .from("homecare-docs").createSignedUrl(doc.file_path, 120);
    if (error || !signed) throw new Error(error?.message ?? "Could not open document");

    await supabaseAdmin.from("admin_audit_log").insert({
      admin_id: context.userId,
      action: "homecare.document.view",
      target_type: "homecare_document",
      target_id: doc.id,
      payload: { provider_id: doc.provider_id },
    });

    return { url: signed.signedUrl };
  });

/** Admin: assign an approved home care provider to a customer request. */
export const adminAssignHomecare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      requestId: uuid,
      providerId: uuid,
      scheduledAt: z.string().optional(),
      amount: z.number().nonnegative().max(1000000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);

    const { data: provider } = await supabaseAdmin
      .from("homecare_providers").select("id, user_id, approval_status, is_active, business_name, full_name")
      .eq("id", data.providerId).maybeSingle();
    if (!provider) throw new Error("Provider not found");
    if (provider.approval_status !== "approved" || !provider.is_active) {
      throw new Error("Only an approved, active provider can receive an assignment");
    }

    const { data: request } = await supabaseAdmin
      .from("homecare_requests").select("id, patient_id, service_type").eq("id", data.requestId).maybeSingle();
    if (!request) throw new Error("Request not found");

    await supabaseAdmin.from("homecare_requests")
      .update({ provider_id: data.providerId, status: "assigned" }).eq("id", data.requestId);

    const { data: assignment, error } = await supabaseAdmin.from("homecare_assignments").insert({
      request_id: data.requestId,
      provider_id: data.providerId,
      status: "offered",
      scheduled_at: data.scheduledAt ?? null,
      amount: data.amount ?? null,
      assigned_by: context.userId,
    }).select("id").single();
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("admin_audit_log").insert({
      admin_id: context.userId,
      action: "homecare.assign",
      target_type: "homecare_request",
      target_id: data.requestId,
      payload: { provider_id: data.providerId, assignment_id: assignment.id },
    });

    await supabaseAdmin.from("notifications").insert([
      {
        user_id: provider.user_id,
        category: "system",
        title: "New home care assignment",
        body: `You have been assigned a ${request.service_type} visit. Open your dashboard to accept it.`,
        link: "/dashboard/homecare_company",
      },
      {
        user_id: request.patient_id,
        category: "system",
        title: "Home care provider assigned",
        body: `${provider.business_name || provider.full_name || "A home care provider"} has been assigned to your request.`,
        link: "/dashboard/patient/homecare",
      },
    ]);

    return { ok: true, assignmentId: assignment.id };
  });

/**
 * Owner-only read of a provider's own banking details.
 * Banking columns are not readable through the Data API at all, so this is the
 * single authorised path and it is scoped to the signed-in owner.
 */
export const getMyHomecareBanking = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
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
