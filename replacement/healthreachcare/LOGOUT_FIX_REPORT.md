# HealthReachCare logout investigation — 22 October 2026

## Cause
The application logout handler explicitly navigated to `/signout-with-chatgpt?return_to=%2F` in a finally block, even if its own session revocation failed. That reserved route ends the Sites identity session. Sites is configured `custom`, with only its owner allowed; the platform therefore requires ChatGPT authentication before any application route can run. These are two separate boundaries, not a Firebase redirect.

## Small fix
- `app/page.jsx`: use app-only logout, clear private React state on confirmed revocation, then replace the current document with `/`. Show a useful error if revocation fails. No host sign-out, cookie manipulation or unrelated storage clearing.
- `lib/app-session.mjs`: revoke the current HealthReachCare token through existing `endDemoSession`; require successful saved acknowledgement; remove only the two application session-storage keys. Preserve platform identity.
- `tests/logout.mjs`: six-role regression checks, failed revocation checks, already signed-out behavior, unrelated storage preservation.
- `package.json`: include these tests in the existing test command.

Existing dashboard guards redirect anonymous visitors to `/login?returnTo=...`. API ownership, token checks, role checks, admin permission checks, browser history/session guards and platform authentication integration remain intact. No new authentication system was added.

## Verification
Actually run: 622 API action checks (including six-role session refresh/revocation), 297 navigation assertions, 93 view assertions, 48 app-only logout assertions: all passed. These are isolated automated fixtures, not authenticated hosted-browser sessions.

Hosted requests to `/`, `/login` and `/dashboard/patient/home` returned HTTP 403. A diagnostic response identifies Cloudflare error 1010. This runtime cannot complete hosted-browser QA: the supported managed browser permits only the internal preview URL. Therefore six-role hosted logout, browser Back/refresh and hosted direct-route outcomes remain unverified. No fabricated cookies, identity headers or access tokens were used to bypass this restriction.

## Remaining hosting dependency
Private Sites require authenticated access before serving even `/`. Keeping the platform session fixes the unnecessary host logout for an already authorised visitor. It does not make the site anonymously public. The supported route to an anonymous landing page is the Sites sharing/access setting **Public**, while retaining application-level authentication and API authorisation. That changes the audience of the entire site and needs deliberate review; no audience change was made in this task. Until that setting is changed and actual hosted anonymous/logout tests pass, the full anonymous-public requirement is not complete.

No Firebase, DNS, existing accounts, live customer records, platform cookies or access settings were changed.
