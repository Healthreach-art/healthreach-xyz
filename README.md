# HealthReach

## Cloudflare Workers production deployment

The TanStack Start app deploys as a Cloudflare Worker. The Worker binds private
uploads to the `healthreachcare-documents` R2 bucket; prescription and
verification files are never served from a public bucket URL. The Worker
checks the caller's Firebase ID token and Firestore ownership/role before
issuing an access link, which expires within 15 minutes.

The private R2 bucket is `healthreachcare-documents`. Build and deploy the
generated Nitro Worker entry point:

```sh
npm run build
npx wrangler deploy --config .output/server/wrangler.json
```

Before deployment, authenticate Wrangler with `npx wrangler login` if needed.
Configure these Worker secrets for the `healthreachcare` service (do not
commit them):

```sh
npx wrangler secret put GOOGLE_API_KEY --config .output/server/wrangler.json
openssl rand -base64 48 | npx wrangler secret put R2_URL_SIGNING_SECRET --config .output/server/wrangler.json
```

`GOOGLE_API_KEY` must be the Firebase project's Web API key, used to verify
Firebase ID tokens. The signing secret protects short-lived private-file URLs.
If the Worker already has the Firebase key configured, do not replace it.
Deploy only after the build succeeds and both secrets and the R2 bucket are
configured.

Existing Firebase Storage objects are not copied automatically. If the
production bucket already contains private files, copy them to R2 before
switching production traffic, preserving each Firebase object key (including
its logical prefix such as `prescriptions/` or `pharmacy-docs/`). Keep the
Firebase source intact until authenticated reads from R2 have been verified.

1. Overview of the Website

- *Name*:HEALTHREACH- *Purpose*: A healthcare management platform connecting patients, pharmacies, hospitals, delivery drivers, and administrators.

- *Target Audience*: Patients, healthcare providers (pharmacies and hospitals), delivery drivers, and administrators.

- *Key Features*:

    - Medication ordering

    - Inventory management

    - Patient care coordination

    - Delivery task management

    - Platform administration

    - Online payment processing

2. Design Requirements

- *Theme*: Clean, modern, and professional. Use a light blue and white color palette for a calming healthcare feel.

- *Typography*: Simple, readable fonts such as Sans-serif (e.g., Roboto, Open Sans).

- *Icons/Graphics*: Use healthcare-related icons (e.g., stethoscopes, pills, trucks for delivery).

- *Mobile-Responsive*: Ensure the website is fully responsive and optimized for mobile devices.

3. Key Pages and Features

Home Page

- Welcome message with a clear tagline (e.g., "Your central hub for integrated healthcare management").

- Login and Sign-Up buttons.

- Quick links to user roles (Patient, Pharmacy, Hospital, Driver, Admin).

- Background image (e.g., a blurred pharmacy or healthcare setting).



Role-Specific Dashboards

- *Patient*:

    - Order medication and track health.

    - View order history and delivery status.

    - Make payments online.

- *Pharmacy*:

    - Manage inventory and patient orders.

    - Notifications for low stock or incoming orders.

    - View payment history and process refunds.

- *Hospital*:

    - Coordinate patient care and records.

    - Manage communication with pharmacies and patients.

- *Driver*:

    - View assigned delivery tasks with addresses and timelines.

    - Update delivery status in real-time.

- *Admin*:

    - Oversee the entire platform.

    - Manage users, permissions, and platform analytics.

    - View transaction history and generate reports.

## Firebase privileged operations

### Booking/delivery readiness (not deployed automatically)

The default `privilegedFirestoreAction` endpoint returned HTTP 404 during the
19 October 2026 read-only check. The export and frontend both use `us-central1`;
no duplicate function or frontend fallback is required. Production deployment
and billing changes must be separately authorized.

The existing dispatcher now includes `available_doctor_slots`,
`book_doctor_appointment` and `confirm_doctor_payment`. Actual doctor availability
is read from `doctor_availability` in Johannesburg time; reservations exclude
overlaps transactionally. Configure the existing doctor's `platform_fee` or
the Functions environment variable `DOCTOR_PLATFORM_FEE_CENTS` to the approved
business amount. No platform fee is invented. Firebase Functions must have a
valid **test** `PAYSTACK_SECRET_KEY` and `ADMIN_INVITE_CODE` secret. App-server
secrets do not automatically configure Firebase Functions secrets.

After authorization, authenticate the Firebase CLI, check the project's existing
billing plan and secret configuration, and deploy only the existing dispatcher:

```sh
npx firebase-tools login --no-localhost
npm run functions:build
npx firebase-tools deploy --only functions:privilegedFirestoreAction --project healthreachcare-prod
```

Review and publish the updated appointment rules separately only after approval.
Without those rules, client writes could still change appointment payment fields.
Without deploying the dispatcher, availability, reservation, confirmation and
driver acceptance remain unavailable. Verify an unauthenticated POST returns
401 (not 404), then use real patient, pharmacy, doctor and driver accounts to
exercise booking/payment and package delivery. A source test is not proof of
live payment or delivery.

The classic admin reads actual `doctor_appointments`, `pharmacy_appointments`,
patient requests and orders. Admin access requires a persisted admin role; no
email-only elevation is allowed. Pharmacy dispatch no longer invents a driver
assignment or overwrites pickup codes. Trusted driver acceptance creates the
package relationship, pickup code and customer delivery code.

Homecare quotations and grouped medication orders now have authenticated
`initialize_marketplace_payment` / `verify_marketplace_payment` actions. Quote
acceptance and assignment require verified exact ZAR payment; medication dispatch
and driver acceptance require paid, ready orders. Checkout creates an unpaid
package before opening Paystack, so payment failures can be retried from the
patient order page. Pharmacies request payment from the patient, not their own card.
Mock card entry has been removed from `/payment`. Payments remain test-only.
The user returns from Paystack and selects Verify payment; new marketplace
payments are not fulfilled by the generic webhook. No automated refunds or
provider availability reservation were added: support must resolve unavailable
visits, changed prices, pending-payment cancellations and paid-order refunds.
Deploy the dispatcher and reviewed rules only with explicit authorization,
then test real role accounts before enabling production charges.

Wallet and driver-dispatch mutations run in the `privilegedFirestoreAction`
Firebase Cloud Function so its Admin SDK can apply Firestore transactions
without granting direct client write access to wallet balances or delivery
assignments. Homecare role registration, quote responses, and coordinator
assignments use authenticated TanStack Start server functions with matching
Firestore Rules for role eligibility, request ownership, and allowed status
transitions. Deploy the updated rules before rolling out those app changes.
Configure the `PAYSTACK_SECRET_KEY` Firebase Functions secret before deploying:

```sh
firebase functions:secrets:set PAYSTACK_SECRET_KEY --project healthreachcare-prod
firebase functions:secrets:set PAYMENT_WEBHOOK_SECRET --project healthreachcare-prod
npm run functions:build
firebase deploy --only functions,firestore:rules,firestore:indexes --project healthreachcare-prod
```

The app calls the function in `us-central1` by default. Set
`FIREBASE_PRIVILEGED_ACTION_URL` on the app server only when deploying the
function to a different endpoint. Set `FIREBASE_PAYMENT_WEBHOOK_URL` only if
the public webhook function is deployed at a different endpoint.

Home care quote/coordination actions and explicit support-provider provisioning
also run through `privilegedFirestoreAction`. The
`archiveCompletedHomecareConversation` trigger closes a service chat after its
assignment is completed without deleting messages. Publish the updated
`firestore.rules` and deploy the functions before enabling this workflow. The
admin provisioning action requires an explicit Firebase UID and verifies the
matching support Auth account; it creates a pending provider profile and does
not approve the provider or make them eligible for assignments.

## Pharmacy medicine catalogue and order security

Pharmacy-entered products are stored in the pharmacy-owned `medications`
collection. The patient catalogue reads `medications_public`, which is
read-only to clients. The `publishMedicationToPatientCatalog` Cloud Function
re-reads the current source medicine and checks its publication request,
active/non-demo state, positive stock, expiry, pharmacy role, approved profile
and pharmacy record, and active primary branch in a Firestore transaction
before writing the public snapshot. Changes to a medicine, pharmacy approval,
profile, role, or branch refresh or remove that snapshot. Do not grant clients
write access to `medications_public`. A scheduled hourly cleanup republishes
or removes products whose stock has expired; the Firebase project must have
Cloud Scheduler enabled for that function.

Order submission uses the existing authenticated order flow. Firestore rules
require the selected public medicine to belong to the order's pharmacy, verify
the pharmacy is still approved and its published branch is active, and check
current source-medicine publication state and stock before accepting an
order. The order handler additionally checks that all cart items belong to
one pharmacy and validates prescription ownership, approval, medicine and
pharmacy match, expiry, repeat allowance, and fraud score before linking the
prescription upload to the created order. Pharmacy prescription access is
limited to uploads linked to that pharmacy's own order. Provider-role records
are written by the authenticated server action only after it verifies a
matching pending provider application; client Firestore rules do not allow
users to create or update roles. The admin invite action requires the
`ADMIN_INVITE_CODE` Functions secret; bootstrap admin access remains tied to
the designated Firebase Auth email, not profile data.

Configure `ADMIN_INVITE_CODE` as a Firebase Functions secret before deploying
if the admin invite flow is used:

```sh
firebase functions:secrets:set ADMIN_INVITE_CODE --project YOUR_FIREBASE_PROJECT
```

After reviewing the rules and indexes, build Functions and deploy only to the
intended Firebase project. The pharmacy-branch and order-linked prescription
queries require the indexes in `firestore.indexes.json`:

```sh
npm run functions:build
firebase deploy --only functions,firestore:rules,firestore:indexes --project YOUR_FIREBASE_PROJECT
```

## MCP OAuth server

The MCP server uses a dedicated Firebase Functions OAuth authorization server.
It supports dynamic client registration, authorization-code flow with PKCE
S256, Firebase-authenticated consent, signed access tokens, and read-only
HealthReachCare MCP tools. The app origin in `MCP_OAUTH_ISSUER` must match the
issuer configured in the MCP server and Cloud Function; the default is
`https://healthreachcare.co.za`. Set `MCP_OAUTH_FUNCTION_URL` on the app server
only if the `mcpOAuth` function uses a different URL.
Set `MCP_OAUTH_DATA_URL` on the app server only if `mcpData` uses a different
URL.

Create a dedicated RSA private signing key outside the repository and store it
as a Firebase Functions secret. Never commit or expose the key:

```sh
firebase functions:secrets:set MCP_OAUTH_SIGNING_KEY --project healthreachcare-prod
npm run functions:build
firebase deploy --only functions,firestore:indexes --project healthreachcare-prod
```

The OAuth authorization-server metadata is served at
`/.well-known/oauth-authorization-server`, and the MCP protected-resource
metadata is served at `/.well-known/oauth-protected-resource`. Deploy the app
and Functions together so both metadata endpoints and OAuth callbacks are
available.


Payment Page

- Patients can make payments using:

    - Credit/Debit cards (e.g., Visa, Mastercard, Amex)

    - Online banking (e.g., EFT, PayFast)

    - Mobile payments (e.g., PayPal, Apple Pay)

- Secure payment gateway integration (e.g., Stripe, PayPal)

- Payment confirmation and receipt generation



Contact Page

- Include a form for inquiries (name, email, message).

- Display contact information (phone, email, address).



Footer

- Links to:

    - About Us

    - Privacy Policy

    - Terms of Service

    - Contact

- Copyright notice.

4. Functional Requirements

- *User Accounts*:

    - Each role (Patient, Pharmacy, etc.) should have its own login.

    - Password recovery option.

- *Notifications*:

    - Email or SMS alerts for order updates, delivery status, and inventory.

    - Payment confirmation notifications.

- *Search Functionality*:

    - Patients can search for medications.

    - Pharmacies can search inventory.

- *Real-Time Updates*:

    - Delivery tracking for patients and drivers.

- *Admin Controls*:

    - Ability to manage and monitor all user activities.

5. Technical Requirements

- *Hosting*: Cloud-based hosting for scalability (e.g., AWS, Google Cloud).

- *Security*:

    - HTTPS encryption.

    - Secure payment gateway integration (e.g., Stripe, PayPal).

    - Data protection for patient records and payment information.

- *CMS*: Use a user-friendly content management system (e.g., WordPress, custom-built).

- *Database*: For storing user data, orders, and inventory (e.g., MySQL, MongoDB).

6. Budget and Timeline

- *Budget*: Specify your budget range (e.g., R70- R200).

- *Timeline*: Mention your expected deadline (e.g., 2-3 months).

7. Additional Notes

- Provide any reference websites you like for design or functionality inspiration.

- Mention if you need ongoing support or maintenance after launch. medicationShows available pharmacies, prices, and stock5Selects pharmacy & delivery optionCalculates delivery fee and ETA6Confirms order and paysProcesses payment and generates order ID7Tracks orderDisplays real-time status (Preparing → Out for delivery → Delivered)8Confirms deliveryMarks order as completed and requests feedback

2. Pharmacy Workflow (Order Fulfillment)

Goal

Pharmacy receives and prepares medication for delivery.

StepWhat the Pharmacy DoesWhat the System Does1Logs into pharmacy dashboardDisplays pending orders2Reviews prescriptionFlags invalid prescriptions if needed3Accepts or rejects orderNotifies patient of status4Prepares medicationUpdates order to “Preparing”5Marks order readyTriggers driver assignment6Updates inventoryAutomatically reduces stock levels

3. Hospital / Clinic Workflow (Prescription Management)

Goal

Doctor issues prescriptions digitally.

StepWhat the Hospital/Clinic DoesWhat the System Does1Logs into provider portalDisplays patient list2Creates digital prescriptionEncrypts and stores prescription3Links prescription to patientMakes it available for pharmacies4Updates treatment notesSyncs with patient profile

4. Delivery Driver Workflow

Goal

Deliver medication safely and on time.

StepWhat the Driver DoesWhat the System Does1Logs into driver appShows available delivery tasks2Accepts deliveryAssigns order and shares pickup location3Collects medicationConfirms pickup with pharmacy4Starts deliveryUpdates patient with live tracking5Delivers medicationCaptures proof of delivery6Completes jobReleases payment to driver

5. Administrator Workflow (Platform Management)

Goal

Maintain system integrity and compliance.

StepWhat the Admin DoesWhat the System Does1Logs into admin panelDisplays platform analytics2Manages users & rolesApplies permissions and access control3Monitors transactionsFlags suspicious activity4Handles disputesUpdates order and refund status5Generates reportsProduces financial & usage reports

6. Payment Workflow

Goal

Secure online payment processing.

StepUser/System ActionSystem Response1User selects payment methodConnects to payment gateway2User confirms paymentEncrypts and processes transaction3Payment successfulConfirms order and notifies pharmacy4Payment failsPrompts retry or alternate payment

7. Notification & Communication Flow

TriggerSystem ActionOrder acceptedPush/SMS/Email notificationOrder readyDriver assignment notificationDelivery startedLive tracking enabledDelivery completedFeedback request sent

8. End-to-End User Experience (Simple View)

Patient → Pharmacy → Driver → Patient
HEALTHREACH acts as the coordinator, ensuring:

 Secure data handling

 Real-time updates

 Automated workflows

 Transparent communication

If you want, I can:

 Convert this into flow diagrams (UI/UX ready)

 Create user stories for developers

 Map journeys to API endpoints

 Customize for South African healthcare regulations

Just tell me 👍



Healthreach User Journey

You’re viewing user-generated content that may be unverified or unsafe.

Report

Below is a clear, step-by-step user journey and workflow breakdown for HEALTHREACH, showing what the user does and what the system does in response.
I’ve customized this specifically for a medication delivery & healthcare coordination platform like the one you described.

HEALTHREACH – User Journeys & Workflows

1. Patient User Journey (Medication Ordering & Delivery)

Goal

Patient orders medication and receives it at home.

Workflow

StepWhat the User DoesWhat the System Does1Opens HEALTHREACH app/websiteLoads homepage and checks authentication2Registers or logs inValidates details, creates user profile3Uploads prescription or selects saved prescriptionVerifies prescription format and stores it securely4Searches for medicationShows available pharmacies, prices, and stock5Selects pharmacy & delivery optionCalculates delivery fee and ETA6Confirms order and paysProcesses payment and generates order ID7Tracks orderDisplays real-time status (Preparing → Out for delivery → Delivered)8Confirms deliveryMarks order as completed and requests feedback

2. Pharmacy Workflow (Order Fulfillment)

Goal

Pharmacy receives and prepares medication for delivery.

StepWhat the Pharmacy DoesWhat the System Does1Logs into pharmacy dashboardDisplays pending orders2Reviews prescriptionFlags invalid prescriptions if needed3Accepts or rejects orderNotifies patient of status4Prepares medicationUpdates order to “Preparing”5Marks order readyTriggers driver assignment6Updates inventoryAutomatically reduces stock levels

3. Hospital / Clinic Workflow (Prescription Management)

Goal

Doctor issues prescriptions digitally.

StepWhat the Hospital/Clinic DoesWhat the System Does1Logs into provider portalDisplays patient list2Creates digital prescriptionEncrypts and stores prescription3Links prescription to patientMakes it available for pharmacies4Updates treatment notesSyncs with patient profile

4. Delivery Driver Workflow

Goal

Deliver medication safely and on time.

StepWhat the Driver DoesWhat the System Does1Logs into driver appShows available delivery tasks2Accepts deliveryAssigns order and shares pickup location3Collects medicationConfirms pickup with pharmacy4Starts deliveryUpdates patient with live tracking5Delivers medicationCaptures proof of delivery6Completes jobReleases payment to driver

5. Administrator Workflow (Platform Management)

Goal

Maintain system integrity and compliance.

StepWhat the Admin DoesWhat the System Does1Logs into admin panelDisplays platform analytics2Manages users & rolesApplies permissions and access control3Monitors transactionsFlags suspicious activity4Handles disputesUpdates order and refund status5Generates reportsProduces financial & usage reports

6. Payment Workflow

Goal

Secure online payment processing.

StepUser/System ActionSystem Response1User selects payment methodConnects to payment gateway2User confirms paymentEncrypts and processes transaction3Payment successfulConfirms order and notifies pharmacy4Payment failsPrompts retry or alternate payment

7. Notification & Communication Flow

TriggerSystem ActionOrder acceptedPush/SMS/Email notificationOrder readyDriver assignment notificationDelivery startedLive tracking enabledDelivery completedFeedback request sent

8. End-to-End User Experience (Simple View)

Patient → Pharmacy → Driver → Patient
HEALTHREACH acts as the coordinator, ensuring:

 Secure data handling

 Real-time updates

 Automated workflows

 Transparent communication

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://healthreach-xyz.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f3f1ef1a-180c-42fe-82f8-e0899adec27a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
