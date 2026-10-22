# HealthReachCare — provider finance and banking implementation

Implemented locally in the existing HealthReachCare demo for Pharmacy, Homecare and Doctor accounts. No push or deployment was performed.

## Account and navigation work completed

The Pharmacy Account layout is now a shared `AccountLayout` with role-specific section configuration. Pharmacy, Homecare, Doctor and Patient use the same avatar/initials, heading, status, edit button, bordered navigation rows and logout treatment. Mobile name/badge crowding was corrected during visual QA. Branding, sticky header and existing navigation remain intact. Driver was preserved.

Financial records and Banking & payout settings are distinct sections and routes for all three provider roles. Patient finances remain inside Account; no new primary Payments tab was introduced. Each account contains its own relevant sections and existing workflow links. Provider onboarding badges and continuation banners use saved application states; no provider approval banner or payout settings are shown to patients.

See `healthreachcare-shared-accounts-2026-10-22.md` in this reports directory for the account implementation and the existing homecare workflow discrepancy.

## Financial records

Reused the existing `FinancePanel`, `DoctorFinances`, ledger, payment attempts, refund records, payout records, settlement batches and `SettlementHistory`. Added `ProviderFinanceRecords` with links to each provider's own saved service records and confirmed fee snapshots. Missing fee snapshots are not invented. Doctor withdrawal functionality remains connected to its existing backend rules. Settlement CSVs and financial histories remain distinct from the beneficiary settings form.

Existing posted earnings, fees, refunds, reservations, completed-work clearance and simulated payout eligibility calculations remain in use. This change does not mark a booking/order as paid or create a settlement merely because banking details were saved.

## Banking setup

One reusable `ProviderPayoutSettings` form serves Pharmacy, Homecare and Doctor using the authenticated account identity. The existing `/api/workspace` handler persists its data through the existing marketplace operations and D1 workspace. No replacement backend or database migration was introduced.

Captured fields:

- Registered business/professional name, trading name, conditional business registration number, role-appropriate licence/professional reference, business/practice address.
- Authorized representative name and role, business contact email and phone.
- Bank name, account holder name, account type, conditional branch code, masked test account reference, review status and last-updated timestamp.

Required business/contact fields are explicitly labelled as this demo review's requirements. They are not asserted to be a live bank's or payment provider's requirements. Branch code is optional, with six-digit format validation when supplied. No universal bank branch code is inferred. Contact email/phone formats are checked; ownership and representative authority are not independently verified by saving them.

The current environment accepts TEST-prefixed fictional account references only. Raw `accountNumber` payload fields are rejected. References are stored as a fingerprint and masked suffix; complete references, fingerprints and arbitrary unknown banking properties are excluded from the public response. Real bank-account collection and direct bank deposits are not enabled.

States: Not provided, Incomplete, Pending verification, Action required, Rejected and Simulated verified. Draft saving and submission are separate explicit actions. Required fields and requested evidence are checked server-side on submission. Provider edits reset review eligibility. A changed beneficiary/account/business setup increments its revision; evidence for an older revision cannot satisfy the new review. Reviewers must provide correction/rejection reasons, visible to the provider. Audit history records actor, time, state, revision and changed field names without storing the full test reference in history.

The existing five-minute test challenge is single-use, bounded by failed-attempt checks and required for payout edits. The UI explicitly says this locally generated code is not SMS/email OTP or an independent authentication factor. Existing authenticated sessions remain the access boundary.

## Conditional supporting evidence

No payout documents are requested by default. An existing authorized administrator may request specific fictional bank confirmation, business registration, licence/professional registration or representative-authority evidence, with a reason. The UI identifies the request as required for that particular review.

Uploads reuse the existing private object store, document validation, audit and download endpoint with a new restricted payout purpose. Only specifically requested kinds are accepted. Files must be fictional PDF/PNG/JPEG up to 1 MB and pass server file-signature checks. Upload success requires a newly saved document acknowledgement. Uploading does not automatically submit or verify the setup.

Payout evidence is accessible only to its provider owner or an authorized administrator with an audit purpose. Patient, Driver and unrelated provider access is denied. Storage keys are excluded from client metadata. Current/previous setup revisions and actual access expiry are shown. The existing identity-document retention interval is reused; expiry is not represented as immediate physical deletion. No automatic OCR/redaction or semantic detection of genuine versus fictional document contents is claimed: testers must supply fictional files as instructed.

The admin Finance area now shows the saved business/bank summary, existing review outcome controls, reasoned conditional evidence requests and audited evidence access. Verification remains labelled Simulated verified and never claims a bank/AVS response.

## Actual tests and results

| Check | Result |
| --- | --- |
| `npm test` | PASS, all five suites |
| API | 1,176 action checks passed, including 181 added payout/privacy checks |
| Navigation | 505 assertions passed, including all shared account section routes |
| Rendering | All existing screens passed; 805 shared-account assertions, 51 three-role banking/finance assertions and 4 saved finance ownership/snapshot assertions passed |
| Interactions | Existing 140 workflow/account handler assertions, four patient-card destinations, every shared account menu action, and three-role banking draft/submit/failure handlers passed |
| Logout | 48 six-role app-only session assertions passed |
| Lint | PASS, no lint errors or warnings |
| TypeScript | PASS, `npx tsc --noEmit` |
| Production build | PASS using the Sites build helper |
| Diff whitespace | PASS, `git diff --check` |

Added backend scenarios exercise all three provider roles: partial draft save/reload, mandatory-field failures, invalid email/account type/branch format, raw number rejection, account-ID injection denial, masked response projection, rejected setup correction, use of saved masked references, reasoned evidence requests, unrequested/invalid/unauthorized uploads, evidence download ownership, mandatory admin audit purpose, explicit re-submission, simulated review, changed-account re-verification and payout blocking while unverified. Order, checkout, payment, ledger and payout snapshots remain unchanged by the banking setup flow.

Browser QA inspected actual shared component output in isolated SSR fixtures at 390px for Pharmacy/Homecare/Doctor and 1050px desktop width. This is layout QA, not a full authenticated hosted banking session. Temporary QA scripts/pages were removed. No real bank data was used.

## Remaining dependencies and limits

- There is no configured live payout gateway, bank account verification service, bank-token vault or transfer API in this checkout. Direct deposits, actual bank verification and real payouts remain unavailable. No transfer was attempted.
- Live account-number collection requires an approved provider integration and its current account types, bank/branch rules, merchant onboarding and document policy, plus appropriate secure tokenization/secret management and change authorization. This task does not install a gateway or modify payment configuration.
- Official provider references reviewed for dependency scoping: https://api.netcash.co.za/value-added-services/avs-real-time/ documents bank-specific AVS/branch restrictions; https://payfast.io/faq/merchant-faqs/ describes provider onboarding evidence. Neither provider is configured or selected by this implementation, and their requirements were not presented as this app's live requirements.
- Existing legacy simulated payout profiles and transaction histories are retained. Editing a provider setup uses the new validated form and review process. No approval or payment event was manufactured to migrate old data.
- Authenticated hosted browser end-to-end verification and physical-device file-picker testing remain to be performed in the corresponding environment. Backend/file tests use the actual route adapter with isolated fixture storage.
- The attached account brief describes homecare quotations, while the existing demo uses the previously requested direct-payment homecare workflow. That business-flow discrepancy remains documented; this finance/account update does not silently replace the booking process or create fake quotations.

Production Firebase, authentication providers, existing user accounts, DNS, hosting/deployment settings, payment configuration and live customer data were not changed. No existing records were deleted or replaced with demo fixtures. The live site does not contain these local changes until a separately authorized deployment.
