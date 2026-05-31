
# HEALTHREACH — Compliance & Trust Rollout

Phased so each turn ships something usable. You approve, I execute one phase, we review, then move on.

---

## Phase 1 — Driver fixes (next turn)

Goal: drivers can complete onboarding, only verified drivers get offers, the map actually directs them to the customer, and patients can rate the driver after delivery.

1. **Fix selfie submit on driver onboarding**
   Camera opens but Submit does nothing → the captured `File` isn't being committed to form state before upload. Wire `CameraCapture` `onCapture` to a `useState<File>` slot used directly by the upload call, and disable Submit until both files exist. Same fix applied to the patient verification card (same component).

2. **Block unverified drivers from receiving offers**
   `dispatch_ready_order_to_drivers` already filters `p.approval_status = 'approved'`, but it does NOT require submitted driver documents. Tighten: add `AND EXISTS (SELECT 1 FROM driver_documents dd WHERE dd.driver_id = ds.driver_id AND dd.selfie_path IS NOT NULL AND dd.id_document_path IS NOT NULL AND dd.license_path IS NOT NULL)`. Also surface a clear "Verification pending — you won't get offers yet" banner on the driver dashboard when status is pending.

3. **Real map directions + customer pin**
   `DeliveryMap` currently shows a straight line. Switch to Mapbox Directions API (token already in secrets) called from a new `getDirections` serverFn → return GeoJSON `LineString` + duration/distance. Render the route polyline, driver pin (live from `driver_locations`), pickup pin (pharmacy), and customer pin (delivery_lat/lng). Auto-fit bounds. Update every 8 s using existing realtime hook.

4. **Patient rates driver after delivery**
   `ratings` table already exists. Add a `ReviewDriverDialog` that auto-opens on the patient's order card when `status = 'delivered'` and no rating yet. 1–5 stars + optional comment → insert into `ratings(target_type='driver')`. Driver dashboard gets an "Avg rating" tile pulled from `ratings`.

---

## Phase 2 — Pharmacy verification framework

Goal: bring pharmacy onboarding to parity with driver/patient.

1. **DB**: extend `profiles` (pharmacy rows) with `license_number`, `pharmacist_name`, `pharmacist_council_number`, `business_reg_number`, `tax_number`, `responsible_pharmacist_phone`, `license_expires_at`. New table `pharmacy_documents` (operating_license_path, pharmacist_cert_path, business_reg_path, tax_cert_path, bank_proof_path). New enum value for status: extend `approval_status` to include `suspended`, `under_review`, `expired`. Annual re-verification: nightly cron flips approved→expired when `license_expires_at < now()`.
2. **Onboarding wizard** at `/pharmacy/onboarding` (mirrors driver wizard): document uploads + ID number fields + bank account.
3. **Admin review queue**: extend `dashboard.admin.tsx` with a Pharmacies tab showing pending applications, document preview, approve/reject with notes.
4. **Pharmacy status badge** everywhere a pharmacy is shown (patient pharmacy picker hides non-approved).

---

## Phase 3 — Patient verification hardening + POPIA & legal

1. **OTP for phone numbers**: Supabase phone auth already supported; add phone verification step on patient profile (gated for prescription-only orders). For now: re-use email magic link as fallback if user prefers no SMS cost.
2. **Account deletion (POPIA "right to be forgotten")**: `requestAccountDeletion` serverFn → soft-flag `profiles.deletion_requested_at`, admin queue processes within 30 days (hard delete user + cascade anonymise orders/payments).
3. **Data export**: `exportMyData` serverFn returns ZIP/JSON of all rows referencing the user.
4. **Legal pages** (each a new route file with proper `head()` metadata):
   `/legal/terms`, `/legal/privacy`, `/legal/popia`, `/legal/pharmacy-agreement`, `/legal/driver-agreement`, `/legal/patient-agreement`, `/legal/refund-policy`, `/legal/cookie-policy`, `/legal/prescription-handling`. Footer links to all. Signup adds "I agree to Terms + POPIA notice" checkbox (required).
5. **Cookie consent banner** (small, dismissible, stored in `localStorage` + `profiles.cookie_consent_at`).

---

## Phase 4 — Audit logs + fraud controls

1. **DB**: `audit_logs(id, actor_id, actor_role, action, target_type, target_id, metadata jsonb, ip, user_agent, created_at)`. Append-only — no UPDATE/DELETE policies. Admin-only read.
2. **Triggers** that auto-insert on: login (`auth.sessions`), prescription upload/approval, pharmacy approval, driver pickup/delivery, payment status change, profile edits.
3. **Fraud signals**:
   - Patient duplicate-account check: hash `id_number` and unique-index it on `patient_verifications`.
   - Pharmacy: 6-monthly license expiry reminders (cron + notifications).
   - Driver: surface avg rating < 3 to admin queue automatically; auto-suspend after 3 consecutive failed deliveries.
4. **Admin Audit Log viewer** route with filters by actor/action/date.

---

## Out of scope (call out, don't silently skip)

- End-to-end message encryption (real E2EE needs key management UX; current setup uses TLS in transit + AES at rest via Supabase — document this in POPIA notice).
- Annual manual compliance check workflow beyond the expiry flag (would need a human admin SOP page).
- Criminal background screening — needs a third-party provider (e.g. iiDENTIFii, MIE). Phase 4 leaves an integration stub.
- SMS OTP cost: requires a Twilio/Vonage account. Phase 3 leaves it behind a feature flag.

---

## Technical notes

- All new server logic uses `createServerFn` + `requireSupabaseAuth` per the TanStack pattern. No new Supabase Edge Functions.
- Every new table follows the GRANT → RLS → POLICY structure with `auth.uid()` scoping; admin-only tables get no anon grant.
- Map directions: `MAPBOX_ACCESS_TOKEN` already in secrets; new `getDirections` serverFn keeps token server-side.
- Cron for expired licenses + offer rebroadcast already has a pattern (`rebroadcast_unaccepted_delivery_orders`); add `expire_pharmacy_licenses()` alongside it.
- Legal page copy will be drafted from POPIA template; you should have a lawyer review before going to live production.

---

Reply with **"go phase 1"** (or which phase to start). I'll execute one phase per turn so you can test each before the next.
