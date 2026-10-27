# HealthReachCare — Homecare + Doctor implementation handoff (isolated branch)

Branch: `work/homecare-doctor-prep-20261027`. DO NOT merge or deploy without explicit approval. Another AI is working on main; compare and reconcile before cherry-picking.

## Existing working entry points
- `components/homecare-reference-dashboard.jsx`: Homecare Home/Bookings/Caregivers/Services/Payments.
- `components/connected-provider-operations.jsx`: `HomecareContractorRoster`, weekly schedule, multiple specialties, caregiver CRUD, provider-scoped saves.
- `components/homecare-services-management.jsx`: main services, sub-services, prices, patient preview, provider-scoped save.
- `components/doctor-workspace.jsx`: doctor calendar, earnings, withdrawal requests, admin withdrawal review.
- `components/doctor-booking.jsx`: patient discovery, appointment reservation and demo payment.
- `components/account-layout.jsx`: provider account navigation; Doctor account simplified on this branch.

## Homecare completion criteria
1. Keep six tabs Home, Bookings, Caregivers, Services, Payments, Account; account exactly Provider profile, Staff permissions, Notification preferences, Service settings, Help & support. Staff permissions must manage actual permissions, not redirect to caregiver roster.
2. Caregivers: add/edit with name, phone, multi-specialties, optional photo/qualifications, weekly availability, leave dates. Show photo or placeholder and real ratings only. Approved provider assigns, unassigns, reassigns manually; enforce availability, qualifications, conflicts server-side. Do not treat admin-only management as provider management.
3. Services: main category + subservices with description, rate/pricing model, duration, required skills and patient preview. Save once and show same provider-specific published records to patients. Existing bookings retain price snapshots. Ensure patient discovery consumes this catalogue (not a parallel company catalogue).
4. Booking: patient checkout -> provider accept/decline -> available caregiver selected -> patient notified -> provider confirms completion -> finance ledger updated. Link complaint notifications and booking details.
5. Payments: patient ledger, caregiver profile payouts and statement PDFs, distinct platform fee statement; admin authorized statement generation. Demo money must not be payable. Do not collect raw banking details in insecure profile fields.

## Doctor completion criteria
1. Keep five tabs Home, Appointments, Schedule, Payments, Account. Appointment details include patient, service, price, location, status, and appointment-linked messages; archive messages at completion.
2. Schedule uses existing platform medical service categories; doctor chooses eligible services and sets own fee, duration, availability. Remove address from each service; use one practice address under Account. Backend and patient booking must agree on service-specific fees and slots.
3. Account: Public profile & practice address; Security & privacy; Help & support. Public profile includes verified photo, bio, qualifications, specialty, location; admin approves before patient publication. Never auto-approve.
4. Payments: real ledger, fees, pending/eligible balances, withdrawal requests, payout history, bank destination via secure existing workflow. Add persisted payout preference: weekly (Mon/Wed/Fri) or monthly (day 1/15/25/last), with timezone Africa/Johannesburg, clearance, holidays, insufficient balance, idempotency, and retry rules. No automatic transfer without verified payment provider and authorization.
5. Cape Town discovery: approved/published doctors should be discoverable for eligible Cape Town patient searches, not falsely presented as geographically near every patient.

## Acceptance tests
- Provider scoping, access control, server-side validation and data persistence.
- Homecare service appears on patient side; confirmed price snapshot remains fixed.
- Caregiver availability prevents conflicting bookings; assignment and completion flow.
- Doctor service price and slot appear in patient checkout; admin approval gating.
- Patient/doctor appointment conversation remains accessible only until completion, then read-only.
- Statement exports, ledger totals, demo/live separation, payout scheduling persistence and no duplicate withdrawals.
- Run lint, types, tests, production build; do not deploy from this branch without approval.

## Coordination
Another AI is editing main. Re-fetch latest main and resolve conflicts before any merge. No main pushes, production DNS, Worker deployments, or real payment transfers are authorized by this handoff.
