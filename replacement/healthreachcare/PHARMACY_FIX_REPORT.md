> Current release: see [COMPLETION_REPORT.md](COMPLETION_REPORT.md). This file also retains notes from preceding releases.

# HealthReachCare pharmacy completion report

The existing Site, design system, five portals, D1 workspace table, ChatGPT sign-in and owner-private audience are retained. No replacement application or new Site was created.

## Pharmacy ordering: fixed displayed prices

Medication checkout now stores an unpaid **checkout draft**, not a pharmacy order. The patient confirms delivery or collection and the saved address, reviews item prices, subtotal, fee and final total, then chooses a demo payment outcome. A successful attempt atomically creates the paid order, saves its price snapshot, deducts inventory and generates connected notifications. Failed/cancelled payments cannot create a paid order, pharmacy work or a driver task. Prices, availability, stock, delivery rules and displayed total are checked server-side before confirmation. A changed catalogue requires another basket review.

All active pharmacy quotation creation/acceptance actions, screens, states and notifications are removed. The remaining quotation actions explicitly require a Homecare record and the appropriate session. Pharmacy callers cannot invoke them by modifying the request.

The pharmacy may accept, process, prepare and mark an order ready for collection or dispatch. Delivery tasks are created only at the ready-for-dispatch stage. The task has no assigned driver until an approved online driver claims it atomically. Manual assignment is disabled. Pickup and delivery require separate single-use codes. Collection has its own ready/collected stages and never creates a driver task. Paid snapshots never change when catalogue prices change.

## Prescription review

The patient uploads private fictional test evidence and submits selected medicines. The unified Orders queue supports direct clarification, separate identity review, and prescription approval or rejection with a reason, reviewer identity and timestamp. Clarification also creates a message in that submission's conversation. Approval selects actual catalogue products and quantities at fixed catalogue prices; the verified items, fee and final total are visible to the patient before payment. There is no acceptance/negotiation stage. Unpaid or rejected submissions cannot enter fulfilment. Prescription-required products cannot enter ordinary checkout.

## Pharmacy pages and inventory

- Overview: clickable live counts for new, processing, preparing, ready, dispatched, completed/cancelled work; pending prescriptions; unread patient messages; low/out-of-stock products.
- Orders: record search, status filtering, newest/oldest sorting, patient identity/contact snapshot, price breakdown, payment status, verification, timeline, tracking, messages and support actions.
- Prescription submissions appear inside Orders; the old URL opens the unified queue.
- Catalogue: product add/edit/deactivate/remove, category, description, fixed price, stock, prescription requirement, built-in selectable product images and optional HTTPS image URL. Low/out-of-stock filters use saved inventory.
- Settings: delivery fee, collection availability and collection instructions.
- Messages: stable order-linked conversations, patient/order search, unread filter, sender/time, persisted text, sent/read indicators and a link back to order tracking.
- Support: linked questions, cancellation requests, damaged/incorrect-order reports, delivery issues, refund reviews, escalation and recorded decisions. Open exceptions/cancellation requests block fulfilment and driver assignment until resolved. An exception never changes the paid products or price silently.

## Shared storage, sessions and permissions

All records, products, stock, conversations, messages, read states, payment attempts, delivery tasks, support cases and events use the same existing server-side D1 workspace. Orders and messages do not depend on browser storage. The aggregate JSON schema is extended in place; this change does not introduce a separate database.

Fictional demo accounts are provisioned by the server: Patient–Thandi, Patient–Sipho, Pharmacy, Doctor, Homecare and Admin. The API issues random 24-hour session tokens and stores only their hashes with the permitted account/role. Each browser tab stores its own token in sessionStorage; this is authentication state, not the source of truth for records. API actions derive the role from the validated token and ignore client-supplied role claims. Each token remains scoped to the authenticated ChatGPT owner's private workspace.

Patient responses and actions are limited to that demo patient's records, payments, drafts, notifications and conversations. Pharmacy accesses its own pharmacy records and conversations; Doctor/Homecare cannot read pharmacy conversations. Admin oversight is explicit and actions are audited. The response omits session hashes, other patient profiles and raw archived legacy records.

These remain **fictional test accounts under one owner-private Site**, not separately verified real-world staff accounts. The authenticated owner is allowed to choose all provisioned demo accounts to test the five-sided workflow. This is not a production staff provisioning or professional credential system.

Conversations are keyed to a stable order identifier, never a global chat. Messages are saved before being shown as sent. A client message ID prevents duplicate saving on retries. Opening a conversation marks incoming messages read; reply notifications open that conversation. Polling refreshes saved state every 15 seconds. Chat is text-only and includes clinical/emergency-channel guidance; no AI is presented as a clinician.

## Existing data conversion

A versioned, idempotent upgrade runs and persists when each existing workspace is next accessed:

- Old unpaid medication orders become patient-only checkout drafts requiring fresh review; prior reserved stock is released and phantom order notifications removed.
- Old active prescription submissions return to pharmacy verification. No approval, payment or dispatch is invented.
- Existing genuine payment records and historical paid amounts are retained. If a legacy paid prescription's newly verified fixed total differs, admin must review/refund it and a new submission is required.
- Historical pharmacy quotation fields/events are archived for audit preservation and removed from active records, visible timelines and notifications. Archived events cannot be used as approval or payment evidence.
- Homecare records and quotation data stay intact. Existing paid order snapshots remain intact.
- Existing records are assigned to the initial fictional patient when adding demo-patient ownership; subsequent new patients have isolated records.

There was no direct enumeration of hosted user rows. Conversion is performed per workspace on its next request, not claimed as a completed bulk migration of every saved workspace.

## Tests actually run

Commands:

```
NODE_ENV=production node tests/workflows.mjs
node node_modules/typescript/bin/tsc --noEmit
git diff --check
```

Results before packaging: **123 API action checks passed**, TypeScript passed, whitespace checks passed. The route suite invokes the actual server route with an in-memory D1 adapter and distinct server-issued tokens. It covers fixed checkout totals, payment success/failure/idempotency, stock and price snapshots, unavailable products, prescription-only checkout blocking, approval/rejection/clarification, denied pharmacy quotation actions, collection and delivery, early driver-task/assignment prevention, messaging and read receipts across patient/pharmacy sessions, stable conversation IDs, post-delivery follow-up, second-patient and cross-workspace denial, client-role tampering, support/escalation/refund-review rules, exceptions/cancellation guards, failed/stale/oversized message handling, image validation, profile isolation, legacy conversion/idempotency, and doctor/homecare regressions.

Browser checks used the real local D1-backed preview with a temporary local-only fictional owner identity. The temporary identity helper was removed before production checks and packaging. Confirmed:

1. Fixed catalogue price, address/fulfilment choice, subtotal, fee and final total.
2. An unpaid checkout produced zero pharmacy orders and zero delivery tasks.
3. Successful demo payment created the order and showed it immediately to pharmacy.
4. Pharmacy acceptance/processing appeared in shared patient activities.
5. Prescription sample submission went directly to review and selected catalogue products could be approved without a pharmacy quotation.
6. A patient tab sent an order-linked message; a separate pharmacy tab displayed it as unread, opened it, and replied; the patient tab received the reply and read receipts updated.
7. A product added with a selected image, price and stock appeared in the patient catalogue.
8. A second patient session showed no first-patient orders.

The production build is run by the source packaging helper. The native Sites deployment result verifies publication. A full signed-in browser replay against the hosted production URL is not claimed; that URL is unavailable to the local QA browser.

## Exact demo walkthrough

1. Open the deployed Site in two tabs while signed into its owner ChatGPT account. The Site remains private.
2. In tab A choose **Explore as → Pharmacy**. Go to **Catalogue → Add product**. Save a fictional product, e.g. `Demo Care Pack`, price R35, stock 5; optionally choose a built-in image.
3. In tab B choose **Patient · Thandi**. Open **Order medication**, find the product and add it to the basket. Confirm delivery or collection and the fictional saved address. Review the fee and final total. Continue and simulate successful payment.
4. In tab A open **Orders** and the same HRC order number. In tab B open it from **Activities**, then **Message Pharmacy**. Send a fictional question. In tab A open **Messages**, view the unread conversation and reply. Tab B updates automatically within 15 seconds, or refresh/reopen the record.
5. In tab A accept the order, mark processing and prepared. For delivery, mark ready for dispatch, assign a fictional demo driver, then out for delivery and delivered. For collection, mark ready for collection and collected. Tab B shows the same status history and keeps the conversation accessible after completion.
6. For prescription review, add/flag a product as prescription-required. Tab B must submit the built-in prescription sample instead of ordinary checkout. Tab A uses **Prescriptions**, records a review reason, selects verified items/quantities and approves or rejects. Only an approved submission permits payment.
7. Use **Request order help or refund review** on an order to create a linked case. Pharmacy can resolve/escalate; Admin records refund decisions and any separate simulated refund transaction. Open product/delivery exceptions pause fulfilment until a reasoned resolution.
8. In a third tab choose **Patient · Sipho** and open **Activities**. Thandi's orders, messages, drafts and payment records must not appear.

## Remaining limitations

- This is a fictional healthcare software demonstration, not production healthcare operations. Real prescriptions/medical records, real card details and live clinical services remain disabled.
- Driver assignment/progress, support and refunds are saved in-app simulations. No external courier/driver app, payment gateway, WhatsApp, SMS, email, video service or professional verification integration is configured.
- Messaging is text-only with 15-second polling; no attachments, typing/push notifications or staff presence indicators.
- Product images can be selected from bundled illustrations or referenced by HTTPS URL; there is no arbitrary image-upload store.
- The existing aggregate D1 workspace uses optimistic concurrency; concurrent updates can require a refresh/retry. This is not a normalized, production-scale marketplace database.
- Unpaid checkout drafts do not reserve inventory; inventory is checked and deducted atomically when payment succeeds. Approved prescription prices remain the displayed verification snapshot, while stock/availability are checked again at payment.
- Existing broader prototype gaps such as full provider onboarding, appointment rescheduling and real staff registration remain outside this focused pharmacy change.

See COMPLETION_REPORT.md for the current authoritative verification counts, new private-file/code workflows and remaining limitations. Earlier test counts and sample-only descriptions below reflect the preceding release.
