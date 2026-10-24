# HealthReachCare login, notifications and identity update

## Implemented

- Removed the dashboard-wide “Demo payments enabled” banner. Checkout still identifies simulated payments; this does not activate real payments or invent payment confirmations.
- Admin login links to password recovery and normal registration for an already-authorized email. Registration itself does not grant administrator permissions. Firebase never exposes existing passwords; the account holder uses recovery or the supported Google sign-in flow.
- An authenticated main-owner email-change form is prepared. It requires server-confirmed main-owner permission, recent Firebase reauthentication and verification of the new address through `verifyBeforeUpdateEmail`. It cannot change another user's email or grant roles from a form value.
- Prepared the main-owner email-change interface, but **did not activate any new owner privilege or relax the existing allowlist**: automatic approval review rejected the requested owner grant outside the earlier two-email Homebase allowlist. The user confirmed `pityhygiene@gmail.com` in clarification; no `gmqil.com` account was created. No Firebase user, password, customer history or provider document was deleted.
- Trusted administrator identities have their app role synchronized to Admin when they open their own account. Historical records remain intact; public signup cannot request Admin. Without an authorized grant, the Gmail account stays in its current role.
- Device notifications use the browser Push API and explicit user permission, authenticated subscription storage in the existing D1 table, VAPID encryption and the app's own service worker. Push summaries contain no clinical information. Clicking a notification opens the user's existing Notifications route. Logout unsubscribes the current app device without changing unrelated browser permissions or sessions.
- Real saved notification events are scheduled after the workspace save succeeds. Outbound attempts are persisted idempotently. “Accepted by push/email service” is an acknowledgement, not proof a person saw the message. Expired subscriptions are disabled. Ambiguous failures stay unconfirmed and are not blindly resent. Immediate device delivery still depends on browser/OS support, permission and network conditions. Future reminders need an active backend event or scheduler; this update does not install a periodic reminder worker.
- Email notification preferences are wired to the verified account email. They remain disabled until a verified sending service is actually configured. The prepared Workers EMAIL transport uses HealthReachCare / support@healthreachcare.co.za and private “open Notifications” links, with no medical details in email. No live sending service or paid plan was enabled.
- Replaced the stock favicon with resized formats of the unchanged provided logo, including PNG/ICO, Apple icons, install manifest icons, Open Graph/Twitter metadata and Organization structured data. Added a sitemap and robot rules excluding private/API routes. Search engines and social networks may retain older cached icons; app code cannot guarantee immediate reindexing everywhere.
- Replaced the large green focus outline with a compact dark keyboard-focus marker. Keyboard accessibility is retained. Existing meaningful active-state colours remain.

## Five additional email-dependent user flows

| User flow | Existing application connection | External requirement |
| --- | --- | --- |
| Password recovery | Firebase password-reset workflow and branded action handler | Firebase sender name/domain/template setup; inbox confirmation |
| Email changes and account security | Firebase verification-before-email-change; main-owner reauthentication | Authorized owner setup and Firebase sender verification |
| Medication order and delivery updates | Saved order/driver events → Notifications → opt-in delivery adapter | Verified transactional sender for email; browser permission for device push |
| Doctor appointment updates/reminders | Saved appointment events/reminders → Notifications → opt-in delivery adapter | Verified sender; a scheduler is needed for reminders when no app/backend event runs |
| Homecare booking and partner approval updates | Saved booking/review notifications → opt-in delivery adapter | Verified transactional sender and actual approved provider records |

All five keep Notifications as the saved in-app source. They do not send fabricated success messages or treat demo payments as real funds.

## Still requires account-owner setup

Firebase Authentication project: `gen-lang-client-0810450473`.

1. Set the Firebase public-facing app name to `HealthReachCare`; the Gmail-based project label cannot be changed by the browser SDK.
2. Configure Authentication email templates: sender name HealthReachCare; From/Reply-to support@healthreachcare.co.za; action URL `https://healthreachcare.co.za/auth/action`.
3. Use Firebase's Customize domain wizard and supply the exact TXT/CNAME table. Install only its genuine values, preserve the existing mail host/MX and existing SPF/DKIM/DMARC records, then Apply Custom Domain in Firebase.
4. Add `healthreachcare.co.za` to Firebase Authorized domains. The latest public Firebase configuration still omitted this hostname, so Google sign-in on the custom domain cannot be claimed working.
5. Enable a verified transactional sender binding before customer event-email delivery. Cloudflare email-management access previously returned Unauthorized; no live SMTP password or sender credential is available here. Do not share passwords or tokens in chat.
6. Explicitly approve changing the former two-email Homebase access policy before implementing and activating the requested main-owner grant. The current owner grant was blocked by automatic approval review and is not active in either runtime.

The Sites-to-Cloudflare database/document migration remains separately pending approval. No private-data export was retried for this task.

## Validation

Run `npm run lint`, `npx tsc --noEmit`, `npm test` and the production build. New tests cover authenticated notification settings, cross-account isolation, actual Web Push request encryption with mocked outbound services, no-clinical-data payloads, idempotent acknowledgements, expired subscriptions, unsubscribe, disabled/unverified email delivery, service-worker safe navigation and six role destinations. Administrator access tests use fictional identities and verify the existing restricted allowlist; no new real owner account is granted. Browser/phone delivery, actual email inbox receipt and password-reset email receipt require account-holder testing.
