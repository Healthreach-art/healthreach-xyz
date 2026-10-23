# HealthReachCare verification email setup

The app continues using Firebase project `gen-lang-client-0810450473`. No existing account, password, permission or email-verification flag is changed by this update. Application records remain in D1 and uploaded documents in R2. No new email service, SMTP credential, payment gateway or paid plan is enabled.

## Working application handler

`https://healthreachcare.co.za/auth/action`

The branded handler uses the configured Firebase SDK to validate the one-time link and confirm the action. It supports email verification, password resets, email restoration and verification of a changed email. Confirmation is explicit; simply inspecting a link does not apply it. Expired, invalid, reused or wrong-operation links do not report success. Password reset enforces the existing shared password policy. The handler ignores query-string API keys and continuation destinations and always returns through the existing login page for trusted role routing. A successful email action does not grant a provider or administrator role. Support links use `support@healthreachcare.co.za`.

The handler is prepared in code; Firebase's email templates must point to it before newly sent emails use it. Merely deploying this page does not change the actual sender address or Firebase project display name.

## Required Firebase administrator settings

Open https://console.firebase.google.com/project/gen-lang-client-0810450473/settings/general

- Public-facing name: `HealthReachCare` (replaces the Gmail-based app label).
- Public support contact: `support@healthreachcare.co.za`, where the project's ownership/Google branding settings permit that address. Keep the existing project owner and accounts intact.

Open https://console.firebase.google.com/project/gen-lang-client-0810450473/authentication/settings

- Add `healthreachcare.co.za` to Authorized domains. Add `www.healthreachcare.co.za` only when that actual hostname is connected and served. Do not remove existing authorized domains.
- At the last read, the live custom domain was missing; Google sign-in on that hostname therefore was not verified as working.

Open https://console.firebase.google.com/project/gen-lang-client-0810450473/authentication/emails

For Email address verification:

| Field | Value |
| --- | --- |
| Sender name | HealthReachCare |
| Sender address | support@healthreachcare.co.za |
| Reply-to | support@healthreachcare.co.za |
| Subject | Verify your email for HealthReachCare |
| Custom action URL | https://healthreachcare.co.za/auth/action |

Use the same sender name/address/reply-to for password recovery; subject `Reset your HealthReachCare password`. Preserve Firebase's generated `%LINK%` placeholder in all templates. Do not replace it with a fixed link, invent codes or include a password in an email. The verification template body may have editing restrictions; use the fields Firebase actually exposes.

Choose Customize domain and enter `healthreachcare.co.za`. Firebase will produce the actual TXT/CNAME verification records. Copy those exact public DNS values for installation in Cloudflare; no passwords or API tokens are needed in chat. After Firebase shows verification complete, Apply Custom Domain. Until applied, the requested sender is not live. Domain verification can take time; do not claim delivery before testing an actual message.

Keep existing mail routing intact. The observed MX record points to `mx7985790329.spe.ucebox.co.za`; do not replace it with Cloudflare Email Routing. The MX record alone does not prove that the support mailbox exists or receives replies. Confirm the mailbox with the current email host. Preserve the existing SPF/DKIM/DMARC setup; merge any required SPF change into the existing SPF record rather than adding a duplicate. Use Firebase-provided DNS values, never guessed verification tokens.

## Access limits observed

- GitHub/Cloudflare deployment is connected and its last production run succeeded.
- Firebase Authentication is enabled, using the new project above. There is no Firebase administrator connection available in this session to edit project branding/templates or authorized domains.
- Cloudflare email-sending management returned Unauthorized. No alternative mail-sending service was enabled. Existing Worker and DNS-read operations worked.
- The earlier Sites-to-Cloudflare data transfer remains separately pending approval; no new private-data export was attempted for this email task.

## Final delivery test after console setup

1. Create or use an email/password account whose inbox the tester controls. Request the actual verification email.
2. Inspect the received From display name and email, Reply-To, subject and action URL. They must show HealthReachCare/support@healthreachcare.co.za as configured, with a genuine Firebase-generated code.
3. Open the link, confirm email and continue to login. Verify the backend now reports Firebase emailVerified; pending partners must still require administrator approval.
4. Reuse the link: it must not create a second success or any role change. Test an expired/altered link and retry state.
5. Request password recovery, open its actual email, set a policy-compliant password and log in. Test an invalid code and failed network response.
6. Test Google sign-in on the now-authorized domain. Confirm actual routing from trusted account records.

Automated local tests use mocked SDK responses and do not prove mailbox delivery, sender-domain verification or a live administrator login.

Primary setup references:
- https://firebase.google.com/docs/auth/email-custom-domain
- https://firebase.google.com/docs/auth/custom-email-handler
- https://support.google.com/firebase/answer/7000714
