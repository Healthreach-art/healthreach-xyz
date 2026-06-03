import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Doctor: submit documents for admin review
export const submitDoctorDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      hpcsa_number: z.string().min(2).max(64),
      hpcsa_cert_path: z.string().min(1).max(512),
      id_document_path: z.string().min(1).max(512),
      qualification_paths: z.array(z.string().min(1).max(512)).min(1).max(10),
      malpractice_cert_path: z.string().min(1).max(512),
      malpractice_expires_at: z.string().optional(),
      practice_letter_path: z.string().max(512).optional(),
      indemnity_path: z.string().max(512).optional(),
      notes: z.string().max(1000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;
    const payload = {
      doctor_user_id: userId,
      hpcsa_number: data.hpcsa_number,
      hpcsa_cert_path: data.hpcsa_cert_path,
      id_document_path: data.id_document_path,
      qualification_paths: data.qualification_paths,
      malpractice_cert_path: data.malpractice_cert_path,
      malpractice_expires_at: data.malpractice_expires_at ?? null,
      practice_letter_path: data.practice_letter_path ?? null,
      indemnity_path: data.indemnity_path ?? null,
      notes: data.notes ?? null,
      submitted_at: new Date().toISOString(),
      verified_at: null,
      rejection_reason: null,
    };
    const { error } = await supabaseAdmin
      .from("doctor_documents")
      .upsert(payload, { onConflict: "doctor_user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Admin: verify or reject a doctor (sets doctors.is_verified + writes doctor_documents)
export const adminReviewDoctor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      doctorUserId: z.string().uuid(),
      decision: z.enum(["approve", "reject"]),
      reason: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Verify admin
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Admin only");

    const approve = data.decision === "approve";
    const ts = new Date().toISOString();

    // Update profile approval status
    await supabaseAdmin.from("profiles")
      .update({ approval_status: approve ? "approved" : "rejected", updated_at: ts })
      .eq("user_id", data.doctorUserId);

    // Update doctor documents
    await supabaseAdmin.from("doctor_documents")
      .update({
        verified_at: approve ? ts : null,
        verified_by: approve ? context.userId : null,
        rejection_reason: approve ? null : (data.reason ?? "Documents rejected"),
      })
      .eq("doctor_user_id", data.doctorUserId);

    // Update / create doctor profile row(s) tied to this user
    const { data: existingDoc } = await supabaseAdmin
      .from("doctors").select("id").eq("user_id", data.doctorUserId).maybeSingle();
    if (existingDoc) {
      await supabaseAdmin.from("doctors")
        .update({
          is_verified: approve,
          verified_at: approve ? ts : null,
          verified_by: approve ? context.userId : null,
          rejection_reason: approve ? null : (data.reason ?? "Documents rejected"),
          is_active: approve,
        })
        .eq("id", existingDoc.id);
    }

    // Notify the doctor
    await supabaseAdmin.from("notifications").insert({
      user_id: data.doctorUserId,
      category: "system",
      title: approve ? "You're verified" : "Verification rejected",
      body: approve
        ? "Your HEALTHREACH doctor account is approved. Patients can now book you."
        : `Your verification was rejected. ${data.reason ?? "Please review the requested documents and resubmit."}`,
      link: "/dashboard/doctor",
    });

    return { ok: true };
  });

// Admin: review pharmacy documents
export const adminReviewPharmacyDocs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      pharmacyUserId: z.string().uuid(),
      decision: z.enum(["approve", "reject"]),
      reason: z.string().max(500).optional(),
      verifiedServices: z.array(z.string().max(120)).max(40).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Admin only");

    const approve = data.decision === "approve";
    const ts = new Date().toISOString();

    await supabaseAdmin.from("pharmacy_documents")
      .update({
        verified_at: approve ? ts : null,
        verified_by: approve ? context.userId : null,
        rejection_reason: approve ? null : (data.reason ?? "Documents rejected"),
        verified_services: approve ? (data.verifiedServices ?? []) : [],
      })
      .eq("pharmacy_id", data.pharmacyUserId);

    await supabaseAdmin.from("notifications").insert({
      user_id: data.pharmacyUserId,
      category: "system",
      title: approve ? "Credentials verified" : "Credentials rejected",
      body: approve
        ? "Your pharmacy credentials are approved. Patients can now book appointments."
        : `Verification rejected. ${data.reason ?? "Please review and resubmit."}`,
      link: "/dashboard/pharmacy",
    });

    return { ok: true };
  });
