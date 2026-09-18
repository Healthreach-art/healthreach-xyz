# Home care providers on HealthReach

Adds home care companies and individual home care providers to the existing platform: sign-up, their own staff, admin approval, then assignments. No redesign — new pages follow the current look and sit beside the existing pharmacy, doctor and driver flows.

## Blocked right now

The hosted database is paused, and I cannot resume it from here — resuming has been switched off for this project. You need to resume it in your project's Cloud settings (or ask support if the button is unavailable). Nothing below can be built or tested until it is awake, because every step needs the live database.

## 1. Home care sign-up

Two new account kinds chosen at sign-up:

- **Home care company** — business name, registration number, contact person, email, phone, address (with a real map pin), service areas, services offered, operating hours, pricing, banking details, documents.
- **Individual home care provider** — full name, email, phone, address (map pin), service areas, services offered, weekly availability, qualifications, certifications, identity and supporting documents, banking details.

Everything saves as you type/leave a field, so a refresh never loses work — the same behaviour the doctor and pharmacy pages now have. Documents go to private storage, never a public link.

New accounts start as **Pending review** and can do nothing operational until an admin approves.

## 2. Company staff

A company can invite staff by email. Staff belong to that company and can only see their own profile, their assigned visits, the schedule, their required documents, and messages about their own assignments. Staff can never become admins and never see another company's data. A company manager manages only its own staff.

## 3. Admin approval screens (built before assignments)

New admin section for home care, matching the existing approvals style:

- **Pending review queue** — every new company and individual, with their details and documents.
- **Document viewer** — open each uploaded file as picture or PDF through a short-lived private link.
- **Actions** — Approve, Reject (with reason), Request more documents (pick which ones), Suspend, Reactivate.
- **Requested documents** — the provider sees exactly what is still missing, and the list ticks itself off as files arrive.
- **Approval history** — who did what, when, and why, for every provider.

Only admins can approve. Providers cannot approve themselves.

## 4. Coordinates and the 100 km radius

Every approved company and individual stores a real latitude/longitude captured from its address. The patient Find page gains a **Home care** tab that lists approved companies and individuals within 100 km of the patient, using the same distance logic already used for doctors. Providers without a saved pin cannot be approved, so nobody ends up invisible.

## 5. Connecting to the existing workflow

Once approval screens are in place, home care requests reuse the current request → assignment → completion pipeline:

customer request → admin review → provider chosen → provider notified → provider accepts → visit scheduled → visit performed → completion confirmed → payment/settlement → shows in customer history.

Statuses update live from the database on both sides. A provider only ever sees the customer details needed for their own visit.

## 6. Prescriptions and sensitive documents

Prescription and document files stay private: no public links, access granted only to the customer, admins, and the specific pharmacy/doctor/provider attached to that order, through short-lived links. Every open of a sensitive file is recorded in the audit log. Medicine orders keep working exactly as today.

## 7. Data residency report (partial — needs the database awake)

Confirmed now:

- Backend, database, file storage and logins are all on Lovable Cloud, hosted in the provider's **Frankfurt, Germany** region.
- That means customer records, orders, prescriptions and provider documents are currently stored **outside South Africa**.

Still to confirm once the database is running: exactly which file areas exist, and whether any prescription or document area is publicly readable. I will report this before touching anything.

No migration will be started. When you want South-Africa-hosted production data, I'll write a separate migration plan that preserves all existing users, orders, providers, documents and their relationships.

## 8. AI

No new AI in any of this. The whole flow works on plain database and application rules. AI stays only for understanding a customer's written request, asking for missing details, explaining services and summarising conversations — it never invents customers, providers, prices, payments, orders, documents or approval decisions, and gives no medical advice.

## Technical details

- New account roles `homecare_company` and `homecare_staff` added to the `app_role` enum; existing roles untouched.
- New tables: `homecare_providers` (company/individual, contact, service areas, services, hours, pricing, lat/lng, approval fields), `homecare_staff`, `homecare_documents`, `homecare_requests`, `homecare_assignments`, `homecare_approval_events`. Each gets GRANTs, RLS enabled, and policies scoped by `auth.uid()` plus `has_role`; company scoping via a security-definer `is_homecare_member(company_id)` helper to avoid recursive policies.
- Approval fields: `approval_status` (reuses the existing enum: pending, under_review, approved, rejected, suspended), `approved_by`, `approved_at`, `rejection_reason`, `requested_documents jsonb`.
- Approvals, rejections, document requests and sensitive-file reads write to the existing `admin_audit_log` via `log_admin_action`.
- Private bucket `homecare-docs` with owner/admin/assigned-party policies; signed URLs only, file type and size validated server-side.
- All approval, assignment and staff-invite mutations run in `createServerFn` handlers with `requireSupabaseAuth` and a server-side role check; no service-role key reaches the browser; frontend role values are never trusted.
- Radius filter reuses the existing `haversine_km` SQL function; new `find_homecare_near(lat, lng, radius_km)` mirrors `find_pharmacies_near`.
- Realtime status updates reuse the existing `postgres_changes` subscription pattern.
- No existing table, column, route or component is removed; all changes are additive and backward compatible.

## Smoke tests after build

1. Customer home care request → admin approval → provider assignment → provider accepts → completion → customer confirmation.
2. Customer medicine order → prescription upload → admin and the authorised pharmacy/doctor can open it; nobody else can, and each open is logged.
