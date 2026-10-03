import { createFileRoute } from "@tanstack/react-router";

const DEFAULT_WEBHOOK_URL =
  "https://us-central1-healthreachcare-prod.cloudfunctions.net/paymentProviderWebhook";

export const Route = createFileRoute("/api/public/payment-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const endpoint = (process.env.FIREBASE_PAYMENT_WEBHOOK_URL ?? DEFAULT_WEBHOOK_URL).trim();
        const body = await request.text();
        let response: Response;
        try {
          response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": request.headers.get("content-type") ?? "application/json",
              "x-webhook-signature": request.headers.get("x-webhook-signature") ?? "",
            },
            body,
          });
        } catch (error) {
          console.error("Could not forward payment webhook to Firebase.", error);
          return new Response("Payment webhook could not be processed", { status: 502 });
        }
        return new Response(await response.text(), {
          status: response.status,
          headers: { "Content-Type": response.headers.get("content-type") ?? "text/plain" },
        });
      },
    },
  },
});
