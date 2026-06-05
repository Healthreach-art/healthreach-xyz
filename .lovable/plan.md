## What I'll build

### 1. Real-time message toasts (appointment + order)
Extend `useNotificationCenter` (already mounted in `__root.tsx`) to also subscribe to:
- `appointment_messages` where `patient_id = me OR provider_id = me`
- `order_messages` (filter via order ownership; rely on RLS — server only delivers rows we can read)

Suppress toast when the chat dialog for that thread is already open (window-level `__activeChatId`). Tapping the toast opens the chat. Plays the same notification sound + browser Notification when permission granted. No DB changes — both tables already broadcast via realtime.

### 2. Inline chat slot on every active booking/order
- Patient dashboard: each active appointment/order card already has a "Chat" button — confirm it stays hidden when there are zero active items (it already does — the cards just don't render).
- Doctor / pharmacy / driver dashboards: same chat button on each active row.
- When provider clicks **Complete**: status flips to `completed` / `delivered`; the card moves to the History tab; messages remain in DB (already the case — we never delete `appointment_messages` / `order_messages`).

No schema changes needed; this is verifying + closing gaps where the chat button is missing on the provider side.

### 3. Auto-popup rating after service completes
- New component `ServiceRatingPrompt` mounted in `__root.tsx` for patient role only.
- Subscribes to `postgres_changes` on `doctor_appointments`, `pharmacy_appointments`, `orders` filtered by `patient_id=me` with `event=UPDATE`.
- When new status ∈ {completed, delivered}: query `ratings` for an existing row keyed by (subject_type, subject_id, patient_id). If none → open modal with 1–5 stars + comment. Submit inserts into `ratings` (table exists, 8 cols).
- For orders, also offer driver rating in the same modal (two stacked star rows) when a driver was assigned.

Migration: add a unique index `(subject_type, subject_id, patient_id)` on `ratings` so we never double-prompt.

### 4. Remove Wallet & Payment Methods — Paystack only at checkout
- Sidebar (`AppSidebar.tsx`): remove "Wallet" and "Payment Methods" entries from patient nav.
- Delete route files: `dashboard.patient.wallet.tsx`, `dashboard.patient.payment-methods.tsx`, `driver.wallet.tsx` (driver keeps payouts via separate Finance view if it exists; otherwise route stays but UI hides "Add Card").
- Remove "Add Card" CTA from `AddCardDialog` consumers; checkout (`checkout.tsx`) keeps the existing Paystack popup path only — strip "Pay with saved card" / "Pay with wallet" branches.
- Keep `wallets`, `saved_payment_methods`, `wallet_transactions` tables intact (user said "only remove add card" — data stays, only the add-card UI + wallet pages go).

### 5. Unified Prescription Library
`dashboard.patient.prescriptions.tsx`: single list merging rows from `prescription_uploads` + `e_prescriptions` + `prescriptions`, sorted by created_at desc. Each row shows: thumbnail (if image), filename / drug name, source badge (Uploaded / E-Script / Pharmacy), status, date. Upload button at top stays.

### 6. Pharmacy sees patient docs on Rx orders
On `dashboard.pharmacy.tsx` order detail: if order contains any Rx-required item, render a "Patient Documents" section listing:
- Linked `prescription_uploads` row (image + verification status)
- Patient ID doc from `patient_verifications`
RLS: add a policy on `prescription_uploads` and `patient_verifications` allowing the pharmacy assigned to the order to SELECT the patient's relevant docs.

### 7. "Home" not "Dashboard"
Sidebar group label + the topmost menu item rename from "Dashboard" → "Home". URL stays `/dashboard/patient` (no route renaming — avoids breaking every internal link).

## Out of scope
- Push notifications to closed app (would need FCM/web-push infra — current setup uses in-page `Notification` API only).
- Driver chat for non-delivery orders.
- Migrating wallet balances to Paystack — kept as historical record only.

## Files touched
**Migrations (1):** add unique index on `ratings`; add pharmacy-can-read-patient-docs RLS policies.
**New:** `src/components/ServiceRatingPrompt.tsx`, `src/components/UnifiedPrescriptionList.tsx`.
**Edited:** `src/hooks/useNotificationCenter.ts`, `src/routes/__root.tsx`, `src/components/AppSidebar.tsx`, `src/routes/checkout.tsx`, `src/routes/dashboard.patient.prescriptions.tsx`, `src/routes/dashboard.pharmacy.tsx`, `src/routes/dashboard.doctor.tsx`, `src/routes/dashboard.driver.tsx`.
**Deleted:** `src/routes/dashboard.patient.wallet.tsx`, `src/routes/dashboard.patient.payment-methods.tsx`.

Approve and I'll ship it.