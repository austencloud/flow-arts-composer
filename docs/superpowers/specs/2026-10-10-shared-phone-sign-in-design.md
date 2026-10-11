# Shared phone sign-in

Approved by Austen on 2026-10-10: "Just me, hidden (Recommended)", "Scan alone
signs in (Recommended)", "Looks right, build it (Recommended)" and "Package,
both at once".

## Goal

Flow Arts Composer gets Ringmaster's scan-to-sign-in: from any copy of the app
(local, worktree preview, dev tunnel or live), Austen presses "Sign in with
your phone", scans the QR with his phone, and the computer signs in. After he
trusts his phone once, the scan alone does it while phone and computer share
an internet connection.

The logic moves out of Ringmaster into a new shared package,
`@austencloud/phone-sign-in`, and both apps use it. Ringmaster's behaviour,
stored data and screens stay exactly as they are.

Ringmaster's three specs remain the design and security record and are not
repeated here:

- `E:/cirque-aflame/ringmaster/docs/superpowers/specs/2026-10-07-phone-approval-sign-in-design.md`
- `E:/cirque-aflame/ringmaster/docs/superpowers/specs/2026-10-08-phone-auto-approve-design.md`
- `E:/cirque-aflame/ringmaster/docs/superpowers/specs/2026-10-09-phone-sign-in-any-server-design.md`

## Who sees it

Only Austen. Approving needs an admin account, so a stranger who reaches the
page can start a request but nothing can approve it.

- On a local copy, a worktree preview or `dev.tkaflowarts.com`, the sign-in
  sheet shows a "Sign in with your phone" button.
- On the live site nothing links to it. Austen opens
  `https://tkaflowarts.com/phone-sign-in` from a bookmark. The page is marked
  `noindex` and stays out of the sitemap.

## The package

`E:/shared-packages/packages/phone-sign-in`, named
`@austencloud/phone-sign-in`. Ringmaster's modules move in with their tests.
Everything a module read from Ringmaster directly (its Firestore client, its
auth check, its environment, its name) becomes configuration.

| Entry                               | Contents                                                                                                                                                                                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@austencloud/phone-sign-in`        | Browser and server alike: the auto-approval message, `formatCode`, device, place and site descriptions, the approve page's tap rules, request clock and automatic-approval rules, the done-screen wording, and the `next` path helpers.                                                                 |
| `@austencloud/phone-sign-in/server` | `createPhoneSignInServer(config)`, which returns one handler per route, plus the parts it is built from: network scope, server keys, the request lifecycle, trusted phones, session revocation, the custom token claims and signer, the capped body reader, and the public and requester address rules. |
| `@austencloud/phone-sign-in/client` | `createPhoneSignInClient(config)` with the browser's calls to every route, and the trusted phone key kept in IndexedDB.                                                                                                                                                                                 |
| `@austencloud/phone-sign-in/svelte` | `QrCode.svelte`.                                                                                                                                                                                                                                                                                        |

Handlers take a standard `Request` plus `{ id, clientAddress, cf }` and return
a standard `Response`, so an app route is a one-line wrapper. An auth refusal
thrown by the app's check (anything with a numeric `status`) becomes a JSON
response with that status and a `message`, the shape SvelteKit's `error()`
produces, so Ringmaster's browser code reads it the same way it does today.

Server configuration:

- `store`: `get`, `getWithRevision` (data, revision and Firestore's
  `createTime`), `set`, `updateIfCurrent` (a write that fails when the revision
  changed) and `delete`. Times go in and come out as `Date`.
- `serverSecret()`: the bytes the HMAC keys are derived from, or `null` on the
  Firestore emulator.
- `signJwt(claims)`: signs the custom token. Ringmaster passes its own
  allowlisted signer; the package exports `createServiceAccountSigner` for apps
  without one, and it signs only for the Identity Toolkit audience.
- `verifyUser(request)`: the app's own check, returning `uid`, `email`,
  `signInProvider` and `issuedAt`. Each app keeps its own admin rule here.
- `rateLimit`, `accessToken` and `forgetAccessToken` for session revocation,
  `projectId`, `disabled()`, `dev`, `liveOrigin`, `approvePath`, `appName`,
  `salt`, `autoPurpose` and collection names.

Client configuration: the API base path, the app's authenticated fetch (with
the force-refresh option), `appName` for messages, and the IndexedDB name.

The screens stay in each app. Ringmaster's screens use its own buttons, icons
and motion, and Flow Arts Composer's must match its own look, so sharing them
would mean restyling one app. Every rule the screens follow is in the package.

## Ringmaster

- Its server modules, browser calls and page rules are replaced by imports
  from the package. Its routes become wrappers. Its screens keep their markup
  and styles; only their imports change.
- It passes the values it uses today: salt `ringmaster-phone-sign-in`, purpose
  `ringmaster-phone-sign-in-auto`, IndexedDB `ringmaster-trusted-phone`,
  collections `phone_sign_in_requests` and `trusted_phones`, live origin
  `https://ringmaster.cirqueaflame.com`. The same salt keeps the trusted phone
  record valid, so Austen's phone stays trusted.
- Tests of the moved logic move into the package. Ringmaster keeps tests of its
  wiring: that each route reaches the package with its own store, auth check
  and settings.

## Flow Arts Composer

- Routes under `/api/phone-sign-in/` wrap the package. Adapters sit over the
  existing `FirestoreRest` client (a commit with an `updateTime` precondition
  is the conditional write), the service account authorizer (the
  `cloud-platform` scope for revocation) and the in-memory rate limiter.
- `verifyUser` verifies the ID token and then applies `requireAdmin`'s live
  check: the account exists, is not disabled, has not been revoked since the
  token's sign-in, and holds the admin claim. The ID token verifier gains
  `issuedAt`. On top of that, the package keeps Ringmaster's rule: the token
  comes from a Google sign-in and was issued within the last 5 minutes.
- The QR always opens `https://tkaflowarts.com/sign-in/<id>`. Every copy of the
  app writes to the same Firebase project (`the-kinetic-alphabet`), so the live
  site can approve a request from any of them.
- Values: salt `flow-arts-phone-sign-in`, purpose
  `flow-arts-phone-sign-in-auto`, IndexedDB `flow-arts-trusted-phone`,
  collections `phone_sign_in_requests` and `trusted_phones`.
- Firestore rules have no admin wildcard, so browsers already cannot read or
  write these collections. No rules deploy is needed.
- `/phone-sign-in`: the computer's page with the QR panel. It signs in and
  then goes to the page in `?next=` when that is a path on this site, otherwise
  to the home page.
- `/sign-in/[id]`: the phone's approve page in Flow Arts Composer's look, with
  the same states as Ringmaster's: loading, request with Approve and Deny, the
  different-connection warning with "Approve anyway", automatic approval, the
  done screen with "That wasn't me" and "Stop approving automatically", and
  each outcome. A signed-out phone gets the normal sign-in sheet and comes back
  to the request.
- The kill switch is `PHONE_SIGN_IN_DISABLED` in the Cloudflare environment.

## Delivery

1. The package: tests pass in its own worktree. Each app keeps a packed copy,
   `vendor/austencloud-phone-sign-in-0.1.0.tgz`, and installs it from there, so
   nothing is published to npm. A new version means packing it again and
   replacing the copy in both apps.
2. Ringmaster: its tests pass on the package; merged to cirque-aflame's local
   main. It changes on the live site only when Austen ships Ringmaster.
3. Flow Arts Composer: tests pass and the computer page and approve page are
   checked in a browser on a preview; merged to local main. The scan works only
   after Austen ships, because the QR opens the live site.

A request made on a local copy is approved and collected through the live
site's server, and the request's secrets are keyed from the service account's
private key. The local copy and the live site must therefore use the same
service account key. Both name `firebase-adminsdk-fbsvc@the-kinetic-alphabet`,
but only the first real scan from a local copy proves they hold the same key.
If it fails with an unknown or expired request while a live-site scan works,
the keys differ.

## Testing

- The package carries Ringmaster's tests for every moved module and route,
  run against the configuration interface instead of Ringmaster's mocks.
- Ringmaster: its remaining tests, plus a wiring test per route.
- Flow Arts Composer: adapter tests (the conditional write, the admin and
  token checks, the configuration values) and a browser check of both pages'
  signed-out states, the QR panel, and the hidden button on the live host.
- The end-to-end scan is Austen's own tap on his phone, after each ship.
