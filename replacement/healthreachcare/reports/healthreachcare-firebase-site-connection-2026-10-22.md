# Firebase connection to the existing Sites app — 22 October 2026

## Project supplied by the owner

Project ID: `gen-lang-client-0810450473`; project number: `370128051283`; app ID: `1:370128051283:web:20ae44f4dfc41d50abbaa6`. The supplied Console identifies it as Default Gemini Project with app nickname ai-studio-applet-webapp. No new Firebase project was created, and no existing Firebase apps or records were changed.

A read-only Firebase project-config request returned HTTP 200 and the matching project number. Its authorized domains do not include `healthreachcare-connected-demo.swiftox16.chatgpt.site`.

## Implemented

- The existing Login/Sign Up form now calls the official Firebase SDK for email/password login and registration instead of an unavailable-service stub.
- Browser-session persistence is used. Passwords are not saved in application state, logs or backend records. There is no app-selected role, email-derived administrator access or test-account shortcut.
- Loading states, duplicate submission guard, safe credential/provider errors, password visibility and reset requests are implemented.
- Firebase verification-email requests, reloading the current email-verification state and server confirmation of Firebase identity are wired to explicit account actions.
- Login success never unlocks the demo dashboards. A signed-in Firebase account sees its verification/account-link status; real dashboard authorization and shared real-user business records still need implementation.
- Google popup code is present but disabled in the published runtime configuration pending provider/domain authorization.
- Firebase logout and the existing app-only demo-session revocation are used together; no hosting-platform logout, unrelated cookies or other browser sessions are cleared.
- Configured Sites runtime flags for Firebase Auth and registration. These flags enable app requests, not the remote Firebase providers. No billing, Firebase rules, provider settings, account privileges, DNS or existing Cloudflare Worker was modified.

## Tested

- Firebase public project configuration: real read-only request, HTTP 200, project number matched. No real user sign-in, registration, password reset or verification email was performed by the agent.
- 21 generated-token/mocked-account Firebase verification/configuration checks passed.
- 16 fail-closed login/signup rendering checks passed, with no public test shortcuts.
- 10 mocked Firebase login UI assertions passed: duplicate submissions, successful backend identity acknowledgement without dashboard escalation, safe errors and form availability. No real Firebase credentials were used.
- Existing full application API/navigation/rendering/logout/interaction regression suites passed before the additional 10 auth handler assertions; the interaction suite was then rerun with those assertions and passed.

## Still required

1. Authorize the Sites hostname in Firebase Authentication settings and verify the Google provider before enabling Google sign-in in the app.
2. Verify email/password registration and email templates in the supplied Firebase project with authorized test accounts.
3. Implement trusted UID-to-role/account mappings and shared real-user records before enabling real dashboards. Do not send new Firebase identities into the isolated seeded demo data.
4. Connect real-user document ownership/access, operational email delivery, regulated provider review, payment verification and fulfillment. Current demo simulations do not become real integrations by adding Firebase configuration.
5. Sites access remains owner-private. No public customer launch or Cloudflare domain switch was performed.

This is an authentication connection and preparation step, not a declaration that the marketplace is production-ready.
