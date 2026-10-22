# Doctor workflow repair — local demo

Implemented against baseline `6e189b670a72be9135156e1e70e9f42d9f1c2c53`. This change is local and has not been pushed or deployed. The currently hosted site does not include these changes.

## Implemented

- Doctor Account now displays the assigned professional profile and saved private contact details, with working links to appointments, scheduling, credentials, support, finances, privacy and logout. Patient delivery fields and ordinary dashboard role switching are excluded.
- Replaced manual appointment-time entry with a saved day/week/month calendar, working hours, consultation modes, appointment duration, recurring breaks, leave blocks and reopening controls. Existing bookings remain visible; changing availability does not silently cancel them.
- Patient discovery uses reviewed, eligible provider profiles, saved service areas and actual availability. It searches the next 14 days and shows distance only when saved coordinates support it. Unavailable choices offer genuine alternative times and suitable doctors without silently changing a booking.
- Booking retries are idempotent. The existing workspace version guard prevents two patients from reserving the same appointment slot.
- Professional support cases use doctor-specific categories and authorized appointment links. A doctor can reply to their own central-support case but cannot assign or resolve it as staff. Private calendar reasons and contact data are filtered from other users.
- Doctor finances derive from saved appointment ledger records, including pending, cleared, refunded, adjusted and reserved amounts. CSV export uses saved transactions.
- Withdrawal requests reserve eligible funds in the existing ledger, preserve references and outcome history, and support cancellation and administrator review. Concurrent requests cannot spend the same balance. Real `Paid` outcomes are forbidden: only explicitly labelled simulated payouts are supported, with no bank transfer.
- Doctor Schedule uses the existing guarded dashboard router and shares the Appointments active destination. Existing branding, authentication and other service workflows are retained.

## Implementation scope

New modules: `components/doctor-workspace.jsx`, `lib/appointment-calendar.mjs`, `lib/doctor-config.mjs` and `lib/doctor-operations.mjs`.

Existing API, page, booking, support, navigation, styling and tests were updated. Workspace data additions are additive: doctor contact details, calendar configuration and withdrawal records. Reservations use the existing ledger and authorization/version checks. No database reset, security-rule deployment, new backend, UI library or payment gateway was introduced.

## Verification actually run

| Check | Result |
| --- | --- |
| API workflow checks | 857 passed |
| Navigation/component assertions | 285 passed |
| Shared-screen rendering assertions | 152 passed |
| App-only logout assertions | 48 passed |
| UI-handler checks | 22 passed |
| `npm run lint` | Passed, zero errors or warnings |
| `npx tsc --noEmit` | Passed |
| Sites production build script | Passed |
| `git diff --check` | Passed |

The build emitted nonfatal proxy-environment and route-classification advisories. Tests exercise the actual API route with isolated D1/R2 and identity adapters, server rendering, navigation definitions and component handlers. They are not hosted-browser tests or production certification. Administrator-positive tests use a trusted permission fixture.

New coverage includes private contact/calendar filtering, mode-specific availability, breaks and blocks, calendar history, discovery and alternatives, booking retries and concurrent reservation conflicts, professional support ownership, withdrawal eligibility and concurrent reservations, cancellation/rejection release, refunds, self-approval rejection and real-payment rejection. Existing pharmacy, homecare, driver, privacy and logout regression tests also ran as part of the suite.

## Remaining limitations

- Hosted browser, mobile-device, refresh/Back and location-permission checks were not performed because browser/platform access remains restricted. No access restriction was bypassed.
- Live payouts require a separately authorized production integration, authoritative destination verification and reconciliation. Current requests and outcomes are clearly simulated; no money was transferred.
- Professional registry verification and legally approved retention policies require external/production review. No real credential approval is implied by the demo.
- A waitlist is not enabled. Genuine alternative appointment options are supported without fictional queue positions.
- The accessible application uses the existing isolated D1/R2 demo workspace, not the production Firebase repository. Production Firebase and real-user integration verification remain outstanding.

## Preserved boundaries

No production Firebase configuration or data, existing user accounts, authentication providers, DNS, hosting audience, deployment settings or payment configuration were changed. No existing records, branches, backups or repositories were deleted. No external messages, real care events or real financial transactions were created. `app/chatgpt-auth.ts`, `.openai/hosting.json` and `package.json` are unchanged by this task.
