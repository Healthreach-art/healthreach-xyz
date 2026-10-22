# Shared Pharmacy-reference accounts — local implementation

## Implemented

Extracted the existing Pharmacy Account header, edit action, bordered section list, icons, captions, badges and logout styling into `components/account-layout.jsx`. Pharmacy, Homecare, Doctor and Patient now render the same component, configured centrally by role. The global HealthReachCare logo, tagline, sticky header and existing navigation remain intact. The Driver account remains unchanged.

Homecare has provider information, services/pricing, availability/service areas, application/documents, bookings, notifications, financial records, payouts, security/privacy and support. Doctor has professional profile, practice/consultation settings, availability, professional verification, appointments, notifications, finance/payouts, privacy/security and support. Patient has personal information, addresses, security/privacy, notifications/reminders, financial records, personal documents, support and platform/legal information. Patient finance remains inside Account; no primary Payments tab was added.

All section actions route to existing functional pages. Private profile/photo editing, professional/public profiles, provider settings, schedules, onboarding, documents, payments, payouts, support cases and legal/privacy controls reuse existing components and backend actions. Existing account preferences and safety/trusted-contact pages remain accessible under Security & privacy. Patient reminder and notification actions are available under Notifications & reminders.

Application badges use the saved application status, falling back to the saved provider status. Patient does not show a provider badge/banner/payout option. Provider continuation banners cover missing applications, Draft, Rejected, Additional information requested and Expired states; Submitted, Under review and Approved do not display an application-completion banner. Professional verification is shown separately using the existing recorded flag; an account approval is not represented as regulatory verification. Names/initials or private saved photos come from existing data.

Updated `components/pharmacy-dashboard.jsx` and `components/account-workspace.jsx` to reuse the shared layout. Updated `app/page.jsx` to suppress duplicate account back links and onboarding banners. Updated `app/globals.css` with shared responsive styles, keyboard focus and a mobile grid that keeps long names and status badges from crowding. No backend/storage/authentication/permission schema changes were needed.

## Checks run

- API suite: PASS, 995 isolated backend action checks, including role ownership, profile/settings save/reload, private files, provider/driver approval safeguards, pharmacy, doctor and homecare regression workflows.
- Navigation suite: PASS, including every shared account section's target route and role-specific route checks.
- Rendering suite: PASS, including 805 new shared account assertions across four roles and seven real application states, role-content exclusions, existing account/detail screens and existing public/service screens.
- Interaction suite: PASS, including all four shared menus, every section button, edit action, Back to Home and logout. Existing 140 workflow/account handler assertions and four patient-card destination clicks also passed.
- Logout suite: PASS, 48 assertions across six roles, app-session revocation and preservation of unrelated browser storage.
- Lint: PASS. TypeScript (`npx tsc --noEmit`): PASS. Production build helper: PASS. `git diff --check`: PASS.
- Browser layout QA: inspected actual shared component output using isolated SSR fixtures at 390px for all four roles and 1050px for Doctor. Fixed mobile name/badge crowding found during inspection. No real account data was modified. Temporary QA scripts/pages were removed.

Backend checks use the existing route adapter with isolated test storage; browser layout checks are not authenticated hosted end-to-end verification. No claim is made that live external payments, regulatory verification or hosting access were tested.

## Genuine limitations / brief discrepancy

The attached brief describes homecare quotations. The current demo deliberately uses fixed-price, direct-payment homecare booking following the earlier explicit instruction to remove homecare quotations. No active quote/accept/decline backend exists in this checkout. This account-only change preserves that current service workflow and links to the actual Bookings and Settings pages; it does not create fake quotations or claim the quotation requirement has been implemented. Restoring quotations requires a separate business-workflow change and explicit reconciliation with the earlier direct-payment requirement.

Sign-in/password changes remain with the existing identity provider. Contact email is not verified by saving it. Real banking validation, payment gateways, professional-registration verification and live Firebase integration are not introduced. Existing financial/provider records remain labelled appropriately for the demo. Private photo/device upload and full authenticated hosted browser testing still require the corresponding environment/device access.

No data was deleted or replaced. Existing accounts, orders, appointments, bookings, financial records, files and provider approval workflows were not migrated or reset. No payment configuration, Firebase configuration, DNS, deployment settings or live customer data were changed. Nothing was pushed or deployed.
