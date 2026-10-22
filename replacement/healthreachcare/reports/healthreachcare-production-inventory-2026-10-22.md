# Production inventory — before implementation

Inspected existing local HealthReachCare checkout; current source is a Sites demo, not the user's production Firebase application. No deployment, DNS change or database migration is authorized.

| Area | Existing implementation | Production gap |
| --- | --- | --- |
| Repository | Local git with Sites project manifest | No GitHub remote configured; intended production repository not identified here |
| Identity | Sites/ChatGPT identity plus isolated demo persona sessions | No Firebase Auth SDK/config or email/password, Google, verification/recovery integration |
| Persistence | Authenticated /api/workspace, owner-scoped D1 workspace, optimistic concurrency | Existing production Firestore project/rules unavailable |
| Documents/images/audio | Private R2 uploads with purpose/owner checks and audited downloads | Firebase Storage project/rules unavailable; device testing still required |
| Pharmacy | Persisted fixed-price checkout, prescription checks, stock snapshots, dispatch eligibility | Catalogue initially seeded with test products/providers; actual pharmacy inventory not connected |
| Doctor | Persisted schedules, slots, bookings, scoped chat, provider verification states | Seeded profiles and simulated professional verification; no verified real provider registry |
| Homecare | Persisted fixed-price/direct-payment bookings | Quotation workflow is missing, despite the latest brief requiring it |
| Payments | Internal Success/Failure/Cancel simulator, DEMO references and simulated accounting | No provider SDK, webhook, merchant configuration or authoritative payment confirmation route |
| Banking | Persisted masked TEST reference, conditional evidence and simulated admin review | No bank ownership verification, token vault or transfer provider |
| Communication | Scoped saved messages, in-app notifications, private files, polling | No configured outbound email/SMS/push; Firebase realtime not implemented |
| Operations | Backend admin checks, audit history, cases and provider review | No consolidated runtime integration-readiness report |
| Tests | Isolated route-adapter fixtures, rendering, navigation, interaction and logout suites | Test simulations are not payment-provider sandbox or live settlement evidence |

Existing fixtures are concentrated in the workspace initial() function, demo-access.mjs, completion/business initialization and isolated tests. They must not be promoted to production inventory or indiscriminately deleted. Historical records will be preserved.

Targeted local work: add a fail-closed live-operation boundary, explicit new payment provenance, backend/admin integration-readiness reporting, and a persisted provider-authored homecare quotation path. Preserve legacy paid/fixed-price bookings, pharmacy direct checkout and current infrastructure. These changes cannot establish Firebase connectivity or real payment processing without the intended production source and configured services.
