import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";

const BodySchema = z.object({
  payment_id: z.string().uuid(),
  outcome: z.enum(["completed", "failed"]).optional(),
});

/**
 * Mock payment gateway endpoint.
 * The patient's checkout inserts a payment row with status='pending', then calls this
 * authenticated endpoint to "process" the mock charge. We verify the caller owns the
 * payment and then flip status server-side using the service-role client.
 *
 * Replace this with a real webhook from your gateway in production.
 */
export const Route = createFileRoute("/api/mock-pay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const auth = request.headers.get("authorization") || "";
        if (!auth.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }
        const token = auth.slice(7);

        const userClient = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });

        const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
        if (claimsErr || !claims?.claims?.sub) {
          return new Response("Unauthorized", { status: 401 });
        }
        const userId = claims.claims.sub;

        let body;
        try {
          body = BodySchema.parse(await request.json());
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        // Verify the payment belongs to this user and is pending
        const { data: payment } = await supabaseAdmin
          .from("payments")
          .select("id, patient_id, status")
          .eq("id", body.payment_id)
          .maybeSingle();
        if (!payment || payment.patient_id !== userId) {
          return new Response("Not found", { status: 404 });
        }
        if (payment.status !== "pending") {
          return new Response("Payment is not pending", { status: 409 });
        }

        // Mock gateway: ~95% success unless caller forces an outcome
        const outcome =
          body.outcome ?? (Math.random() > 0.05 ? "completed" : "failed");

        const patch: Record<string, unknown> = {
          status: outcome,
          updated_at: new Date().toISOString(),
        };
        if (outcome === "failed") patch.failure_reason = "Gateway declined card";

        const { error } = await supabaseAdmin
          .from("payments")
          .update(patch as never)
          .eq("id", payment.id);
        if (error) return new Response(error.message, { status: 500 });

        return Response.json({ ok: true, status: outcome });
      },
    },
  },
});
