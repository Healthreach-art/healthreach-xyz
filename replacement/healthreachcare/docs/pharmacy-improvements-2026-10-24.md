# Pharmacy catalogue, operations and account improvements — 24 October 2026

## Implemented

- Authenticated pharmacies can create up to 30 medications in one explicit save. The server validates the entire batch before applying any product change. Prices, stock, prescription flags, strength, form and pack size are retained. Editing a catalogue price never rewrites a confirmed order snapshot.
- Multiple PNG/JPEG pack photos can be uploaded before product creation. Existing server validation enforces 2 MB, supported signatures and dimensions; up to eight owned product images can be selected and ordered. Failed saves retain the entered rows. Preview requests require the owning Firebase identity or an administrator; unpublished pack photos remain unavailable publicly. Published catalogue images retain the existing public access policy.
- Removed generated-pack and legacy external-URL controls from the new editor. No online medical description or pack image is invented. Automated web lookup requires a configured licensed, reviewable source and remains unavailable.
- Pharmacy-specific notifications distinguish orders, messages and system updates. Conversations remain tied to assigned orders; active lists exclude archived/closed service conversations. Existing read-only history authorization is now connected for authenticated accounts.
- Connected existing authenticated support-case creation, replies, escalation and status updates with their existing participant/team checks. Administrator alerts resolve to actual configured administrator account UIDs. Unsupported support-evidence uploads are not offered on authenticated accounts.
- Removed the old pharmacy delivery/collection-fee form. Both authenticated and isolated legacy APIs reject a pharmacy-supplied delivery fee. An authorized administrator with recent sign-in can save a platform charge under Financial records. Previously configured charges and confirmed order totals are preserved; unconfigured delivery pricing is not fabricated.
- Company/practice and representative details are shared between the service profile and payout-readiness settings. Internal company/representative details are excluded from other users' provider projections.
- Seven separate daily opening schedules support closed days, 24-hour operation and overnight opening, in South Africa time. Pharmacy matching, homecare availability and doctor slot selection honor saved daily hours. Existing global-hour records still work until explicitly updated.
- Authenticated Financial records show saved service-linked payment attempts and CSV exports, with a direct link to Banking & payout settings. Replaced the authenticated fake TEST-account/security-challenge form with working shared company-detail saving and accurate payout readiness. No real bank account number is requested or stored by this change. Historic payout setup is retained and masked. Test receipts remain explicitly simulated and cannot be withdrawn.

## Verification

Run the complete repository suite, lint, TypeScript and production build before publication. New focused tests cover batch atomicity, role/image ownership, price snapshots, daily/overnight/24-hour matching, company-field privacy, product preview authorization, service-linked support and archive permissions. UI render/handler checks exercise multi-row entry and daily-hours controls. Tests use isolated fictional records, mocked Firebase identities and in-memory storage; no real medical order, payment or support message is created.

## External limitations

- No licensed medicine image/description lookup source is configured.
- No live bank verification, beneficiary onboarding or transfer provider is connected. This change does not claim otherwise.
- End-user password/Google login, physical mobile photo selection, inbox email receipt and device push delivery require genuine interactive verification and are not claimed tested here.
- Administrator policy remains the two verified-email allowlist. A read-only Cloudflare D1 check found pityhygiene@gmail.com as Active Patient, hlawulekanimalunagani12@gmail.com as an unverified saved Homecare registration, and no saved support@healthreachcare.co.za app account. These are application records, not proof of a usable Firebase password or mailbox.
- The earlier automatic approval review rejected changing the Gmail account to main administrator because it conflicted with the explicit two-email restriction. No privilege grant was retried or implemented through another route. Changing that restriction needs explicit clarification/authorization.

Existing Firebase users, live business records, stored documents, DNS, sender settings and payment configuration are preserved. Publication updates application code only.
