import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { firestoreAdmin } from "@/lib/firestore-admin";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";

export const getDoctorAvailableSlots = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d) => z.object({ doctorId: z.string().uuid() }).parse(d))
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
      doctorId: z.string().uuid(),
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
    const booking = result.data as { appointmentId?: string; platformFeeCents?: number } | null;
    if (!booking?.appointmentId || !Number.isSafeInteger(booking.platformFeeCents)) {
      throw new Error("The appointment booking service returned an invalid response.");
    }
    return { appointmentId: booking.appointmentId, platformFeeCents: booking.platformFeeCents };
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
    const paystackSecret = (process.env.PAYSTACK_SECRET_KEY || process.env.STRIPE_TEST_API_KEY);
    if (!paystackSecret) throw new Error("Payment provider not configured");

    const { data: existing, error: lookupErr } = await firestoreAdmin
      .from("doctor_appointments")
      .select("id, patient_id, payment_status, payment_reference, platform_fee")
      .eq("id", data.appointmentId)
      .maybeSingle();
    if (lookupErr) throw new Error(lookupErr.message);
    if (!existing || existing.patient_id !== context.userId) throw new Error("Appointment not found");

    // Verify the reference against Paystack before marking the appointment paid.
    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(data.reference)}`,
      { headers: { Authorization: `Bearer ${paystackSecret}` } },
    );
    const verifyJson = (await verifyRes.json().catch(() => ({}))) as {
      status?: boolean;
      data?: {
        status?: string;
        amount?: number;
        currency?: string;
        reference?: string;
        metadata?: Record<string, unknown>;
      };
    };
    if (
      !verifyRes.ok
      || !verifyJson.status
      || verifyJson.data?.status !== "success"
      || verifyJson.data.reference !== data.reference
      || verifyJson.data.metadata?.appointment_id !== data.appointmentId
      || verifyJson.data.metadata?.payment_type !== "doctor_booking_fee"
    ) {
      throw new Error("Payment could not be verified");
    }
    const paidMinor = Number(verifyJson.data?.amount ?? 0);
    const fee = Number(existing.platform_fee);
    const expectedMinor = Math.round(fee * 100);
    if (
      !Number.isSafeInteger(expectedMinor)
      || expectedMinor <= 0
      || paidMinor !== expectedMinor
      || verifyJson.data.currency !== "ZAR"
    ) {
      throw new Error("Payment amount does not match the appointment fee");
    }

    if (existing.payment_status === "paid" && existing.payment_reference === data.reference) {
      return { ok: true };
    }
    if (existing.payment_status !== "pending") {
      throw new Error("Appointment already paid");
    }

    const { error, count } = await firestoreAdmin
      .from("doctor_appointments")
      .update({
        payment_status: "paid",
        payment_reference: data.reference,
        total_paid: fee,
        status: "confirmed",
      })
      .eq("id", data.appointmentId)
      .eq("patient_id", context.userId)
      .eq("payment_status", "pending");
    if (error) throw new Error(error.message);
    if (count === 0) throw new Error("The payment state changed before it could be recorded. Refresh your appointment.");
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
