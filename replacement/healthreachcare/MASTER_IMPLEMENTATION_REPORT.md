# HealthReachCare master brief — local implementation

22 October 2026 · Changes are committed locally for review. **Not pushed or deployed.**

Baseline: `4d7877334f79a90cfe45406b57bb96ea0f1a9924`. Earlier `df9bb80` and logout/landing commits remain in history. The checkout was clean before this task. No branch, commit, record, deployment or backup was removed.

## Implemented in this change

- Patient primary navigation is exactly **Home, Activities, Notifications, Account**, in desktop and bottom navigation. Notification badges count only notifications. Provider navigation is retained; Admin has no bottom bar. Old patient inbox/message URLs resolve to Notifications; financial-history URLs remain accessible under Account. Removed the dashboard logout bar and test-registration controls/routes from ordinary navigation. Account remains the logout location. Internal pages have a Back to Home action; patient Home does not.
- Account links to financial history, privacy/legal controls, security information, Help & Support, reminders and private documents. Name/email editing uses the existing persisted profile; it does not falsely verify email. Removed the customer security screen's simulated email-verification controls. Existing isolated account fixtures and backend test utilities were retained. Live customer registration is explicitly unavailable rather than simulated as successful.
- Default Home address editor supports manual street/unit/suburb/city/province/postal code/instructions and optional permission-based coordinates. Home can open the editor directly. Transaction-specific medication, prescription, doctor and homecare addresses are selectable without overwriting the default unless explicitly requested. Matching uses the selected transaction location. Server validates transaction coordinates. Seed addresses labelled `Saved demo address` are hidden as defaults without deleting the retained data. Coordinates are not represented as verified street addresses; reverse geocoding is not connected.
- Persisted reminders support create, edit/reschedule, complete, delete and daily/weekly recurrence. A due occurrence creates one saved in-app notification, not one per refresh. Patient ownership is checked. Notification preferences report the device's response honestly; background push is not implemented.
- Routine fulfilment statuses stay on the Activity timeline. Important decisions, exceptions, rescheduling, payment events, messages and reminders remain separate actionable alerts. Reminder alerts open Reminders; support alerts open Support; privacy alerts open Privacy. Historical routine-status notifications are filtered from patient responses, not deleted from storage.
- Activities now expose service-specific payment attempts, amounts, status, timestamp, reference and receipt access. Patient activity cards create refreshable detail URLs. Existing item price snapshots, quotations, review decisions, tracking and audit timelines remain attached to their transaction.
- Patient prescription documents can be uploaded into the private document centre independently of an order. A patient may explicitly link a still-retained prescription to another owned draft. This does **not** copy an approval, verify clinical suitability, extend retention or bypass pharmacy/identity review. Pharmacy access is limited to linked active orders. Other transaction associations and storage keys are removed from pharmacy responses. Original documents are not deleted when a service closes.
- Service support routes eligible cases to their assigned pharmacy, doctor or homecare provider. Completed services can raise cases. Provider access after completion has an Admin-configurable 1–720 hour window (72 hour default); this is an access window, not a promised response time. Unavailable/out-of-window cases and sensitive platform/payment/privacy categories route centrally. Escalation removes provider access. Replies, outcomes and escalation history persist. Missing/unrelated service IDs and unrelated providers are rejected. Support-evidence access uses the same case permissions.
- Terminal service conversations are archived for **all service types**, retained and readable by permitted participants. New discussion uses service support instead of reopening a completed operational thread. Retained history is accessible within the service details. Active-service attachments and voice notes remain unchanged.
- Added an Admin Announcements & promotions destination: create/edit, draft/publish/pause/expire, start/end dates, one or all supported audiences, optional city and category metadata, internal call to action, PNG/JPEG image up to 500 KB, and recorded in-app read acknowledgements. Role/city/date filtering and read eligibility run on the server. Promotional cards are separate from important notifications. Category is descriptive metadata; interest-based targeting is not implemented. Read counts are not claims of delivery or ad impressions.
- The supplied hero image is retained at its original aspect ratio with no forced cropping on mobile or desktop. Existing green tokens remain. Compact service cards, concise how-it-works and partner information, existing public policy links, About and Contact & Support are present. Internal dashboards no longer repeat the public footer. Emergency guidance clearly separates platform support from emergency services.

## Changed source

| Files | Purpose |
|---|---|
| `app/page.jsx`, `app/globals.css` | Public layout, patient Account/Home/Activities, contextual tools, footer/back navigation |
| `lib/dashboard-navigation.ts`, `components/dashboard-bottom-nav.tsx` | Central patient destinations, legacy routing, badge/layout rules |
| `lib/patient-experience.mjs`, `components/patient-tools.jsx` | Reminders, addresses, support permissions/window, announcements |
| `app/api/workspace/route.js` | Persisted API integration, important-event notifications, transaction details |
| `lib/completion.mjs`, `components/completion-panels.jsx` | Document reuse/access, selected service locations and service support |
| `lib/business.mjs`, `lib/matching.mjs` | Complaint access, completion archives and selected-location matching |
| `components/demo-entry.jsx` | Transparent isolated-testing access; no fictitious live registration claim |
| `tests/workflows.mjs`, `tests/navigation.mjs`, `tests/views.mjs` | New regressions and updated expectations |

## Checks actually run on the final source

| Check | Result |
|---|---|
| API workflow checks | **713 passed** |
| Navigation/component assertions | **283 passed** |
| Shared-screen rendering assertions | **104 passed** |
| App-only logout assertions | **48 passed** |
| ESLint | Passed, no errors or warnings |
| TypeScript `tsc --noEmit` | Passed |
| Production framework build | Passed |
| `git diff --check` | Passed |

API checks invoke the actual workspace route against isolated in-memory D1/R2 adapters and simulated trusted identity. They exercise persisted records, validation, role permissions, version conflicts and data isolation. Admin-positive tests supply a trusted permission fixture; they are **not proof of a real hosted administrator login**. Build output contains non-fatal proxy and framework route-classification advisories.

Regression testing initially caught old expectations that required notification spam and open operational messaging after completion. Tests were corrected to assert timeline history, archived retained conversations and active-service messaging. Temporary appointment fixtures were completed so later conflict tests remained independent. Final full suite passed after these corrections.

## Requested verification coverage

| Brief checks | Verified result / limitation |
|---|---|
| 1–3 landing, sign-in/sign-up, logout | Existing server/render/logout tests preserved; host-level anonymous access still blocked and not changed. No new live login/signup verification. |
| 4 patient destinations | Exact four labels, active links, nested routes, no patient Payments/Inbox primary items tested. |
| 5 location | API verifies per-transaction address snapshot and unchanged default, coordinate bounds, saved-address ownership. Device GPS/geocoding and interactive browser behavior unverified. |
| 6 ordinary medication ordering | Existing fixed-price checkout/payment/order/pharmacy/dispatch/delivery regressions pass. |
| 7–10 prescription controls | Reuse, foreign-owner rejection, missing verification, review rejection, unpaid state, blocked dispensing and retained document tested. Existing completion/private-access regressions remain. |
| 11–12 notifications | Routine Prepared event absent as standalone alert, history retained; saved due reminders de-duplicated; notification routing assertions and UI rendering checked. No hosted clicking test. |
| 13 reminders | Create/edit, recurrence, completion, deletion, ownership and once-per-occurrence alerts tested. Background push unavailable. |
| 14 homecare | Quotation/acceptance/payment/scheduling regressions pass; homecare remains separate from pharmacy. |
| 15–16 support | Active/completed cases, pharmacy/doctor/homecare replies, unrelated role rejection, escalation, expiry and Admin permission tested. |
| 17 promotions | Admin-only mutation, server role/city targeting, reads, publish/pause, future schedule and expiration, invalid image rejection tested. Valid image rendering and browser file selection not device-tested. |
| 18 tracking | Existing consent/ownership/approval/expiry/reassignment/completion tracking regressions pass. Physical GPS and hosted map/browser behavior unverified. |
| 19 payment consistency | Existing payment, refund, ledger, price-snapshot and transaction-linkage regressions pass. Payments remain simulated. |
| 20 permissions | Existing ownership, cross-role, sensitive document/message, Admin negative, driver dispatch and atomic assignment regressions pass. |
| 21 checks | All checks in the table above passed. |

## Remaining dependencies and incomplete requirements

1. **Approved website reference:** `https://healthreachcare.co.za/` could not be opened by the search service; a direct read returned HTTP 403. Search found no indexed pages. Its approved contacts, complete footer, logo assets and exact responsive design could not be verified. No contact details were invented. Current supplied imagery, established branding and working policy/support links were preserved. Exact reference matching and approved business contact information remain incomplete.
2. **Host/authentication:** the existing Site is owner-private and uses Sites identity. An anonymous visitor may be stopped by the platform before `/` or `/login` reaches app code. App-only logout no longer signs out that platform identity. Public anonymous hosting requires an intentional audience/hosting decision; no workaround or setting change was made. Existing authentication remains ChatGPT-backed. Real customer accounts, customer signup, external email delivery and trusted healthcare Admin authority need the separately authorised production integration. UI testing identities are still clearly identified rather than passed off as real accounts.
3. **Real healthcare and payments:** the accessible project is a D1/R2-backed isolated testing application, not access to production Firebase or live provider inventories. Existing fictional inventory/identity and simulated payment/verification disclosures remain where needed. Real pharmacy stock, professional verification, clinical prescription validity, justified identity requirements/retention, real settlement and payment authorisation/refunds require production services and review. No simulated payment or provider approval was relabelled as real. Prescription review still precedes the available simulated capture; no new payment-authorisation gateway was invented.
4. **Documents/security:** the existing API's private R2 paths, ownership, assigned active-order checks, Admin purpose audit, expiry and driver denial were inspected and regression-tested. Compatible linkage checks were added. Production Firebase/Storage rules and legal retention were not accessed or certified. Existing test uploads still require test-data consent and preserve their retention safeguards. Minimum necessary real identity verification needs professional/privacy policy approval before production use.
5. **Device/hosted QA:** no authenticated hosted browser, mobile device, actual microphone/GPS, permission prompt, browser Back/refresh after real login, private-file download or screen-reader interaction was verified in this task. The managed browser's previous policy restriction prevents live Site inspection. No browser-policy bypass was attempted. Production browser acceptance remains required.
6. **Notifications/ads:** due reminders are processed when the app API is accessed; no worker scheduler or push provider was added. No background delivery guarantees, live geocoding/road map integration or interest-based promotional targeting are claimed.

These dependencies mean the complete production marketplace brief is **not fully finished or production-verified**, despite the passing local checks.

## Compatible data changes and preservation

Additive persisted fields: `reminders`, `announcements`, document `recordIds`, optional transaction `addressDetails`, structured address `street`, support `team/providerAccessUntil`, policy `serviceSupportHours`, announcement read acknowledgements. Existing rows and binary documents are retained. Whole-workspace compare-and-swap persistence and existing server ownership rules remain. No Firebase schema or security-rule deployment occurred. Review these additions, real retention/consent policy and trusted Admin permissions before production integration.

**Firebase data, real users, DNS, hosting audience/deployment, payment configuration and authentication provider were not changed.** No new payment, messaging, mapping or authentication backend was introduced. No external messages were sent. The live Site remains at its prior published version. Rollback is available through the intact baseline and prior commits; review/revert the local implementation commit rather than resetting data or deleting history.
