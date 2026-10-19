import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";

const eventSchema = z.object({
  event: z.string(),
  data: z.object({
    reference: z.string().min(1).max(200),
    status: z.string().optional(),
    amount: z.number().optional(),
    currency: z.string().optional(),
    channel: z.string().optional(),
    paid_at: z.string().nullable().optional(),
    customer: z.object({ email: z.string().optional() }).partial().optional(),
    metadata: z.any().optional(),
  }).passthrough(),
});

function safeId(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : null;
}

export const Route = createFileRoute("/api/public/payment-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = (process.env["PAYSTACK_SECRET_KEY"] ?? "").trim();
        if (!secret) return new Response("Not configured", { status: 500 });

        const body = await request.text();
        const signature = request.headers.get("x-paystack-signature") ?? "";
        const expected = createHmac("sha512", secret).update(body).digest("hex");
        const a = Buffer.from(signature, "utf8");
        const b = Buffer.from(expected, "utf8");
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let parsed: z.infer<typeof eventSchema>;
        try {
          parsed = eventSchema.parse(JSON.parse(body));
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        const { event, data } = parsed;
        const meta = (typeof data.metadata === "object" && data.metadata) ? data.metadata as Record<string, unknown> : {};
        // These payments are fulfilled transactionally by the authenticated
        // dispatcher, which checks the persisted target, amount and patient.
        if (meta.payment_kind === "homecare" || meta.payment_kind === "medication") {
          return new Response("Payment awaits authenticated verification", { status: 200 });
        }
        const reference = data.reference;
        const now = new Date().toISOString();
        const status =
          event === "charge.success" ? "paid" :
          event === "charge.failed" ? "failed" :
          event.startsWith("refund") ? "refunded" : null;

        if (!status) return new Response("ignored", { status: 200 });

        try {
          const { serviceMergeDocument } = await import("@/lib/firebase-service.server");
          const { firestoreAdmin } = await import("@/lib/firestore-admin");
          const orderId = safeId(meta.order_id);
          const bookingId = safeId(meta.booking_id);
          const appointmentId = safeId(meta.appointment_id);
          const userId = safeId(meta.user_id);

          if (appointmentId && meta.payment_type === "doctor_booking_fee" && status === "paid") {
            const { data: appointment, error: appointmentError } = await firestoreAdmin
              .from("doctor_appointments")
              .select("payment_status, payment_reference, platform_fee, consultation_fee")
              .eq("id", appointmentId)
              .maybeSingle();
            if (appointmentError) throw appointmentError;
            if (!appointment) throw new Error("Doctor appointment was not found.");
            const amountDueCents = Math.round((Number(appointment.platform_fee) + Number(appointment.consultation_fee)) * 100);
            if (data.currency !== "ZAR" || data.amount !== amountDueCents) {
              throw new Error("Doctor appointment payment amount does not match.");
            }
            if (appointment.payment_status === "paid" && appointment.payment_reference !== reference) {
              throw new Error("Doctor appointment has already been paid with a different reference.");
            }
            if (appointment.payment_status === "pending") {
              const { error: updateError } = await firestoreAdmin.from("doctor_appointments")
                .update({
                  payment_status: "paid",
                  payment_reference: reference,
                  total_paid: amountDueCents / 100,
                  status: "confirmed",
                })
                .eq("id", appointmentId)
                .eq("payment_status", "pending");
              if (updateError) throw updateError;
            }
          }

          await serviceMergeDocument("payments", reference.replace(/[^A-Za-z0-9_-]/g, "_"), {
            reference,
            provider: "paystack",
            status,
            event,
            amount_cents: data.amount ?? null,
            currency: data.currency ?? "ZAR",
            channel: data.channel ?? null,
            customer_email: data.customer?.email ?? null,
            user_id: userId,
            order_id: orderId,
            booking_id: bookingId,
            purpose: typeof meta.purpose === "string" ? meta.purpose : null,
            paid_at: data.paid_at ?? null,
            updated_at: now,
          });

          if (bookingId && status === "paid") {
            await serviceMergeDocument("appointments", bookingId, {
              payment_status: "paid", payment_reference: reference, updated_at: now,
            });
          }
        } catch (error) {
          console.error("[paystack-webhook] processing failed", error);
          // Non-200 makes Paystack retry later.
          return new Response("Processing failed", { status: 500 });
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
