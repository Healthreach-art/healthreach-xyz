# Existing Firebase / Cloudflare integration inspection — 22 October 2026

## Verified locally and read-only

- Existing source retrieved from https://github.com/Healthreach-art/healthreach-xyz at `93d390fc53eb34a48e93ece8887a8c6ae9446b1b`. The source checkout is `/workspace/repos/healthreach-xyz`; no edits or pushes were made to it.
- Its Firebase config identifies `healthreachcare-prod`, matching the supplied public Web App configuration. Runtime encrypted Worker values were not inspected, so source agreement is not runtime proof.
- Wrangler configuration names Worker `healthreachcare` and private R2 binding `DOCUMENTS_BUCKET` → `healthreachcare-documents`.
- Source includes Firebase email/password, Google sign-in, verification, password recovery, Firestore `user_roles` and profiles, authenticated Firebase action dispatch, and private document upload/download handlers.
- Public domain https://healthreachcare.co.za returned HTTP 200 to a read-only HEAD request. This does not verify login or production workflows.
- Wrangler reports this workspace is not authenticated to Cloudflare. No Worker configuration, billing, DNS or deployments changed.
- Production source's available `npm test` ran: 12 policy tests passed. Production build/lint were not run; dependencies were not installed in that checkout.

## Prepared in the existing Sites checkout

- Added Firebase SDK and JOSE dependencies.
- Saved the supplied public web configuration in `config/firebase-web.json`; no service-account key, private credential or API token was requested or saved.
- Added allowlisted configuration API, browser authentication helpers for email/password and Google, registration, verification email, password recovery and app-scoped Firebase logout.
- Added server Firebase identity verification using Google signing keys plus current-account lookup, issuer/audience/expiry checks, disabled/revoked-account checks, safe errors, and no inferred permissions.
- All integrations default OFF until explicitly configured. The new helpers have not replaced the current login component or demo workspace authorization. The identity endpoint deliberately grants no dashboard access. This is preparation, not a completed live connection.
- Existing demo uploads and records remain unchanged. No real production record was imported into the isolated demo.
- `node tests/firebase-connection.mjs`: 20 checks passed with local generated tokens and mocked Firebase responses. No live sign-in, registration, verification email, reset email or Google popup was tested; no real accounts created.
- Demo lint, TypeScript (`npx tsc --noEmit`), production build and `git diff --check` passed.
- Existing complete demo `npm test` passed (1,255 API action checks, 505 navigation checks, rendering, logout and interaction suites).

## Required before replacement

1. Obtain secure Cloudflare access and repository write authorization, without pasting secrets in chat.
2. Confirm actual Worker Firebase config, account plan/usage, domain routes, Firebase enabled providers/authorized domains and email action handlers. Never enable billing or upgrade plans automatically.
3. Preserve/export current Worker version and binding metadata and arrange authorized backups of Firestore and R2. No deletion, reseeding or blanket export of sensitive records to this workspace.
4. Adapt the new UI to production Firestore schemas and authenticated action dispatcher; the Sites D1 JSON demo is not a drop-in replacement. Preserve canonical role, provider approval, booking/payment and document ownership checks.
5. Review private-file administrator checks: current `r2-storage.server.ts` contains an email-address OR role shortcut. Replacement must not authorize private access based only on an email string. Existing Firestore rules and backend approval checks must be reviewed together.
6. Operational notification emails still need a verified sender and configured delivery provider. Firebase verification/reset emails are separate. Do not expose medical details in email or turn persisted in-app notifications into claims of delivered email.
7. Validate signed-out/public routes, real-user role routing, Google sign-in, verification/recovery, protected uploads, complete service workflows and failure states in a non-public staging environment.
8. Review rollback and replacement, then deploy the tested replacement to the existing Worker. Only after health checks should the old automatic deployment pipeline be paused or replaced. Do not disable/delete the Worker serving the domain first.

The pasted custom-domain list includes `www.healthreachcare.co.za.healthreachcare.co.za`. This is reported input, not an independently verified Cloudflare route; inspect before correcting it.

## Preservation / cost status

No Firebase users, Firestore documents, R2 objects, Cloudflare domains, live customer data, payment settings, deployment settings or billing plans were changed. No production emails sent. No cloud costs or free quota availability have been verified. No deployment performed.
