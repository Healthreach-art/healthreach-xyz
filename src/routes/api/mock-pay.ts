import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin } from "@/lib/firestore-admin";
import { z } from "zod";

const BodySchema = z.object({
  payment_id: z.string().uuid(),
  outcome: z.enum(["completed", "failed"]).optional(),
});

/**
 * Mock payment gateway endpoint.
 * The patient's checkout inserts a payment row with status='pending', then calls this
 * authenticated endpoint to "process" the mock charge. The privileged Firebase
 * function verifies the caller owns the payment and updates it transactionally.
 *
 * Replace this with a real webhook from your gateway in production.
 */
export const Route = createFileRoute("/api/mock-pay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: z.infer<typeof BodySchema>;
        try {
          body = BodySchema.parse(await request.json());
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        const outcome = body.outcome ?? (Math.random() > 0.05 ? "completed" : "failed");
        const { data, error } = await firestoreAdmin.rpc("complete_mock_payment", {
          _payment_id: body.payment_id,
          _outcome: outcome,
        });
        if (error) {
          const status = error.message === "Payment not found." ? 404
            : error.message === "Payment is not pending." ? 409
              : error.message.includes("ID token") ? 401 : 500;
          return new Response(error.message, { status });
        }
        return Response.json(data);
      },
    },
  },
});
