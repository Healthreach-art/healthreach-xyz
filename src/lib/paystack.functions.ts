import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PAYSTACK_BASE = "https://api.paystack.co";

function paystackKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY not configured");
  return key;
}

interface PaystackAuth {
  authorization_code?: string;
  signature?: string;
  bank?: string;
  card_type?: string;
  brand?: string;
  last4?: string;
  exp_month?: string;
  exp_year?: string;
  country_code?: string;
  reusable?: boolean;
}

/**
 * Verify a Paystack transaction by reference.
 * Also saves the card authorization (if reusable) so the user gets one-tap
 * checkout next time — card details never touch our database.
 */
export const verifyPaystackTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ reference: z.string().min(4).max(128) }).parse(d))
  .handler(async ({ data, context }) => {
    const res = await fetch(
      `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(data.reference)}`,
      { headers: { Authorization: `Bearer ${paystackKey()}` } },
    );
    const json = (await res.json()) as {
      status?: boolean;
      message?: string;
      data?: {
        status?: string;
        amount?: number;
        currency?: string;
        reference?: string;
        customer?: { email?: string };
        authorization?: PaystackAuth;
        metadata?: Record<string, unknown>;
      };
    };
    if (!res.ok || !json.status) {
      throw new Error(json.message || `Paystack verify failed (${res.status})`);
    }
    const verified = json.data?.status === "success";
    const auth = json.data?.authorization;
    const userId = context.userId;

    // Save reusable authorization for next-time one-tap pay.
    if (verified && auth?.authorization_code && auth?.signature && auth?.reusable !== false) {
      const existingCount = await supabaseAdmin
        .from("saved_payment_methods")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);

      await supabaseAdmin.from("saved_payment_methods").upsert(
        {
          user_id: userId,
          authorization_code: auth.authorization_code,
          signature: auth.signature,
          brand: auth.brand || auth.card_type || "card",
          last4: auth.last4 || "0000",
          exp_month: Number(auth.exp_month) || 1,
          exp_year: Number(auth.exp_year) || new Date().getFullYear() + 1,
          bank: auth.bank ?? null,
          card_type: auth.card_type ?? null,
          country_code: auth.country_code ?? null,
          email: json.data?.customer?.email ?? null,
          reusable: true,
          is_default: (existingCount.count ?? 0) === 0,
        },
        { onConflict: "user_id,signature" },
      );
    }

    return {
      verified,
      reference: json.data?.reference ?? data.reference,
      amount: (json.data?.amount ?? 0) / 100,
      currency: json.data?.currency ?? "ZAR",
      metadata: json.data?.metadata ?? {},
    };
  });

/**
 * Charge a previously saved Paystack authorization — no popup, one tap.
 * Returns the reference; caller should pass it to verifyPaystackTransaction.
 */
export const chargeSavedCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      cardId: z.string().uuid(),
      amountCents: z.number().int().min(100).max(10_000_000),
      purpose: z.enum(["order_payment", "wallet_topup"]),
      orderId: z.string().uuid().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const { data: card, error } = await supabaseAdmin
      .from("saved_payment_methods")
      .select("authorization_code, email, user_id")
      .eq("id", data.cardId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !card?.authorization_code || !card.email) {
      throw new Error("Saved card not found or not reusable");
    }

    const res = await fetch(`${PAYSTACK_BASE}/transaction/charge_authorization`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        authorization_code: card.authorization_code,
        email: card.email,
        amount: data.amountCents,
        currency: "ZAR",
        metadata: {
          purpose: data.purpose,
          order_id: data.orderId ?? null,
          user_id: userId,
        },
      }),
    });
    const json = (await res.json()) as {
      status?: boolean;
      message?: string;
      data?: { status?: string; reference?: string; gateway_response?: string };
    };
    if (!res.ok || !json.status || json.data?.status !== "success") {
      throw new Error(json.data?.gateway_response || json.message || "Charge failed");
    }
    return { reference: json.data.reference!, status: json.data.status };
  });

/**
 * Remove a saved card — deactivates the Paystack authorization, then deletes the row.
 */
export const deleteSavedCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ cardId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const { data: card } = await supabaseAdmin
      .from("saved_payment_methods")
      .select("authorization_code")
      .eq("id", data.cardId)
      .eq("user_id", userId)
      .maybeSingle();

    if (card?.authorization_code) {
      // Best-effort — ignore network errors so the user can still remove the row.
      try {
        await fetch(`${PAYSTACK_BASE}/customer/deactivate_authorization`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${paystackKey()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ authorization_code: card.authorization_code }),
        });
      } catch { /* ignore */ }
    }

    await supabaseAdmin.from("saved_payment_methods").delete().eq("id", data.cardId).eq("user_id", userId);
    return { ok: true };
  });
