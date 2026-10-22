# Appointment booking and pharmacy replacement

22 October 2026. Local implementation on top of `9b7e9846efb1d634feab02d52eb8c7128392809b`. **Not pushed or deployed.** Prior implementation and rollback commits remain intact.

## Appointment corrections

The earlier booking UI exposed slots and reservation creation but did not provide a complete review flow or management controls. Inspection also found missing weekday/opening-hour validation and an incorrect patient-home address on in-person appointments.

Implemented:

- New `DoctorBooking` flow: professional profile → doctor selection → consultation type/location → saved available slots → selected time → final price review → persisted unpaid reservation → existing demo payment → confirmation in Activities.
- Booking opens the exact `appointmentId` returned by the saved API response, rather than assuming the first record is the new appointment. Its Activity detail has a direct, refreshable URL.
- Profile includes saved qualifications, professional registration, languages, consultation types, duration, practice address, approved photograph where present, and fee. No photos, available slots or professional approvals were invented.
- Availability checks apply valid calendar date, future time, saved weekdays, practice hours, duration, configured dates and overlapping held/paid reservations. A slot finishing after closing is unavailable. Request and payment revalidate the slot.
- The reviewed fee is compared with the server fee before creating the reservation. A changed fee is rejected for a fresh review. The saved appointment retains its price snapshot.
- In-person appointment address now comes from the saved practice, not the patient's home. The patient's selected location is used for eligibility/matching; an online consultation is labelled separately. No video integration or invented joining link was added.
- Patients and the assigned doctor can check availability and reschedule their upcoming appointment. The API validates ownership, provider and conflicts; an existing appointment may exclude its own reservation when checking its current time. A consultation already started cannot be rescheduled or cancelled by these actions.
- Upcoming cancellation records the actor, reason, time and refund-review requirement. A paid appointment remains paid until a separate supported refund decision; cancellation never fabricates a refund.
- Appointment details include saved professional information, practice directions, payment history, hold expiry, contextual communication/support and a linked one-hour-before reminder action. Linked reminders shift on rescheduling and are completed on cancellation without deleting their records.
- Doctors can manage weekdays, start slots, opening/closing times, consultation duration and optional available dates through a saved availability editor. This cannot grant professional approval or edit another doctor's practice.
- Availability errors, no-result states, withdrawn providers, unavailable slots and refresh/retry actions are explicit. Request-generation guards discard stale slot responses.

## Pharmacy replacement

Inspected the supplied `HealthReachCare Pharmacy App Dashboard.png`. Implemented its card/list/profile design in live React components; **the reference screenshot is not embedded in the application**.

- New Home overview with saved pharmacy name/status/hours, actual pending/processing/completed-today/patient counts, quick actions and recent orders.
- New Orders list with search and All/Pending/Processing/Ready/Completed/Cancelled filters. Rows open the exact saved order and existing permitted fulfilment controls.
- New Stock list, search, stock filters, medicine details, Add product and Edit product/images actions. Existing shared price/stock persistence and confirmed price snapshots remain.
- New order-linked Messages list with saved timestamps/unread counts and Support access. Rows open the permitted saved conversation.
- New Profile screen with public profile, hours/coverage, delivery settings, application/documents, notifications, products, finances/payouts, privacy and support. Logout stays in Profile.
- Pharmacy primary navigation is Home, Orders, Messages, Stock, Profile. Notifications remain accessible in the header and Profile; finances remain accessible in Profile. Legacy request/prescription URLs resolve to Orders. The duplicate old Inbox heading and old overview implementation were removed.
- There is no separate New Prescription section or staff-created prescription/order wizard. Necessary prescription verification stays inside the assigned order; dispensing, payment and dispatch safeguards remain. No pharmacy quotations, fake ID scanner, fictional patient directory, fabricated counts or dead order-submit button were introduced.
- White surfaces, mint accents, rounded cards, compact icons and responsive layouts use the existing green token. No UI library, authentication backend or separate data store was added.

## Files

- `components/doctor-booking.jsx`: booking, appointment management and doctor availability editor.
- `components/pharmacy-dashboard.jsx`: replacement pharmacy screens.
- `app/page.jsx`, `app/globals.css`: integration, route actions, scoped responsive styling.
- `lib/completion.mjs`, `lib/experience.mjs`, `lib/patient-experience.mjs`, `app/api/workspace/route.js`: appointment state, eligibility, schedule, references, reminders and permissions.
- `lib/dashboard-navigation.ts`, `components/dashboard-bottom-nav.tsx`: pharmacy destinations, active routes and badges.
- `components/completion-panels.jsx`: delegates appointment UI to the new component.
- `tests/workflows.mjs`, `tests/navigation.mjs`, `tests/views.mjs`, `tests/interactions.mjs`, `package.json`: regressions and test entry point.

## Actual verification

| Check | Result |
|---|---|
| API workflow checks | **761 passed** |
| Navigation/component assertions | **283 passed** |
| Rendering assertions | **135 passed** |
| App-only logout assertions | **48 passed** |
| UI event-handler checks | **18 passed** |
| ESLint | Passed, zero errors/warnings |
| TypeScript | Passed |
| Production build | Passed |
| Whitespace/diff check | Passed |

New API tests cover stale price rejection, opening/closing times, weekdays, invalid dates, exact returned booking ID, practice-address snapshot, unpaid-before-payment, confirmation, another patient's slot conflict, message gating, linked reminder ownership, rescheduling, reminder time movement, cancellation/refund state, archived messages, expired hold rejection/renewal, and active-consultation mutation rejection. Existing pharmacy, prescription, homecare, driver, payment/refund, private-document and role-isolation regressions remain passing.

UI tests execute the actual component handlers with isolated React-hook state: pharmacy metric navigation, stock action, saved order opening, product details/editing, contextual messages, finances, logout, doctor selection, date availability request, chosen slot, review and opening the exact saved appointment reference. They are component tests, **not browser clicks or proof of hosted/device behavior**. API tests use the real workspace route against isolated in-memory D1/R2 adapters and trusted fictional identity fixtures.

## Remaining boundaries

- Your earlier master brief expressly prohibits deployment without explicit authorisation. These changes are local; the live Site still serves its earlier published version.
- This accessible environment has simulated payments and isolated test identities. Bookings require a genuinely saved approved/reviewed provider within that environment. An unapproved doctor stays unbookable. Tests supplying verified administrator authority do not establish a real hosted Admin login.
- Native hosted/browser/device verification remains unavailable under the existing browser/access restriction. No authentication, cookie or browser-policy bypass was attempted. Responsive CSS and rendering are implemented, but pixel-perfect comparison, touch interaction, real GPS/microphone and hosted refresh/login/booking remain unverified.
- Real customer registration, trusted production provider verification, real payment services, online consultation infrastructure and anonymous host access remain the dependencies documented in `MASTER_IMPLEMENTATION_REPORT.md`. This work does not claim to complete those external integrations or certify production healthcare readiness.
- Additive saved fields include appointment professional-profile snapshots, cancellation audit/refund-review state, availability settings and linked reminder updates. No existing customer records or documents were deleted; no Firebase schema/security rules were deployed.

**Firebase, existing real accounts, production DNS, hosting/access settings and payment configuration were unchanged. No external messages, live approvals, real payments or deliveries were performed.**
