# Plan

## 1. Pricing rework (R26 base + R10/km, 15% admin top-up)

**Formula** (in `src/lib/pricing.ts`):
- `customerMedPrice = basePrice * 1.15` (pharmacy keeps 100% of base, admin gets the 15% markup)
- `deliveryFeeCustomer = 26 + 10 * km` (charged even when km < 0.5)
- `driverEarning = deliveryFeeCustomer * 0.85`
- `adminEarning = (basePrice * 0.15) + (deliveryFeeCustomer * 0.15)` (plus transaction/processing fee captured on payments)
- New helper `estimateDeliveryFee(km)` + ETA `etaForDistance(km)` already exists.

**DB-side** (`validate_order_pricing`, `split_payment_amounts`):
- Update both triggers to use the new formula so server is authoritative.
- Store `delivery_km` on orders (new column) so split is deterministic.
- `split_payment_amounts`: driver = delivery_fee × 0.85, admin = subtotal_med × (0.15/1.15) + delivery_fee × 0.15 + transaction_fee, pharmacy = base medicine cost.
- Add `transaction_fee` numeric column on `payments` (default 0; for mock provider use 2.9% + R1).

**UI**:
- Driver dashboard wallet: show "Your earnings (85% of delivery)".
- Pharmacy finance: show "Medicine revenue" only.
- Admin dashboard: new "Platform revenue" panel with total, breakdown (med markup, delivery cut, transaction fees), and per-order table.

## 2. Cancel fix
- `cancel_order_safely`: drop the "driver assigned" block. Always allow cancel before `delivered`. If a driver was assigned, mark their delivery `cancelled`, free them up, notify them.

## 3. Scheduled delivery
- Add `scheduled_for timestamptz` nullable on `orders`.
- Checkout: optional "Deliver later" datetime picker.
- New cron job `release-scheduled-orders` runs every minute via pg_cron + `/api/public/hooks/release-scheduled`. It flips orders where `scheduled_for <= now()` and `status='scheduled'` to `pending` so the normal flow takes over.
- Add `scheduled` to `order_status` enum.
- Pharmacy dashboard: show scheduled orders in a separate "Upcoming" tab; no alarm until release.

## 4. Priority alert mode
- Add `priority boolean default false` on `orders`. Patient checkbox "Urgent / critical" at checkout (e.g. emergency medication).
- Pharmacy alarm: when any pending order has `priority=true`, switch to "critical" tone (higher pitch, faster loop, no cap). Otherwise current standard alarm.
- Driver new-offer ping: same — louder/longer for priority orders until accept/decline.

## 5. Patient stage notifications with per-stage toggles
- Extend `notification_preferences` with columns: `push_order_placed`, `push_preparing`, `push_ready`, `push_picked_up`, `push_out_for_delivery`, `push_delivered` (all default true).
- New "Notification preferences" section on patient settings — switches per stage.
- Update `notify_order_status_change` trigger to respect the per-stage flag.

## 6. Device vibration (pharmacy)
- In `dashboard.pharmacy.tsx` alarm loop, call `navigator.vibrate([400, 200, 400])` each tick when supported and not muted.
- Add a separate `hr_pharmacy_vibrate` localStorage toggle next to the mute button.

## 7. In-app chat fix
- `OrderChatDialog` already exists. Add realtime subscription on `order_messages` filtered by `order_id`. Ensure `order_messages` is in `supabase_realtime` publication.
- Wire chat button on patient orders, pharmacy orders, driver orders to open the dialog for the same order (3-way thread).
- Add unread badge counter using `read_at`.

## Files

**DB migration**:
- `orders`: + `scheduled_for`, `priority`, `delivery_km` columns; enum value `scheduled`.
- `payments`: + `transaction_fee`.
- `notification_preferences`: + 6 per-stage push flags.
- Rewrite `cancel_order_safely`, `validate_order_pricing`, `split_payment_amounts`, `notify_order_status_change`.
- Add `release_scheduled_orders()` function.
- Enable realtime on `order_messages`.

**Code**:
- `src/lib/pricing.ts` — new formula + helpers
- `src/routes/checkout.tsx` — priority checkbox, scheduled picker, km-based fee preview
- `src/routes/dashboard.pharmacy.tsx` — vibration, priority alarm tier, scheduled tab
- `src/routes/dashboard.driver.tsx` — priority offer alarm
- `src/routes/dashboard.patient.index.tsx` (or settings) — per-stage preference switches
- `src/routes/dashboard.admin.tsx` — revenue panel
- `src/components/OrderChatDialog.tsx` — realtime + unread
- `src/routes/api/public/hooks/release-scheduled.ts` — cron endpoint
- pg_cron schedule via insert tool

## Order of execution
1. Migration (schema + new triggers + cancel/release functions) — needs approval.
2. Pricing lib + checkout + admin revenue UI.
3. Pharmacy alarm priority + vibration.
4. Driver alarm priority.
5. Patient per-stage prefs UI.
6. Chat realtime.
7. Cron hook + pg_cron job for scheduled release.

## Technical notes
- Pricing trigger override: server recalculates `total_amount` from `medication.price`, `quantity`, `delivery_km`. Client value ignored.
- Pricing tolerance widened to R0.01 since both sides use same formula.
- Cron auth: `apikey` header with anon key; route validates apikey only.
- Vibration API: feature-detect `navigator.vibrate`.
- Priority alarm: separate oscillator pattern (1200 → 880 → 1200 Hz, every 1s).
- Cancel notifies driver/pharmacy and closes open offers.
