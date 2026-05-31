## Goal

Stop forcing customers to re-enter their card on every order, **without storing card details in our database**. Tokenization happens at Paystack; we only store a reusable token (authorization_code). Then layer a wallet on top — customers can pre-load funds via Paystack and pay future orders from balance, also without saving anything sensitive in our app.

## Why this approach

- **Compliant by default**: Paystack holds the card; we hold a token. No PCI scope for HEALTHREACH.
- **Reuses what's already built**: `saved_payment_methods` table, `AddCardDialog`, `CardPinDialog`, `verifyPaystackTransaction` server fn, Paystack inline JS in checkout — all already wired.
- **The real gap**: today's `saved_payment_methods` only stores `brand/last4/exp_*` for *display*. There is no `authorization_code`, so the next checkout still pops a fresh Paystack form. That's the one thing we fix to deliver "no need to re-add card".

## What changes (phased)

### Phase 1 — Saved cards (one-tap reuse) — ship now

1. **DB migration**
   - Add to `saved_payment_methods`: `authorization_code TEXT`, `signature TEXT` (Paystack dedupe), `bank TEXT`, `card_type TEXT`, `country_code TEXT`, `email TEXT`, `reusable BOOLEAN DEFAULT true`.
   - Unique index on `(user_id, signature)` so the same physical card isn't saved twice.
   - Keep existing RLS ("Users manage own cards") — still scoped to `auth.uid() = user_id`.

2. **Server functions (`src/lib/paystack.functions.ts`)** — extend the existing file:
   - `verifyPaystackTransaction`: also pull `authorization` block from Paystack's verify response and, when `reusable=true`, upsert into `saved_payment_methods` (by `signature`). Mark `is_default=true` if it's the user's first card.
   - `chargeSavedCard({ authorization_code, amount, order_id })`: POST to `https://api.paystack.co/transaction/charge_authorization` with the patient's email + amount in kobo/cents. Returns `{ status, reference }`. Used for one-tap checkout and wallet top-ups.
   - `deletePaymentMethod({ id })`: call Paystack's `/customer/deactivate_authorization` then delete the row.

3. **Checkout UX (`src/routes/checkout.tsx`)**
   - Load patient's saved cards on mount.
   - Payment step shows: list of saved cards (Visa •••• 4242 · default) + "Use a new card" option.
   - **One-tap path**: tap a saved card → call `chargeSavedCard` → server returns reference → call existing `verifyPaystackTransaction` → place order. No Paystack popup.
   - **New card path**: existing Paystack inline popup runs, but now `verifyPaystackTransaction` quietly saves the authorization for next time (with a small "Save this card for faster checkout" toggle, default on).

4. **Payment methods page (`/dashboard/patient/payment-methods`)**
   - Already lists cards; just wire the new `deletePaymentMethod` server fn and add a default-card toggle (already there, just verify it works against the new schema).

### Phase 2 — Wallet (visible flow, no card stored in our app)

1. **DB migration**
   - `wallets`: `id`, `user_id` (unique), `balance_cents INT NOT NULL DEFAULT 0`, `currency TEXT DEFAULT 'ZAR'`, timestamps.
   - `wallet_transactions`: `id`, `wallet_id`, `direction` (`credit`/`debit`), `amount_cents`, `reason` (`topup`/`order_payment`/`refund`/`adjustment`), `order_id` (nullable), `paystack_reference` (nullable), `created_at`.
   - GRANTs to authenticated + service_role. RLS: user reads own wallet/txns; only server-side (service role) writes.
   - Function `wallet_debit(_user_id, _amount_cents, _order_id)` + `wallet_credit(...)` — atomic, `SECURITY DEFINER`, locks the wallet row, refuses overdraft, inserts a `wallet_transactions` row.

2. **Server functions** (`src/lib/wallet.functions.ts`)
   - `getWalletSummary()` — balance + last 20 transactions for current user.
   - `topUpWallet({ amount_cents, authorization_code? })` — if `authorization_code` provided, calls `chargeSavedCard`; otherwise returns a Paystack init payload so the page opens the inline popup. On verify success the webhook (or verify fn) calls `wallet_credit`.
   - Extend `src/routes/api/public/payment-webhook.ts`: when a `charge.success` event has `metadata.purpose === 'wallet_topup'`, credit the wallet; when it has `metadata.purpose === 'order_payment'` and a wallet portion, debit/credit accordingly.

3. **Wallet UI** (`/dashboard/patient/wallet`)
   - Big balance card + "Top up" button (R50 / R100 / R250 / custom).
   - Top-up flow: pick a saved card → one tap → confirmation. OR "Use a new card" → Paystack inline popup. The point: **the card lives at Paystack, never in HEALTHREACH; the wallet balance lives in HEALTHREACH**.
   - Transaction list with running balance, refund-to-wallet entries, etc.

4. **Checkout integration**
   - Add a third payment option above the card list: "Pay from wallet (R 247.50 available)".
   - If wallet ≥ total → one-tap debit, instant order placement.
   - If wallet < total → "Pay R45 from wallet + R180 from Visa •••• 4242" (split payment) OR "Top up R200 first".
   - Cancelled orders refund to wallet by default (instant), with optional "refund to original card" (3–7 days) for whole-order refunds.

## Technical details

```text
Saved-card one-tap flow
─────────────────────────
patient → checkout.tsx
       → chargeSavedCard({authorization_code, amount, order_id})  [server fn]
              → Paystack /transaction/charge_authorization
              ← {reference, status:"success"}
       → verifyPaystackTransaction({reference})                   [existing]
       → placeOrder(...)                                          [existing dispatch fn]

Wallet top-up flow
─────────────────────────
patient → /dashboard/patient/wallet
       → topUpWallet({amount_cents, authorization_code?})         [server fn]
       → on success: wallet_credit(user_id, amount, ref)          [DDL fn, SECURITY DEFINER]
       → wallet_transactions row inserted; balance updated atomically

Wallet pay-for-order flow
─────────────────────────
patient → checkout → "Pay from wallet"
       → wallet_debit(user_id, total_cents, order_id)             [DDL fn]
              raises if balance < total
       → placeOrder(...)
       → if order cancelled → wallet_credit refund (instant)
```

**Security model**

- `saved_payment_methods.authorization_code` is sensitive but **not** a card number — Paystack only honors it against the same email + their secret key. RLS keeps it per-user; only server functions read it.
- Wallet writes go through `SECURITY DEFINER` SQL functions; client cannot directly UPDATE balance.
- Webhook signature already verified in `/api/public/payment-webhook` — extend it, don't loosen it.

## What stays the same

- Paystack remains the only payment provider; no Lovable Payments enable needed.
- `cancel_order_safely` already refunds payments — we just add a wallet credit path inside it (Phase 2).
- Existing `AddCardDialog` / `CardPinDialog` stay as-is for the "new card" path.

## Out of scope (call out explicitly)

- Withdrawing wallet balance back to bank — wallet is **store credit only** for now (avoids money-transmitter regulatory questions in SA).
- Apple Pay / Google Pay — Paystack supports them; can add later behind the same flow.
- Driver/pharmacy wallet payouts — separate system, already partly there.

## Suggested rollout order

1. Phase 1 migration + paystack server fns (1 build step)
2. Wire saved cards into checkout + payment-methods page (1 build step) ← **delivers the "no re-adding card" win**
3. Phase 2 wallet DB + server fns + wallet page (1 build step)
4. Wallet into checkout + refund-to-wallet on cancellation (1 build step)

You can stop after step 2 and customers already get one-tap checkout. Steps 3–4 add the wallet on top whenever you're ready.
