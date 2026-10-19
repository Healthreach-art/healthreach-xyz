# Roadmap

- [ ] Use consistent logo/name across booking screens and all shared page endings.
- [ ] Preserve doctor-set prices, remove invented consultation defaults, and validate saved charges.
- [ ] Add verified Paystack payment and confirmation for homecare quotations, with duplicate protection.
- [ ] Add real payment requests/status to pharmacy orders and block unpaid driver dispatch.
- [ ] Exercise patient order → pharmacy approval → driver acceptance (requires real Firebase role sessions and authorized function deployment).

- [ ] Verify patient doctor booking, Paystack, appointment viewing and calendar download (blocked on real patient sign-in, authorized Firebase deployment and approved platform fee configuration).
- [x] Preserve classic admin approval controls and add canonical doctor/pharmacy appointments, patient details and request visibility; signed-in approval checks await real admin access.
- [ ] Verify patient medication order → pharmacy acceptance → driver pickup/delivery (local address/package/dispatch fixes completed; blocked on Firebase deployment and real role accounts; medication payment idempotency and code verification need further hardening).
- [x] Diagnose missing privileged Firebase action endpoint: default URL returns 404; source export/region agree, missing booking actions added, deployment steps documented without deployment/billing changes.
- [ ] Implement secure upfront homecare payment (blocked on approved price/package interpretation, provider eligibility and no-provider refund policy; current request/quote flow retained).

- [ ] Restore legacy medicine publication and align patient catalogue/checkout reads; verify local tests.
- [ ] Deploy updated Firebase publication action and verify a real pharmacy-to-patient order (blocked until deployment authorization and authenticated accounts are available).

- [ ] Stabilize shared layouts for small phones and wide screens without redesigning workflows.

- [ ] Finish HealthReachCare brand/domain/support-email updates and landing role card.
- [ ] Complete Home Care scheduled transition, realtime status flow, and real-data verification.
- [ ] Align doctor admin review with request-documents flow.
- [ ] Audit real email delivery for auth, approvals, assignments, and booking/request status.
- [ ] Audit professional approval consistency for doctor, pharmacy, driver, and Home Care.
- [ ] Diagnose and fix private document upload/retrieval/admin review permissions.
- [ ] Strengthen POPIA-supporting privacy notices, consent, correction/deletion, access controls, and audit trails without claiming compliance.
- [ ] Add an in-app HealthReachCare support chatbot while preserving WhatsApp and medical-safety boundaries.
- [ ] Slightly increase default readable text sizing without changing hierarchy.
- [ ] Audit refresh persistence and duplicate-submission protection across major dashboards/forms.
- [ ] Add contextual Back navigation only where needed and protect unsaved forms.
- [ ] Audit complete onboarding flows for all roles and remove dead ends.
- [ ] Run real authenticated critical-flow tests without mock users/documents/data; report blockers if suitable accounts are unavailable.
