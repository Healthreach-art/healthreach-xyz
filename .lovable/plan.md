# HealthReachCare targeted integration plan

## Scope
Preserve the existing Home Care, doctor, pharmacy, driver, authentication, payment, database, and page designs. Make only the requested workflow-completion and public-brand changes. No migration, replacement database, mock records, or fake email delivery.

## 1. Complete the existing Home Care status flow
- Keep the current `homecare_requests`, `homecare_assignments`, approval rules, notifications, pricing percentage, and live database subscriptions.
- Preserve customer submission with a real address pin, service, description, preferred date/time, and duration.
- Keep assignment server-controlled and enforce that only approved, active providers can be selected and assigned.
- Complete the existing transition sequence using the current statuses:

```text
pending_review → assigned/offered → accepted → scheduled → in_progress → completed → confirmed
```

- Add the missing provider step from **Accepted** to **Scheduled** before a visit can start. Keep decline returning the request to admin review for reassignment.
- Tighten status updates so customers, providers, and admins can only make the transition appropriate to their role; continue mirroring assignment status onto the request.
- Keep the provider dashboard details already present: service, area, scheduled date/time, duration, approximate distance, customer charge, existing platform fee, and provider earnings.
- Keep live in-app assignment notifications and add only any missing status-change notifications needed for the customer/admin to follow acceptance, scheduling, progress, completion, and confirmation.
- Keep customer confirmation as the final step and show every current status in the existing request card.

## 2. Verify the real workflow
- Use existing authenticated accounts and existing approved provider records only.
- Verify: customer submits → admin sees request → admin assigns approved provider → provider receives notification and dashboard assignment → provider sees distance/earnings → provider accepts and schedules → customer sees the live status.
- Also verify start, completion, and customer confirmation if the existing records allow the full sequence.
- Do not create test users, providers, requests, or assignments. If suitable real records do not exist, report the exact verification step that could not be exercised rather than inserting fake data.

## 3. Align doctor approval with the controlled provider model
- Reuse the current doctor profile, private `doctor-docs` storage, doctor document record, admin verification panel, audit log, notifications, and existing booking visibility rules.
- Preserve doctor signup, document upload, admin approval/rejection, activation, and patient booking.
- Add the missing **Request documents** admin action to the existing doctor review flow rather than creating another approval system.
- Persist the request/review reason, notify the doctor, keep the doctor inactive while more documents are required, and allow resubmission through the current doctor dashboard.
- Ensure only an approved, active, verified doctor is returned to patients; do not change doctor appointment booking behavior.

## 4. Rename the public brand to HealthReachCare
- Replace every user-visible `HealthReach` / `HEALTHREACH` occurrence across the landing page, login, signup, dashboards, navigation, support pages, receipts, notifications, consent/tool descriptions, page titles, metadata, PWA text, and public indexing files with **HealthReachCare**.
- Replace controlled canonical, sitemap, robots, structured-data, and social-image URLs with `https://healthreachcare.co.za`.
- Replace old platform contact addresses with `support@healthreachcare.co.za`, including support/contact/legal-style contact points where a platform email is shown.
- Update existing authentication email branding/templates through the connected email infrastructure where supported; do not add a simulated sender or a second email service.
- Keep internal identifiers that users do not see—database names, storage buckets, route paths, local-storage keys, file names, and protocol identifiers—unchanged to avoid regressions.

## 5. Update landing-page role cards only
- Remove only the public **Administrators** marketing card; retain all admin login and dashboard functionality.
- Add **Home Care Providers** in the same card structure and current visual style, linked to the existing Home Care signup path.
- Use the supplied copy and a matching Home Care image asset; do not redesign the landing page or other sections.

## 6. Validation
- Check the database migration contains grants/RLS and does not weaken existing provider, customer, or admin isolation.
- Run the relevant Home Care and doctor checks, confirm the app builds cleanly, and inspect the login, signup, landing page, Home Care customer/admin/provider views, and doctor verification panel at mobile and desktop widths.
- Confirm no old public-facing brand, old support email, or controlled `healthreach.xyz`/`healthreachhub.lovable.app` reference remains while internal compatibility identifiers remain untouched.
