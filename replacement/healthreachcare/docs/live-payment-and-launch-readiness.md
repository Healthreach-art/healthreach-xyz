# Live payment and launch readiness

Status checked against the HealthReachCare `main` source on 10 November 2026.

## Current payment behavior

- Patient, pharmacy, doctor and Homecare checkout use the existing internal simulated-payment flow.
- The production Cloudflare preparation currently keeps `HRC_SIMULATED_PAYMENTS_ENABLED=true` and `HRC_DEMO_ENABLED=false`.
- There is no live payment gateway adapter, merchant account configuration, signed payment webhook, provider-side transaction verification, or live refund/settlement integration in the application.
- Payment records created by the simulator are not proof of money received. Preserve their demo provenance.
- The Admin Overview now reports provider-configuration presence without showing secrets. It deliberately reports live processing as unavailable until the real integration is implemented and verified.

## Required decisions and implementation before accepting live money

1. **Choose the merchant/payment provider and ownership model.** Confirm who is merchant of record for each product or service, which entity receives funds, settlement timing, refund/chargeback responsibility, and how provider/doctor/Homecare earnings are accounted for. Do not use one platform-wide merchant flow for pharmacy medicines until the pharmacy transaction structure has been reviewed.
2. **Open and verify the merchant account.** Complete the provider's actual business/KYC checks outside this application and obtain sandbox credentials first. Store credentials only as Cloudflare Worker secrets; do not place private keys in client code, source files, D1, logs, chat, or the public readiness response.
3. **Implement the provider adapter.** Initialize transactions server-side from immutable saved checkout totals, use ZAR, bind transaction references to one account and one booking/order, and return only the provider's hosted checkout/authorization result to the browser.
4. **Verify before fulfillment.** Treat redirects as untrusted. Verify transaction status and exact amount/currency server-side, validate the gateway webhook signature over its required raw payload, reject stale/replayed or mismatched events, and make event processing idempotent. Only a verified success may mark a record paid or trigger fulfillment.
5. **Implement failure, cancel, retry, refund and reconciliation paths.** Record attempts without changing paid state on failure/cancel. Add duplicate-submit and duplicate-webhook protection, refund authorization/audit, daily reconciliation, settlement reporting, and operational alerts.
6. **Keep demo/live separation explicit.** Use separate sandbox/live credentials and configuration. Default to demo; enable live only in a reviewed deployment with all checks passing. Add tests that prove demo mode still works and that missing/mismatched verification cannot fulfill an order.
7. **Test the full service-specific journeys.** Use provider sandbox accounts and non-real data for medicine, doctor and Homecare orders. Test success, failure, cancel, timeout, duplicate callback, amount mismatch, refund, and provider outage. Verify patient/provider/admin records and finance reports agree.

Provider documentation requires server-side transaction initialization and status/amount verification; webhook authenticity must also be verified before processing. See the official integration references: [Paystack accept payments](https://paystack.com/docs/payments/accept-payments/), [Paystack webhooks](https://paystack.com/docs/payments/webhooks/), and [PayFast ITN](https://developers.payfast.co.za/docs/itn-instant-transaction-notification/).

## Launch blockers found in the source/configuration

### Payments

- No payment provider has been selected/configured in the Worker.
- No adapter or trusted callback/webhook route exists.
- No verified merchant account or sandbox end-to-end test evidence is available.
- Refunds, chargebacks, payout/settlement, and reconciliation are not connected to a payment provider.
- Real payments must remain off. Demo mode is intentionally preserved.
- The source currently calculates a 12% platform fee for medicine orders and adds VAT on that platform fee only when an administrator has marked the platform VAT-registered. Pharmacy dispensing VAT is separately driven by the branch's saved VAT flag. Confirm fee ownership, VAT registration, tax invoice responsibility, and the taxable amount with the accountant before live use; do not treat the demo configuration as tax advice.

### Pharmacy and medicine ordering

- Obtain specialist South African pharmacy/legal review of the exact app, merchant-of-record, prescription review, pricing, dispensing, collection, and delivery roles before enabling live medicine purchases. SAPC's app guidance describes a pharmacy/group's use of third-party websites/apps for ordering/collection/delivery; the precise fit of HealthReachCare's model must be confirmed with the regulator/professional adviser and participating pharmacy. Do not infer approval from a working demo checkout. [SAPC guidance](https://www.sapc.za.org/Media/Default/Documents/Annexure%20A_%20Guidance%20doc_%20Website%20and%20apps.pdf)
- Specifically, SAPC's guidance says a third-party app that directs an above-Schedule-0 medicine purchase to a specific pharmacy must not receive that purchase payment. Confirm that HealthReachCare's actual ownership and checkout route comply before selecting the live merchant-of-record or enabling those products. [SAPC guidance, acceptable use and prohibitions](https://www.sapc.za.org/Media/Default/Documents/Annexure%20A_%20Guidance%20doc_%20Website%20and%20apps.pdf)
- Confirm medicine catalogue and pricing data ownership, dispensing fee rules, product verification, prescription handling, substitutions, cold-chain and delivery controls with the responsible pharmacy/pharmacist.
- Have an accountant verify the 12% platform-fee base, which party supplies each service, VAT registration and invoice treatment. SARS states standard VAT is 15% on taxable supplies by registered vendors, while some supplies are zero-rated or exempt; the platform's current VAT flag must reflect verified status and actual supply structure. [SARS VAT overview](https://www.sars.gov.za/types-of-tax/value-added-tax/)

### Operational launch checks still requiring real evidence

- Verify current provider registration/credentials and each pharmacy's responsible pharmacist and licence directly with the relevant authority; an in-app approval flag alone is not external verification.
- Complete a production access-control review for patient health records, prescriptions, uploaded files, caregiver/driver visibility, admin actions, deletion, and audit logs.
- Verify backup/restore and incident response, including POPIA breach handling and support contacts.
- Prove email/push notifications are configured and delivered; the current email-notification UI previously reported sender delivery unavailable.
- Verify live map/geocoding, delivery dispatch, driver acceptance/expiry, location consent/retention, and proof-of-delivery on real supported devices.
- Run a production smoke test from patient sign-in through each provider dashboard using safe test accounts, then monitor Worker/API errors and payment events before public launch.

## Decision gate

Do not advertise live payment collection or mark a service paid based on browser return, a demo outcome, a screenshot, or an administrator action. Release live payment capability only after sandbox tests, security review, provider agreement, legal/operational checks, and a controlled low-value production verification all pass.
