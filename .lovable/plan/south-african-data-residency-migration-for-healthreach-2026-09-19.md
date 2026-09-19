# South African data residency migration for HealthReach

A staged move of HealthReach's live data — customers, orders, prescriptions, provider documents — from the current Frankfurt hosting to South-Africa-hosted infrastructure, with nothing deleted and no downtime beyond one short, announced switch-over window.

## Where things stand today

- Backend, database, file storage and logins all run on Lovable Cloud.
- The hosting region is **Frankfurt, Germany** — so customer records, orders, prescriptions and provider documents currently sit outside South Africa.
- Files live in eight storage areas. Sensitive ones (prescriptions, doctor, pharmacy, driver and home care documents, delivery proofs) are private; profile photos and medicine images are public by design.
- Lovable Cloud does not offer a South African region, and the region of an existing backend cannot be changed. So residency requires moving to a South-Africa-hosted database and file storage account that you own, with the app pointed at it.

## What you need to decide first

1. **Who hosts it.** Options that have South African capacity: a self-managed Supabase instance in a Johannesburg or Cape Town data centre, or a South African managed Postgres + object storage provider. This choice fixes cost, backups and who holds the keys.
2. **Whether logins move too.** Accounts and passwords live with the current login service. Moving them keeps everything in one country but forces every user's session to be re-established; leaving them where they are keeps sign-in untouched while personal health data sits in South Africa.
3. **Cut-over window.** A read-only period of roughly 30-60 minutes, ideally overnight, during which customers can browse but not place orders.

## Migration stages

### Stage 1 — Prepare and prove (no live data touched)
- Stand up the South African database and private file storage.
- Recreate the full structure: all tables, roles, access rules, triggers, functions and storage areas, from the existing definitions.
- Restore a **copy** of today's data into it and run the two smoke tests there (home care request through to completion; medicine order with prescription access).
- Verify that private files stay private and that every access rule behaves identically.

### Stage 2 — Continuous copy
- Stream ongoing changes from the live database into the South African one so the two stay in step, while the live site keeps serving Frankfurt.
- Copy every stored file (prescriptions, provider documents, delivery proofs, photos, medicine images) with identical paths, then re-copy anything added since.
- Compare row counts and file counts per area and fix any gaps before proceeding.

### Stage 3 — Cut-over
- Announce the window; put the app into read-only mode.
- Let the copy drain to zero lag; run a final file sync.
- Re-point the app's database and storage settings at South Africa; keep the Frankfurt instance running, untouched, as the fallback.
- Re-run both smoke tests against production, plus sign-in, prescription upload and document viewing.
- Lift read-only.

### Stage 4 — Verify and retire
- Watch errors, order flow and document access for 7 days with the old instance still intact.
- Re-confirm no public URL exists for any prescription or provider document.
- Only after you confirm, securely delete the Frankfurt copy and record the date. Nothing is deleted before that.

## Safety rules for the whole exercise

- No existing record, file or relationship is dropped or rewritten; identifiers are preserved exactly, so orders keep pointing at the right customers, pharmacies, doctors, drivers and documents.
- Frankfurt stays read-intact throughout and is the rollback path: if the cut-over misbehaves, settings are pointed back and the site is live again within minutes.
- No fake or demo data is created at any stage.
- Sensitive files move only between private areas; short-lived authenticated links remain the only way to open them, and every open keeps being recorded in the audit log.
- Keys for the new hosting stay server-side only.

## Technical details

- Structure move: `pg_dump --schema-only` of `public` (plus `storage.objects` policies) applied to the target; enum types, `SECURITY DEFINER` functions, triggers and RLS policies replayed in dependency order; extensions (`pgcrypto`, `pg_net`, `pg_cron`, `postgis`-free `haversine_km`) installed first.
- Data move: `pg_dump --data-only --disable-triggers` for the seed load, then logical replication (publication on source, subscription on target) for Stage 2; sequences reset after the final drain.
- Files: bucket-by-bucket copy via the Storage API with identical object keys and content types, buckets recreated with the same public/private flags and size limits (`prescriptions`, `doctor-docs`, `pharmacy-docs`, `driver-docs`, `homecare-docs`, `delivery-proofs` private; `avatars`, `medication-images` public).
- Auth: if accounts move, `auth.users`, `auth.identities` and hashed passwords are transferred with the same UUIDs so every foreign key and RLS policy keeps matching; JWT signing keys are regenerated, which invalidates existing sessions.
- App change is configuration only — `SUPABASE_URL`, publishable key and service key; no query, policy or component rewrite is expected.
- Verification: per-table `count(*)` and `md5` checksums of ordered key columns, per-bucket object counts and byte totals, plus a scripted pass of both smoke tests.

## What is not in this plan

No schema redesign, no cleanup of old data, no change to how the app works, and no move of the published domain or email. Those stay as they are.
