---
status: active
value: 5
effort: XS
remaining: "Outcomes 1-6 are BUILT, in 20f0395e7 (feat(auth): add in-app email code sign-in, 2026-08-25) - do not re-implement them. Outcome 7 is the only product work left and it is Austen's, not an agent's: John's older Google UID stays canonical, the Live.com address becomes its Firebase primary email, and his duplicate Firestore work is copied before the second UID is deleted. That mutates production identity data. Verification still owed: a Firebase Auth emulator run proving a Google-provider email plus a different primary email return the same UID, the auth-surface viewport sweep with measured touch input font sizes, and physical iPad proof of the native software keyboard - which no desktop emulator can supply."
depends_on: "external: Austen's decision on the production UID consolidation, plus a physical iPad session"
plan_path: ""
tags: ["auth", "firebase", "ios", "ipad", "pwa", "account-merge"]
last_triaged: 2026-09-13
---

# Multi-email and iPad auth continuity

**Status (reconciled 2026-09-13):** implemented except outcome 7. This spec
carried no `remaining` field, so the queue ranked it as fresh v5/M work over
auth code that already ships. Evidence: `20f0395e7` extended
`magicLinkStateStore.ts` (+163) and `sendMagicLink.ts` (+184) for the six-digit
code lifecycle, rewrote `EmailLinkAuth.svelte` (+361) and the magic-link email
template, retabbed `EmailAuthTabs.svelte`, and applied the iOS floor in
`EmailPasswordAuth.svelte:342-344` with the WebKit rationale in a comment.
`email-link-completion.ts:266-276` is outcome 1 verbatim: a signed-in user who
does not already own the saved email goes through `linkWithCredential`, not the
plain sign-in path. `tests/unit/auth/email-link-completion.test.ts` -- 15 tests,
re-run green at `c4be1619`, including "uses signInWithEmailLink when the saved
email already belongs to the current user" (outcome 2). Function-side coverage
lives in `firebase-functions/src/auth/magicLinkStateStore.test.ts` and
`sendMagicLink.test.ts`.

## Field report

John Cloud had an established Google account under `theprizman@gmail.com` and
used a magic link sent to `jcld2@live.com` on an iPad. Completing that link in
Chrome created a second Firebase UID. He also reported that the installed Home
Screen app would not accept text input and that the email button opened a
browser instead of the installed app.

## Proven behavior

- The North Carolina replay starts after Mail opened the link in Chrome. Chrome
  already held the established Google session.
- Tapping **Finish signing in** called `signInWithEmailLink`, changed the UID,
  fired `user_signed_up`, and produced seven Firestore permission errors as
  listeners from the prior UID settled.
- The replay does not contain the earlier Home Screen input attempt, so it
  cannot prove which field John tapped.
- The password sign-up fields use a 12–14px computed font on touch devices.
  The project already uses a 16px mobile form-control floor to avoid iOS focus
  zoom and keyboard instability.
- Apple states that email links open in the default browser, not an existing
  Home Screen web app, because browser and installed-web-app storage are
  separate. A website cannot force that browser-to-PWA launch. Apple recommends
  putting a one-time code in the email so the user can finish inside the
  installed app.

## Outcome

1. A signed-in permanent user who verifies a different email through a magic
   link links that email credential to the current Firebase UID. It never calls
   the plain sign-in path that silently replaces the account.
2. A link for an email already attached to the current user signs into the same
   UID normally.
3. Every sign-in email includes a six-digit, short-lived code. The requesting
   screen accepts the code and signs in without leaving the installed PWA.
   The pending request survives an app suspension or reload until it expires.
4. Code attempts are bound to the opaque request ID, expire with the link, are
   rate-limited, and are consumed once.
5. Touch-device auth inputs use the existing 16px iOS-safe floor. Desktop can
   retain the compact typography.
6. Email code is the default email-auth tab for new users and anyone without a
   remembered password preference. Its screen asks for an email, then a
   six-digit code, with password still one tap away. The email presents the
   code first and keeps the browser link as a secondary fallback. Installed-app
   copy explicitly tells the user to return to the app.
7. John’s older Google UID remains canonical. The Live.com address becomes its
   Firebase primary email while the Google provider keeps the Gmail identity.
   His duplicate Firestore work is copied before the second UID is deleted.

## Shared owners

- Extend `email-link-completion.ts` for link-versus-sign-in selection. This is
  already the only owner that consumes Firebase email links.
- Extend `magicLinkStateStore.ts` for the one-time-code lifecycle. The same
  server-held state already owns link expiry and recipient binding.
- Extend the deployed `sendMagicLink` callable for code redemption. Do not add
  a parallel endpoint or a second email sender.
- Extend `EmailLinkAuth.svelte` for the code field because it already owns the
  request and delivery states.
- Apply the mobile typography policy inside `EmailPasswordAuth.svelte`; no new
  input primitive is justified for one shared CSS rule.

## Security contract

- Generate codes with a cryptographically secure random source.
- Store only a salted slow hash, never the code.
- Require a valid UUID request ID and exactly six digits.
- Allow five failed attempts. Reject expired, consumed, or locked requests with
  the same user-facing invalid-code result.
- Resolve or create the Firebase user only after code proof. If the request was
  made by an authenticated permanent user, keep that UID and associate the
  verified email when Firebase reports it is available.
- Never log an email, code, action link, or custom token.

## Verification

- Unit-test state parsing, hashing, attempt limits, expiry, and one-time use.
- Unit-test signed-in alternate-email completion through `linkWithCredential`.
- Run the Firebase Auth emulator to prove a Google provider email plus a
  different primary email both return the same UID.
- Run focused Svelte/TypeScript checks and auth/function tests.
- Verify the changed auth surface at the required desktop, tablet, short-wide,
  and phone viewports. Measure touch input font sizes and confirm the code field
  remains reachable with no horizontal overflow.
- Physical iPad proof is still required for the native software keyboard. A
  desktop emulator can prove focus and layout but cannot summon iPadOS's real
  keyboard.
