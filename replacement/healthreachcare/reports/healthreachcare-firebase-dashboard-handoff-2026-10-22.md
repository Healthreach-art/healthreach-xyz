# Firebase dashboard handoff repair — 22 October 2026

## Cause and changes

Firebase login previously stopped at a separate /account profile page. The existing dashboard accepted only a Sites-isolated demo session. These were two different authentication/data paths.

Verified Firebase accounts now call the existing /api/workspace endpoint using an ID token. The server verifies the token against Firebase and reads the stored account type and approval status. The existing dashboard components receive their normal filtered workspace shape without a demo token or identity selector. The isolated demo path remains separate for its existing tests/data.

A verified patient with a saved name and password now leaves /account automatically for /dashboard/patient/home. An address is not required simply to browse the dashboard; patients can save/select it through the existing address UI. Google-only patients see a focused password setup rather than another name/address/profile form. Existing saved account addresses are imported, never replaced with sample addresses. Approved providers have role-specific dashboard destinations; pending/rejected providers remain in their authenticated onboarding area. Administrator permission remains a verified signed claim, never an email, client role field or URL selection.

Real workspaces are stored separately under firebase-market:<projectId> in the existing Sites Cloudflare D1 binding. They start with zero fictional patients, providers, products, orders, payments and deliveries. The existing role-filtered projection protects other patients' profiles and saved addresses. Writes use the existing compare-and-swap version pattern. Firebase identity takes precedence over a stale demo token.

Supported real-account dashboard actions now include saved-address management, profile/contact preferences, trusted contacts, account photos, reminders, notification reads and existing policy acknowledgement. Private photo downloads use Firebase authentication and return binary content with no-store/nosniff headers. Existing provider onboarding documents remain under their authenticated /api/account/documents endpoint in private Sites R2.

Real-account requests cannot call the demo payment simulator, select demo personas, approve themselves, create simulated dispatches or substitute a successful transaction. Unsupported live service actions return a clear unavailable error without changing records. Live medication checkout, appointments, homecare bookings, delivery operations, prescription-document workflow and service messaging still need real transaction integration; they are not represented as complete by this repair.

Dashboard routes now render an empty loading shell and let the Firebase-authenticated API gate data. They no longer require a separate ChatGPT identity inside the application router. The private Sites hosting audience is unchanged. Logout still signs out only HealthReachCare, and private UI state is cleared on pagehide to avoid retaining it in a back-forward cache.

## Validation actually performed

- npm test passed, including 1,255 existing workflow assertions, 511 navigation assertions plus 290 route-table checks, existing rendering/logout/interactions, and all account suites.
- New Firebase dashboard tests: 56 handoff/projection/state/permission checks and 12 actual dashboard load/navigation handler checks. They use mocked identities and isolated D1 storage with the actual existing dashboard projection. They verify address/profile persistence, cross-account isolation, no fictional seed records, pending-provider restrictions, no demo-token requirement and no simulated-payment fallback.
- Existing Firebase token suite: 26 generated-token/mock-account checks; account rules: 105 checks; account/document API suite: 42 isolated checks.
- ESLint passed without lint errors or warnings. TypeScript noEmit passed. Production Vinext build passed.
- Managed desktop browser: opening /dashboard/patient/home while signed out reached /login?returnTo=%2Fdashboard%2Fpatient%2Fhome, with no private records and no host ChatGPT-login redirect. The local preview intentionally has no production auth environment flags, so its form was disabled. No live credentials were entered and no real-user booking, payment, message or upload was performed.

## Connection checks and remaining dependencies

- Read-only Firebase metadata for project number 370128051283 returned successfully. healthreachcare-connected-demo.swiftox16.chatgpt.site is still absent from its authorized domains. Google remains disabled pending an authorized Firebase administrator adding that hostname, confirming/enabling the Google provider, and enabling the corresponding Sites flag. No Firebase console settings or users were changed.
- Cloudflare Wrangler whoami reports that no account is authenticated. The supplied attachment is a functional specification and contains no delegated Cloudflare authorization. No connected Cloudflare management plugin was found. The separate healthreachcare Worker/custom domain/R2 account cannot be managed until authorized access is provided through a supported sign-in flow.
- Current persistence uses the existing Sites Cloudflare D1/R2 bindings, not a newly configured Firestore or Firebase Storage database. No new database product or billable plan was enabled.
- A legitimate Firebase administrator claim is still needed for real provider reviews. Public listings, licensing checks, payment-provider/webhook work and live fulfilment remain unfinished. The application is not a completed public healthcare marketplace.

No existing Firebase user or legacy customer record was deleted or reset. No old Cloudflare Worker, DNS, domain, GitHub deployment, hosting audience or payment setting was changed.
