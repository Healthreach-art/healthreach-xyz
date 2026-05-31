import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { chargeSavedCard } from "./paystack.functions";

/** Get the user's wallet balance + recent transactions. */
export const getWalletSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;

    // Ensure a wallet row exists (idempotent).
    await supabaseAdmin.from("wallets").upsert({ user_id: userId }, { onConflict: "user_id" });

    const [{ data: wallet }, { data: txns }] = await Promise.all([
      supabaseAdmin.from("wallets").select("balance_cents, currency, updated_at").eq("user_id", userId).maybeSingle(),
      supabaseAdmin.from("wallet_transactions").select("id, direction, amount_cents, reason, order_id, paystack_reference, balance_after_cents, note, created_at")
        .eq("user_id", userId).order("created_at", { ascending: false }).limit(30),
    ]);

    return {
      balanceCents: wallet?.balance_cents ?? 0,
      currency: wallet?.currency ?? "ZAR",
      updatedAt: wallet?.updated_at ?? null,
      transactions: (txns ?? []) as Array<{
        id: string; direction: "credit" | "debit"; amount_cents: number;
        reason: string; order_id: string | null; paystack_reference: string | null;
        balance_after_cents: number; note: string | null; created_at: string;
      }>,
    };
  });

/**
 * Top up using a previously-saved Paystack card.
 * Calls Paystack charge_authorization, verifies success, then credits the wallet
 * atomically (deduped by paystack reference).
 */
export const topUpWithSavedCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    cardId: z.string().uuid(),
    amountCents: z.number().int().min(2000).max(2_000_000), // R20 – R20,000
  }).parse(d))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const charge = await chargeSavedCard({
      data: { cardId: data.cardId, amountCents: data.amountCents, purpose: "wallet_topup" },
    });

    const { data: credit, error } = await supabaseAdmin.rpc("wallet_credit", {
      _user_id: userId,
      _amount_cents: data.amountCents,
      _reason: "topup",
      _order_id: null,
      _paystack_reference: charge.reference,
      _note: "Top-up via saved card",
    });
    if (error) throw new Error(error.message);
    return { ok: true, reference: charge.reference, result: credit };
  });

/**
 * Confirm a wallet top-up that was paid via the Paystack popup (new card).
 * Calls Paystack verify, then credits the wallet — deduped by reference.
 */
export const confirmWalletTopUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ reference: z.string().min(4).max(128) }).parse(d))
  .handler(async ({ data, context }) => {
    const userId = context.userId;

    // Verify with Paystack directly here so we get the exact authoritative amount.
    const key = process.env.PAYSTACK_SECRET_KEY;
    if (!key) throw new Error("PAYSTACK_SECRET_KEY not configured");
    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(data.reference)}`,
      { headers: { Authorization: `Bearer ${key}` } },
    );
    const json = (await res.json()) as {
      status?: boolean; message?: string;
      data?: { status?: string; amount?: number; customer?: { email?: string }; authorization?: { authorization_code?: string; signature?: string; brand?: string; last4?: string; exp_month?: string; exp_year?: string; bank?: string; card_type?: string; country_code?: string; reusable?: boolean } };
    };
    if (!res.ok || !json.status || json.data?.status !== "success") {
      throw new Error(json.message || "Top-up verification failed");
    }
    const cents = json.data.amount ?? 0;
    if (cents <= 0) throw new Error("Invalid top-up amount");

    // Also persist the authorization for future one-tap top-ups & checkouts.
    const auth = json.data.authorization;
    if (auth?.authorization_code && auth?.signature && auth?.reusable !== false) {
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
          email: json.data.customer?.email ?? null,
          reusable: true,
          is_default: (existingCount.count ?? 0) === 0,
        },
        { onConflict: "user_id,signature" },
      );
    }

    const { data: credit, error } = await supabaseAdmin.rpc("wallet_credit", {
      _user_id: userId,
      _amount_cents: cents,
      _reason: "topup",
      _order_id: null,
      _paystack_reference: data.reference,
      _note: "Top-up via Paystack",
    });
    if (error) throw new Error(error.message);
    return { ok: true, creditedCents: cents, result: credit };
  });

/** Pay for an order from the wallet — atomic; refuses overdraft. */
export const payOrderFromWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    amountCents: z.number().int().min(100),
    orderId: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const { data: result, error } = await supabaseAdmin.rpc("wallet_debit", {
      _user_id: userId,
      _amount_cents: data.amountCents,
      _reason: "order_payment",
      _order_id: data.orderId ?? null,
      _note: "Order payment",
    });
    if (error) throw new Error(error.message);
    return { ok: true, result };
  });
