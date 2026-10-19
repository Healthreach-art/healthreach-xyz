import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { firestoreAdmin } from "@/lib/firestore-admin";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";

export const getDoctorAvailableSlots = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d) => z.object({ doctorId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/) }).parse(d))
  .handler(async ({ data }) => {
    const { firestoreAdmin } = await import("@/lib/firestore-admin");
    const result = await firestoreAdmin.rpc("available_doctor_slots", {
      _doctor_id: data.doctorId,
    });
    if (result.error) throw new Error(result.error.message);
    const payload = result.data as { slots?: Array<{ scheduledAt: string; durationMinutes: number }> } | null;
    return { slots: payload?.slots ?? [] };
  });

export const bookDoctorAppointment = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d) =>
    z.object({
      doctorId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
      scheduledAt: z.string().datetime({ offset: true }),
      durationMinutes: z.number().int().min(30).max(120).multipleOf(30),
      mode: z.enum(["in_person", "video", "phone"]),
      reason: z.string().max(1000).default(""),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { firestoreAdmin } = await import("@/lib/firestore-admin");
    const result = await firestoreAdmin.rpc("book_doctor_appointment", {
      _doctor_id: data.doctorId,
      _scheduled_at: data.scheduledAt,
      _duration_minutes: data.durationMinutes,
      _mode: data.mode,
      _reason: data.reason,
    });
    if (result.error) throw new Error(result.error.message);
    const booking = result.data as { appointmentId?: string; platformFeeCents?: number; consultationFee?: number } | null;
    if (!booking?.appointmentId || !Number.isSafeInteger(booking.platformFeeCents) || typeof booking.consultationFee !== "number") {
      throw new Error("The appointment booking service returned an invalid response.");
    }
    return { appointmentId: booking.appointmentId, platformFeeCents: booking.platformFeeCents, consultationFee: booking.consultationFee };
  });

export const markDoctorAppointmentPaid = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d) =>
    z.object({
      appointmentId: z.string().uuid(),
      reference: z.string().min(2).max(128),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (context.claims.email_verified !== true) throw new Error("Verify your email before paying for an appointment.");
    const { error } = await firestoreAdmin.rpc("confirm_doctor_payment", { _appointment_id: data.appointmentId, _reference: data.reference });
    if (error) throw error;
    return { ok: true };
  });

export const issueEPrescription = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
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
    const { data: appt, error: aErr } = await firestoreAdmin
      .from("doctor_appointments")
      .select("id, patient_id, doctor_id, hospital_id")
      .eq("id", data.appointmentId)
      .maybeSingle();
    if (aErr) throw new Error(aErr.message);
    if (!appt) throw new Error("Appointment not found");
    if (appt.hospital_id !== context.userId) throw new Error("Not your appointment");

    const { data: row, error } = await firestoreAdmin
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
    if (!row) throw new Error("Prescription could not be created.");
    return { id: row.id };
  });
