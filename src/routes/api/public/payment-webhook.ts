import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";

const PayloadSchema = z.object({
  transaction_ref: z.string().min(1).max(128),
  status: z.enum(["completed", "failed", "refunded"]),
  failure_reason: z.string().max(500).optional(),
  refund_amount: z.number().min(0).optional(),
  provider: z.string().max(64).optional(),
});

/**
 * Public payment provider webhook.
 * Verifies HMAC signature, then updates the matching payment row.
 * DB triggers handle order status promotion + notifications.
 */
export const Route = createFileRoute("/api/public/payment-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        const secret = process.env.PAYMENT_WEBHOOK_SECRET;

        // Signature verification (skip only if no secret configured — dev/sandbox)
        if (secret) {
          const sig = request.headers.get("x-webhook-signature") || "";
          const expected = createHmac("sha256", secret).update(body).digest("hex");
          const a = Buffer.from(sig);
          const b = Buffer.from(expected);
          if (a.length !== b.length || !timingSafeEqual(a, b)) {
            return new Response("Invalid signature", { status: 401 });
          }
        }

        let parsed;
        try { parsed = PayloadSchema.parse(JSON.parse(body)); }
        catch { return new Response("Invalid payload", { status: 400 }); }

        const { data: existing } = await supabaseAdmin
          .from("payments").select("id, retry_count, status")
          .eq("transaction_ref", parsed.transaction_ref).maybeSingle();
        if (!existing) return new Response("Payment not found", { status: 404 });

        const patch: Record<string, unknown> = { status: parsed.status, updated_at: new Date().toISOString() };
        if (parsed.status === "failed") {
          patch.failure_reason = parsed.failure_reason ?? "Provider declined";
          patch.retry_count = (existing.retry_count ?? 0) + 1;
        }
        if (parsed.status === "refunded") {
          patch.refund_status = "refunded";
          patch.refund_amount = parsed.refund_amount ?? 0;
        }
        if (parsed.provider) patch.provider = parsed.provider;

        const { error } = await supabaseAdmin.from("payments").update(patch as any).eq("id", existing.id);
        if (error) return new Response(error.message, { status: 500 });

        return Response.json({ ok: true });
      },
    },
  },
});
