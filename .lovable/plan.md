# Plan — Healthreach follow-ups

Grouped by area. Each item is small and independent.

## 1. Orders — cancel before driver assigned

- Add `cancelled_at`, `cancelled_by`, `cancellation_reason` to `orders` (migration).
- Server fn `cancelOrder({ orderId })`:
  - Allowed if `status in ('pending','accepted','preparing','ready_for_pickup')` AND no `deliveries` row exists for the order with a non-null `driver_id`.
  - Sets `status='cancelled'`, refunds the payment row if it was paid (mock provider → mark `refund_status='refunded'`).
- Patient orders UI: show "Cancel order" button only when the rule allows; hide once a driver is assigned and show "Driver assigned — contact support to cancel".

## 2. Live location on login

- New hook `usePatientLocationBroadcaster` (mirrors driver one) that, on patient login, asks for geolocation permission once, then upserts into `user_addresses` a row labelled "Current location" with `is_default=true` and refreshes lat/lng every 60s while the tab is open.
- Reuse this on driver dashboard so drivers go online + share location automatically as soon as they log in (already partial — make it auto-start on mount instead of waiting for the toggle).
- Address card: show a "Live" badge next to the Current location row; the static `-33.90321, 18.59066` row is replaced by a reverse-geocoded address (Google Geocoding via connector).

## 3. Chat (customer ↔ pharmacy ↔ driver)

- `order_messages` table + RLS already exists. Issue is the dialog only wires patient↔pharmacy.
- Update `OrderChatDialog`:
  - Determine `sender_role` from the viewer's role.
  - Show all messages on the order, colour-coded by role (patient / pharmacy / driver).
  - Realtime subscribe to `postgres_changes` on `order_messages` filtered by `order_id`.
- Add chat entry points in driver dashboard (active order card) and pharmacy order row.

## 4. Reviews after delivery

- `ratings` table already exists. Add a `ReviewDialog` shown on patient orders list when `status='delivered'` and no rating exists yet for that order.
- Two stars groups: pharmacy + driver. Insert one `ratings` row per target.

## 5. Driver dispatch speed parity

- Today: pharmacy offers fan out instantly; driver `delivery_offers` are created only when pharmacy accepts.
- Change: as soon as pharmacy accepts the order, the dispatcher immediately creates `delivery_offers` for ALL online drivers within 20 km (one row per driver in `declined_by` filter sense — actually one broadcast offer, drivers see it via the existing nearby-offers fn).
- Add realtime subscription on the driver dashboard to `delivery_offers` inserts so new offers appear in <1s without polling.

## 6. WhatsApp + phone consistency

- Audit `+27` strings — make a `WHATSAPP_NUMBER = '27797285078'` constant in `src/lib/platform-rules.ts` and a helper `whatsappLink(message?)` returning `https://wa.me/27797285078?text=...`.
- Replace all hardcoded numbers/links across Footer, Contact, Home JSON-LD, floating WhatsApp button.
- The floating button opens WhatsApp with a pre-filled message: "Hi Healthreach, I need help with…".

## 7. Cape Town

- Replace `"Johannesburg, South Africa"` with `"Cape Town, South Africa"` in JSON-LD on `src/routes/index.tsx`, About page, Footer, and any seeded copy.

## 8. Real-time live selfie

- `PatientVerificationCard` currently uploads a file. Replace with `CameraCapture` component (already exists) used in "live" mode: opens the front camera, captures a still on a 3-2-1 countdown, watermarks with a server-issued nonce + timestamp, uploads.
- Same treatment for driver onboarding selfie step.

## Technical details

- **Migration** (single file): add cancellation columns to orders; add unique constraint `(order_id, target_type, patient_id)` on `ratings` so we don't double-rate; enable realtime on `order_messages` and `delivery_offers` (`ALTER PUBLICATION supabase_realtime ADD TABLE ...`).
- **Server fns** added in `src/lib/orders.functions.ts` (cancelOrder), `src/lib/reviews.functions.ts` (submitReview, hasReviewed), `src/lib/dispatch.functions.ts` (extend `acceptPharmacyOffer` to fan out driver offers immediately).
- **Components**: `ReviewDialog`, updated `OrderChatDialog`, `LiveSelfieCapture` wrapper around existing `CameraCapture`, `usePatientLocationBroadcaster` hook.
- **Constants**: `WHATSAPP_NUMBER` + `whatsappLink()` in `platform-rules.ts`; sweep all phone strings.

## Out of scope for this turn (already shipped previously)

Distance-per-branch, login-first hero, AI sanity check, medicine description requirement, WhatsApp floating button presence — those landed in the previous turn. If any are still broken, tell me which and I'll patch surgically rather than redo.

Approve and I'll ship it in one pass.