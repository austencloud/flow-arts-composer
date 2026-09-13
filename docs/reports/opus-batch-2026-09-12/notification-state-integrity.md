# Notification state integrity — subscription and registration lifetimes

Date: 2026-09-13. Branch: `claude/notification-state-integrity-t5l2ay`.
Base: `6e4c1b5a` (`origin/main`, "Merge pull request #49 from austencloud/claude/ember-parity-timeout").
Code commit: `6c17c7f5`. Final commit: `4cff5bb1`, which adds this report and
applies Prettier formatting to the two new test files — no behavior changed
after `6c17c7f5`.

Assignment: investigate and fix up to two reproduced notification state /
read-marker races. Audit-only for everything else. No push sends, no real
subscription endpoints, no auth-service changes, no server billing or history
truncation.

## Scope boundary

The brief assigns `shared/notifications` and `shared/push` client state,
services, and tests, and reserves `shared/inbox` for another agent.

`src/lib/shared/notifications/` turned out to be a 10-line re-export shim
(`notification-models.ts` forwards to `$lib/shared/feedback/domain/models/…`).
The notification client service itself lives at
`src/lib/shared/feedback/services/notifier.ts` and is consumed from
`shared/inbox`. Since that service _is_ the notification subscription and
read-marker owner, it is treated as in-domain for this task. Nothing under
`src/lib/shared/inbox/` was edited; it was read only, to establish how the
service is actually used.

### Files owned by this change

| File                                                                  | Change        |
| --------------------------------------------------------------------- | ------------- |
| `src/lib/shared/feedback/services/notifier.ts`                        | Fix 1         |
| `src/lib/shared/push/services/fcm-token-manager.ts`                   | Fix 2         |
| `tests/unit/notifications/notification-subscription-lifetime.test.ts` | New (5 cases) |
| `tests/unit/push/android-registration-listener-lifetime.test.ts`      | New (4 cases) |
| `docs/reports/opus-batch-2026-09-12/notification-state-integrity.md`  | This report   |

## Fix 1 — a notification subscription did not own its own lifetime

**Where:** `src/lib/shared/feedback/services/notifier.ts`,
`Notifier.subscribeToNotifications` / `cleanup`.

**Before.** The class held one `private unsubscribe: (() => void) | null`.
`subscribeToNotifications` returned a disposer immediately, but only assigned
`this.unsubscribe` inside an async IIFE, after `await getFirestoreInstance()`.
The returned disposer was `() => { if (this.unsubscribe) this.unsubscribe(); }`
— it ended whatever listener was current at call time, not its own, and it did
not clear the field.

**Failure paths (both reachable from the one live consumer,
`src/lib/shared/inbox/components/InboxSubscriptionProvider.svelte:66-98`, whose
`$effect` subscribes per effective user id and disposes in effect cleanup):**

1. _Disposed before registration._ Sign-out, or a user-preview switch, while
   `getFirestoreInstance()` is still pending: the disposer sees `null`, does
   nothing, and the IIFE then attaches an `onSnapshot` listener that no one
   holds a handle to. It keeps calling back into
   `inboxState.setNotifications(...)` with the **previous account's**
   notifications, which drives the inbox list and the nav badge. Nothing in the
   UI surfaces this — the list just shows the wrong user's items.
2. _Cross-subscription teardown._ A disposer that runs after another
   subscription became current tears that one down instead of its own, leaving
   the consumer that owns it silently without notifications.

**After.** Each call captures its own `disposed` flag and `detach` handle. The
disposer ends exactly its own subscription and is safe before registration
(the IIFE re-checks `disposed` after the await and skips attaching). A disposed
subscription delivers nothing — no snapshot callback, no error toast for a
listener nobody owns. `cleanup()` now ends every live subscription rather than
just the most recent.

**Behavior change to note:** subscribing no longer implicitly supersedes the
previous subscription. Both call sites (`InboxSubscriptionProvider`, and the
currently unreferenced `createNotificationState.init()`) already dispose before
re-subscribing, so the live listener count is unchanged (verified by grep for
`subscribeToNotifications` consumers). See Risks.

## Fix 2 — native Android registration listeners were never removed

**Where:** `src/lib/shared/push/services/fcm-token-manager.ts`,
`FCMTokenManager.registerNativeAndroidToken`.

**Before.** Every call added a `registration` and a `registrationError`
Capacitor listener with `void PushNotifications.addListener(...)` — the handle
was discarded, so nothing was ever removed. Capacitor listeners are
process-global, and `registerToken` runs once per effective user
(`InboxSubscriptionProvider.svelte:114-125` re-runs it whenever the effective
user id changes, including preview mode and remount).

**Failure path.** Register as user A (listeners L1 attached, never removed),
then register as user B (L1 + L2 attached). `PushNotifications.register()`
emits its registration event to every attached listener, so L1 — still holding
`userId = "user-a"` — writes this device's **current** token into
`users/user-a/fcmTokens/…`. The signed-out account stays subscribed to this
device and keeps receiving its push notifications. Each stale listener also
runs its own `storeToken` write plus a `pruneStaleDeviceTokens` collection
read, so the Firestore cost of a registration grows with the number of
registrations in the session.

**After.** Both listeners are awaited, tracked, and removed before the attempt
resolves — on success, on registration error, and on a thrown registration
call. `finish()` resolves only after removal, so a caller's next registration
starts from a clean slate.

## Proof

Both suites were written against the unfixed code first.

| Suite                                                                 | Before fix         | After fix |
| --------------------------------------------------------------------- | ------------------ | --------- |
| `tests/unit/notifications/notification-subscription-lifetime.test.ts` | 4 failed, 1 passed | 5 passed  |
| `tests/unit/push/android-registration-listener-lifetime.test.ts`      | 3 failed, 1 passed | 4 passed  |

Pre-fix failures, verbatim:

```
× attaches no listener when disposed before registration completes
    AssertionError: expected [ { next: [Function], …(2) } ] to have a length of +0 but got 1
× keeps other subscriptions alive when one is disposed
    AssertionError: expected true to be false      (listenerB.detached after disposing A)
× delivers nothing after its disposer runs
    AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
× ends every live subscription on cleanup()
    AssertionError: expected [ …(1) ] to have a length of 2 but got 1
× leaves no listener attached after a registration settles
    AssertionError: expected 1 to be +0
× does not write a later registration into the previous user's account
    AssertionError: expected [ …(2) ] to have a length of 1 but got 2
    (the extra write targeted users/user-a/fcmTokens/… while registering user-b)
× reports failure without leaving its listeners attached
    AssertionError: expected 1 to be +0
```

The cases that passed before the fix (`still delivers snapshots for a live
subscription`, `registers the token for the requesting user`) are the
no-regression anchors: the tests fail for the race, not for the happy path.

Both suites use deterministic doubles around the real service code — a
controllable `getFirestoreInstance` deferral and a listener-registry double for
`@capacitor/push-notifications`. No network, no Firebase project, no real
subscription endpoint, no push send.

### Commands run

```
npx vitest run --config tests/config/vitest.config.ts \
  tests/unit/inbox tests/unit/notifications tests/unit/push \
  tests/unit/inbox-notification-navigation.test.ts
→ 11 files, 45 tests passed

npm run check:tsc
→ 1 owned diagnostic, identical on this branch and on main (measured by
  checking out main and re-running):
  src/lib/features/community/get-geocoding-service.ts(4,10): TS2305
  '$env/static/public' has no exported member 'PUBLIC_GOOGLE_MAPS_API_KEY'
  — a missing env var in this cloud container, unrelated to these files.

npm run check:fast
→ 582 pre-existing conversion errors project-wide; none reference the changed
  files. `check:tsc` is the meaningful gate for plain-TS changes.
```

## Audited, not changed

All read-only. Each claim below is labelled by how it was established.

- **Mark-all-read vs a new arrival (live path): no defect found.** _Measured by
  code reading._ `InboxDrawer.svelte:163-179` fires
  `notificationService.markAllAsRead(userId)` and applies no local optimistic
  write; the inbox list is only ever set from a snapshot
  (`inbox-state.svelte.ts:379`). `Notifier.markAllAsRead` marks exactly the docs
  its `where("read","==",false)` query returned, so a notification that arrives
  after that query stays unread on the server, arrives unread in the next
  snapshot, and re-triggers the drawer's effect. The server and the client agree.
- **Optimistic read/unread rollback: latent, in dead code.** _Measured._
  `src/lib/features/feedback/state/notification-state.svelte.ts` applies its
  optimistic `read: true` mapping _after_ awaiting a service call that swallows
  every error (`Notifier.markAsRead` catches and logs), so a failed write leaves
  the UI permanently claiming "read" with no rollback and no further snapshot to
  correct it; `markAllAsRead` there also blanket-marks notifications that
  arrived after the server query. `createNotificationState` has no importers
  (grep across `src/`), so neither can occur in the product today. Not fixed:
  there is no consumer to verify against, and changing it would be an
  unverifiable edit to unused code. Deleting it is a separate call.
- **Duplicate event delivery.** _Measured._ The only duplicate delivery found is
  the Android registration replay in Fix 2. The foreground toast path
  (`push/services/foreground-message-handler.ts`) and the background
  `showNotification` path (`static/firebase-messaging-handler.js:28`) are
  mutually exclusive by FCM's foreground/background dispatch, and the foreground
  listener is already guarded by a generation counter against its own
  start/stop race.
- **Permission-denied recovery: open followup.** _Measured code behavior,
  inferred impact._ On a `permission-denied` snapshot error the handler returns
  silently (correct at sign-out) and Firestore terminates the listener; nothing
  re-subscribes. A transient denial — rules propagation, a claim refresh —
  would therefore freeze the inbox at its last snapshot with no user-visible
  signal until the effective user id changes or the app reloads. I have no
  evidence this happens in production, so it is not treated as a proven defect.
  A fix needs a product decision (retry with backoff, or a visible stale-state
  affordance).
- **Unread invariant.** _Measured._ The client treats a notification as unread
  when `!n.read` (`inbox-state.svelte.ts:49`), while server-side reads use
  `read == false`. These disagree for a document with no `read` field, which
  would be counted in the badge but never matched by mark-all-read. Every writer
  in the repo sets `read: false` explicitly (client trigger service,
  `firebase-functions/src/social/onFollowChange.ts`,
  `firebase-functions/src/pulse/notifyAdmins.ts`, scripts), so the invariant
  holds today. Stated here as the invariant to preserve, not as a defect.

## Risks

- **Subscriptions no longer supersede each other** (Fix 1). Today's only live
  consumer disposes before re-subscribing, so the live listener count is
  unchanged. If a future caller subscribed twice without disposing, the old
  code silently killed the first listener; the new code keeps both, which costs
  a second Firestore listener. The explicit disposer and `cleanup()` are the
  supported way to end one.
- **Fix 2 resolves after listener removal.** `registerToken` now awaits two
  `addListener` promises and the `remove()` calls before resolving. If a
  Capacitor version returned a handle whose `remove()` never settles,
  registration would hang; `remove()` rejections are already swallowed, and the
  promise the caller awaits is unchanged in shape (`string | null`).
- Both changes are in the shared notification/push services that
  `shared/inbox` consumes. The public signatures are unchanged, so a concurrent
  inbox change should merge without conflict.

## Limitations

- No runtime/browser observation. This is a cloud container with no dev server
  and no Firebase credentials; every claim above is from code reading plus the
  deterministic unit suites, not from the running app.
- The component (browser) suite could not run here: the vitest browser project
  wants Playwright chromium build 1228 and the image provides 1194
  (`npx playwright install` is out of bounds in this environment). The one
  relevant component test,
  `src/lib/shared/inbox/components/InboxSubscriptionProvider.svelte.test.ts`,
  mocks `notificationService` wholesale, so it exercises the provider's wiring
  rather than the code changed here.
- Fix 2's failure mode depends on Capacitor invoking every attached listener for
  an event. That is the plugin listener contract and is what the test double
  implements; it was **not** observed on a physical Android device. The leak
  itself — handles discarded, listeners never removed — is directly visible in
  the pre-fix source.

## Followups (not done, not authorized here)

1. Decide the fate of `createNotificationState`
   (`src/lib/features/feedback/state/notification-state.svelte.ts`): delete it,
   or fix its optimistic-update rollback and give it a consumer.
2. Decide permission-denied recovery policy for the notification subscription
   (see above).
3. `Notifier.markAsRead` / `markAsUnread` swallow write failures and return
   `void`, so no caller can react to a read-marker that did not persist. If a
   surface ever needs optimistic read state, that signature has to change first.
