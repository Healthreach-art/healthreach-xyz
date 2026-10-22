# HealthReachCare account and landing-page update — 22 October 2026

## Implemented

- Removed Welcome / Log In / Sign Up from the top landing navigation. Kept the supplied logo, hero image and hero account links. Kept the header sticky.
- Unified the main brand token to #13A673. Retained the specifically requested patient service-card colours.
- Added a landing-only pale-mint footer: desktop columns, responsive stacking, original logo at 44px, platform/company/policy links, support@healthreachcare.co.za, tel:+27797285078 and https://wa.me/27797285078. No WhatsApp messaging backend was added and no message was sent.
- Patient signup at /signup asks for full name, email and password. Separate provider signup is at /partners. There is no administrator signup choice or dashboard role switcher.
- New account passwords and linked passwords require at least six characters, a letter, and a number or special character. Existing registered passwords are not changed. Firebase-hosted password-reset policy has not been reconfigured.
- Firebase-managed browser-local session persistence keeps users signed in until they explicitly sign out. Logout signs out HealthReachCare's named Firebase app and returns to /. No host or unrelated cookies are cleared.
- Replaced Check account status with Confirm if verified. Verified sign-ins enter /account; restored verified sign-ins on login/signup also enter /account. Unverified identities cannot edit profiles, upload documents, submit applications or review providers.
- Signup saves the chosen patient/provider account against the authenticated UID, so its type survives email verification and refresh. Choosing a provider account only creates an incomplete application; it grants no service/admin permission.
- Patient /account saves the full name and delivery address. Google-only users have an explicit password-linking form; existing password users are not forced to reset their password.
- Provider /account has onboarding guidance, a welcome dialog, saved application fields, private supporting-document upload/download, submission status, rejection reasons and resubmission. Approved and submitted applications cannot be silently rewritten by their owner.
- Administrators with a verified signed Firebase admin:true custom claim can read submitted provider applications and their supporting documents, approve after confirming required checks, or reject with a mandatory reason. Decisions and account changes are recorded in audit history. No claim or administrator account was created.
- Added separate authenticated account APIs using the existing Sites D1 and private R2 bindings. Records are namespaced by Firebase project and UID; they never initialize or reuse fictional marketplace workspaces. Concurrent saves use compare-and-swap. Upload metadata failures remove the newly uploaded object.
- Upload validation: PDF/JPEG/PNG/WebP, nonempty, 10 MB maximum, matching file signatures, maximum eight documents; owner or signed-claim administrator downloads only, private no-store responses and attachment disposition. Upload progress, save acknowledgement, timeout and retry errors are shown.

## Actual validation

- Existing API workflow suite: 1,255 assertions passed using isolated test data.
- Existing navigation: 511 assertions plus 290 route-table assertions passed.
- Existing rendering, logout and interaction suites passed; updated intentional landing-header assertions and added 16 landing/footer/signup rendering checks and eight signup-handler checks.
- Firebase verification: 26 generated-token/mock-account assertions passed, including invalid/disabled/revoked identities and signed administrator claims. These are not live-account sign-in tests.
- Real-account rules: 105 fictional local password/state/authorization assertions passed.
- New account APIs: 42 isolated in-memory D1/R2 assertions passed, including persistence, forbidden cross-account edits/downloads, admin-only review, mandatory rejection reasons, resubmission, stale-write protection and upload rollback. No live identity or document was used.
- Lint passed without errors or warnings. TypeScript noEmit passed. Production Vinext build passed and included /account, /partners and both account APIs.
- Desktop browser QA through the managed preview verified the landing header/footer and distinct patient/provider registration pages. No live credentials were entered. Mobile styles were checked in source/rendering tests; a mobile browser viewport was not tested.

## Still requires authorized setup / integration

- Read-only Firebase project metadata returned HTTP 200 for project number 370128051283. The authorized-domain list still excludes healthreachcare-connected-demo.swiftox16.chatgpt.site. Google login remains disabled rather than presenting false success. An authorized Firebase administrator must add this hostname (without scheme/path), confirm the Google provider/support settings, and then enable the Sites Google flag. Actual Google login must then be tested.
- Real registered-user login, verification-email delivery, password-reset delivery and real-account document persistence in the deployed runtime were not exercised with live credentials. A successful SDK email request is described as a request acknowledgement, never proof of delivery.
- No trusted Firebase administrator custom claim is configured by this task. Applications can be saved to the real review queue, but an authorized project administrator must provision legitimate reviewer permission before review can be used by a real admin.
- /account is a real saved-profile/onboarding area. It does not claim that the existing isolated demo marketplace is now a live healthcare marketplace. Real catalogue publication, professional verification, bookings, ordering, payments, deliveries, service conversations and transactional email remain separate integration work. Approved onboarding alone does not publish a provider or authorize live healthcare transactions.
- The Sites audience remains owner-private. The separate host access gate was not removed; this is not a public customer launch.
- WhatsApp link format is verified; ownership/availability of the recipient's WhatsApp account has not been independently verified.

## Preservation

No old Firebase project, existing Firebase users, Cloudflare Worker/domain/DNS, legacy GitHub repository or live customer records were changed or deleted. No billing plan, payment configuration or production deployment outside the existing private Sites app was changed.
