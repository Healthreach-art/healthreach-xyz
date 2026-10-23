# HealthReachCare page and dashboard preparation — 22 October 2026

## Changes in the Sites app

- All non-admin roles now use five destinations: Patient Home/Activities/Messages/Notifications/Account; Pharmacy Home/Orders/Messages/Notifications/Account; Doctor Home/Appointments/Messages/Notifications/Account; Homecare Home/Bookings/Messages/Notifications/Account; Driver Home/Deliveries/Messages/Notifications/Account.
- Patient messages now resolve to the saved conversation screen, instead of incorrectly opening Notifications. Legacy non-admin Inbox URLs resolve to Messages, including an existing record reference.
- Pharmacy product management remains on its products route and in Account/Home actions. Product screens highlight Account; finances remain reachable from account menus for providers.
- Messages and Notifications each use the existing saved-data unread count. No invented badge counts were added.
- Nested routes retain the correct selected destination; finance, schedule, onboarding, payout and account subpages remain reachable.
- Removed obsolete message-list text telling users to switch portals, and the fixed refresh-interval wording. Existing demo records remain identified as demonstration data in their workflows.
- Removed the old production Firebase project's default local configuration. New Firebase setup remains disabled until a new project is actually authorized and configured. The old Firebase project was not modified.

## Checks actually run

- Full `npm test`: passed. This includes 1,255 API/workflow checks, navigation, all role screen rendering, 48 six-role logout checks, and UI interaction suites for accounts, messages/attachments/recording, prescription documents, patient service cards, banking and homecare quote decisions.
- `npm run test:navigation`: passed, including 511 navigation/component assertions and 290 full-route-table/unknown-route assertions, plus legacy Inbox and nested-message checks.
- `node tests/firebase-connection.mjs`: 21 checks passed using generated local tokens and mocked responses. No live Firebase users or external account operations were involved.
- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- Sites production build helper: passed (framework informational route-classification warning remains).
- `git diff --check`: passed.

These are local automated checks. They are not production end-to-end testing, physical-device testing, live Firebase sign-in/Google popup testing, or evidence that real emails, payments or deliveries occurred.

## Remaining real-user blockers

1. New Firebase project has not been created. Automatic browser security review blocked Google sign-in; no credential entry or project creation occurred. The app has no active new project configuration.
2. Prepared Firebase helpers are not yet connected to real dashboard identities and trusted shared business records. The existing demo API still uses Sites identity plus isolated sessions; it must not be presented as production customer authentication.
3. Production provider credential checks, payments/payouts, operational email delivery and live-driver services are not connected here. Existing simulations must stay separate from real-user activity.
4. The hosted Sites app remains owner-private. Public customer access and the intended Cloudflare/R2 connection need separate configuration and verification.

No GitHub push/merge, old-project changes, Cloudflare changes, billing upgrades, live-data changes or deployment was performed in this preparation step.
