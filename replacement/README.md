# Current HealthReachCare app

`replacement/healthreachcare` contains the current OpenAI Sites app, including Firebase authentication and private R2 uploads. The proposed root build command selects it and emits the root Wrangler configuration used by both the existing Cloudflare Builds command and GitHub Actions. No DNS change or database reset is needed. The existing root `src/` is retained; `npm run build:legacy` and the rollback branch preserve the former application.

## Do not merge before the integration checks

This branch prepares replacement; it does not connect the old Firestore service history to the new D1 account workspace. See `replacement/healthreachcare/reports/healthreachcare-firebase-cutover-2026-10-22.md`. Booking, payments, dispatch and messaging are fail-closed for real accounts until integrated. The former app remains live until this branch is reviewed and deployed. Existing users in the old Firebase project have not been migrated. Existing R2 objects and database records are not deleted or copied.

Required production checks: confirm existing-record adapter and project choice; add healthreachcare.co.za and the Worker hostname to the selected Firebase authorized domains; test Google sign-in, verification/reset email delivery and real uploads; verify existing signed admin claims/roles; execute a Cloudflare preview build and smoke test. Do not enable live payments or claim regulatory verification as part of this deployment.

## Rollback

Remote branch `archive/before-current-app-2026-10-22` retains the exact former main commit `b3d85ec56a5dc42381ed16fc6f5cd1ed5b894787`. Restore a prior Cloudflare deployment for immediate rollback and revert this activation PR to restore automated builds. Do not delete R2 objects or D1 tables. Data written to the new app remains separate and is not automatically imported into the old app.
