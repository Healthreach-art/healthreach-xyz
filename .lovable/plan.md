# Restore existing pharmacy medicines safely

## Confirmed problem
- Existing medicines without `is_active` and `publish_requested` fail the trusted catalogue publication check, including after stock changes.
- The inventory’s publication control only appears for `false`, not missing values. Its current publication update also omits the active field required by the current rules for legacy records.
- Some patient reads now have legacy fallbacks, but these require `is_active: true`. The pharmacy fallback only runs when its entire public catalogue is empty, so partially published inventory still disappears.
- Cart refresh and prescription validation still require a public catalogue row. Showing a legacy medicine in the shop does not make it usable through checkout.

## Proposed repair
1. Add an explicit **Publish existing medicines** action to pharmacy inventory, plus a working publication action on individual legacy items. Show results and reasons for excluded medicines without requiring each product to be edited.
2. Send the request through a trusted, authenticated pharmacy action. Only the owning, approved pharmacy may request publication. Keep direct client writes to the public catalogue prohibited.
3. Validate existing records before publication: genuine (`is_demo: false`), valid name and price, positive whole-number stock, and non-expired stock. Preserve explicit archived or unpublished decisions; do not silently publish these items or infer that unknown demo status means genuine inventory.
4. Normalize missing legacy publication fields only following the pharmacy’s explicit request, and reconcile eligible items through the existing publication process. Do not delete source inventory or replace any database or authentication infrastructure.
5. Keep patient shop, pharmacy storefront, cart, prescription validation, and ordering on the same approved published inventory. Remove unsafe source-inventory fallbacks once the recovery path is in place, so unavailable or unpublished medicines cannot appear as purchasable.
6. Preserve prescription review, pharmacy approval, verified payment, stock, and expiry safeguards. Use only existing pharmacy pickup/location information; flag missing required location details rather than fabricate a branch or address.

## Validation
- Add local regression tests for missing legacy fields, owner/approval checks, explicit opt-outs, expiry, demo status, stock, repeat publication, and partial catalogues.
- Run the existing prescription safety tests (the current five tests passed during diagnosis).
- Test the publication action, patient visibility, cart retention, and prescription/order checks with suitable authenticated accounts. Report unavailable credentials or services as blockers, not successful verification.
- No Firestore Emulator tests are currently configured. Run isolated emulator security tests if feasible; otherwise explicitly report rules coverage as unverified.
- Existing unrelated preview type errors must be addressed or reported as verification blockers before claiming the app is ready.

## Technical details
- Reuse the existing Firebase action dispatcher and catalogue reconciliation logic in `functions/src/index.ts`; add a matching authenticated TanStack action wrapper and inventory control.
- Share testable eligibility/normalization logic with the trusted publishing action without weakening current publication defaults globally.
- Update the affected marketplace/storefront/cart/checkout readers only as needed to align them with trusted catalogue publication.
- Record the publication boundary in `AGENTS.md` and track the approved work in `roadmap.md` during implementation.

## Deployment boundary
This repair requires both website changes and an updated Firebase function deployment. No production data changes, production deployment, rules publication, commits, or pushes will be performed without explicit authorization. Until that deployment and authenticated verification happen, the live-site recovery remains unverified.