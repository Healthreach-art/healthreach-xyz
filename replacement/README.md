# Current HealthReachCare application

The active replacement source is under `replacement/healthreachcare`. The proposed root build selects this app and emits the root Wrangler configuration used by the existing Cloudflare Builds and GitHub Actions commands. Original root source remains preserved, along with rollback branch `archive/before-current-app-2026-10-22`.

## Firebase and hosting direction

Use Firebase project `gen-lang-client-0810450473` only. Do not reconnect the old Firebase project or import its identities/roles. Existing old users and records remain untouched. Reuse the existing Cloudflare Worker `healthreachcare`, D1 `healthreachcare-app`, R2 `healthreachcare-documents`, and the DB/BUCKET/DOCUMENTS_BUCKET bindings. No database reset, DNS change or deletion is required.

## Latest patient scope

Patient navigation remains Home, Activities, Notifications, Account. There is no map on Patient Home. Prescription-only medicines use the ordinary medication basket and an order-linked document step. Homecare uses the existing fixed-price booking form. Medication orders have order-only progress and street-map tracking from recent assigned-driver coordinates, plus saved driver arrival estimates. See `healthreachcare/reports/healthreachcare-patient-order-scope-2026-10-22.md` for actual checks and limitations. That report supersedes any earlier suggestion to reconnect old Firebase.

## Cutover checks still required

The pull request remains draft. Verify the new-project payment, booking and dispatch integrations, real stocked/published providers, real Google login and verification/reset email delivery, authenticated R2 uploads and the bucket's public-access settings, trusted administrator claims, and a genuine driver location run. Authorize production and Worker hostnames in the selected Firebase project. Unsupported real payment actions fail closed; no simulated payment is presented as a real transaction.

## Rollback

Former main commit `b3d85ec56a5dc42381ed16fc6f5cd1ed5b894787` remains on the rollback branch. Keep previous Cloudflare deployments. To roll back, restore the prior deployment and revert the activation PR for future builds; do not delete R2 objects or D1 tables. Data in the new app remains separate from the old app.
