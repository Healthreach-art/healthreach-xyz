# HealthReachCare: communication, tracking and entry-flow improvements

22 October 2026. Changes are prepared in the existing `/workspace/sites/healthreachcare` project. **They have not been deployed.** The current hosted application remains unchanged, as requested. No Firebase configuration, authentication provider, production user account, DNS, Cloudflare deployment, payment gateway, repository branch or existing live record was changed or deleted. The accessible application remains the existing Sites/ChatGPT-authenticated D1/R2 demo; this is not a claim of implementing or testing the separate production Firebase repository.

## What changed

### Public entry, session handling and demo access

- Added `/login` and `/signup` using the existing application, branding and native sign-in. The pages render their actual entry screens on the server, avoiding a flash of the landing page.
- Signed-out `/` and `/welcome` remain public. The landing page has Log In and Sign Up links. Public logo navigation returns to the landing page.
- The existing dashboard route now checks the existing server authentication before rendering. Signed-out direct dashboard URLs redirect to Login with a validated internal `returnTo`, including query parameters. Login, Sign Up and demo-entry links preserve that destination; an identity cannot enter a different role's destination.
- Removed automatic activation of a default patient persona. Native authentication without an active demo session offers the explicit chooser instead of inventing an authenticated patient session.
- Added **Demo Accounts — Test the Platform** using existing persisted/provisioned identities, with registered workspace identities available after native authentication. Native sign-in remains required. No proposed `@healthreachcare.co.za` addresses or passwords were invented. Patient email identifiers come from saved demo profiles; other identities use their existing workspace IDs when no stored email exists. These are not email/password credentials or proof of working mailboxes.
- Removed the general role/account selector from dashboard headers. A valid active demo token cannot call `startSession` to change identity. Users log out before selecting another demo. Administrative account-management tools remain restricted to authorised administrators.
- Logout clears active client records, messages/modals, basket, stored persona token and intended private page before native sign-out. Server revocation is independent of a stale workspace version, retries compare-and-swap conflicts, removes that session's shared locations and returns no private workspace payload. Expired/revoked sessions do not silently reactivate a remembered persona. History/page restoration checks the session before showing a private view.
- The patient bottom bar now links to **Payments**, not provider Finances. Legacy patient finance links resolve to the payment-history screen. Other role navigation and Admin exclusion remain intact.

**Administrator dependency:** The current native identity adapter supplies identity fields but no verified HealthReachCare administrator entitlement. The demo chooser therefore keeps Administrator disabled, and the API denies new Admin sessions and existing Admin-token operations without a trusted server-side `healthreachcare:admin` permission. A typed email, body role, client flag or demo button cannot grant it. No administrator was provisioned and no provider configuration was changed. Positive Admin workflow tests inject an explicitly authorised identity through the existing isolated API test adapter; they do not establish that a real administrator can sign in with the current provider. Connecting the existing legitimate administrator authority requires a separately authorised identity/permission integration.

### Contextual communication

- Reused existing service-linked conversations, unread/read state, timestamps, participant checks and notifications. New message success is returned only after persistence.
- Doctor messaging is denied before booking confirmation. Pharmacy, doctor, homecare and delivery channels remain tied to their particular order/booking and participants.
- Added PNG/JPEG/PDF attachments and WebM/Ogg audio through the existing private object store. Uploads validate size/signatures, use transaction-scoped ownership, retain opaque file IDs rather than storage keys in messages, and are idempotent by message ID. CAS failure retains the existing uploaded-object rollback mechanism.
- Added browser voice-note recording where supported, explicit microphone permission, a 60-second recording UI limit, audio-format checks, manual Send, and useful unsupported/denied/error states. Files are bounded to 3 MB. This does not introduce WhatsApp or another messaging backend.
- Added authorised attachment download/audio playback, with saved workspace-version synchronization after binary reads so the next message/review does not fail on the old document-read version. Admin reading requires a stated purpose and an audit event; active conversation bodies are no longer automatically included in Admin workspace responses. Drivers cannot download pharmacy/prescription/appointment conversation attachments.
- Added retained conversation history access for current permitted participants. Completed pharmacy/delivery conversations stay archived rather than erased. Reassigned providers/drivers do not regain old operational access. The existing care-context retention and dispute evidence remain intact.
- Message attachments follow the existing 30-day demo document access period. This change does not add a closed-app deletion scheduler or claim malware scanning/production clinical compliance.

### Delivery, location and matching

- Added explicit opt-in driver location for nearby offers and active deliveries. Only approved online drivers may submit coordinates; active tracking additionally requires that driver's assigned, paid, unfinished delivery. Consent, coordinate bounds and accuracy are validated. Points are server-timestamped and expire after two minutes; only the latest point is held, not a fabricated location trail.
- Location is visible only to the assigned driver, the corresponding patient, and verified authorised administrators. Other patients and pharmacies cannot read active driver coordinates. Raw location/session-hash collections are excluded from client responses.
- Stop, offline/approval changes, expiry, reassignment, logout and delivery completion clear the applicable shared location. The last-update timestamp remains so tracking can distinguish Live, Location unavailable and Ended.
- Existing atomic driver claims and handover-code safeguards remain. Offer eligibility now uses the saved delivery city/service area, supports drivers listing multiple cities, and ranks sequential offers by genuine fresh driver-to-pickup coordinates when supplied. Missing coordinates use the existing eligibility/fairness fallback rather than an invented distance.
- Added pickup/delivery navigation links using saved addresses, with unavailable pickup information shown explicitly. Exposed straight-line pickup distance only when both saved coordinate sources exist; road distance and ETA are not invented.
- Added an Admin operational coordinate map with active deliveries, driver positions, pickups and destinations, authorised purpose audit, timestamps and 15-second refresh while the opened view is active. It is a coordinate map with navigation links, not a new street-map/traffic/routing-provider integration.
- Preserved existing stock/hours/price/publication checks for pharmacy matching and separate homecare quotations. Added location eligibility for configured in-person doctor requests and useful catalogue empty states.

### Doctor profiles and appointments

- Displayed saved registration information alongside qualifications, languages, specialty, consultation mode, practice location and fixed fee.
- Added a date-specific availability API using the same reservation/overlap rules as booking. The patient UI loads actual available slots rather than treating all configured times as free; booking and payment still recheck concurrency.
- Added consented profile-photograph upload through the existing validated image uploader. Photo changes return the public profile to Draft. The photograph becomes listed only after the existing explicit publication review; unapproved photo asset URLs return Not found. Existing private provider-document review supports examining the supplied photograph. No stock or generated portrait was substituted for a professional.

## Verification results

The API suite executes the actual route and shared rules using isolated fictional D1/R2 test adapters. Existing checkout, prescription, homecare quotation, appointment, driver handover, image, finance/refund and onboarding regression journeys remain included. Tests never write production records or move money.

- API: **622 action checks passed**.
- Navigation/components: **297 assertions passed**.
- Screen rendering: **93 assertions passed**.
- ESLint: **passed, 0 errors and 0 warnings**.
- TypeScript (`npx tsc --noEmit`): **passed**. Existing dynamic JS/JSX still relies on runtime validation/API tests; this is not full static typing of arbitrary workspace JSON.
- Framework production build: **passed**, including `/login`, `/signup`, protected dashboards and existing endpoints. Framework proxy/plugin-timing/route-classification advisories were non-fatal.

New API assertions cover: session identity/refresh and revocation across all six roles; stale-version logout; changing role with an active token; denied Admin entry from a forged email/flag; denied operations after verified permission is removed; file ownership/idempotency/invalid file rejection and authorised binary retrieval; purpose-based message access; delivery consent/ownership/privacy/expiry/stop/completion; genuine driver proximity selection; Admin map access; actual slot availability and messaging gates; profile-photo consent, publication and protected serving. No real microphone, camera or GPS device result is asserted by the API tests.

### Requested entry scenarios

| Scenario | Actual result |
|---|---|
| 1. Signed out opens landing | Browser passed in local preview. |
| 2. Log In opens login page | Browser passed. |
| 3. Sign Up opens signup page | Browser passed, including direct refresh. |
| 4. Logout from each role returns public | Server revocation passed for six role fixtures. Client cleanup/native-return implementation inspected; full signed-in browser/native-sign-out journey not verified. |
| 5. Signed-out refresh stays public | Browser passed. |
| 6. Signed-in refresh preserves role | Actual API session refresh passed for six role fixtures; full signed-in browser refresh not verified. |
| 7. Private dashboard while signed out | Browser passed: redirected to Login with the pharmacy Orders destination preserved through sign-in and signup links. |
| 8. Each demo role opens correct dashboard | Server identity/role and dashboard routes passed in tests. Five role-entry controls connect to native sign-in. Native browser completion unverified. Real Administrator entry is deliberately blocked until existing verified administrator authority is available. |
| 9. Administrator shortcut cannot elevate | API and rendered/browser disabled-state checks passed. Positive Admin tests use an explicitly trusted test identity only. |
| 10. No ordinary dashboard role selector | Source/render checks passed; active-token identity switching is rejected by the API. |

The existing browser environment's native sign-in completion remains unverified; its earlier authentication restriction was not bypassed. Full signed-in desktop/mobile end-to-end runs, permission prompts, real voice playback, browser downloads and real device location accuracy remain unverified. Empty/error/consent states are implemented and relevant server denials were tested; a rendered screen alone is not counted as a completed live integration.

## Main changed files

- `app/page.jsx`: entry/session/logout lifecycle, dashboard selector removal, contextual communication/tracking UI, directions and empty states.
- `app/login/page.jsx`, `app/signup/page.jsx`, `app/dashboard/[...path]/page.tsx`: explicit public entry and protected server routing.
- `app/api/workspace/route.js`: demo session/admin checks, revocation, shared communication/location integration and secure binary responses.
- `lib/demo-access.mjs`, `lib/experience.mjs`: existing identity catalogue, safe return paths, administrator entitlement guard, attachment/history permissions, availability and tracking rules.
- `lib/business.mjs`, `lib/marketplace.mjs`, `lib/matching.mjs`, `lib/dashboard-navigation.ts`: location-aware offers, reviewed photos, doctor eligibility and patient payment navigation.
- `components/demo-entry.jsx`, `components/service-communication.jsx`, `components/delivery-tracking.jsx`, `components/provider-photo.jsx`: connected user controls.
- `components/completion-panels.jsx`, `components/marketplace-panels.jsx`, `app/api/product-image/[id]/route.ts`: doctor availability/profile/photo integration.
- `tests/workflows.mjs`, `tests/navigation.mjs`, `tests/views.mjs`: expanded regression and permission coverage.

## Dependencies left untouched

Verified administrator authority in the real identity system; complete native/browser/device testing; real provider/clinical verification; licensed road-map/routing/traffic integration if required; production document scanning and retention scheduling; production Firebase deployment/security review. No new authentication provider, WhatsApp integration, payment gateway, hosting configuration or production deployment was introduced.
