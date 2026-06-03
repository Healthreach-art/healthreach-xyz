import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PLATFORM_FEE = 15;

export const bookDoctorAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      doctorId: z.string().uuid(),
      scheduledAt: z.string().min(10).max(64),
      mode: z.enum(["in_person", "video", "phone"]),
      reason: z.string().max(1000).default(""),
      useMedicalAid: z.boolean().default(false),
      medicalAidProvider: z.string().max(120).optional(),
      medicalAidMemberNumber: z.string().max(120).optional(),
      familyMemberId: z.string().uuid().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const { data: doc, error: docErr } = await supabaseAdmin
      .from("doctors")
      .select("id, hospital_id, user_id, consultation_fee, is_active, is_verified, full_name")
      .eq("id", data.doctorId)
      .maybeSingle();
    if (docErr || !doc) throw new Error("Doctor not found");
    if (!doc.is_active) throw new Error("Doctor is not accepting appointments");
    if (!doc.is_verified) throw new Error("Doctor is not yet verified by HEALTHREACH");

    // Self-registered doctors have no hospital — fall back to the doctor's own user_id
    // so the existing notification trigger still has a recipient.
    const hospitalId = doc.hospital_id ?? doc.user_id ?? userId;

    const { data: appt, error } = await supabaseAdmin
      .from("doctor_appointments")
      .insert({
        patient_id: userId,
        doctor_id: doc.id,
        hospital_id: hospitalId,
        family_member_id: data.familyMemberId ?? null,
        scheduled_at: new Date(data.scheduledAt).toISOString(),
        mode: data.mode,
        reason: data.reason,
        consultation_fee: doc.consultation_fee,
        platform_fee: PLATFORM_FEE,
        use_medical_aid: data.useMedicalAid,
        medical_aid_provider: data.medicalAidProvider ?? null,
        medical_aid_member_number: data.medicalAidMemberNumber ?? null,
        status: "pending",
        payment_status: "pending",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { appointmentId: appt.id, platformFeeCents: PLATFORM_FEE * 100 };
  });

export const markDoctorAppointmentPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      appointmentId: z.string().uuid(),
      reference: z.string().min(2).max(128),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("doctor_appointments")
      .update({
        payment_status: "paid",
        payment_reference: data.reference,
        total_paid: PLATFORM_FEE,
        status: "confirmed",
      })
      .eq("id", data.appointmentId)
      .eq("patient_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const issueEPrescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      appointmentId: z.string().uuid(),
      kind: z.enum(["prescription", "referral", "sick_note"]),
      title: z.string().max(200).default(""),
      body: z.string().max(4000).default(""),
      medicationName: z.string().max(200).optional(),
      dosage: z.string().max(200).optional(),
      instructions: z.string().max(2000).optional(),
      validUntil: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: appt, error: aErr } = await supabaseAdmin
      .from("doctor_appointments")
      .select("id, patient_id, doctor_id, hospital_id")
      .eq("id", data.appointmentId)
      .maybeSingle();
    if (aErr || !appt) throw new Error("Appointment not found");
    if (appt.hospital_id !== context.userId) throw new Error("Not your appointment");

    const { data: row, error } = await supabaseAdmin
      .from("e_prescriptions")
      .insert({
        appointment_id: appt.id,
        patient_id: appt.patient_id,
        doctor_id: appt.doctor_id,
        hospital_id: appt.hospital_id,
        kind: data.kind,
        title: data.title,
        body: data.body,
        medication_name: data.medicationName ?? null,
        dosage: data.dosage ?? null,
        instructions: data.instructions ?? null,
        valid_until: data.validUntil ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });
