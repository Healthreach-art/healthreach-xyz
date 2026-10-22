# HealthReachCare replacement source

This directory contains the full current Sites application from source commit `2c11d69`, including its prior UI and workflow changes. The existing production application remains at the repository root.

## Deployment boundary

This is a source handoff branch, not a completed production replacement. Do not merge and deploy expecting the root Worker to run this app. Its current runtime expects Sites identity, a D1 `DB` binding and an R2 `BUCKET` binding. Production uses Firebase/Firestore and `DOCUMENTS_BUCKET` for `healthreachcare-documents`.

Firebase client/server integration helpers are prepared but remain off by default and are not yet wired into the login screen or production account mapping. Live payments and payouts remain unavailable. Existing Firebase users, Firestore records and R2 objects must be preserved. Do not reseed or copy demo records into the production backend.

Before the production swap: adapt the UI to the existing canonical Firestore data/action interfaces, verify real account roles and approval restrictions, preserve private-document access and email verification, test all service flows, then review an exact deployment and rollback. Main's automatic deployment workflow has not been changed or paused.

## Checks already run

- Existing application: complete API, navigation, rendering, logout and UI interaction suites passed; lint, TypeScript and production build passed.
- Firebase preparation: 20 local generated-token/mocked-account checks passed, no real users contacted.
- Existing production repository: 12 available policy tests passed.

No production deployment, data changes or billing changes were performed for this source handoff.
