# Inbox concurrency and state audit — 2026-09-12 Opus batch

Scope: reproduced concurrency/state defects in `src/lib/shared/inbox` and its
tests. Five fixed, two confirmed outside the owned tree. No production data was
written and no message was sent anywhere; every result below comes from the
repository's own test harnesses in this cloud container.

Revision history: the first pass (`ea203124`) shipped F1 and F2 and was held in
review for missing account ownership. This revision adds F3 (account ownership in
the drawer), F4 (account ownership in the composer), fixes A1 rather than leaving
it quarantined, and narrows the claims the review flagged as too broad.

| Field         | Value                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Branch        | `claude/inbox-concurrency-fixes-7fu4t7`                                                                                                    |
| Base SHA      | `c4be16199e390e8bdab766051a0042c7827b8d30` (`origin/main` at session start)                                                                |
| Held revision | `ea203124` (F1 + F2 only; review verdict HOLD)                                                                                             |
| Merged `main` | `6e4c1b5a388625d9c95f92e9a717f8ca2ab77f20` — merged in to stay current; it touches only an unrelated 3D parity test                        |
| Final SHA     | `69f6614fe09e553c40000770b92d32e006d926a7` — the correction commit; the branch tip after it only fills in this row and updates this report |
| Owned paths   | `src/lib/shared/inbox/**`, `tests/unit/messaging/message-delivery-activation-race.test.ts`, `tests/helpers/inbox/**` (both files new)      |

Files changed:

- `src/lib/shared/inbox/components/InboxDrawer.svelte` (fixes F1, F3)
- `src/lib/shared/inbox/components/InboxDrawer.svelte.test.ts` (new; 8 cases prove F1 and F3)
- `src/lib/shared/inbox/components/messages/MessageComposer.svelte` (fixes F2, F4)
- `src/lib/shared/inbox/components/messages/MessageComposer.svelte.test.ts` (3 new cases prove F2 and F4)
- `src/lib/shared/inbox/state/message-delivery-state.svelte.ts` (fix A1, 20 lines inside `activate()`)
- `tests/unit/messaging/message-delivery-activation-race.test.ts` (new; was quarantined, now green against the fix)
- `tests/helpers/inbox/reactive-account-double.svelte.ts` (new test helper)
- `tests/helpers/inbox/memory-delivery-repository.ts` (new test helper)
- `docs/reports/opus-batch-2026-09-12/inbox-concurrency.md` (this report)

Nothing else was touched. No instruction file, no `main`, no deploy, no package
publish, no emulator or live data.

---

## F1 (fixed) — a closed conversation's listener replaced the open thread

**Severity: high.** Wrong conversation's messages rendered inside the thread the
user is reading, plus a listener leak per distinct conversation visited.

### Mechanism

At base, `InboxDrawer.svelte:243-269` opened a thread like this:

```
handleConversationSelect(id)
  await conversationService.getConversation(id)
  inboxState.selectConversation(conversation)
  messagingService.subscribeToMessages(id, cb)   // :252 — return value DISCARDED
  await messagingService.markAsRead(id)
```

`subscribeToMessages` (`messaging/services/messenger.ts:314-382`) keys its
listeners by conversation id and only tears one down when the disposer it
returns is called. The drawer never called it: not on a thread switch, not on
back-to-list, not on tab toggle, not on close, not on destroy. Three consequences
followed, all reproduced:

1. The listener for a conversation the user had left stayed attached, and its
   next snapshot called `inboxState.setMessages(...)` — replacing the messages of
   the thread actually on screen with the left conversation's messages.
2. Every distinct conversation opened in a session left one Firestore listener
   attached for the life of the page.
3. Two rapid selections raced: whichever `getConversation` resolved LAST called
   `selectConversation`, so a slow first selection could swap the thread under
   the user after they had already opened another — and `markAsRead` was written
   for a conversation they never saw.

### Evidence — measured

`src/lib/shared/inbox/components/InboxDrawer.svelte.test.ts`, the real drawer
rendered in the browser project with a fake messenger that records each listener
and flips it inactive when its disposer runs.

Before the fix (base `InboxDrawer.svelte` restored under the new test file),
4 failed / 4:

| Test                                                            | Failure at base                                                      |
| --------------------------------------------------------------- | -------------------------------------------------------------------- |
| stops the previous thread's listener when another opens         | `expected true to be false` (listener still active)                  |
| keeps the open thread when a closed conversation gets a message | `expected [ "Paul's thread" ] to deeply equal [ "Morgan's thread" ]` |
| ignores a conversation load that resolves after a newer one     | `expected 'conversation-a' to be 'conversation-b'`                   |
| stops listening when the inbox closes                           | `expected true to be false`                                          |

The second row is the user-visible headline: Paul's message landed inside
Morgan's open thread.

After the fix: 4 passed / 4.

### The fix

The open thread owns exactly one listener. `stopThreadSubscription()` disposes it
and bumps a generation counter, and it runs on: a new selection, back, tab
toggle, group-left, destroy, and an `$effect` on `inboxState.isOpen` so a close
from anywhere (header button, Escape, a notification that navigates away, a
module switch, a dashboard widget) also ends the thread. The generation counter
is the second guard — a `getConversation` that resolves after a newer selection
no longer selects, subscribes, or marks as read, and a snapshot that arrives
around a teardown cannot write into a thread it no longer owns.

`inboxState.isOpen` was chosen over `currentView === "thread"` deliberately: the
view is still `"list"` for the whole window between the row tap and
`selectConversation`, so a view-driven teardown would cancel the selection it is
supposed to set up.

This much was the first pass. It fenced the thread against another _conversation_
and against a closed inbox, but not against a changed _account_ — F3.

---

## F2 (fixed) — an in-flight draft autosave landed on the next conversation

**Severity: high.** Silent loss of one thread's unsent text plus contamination of
another thread's draft, which then re-appears in the composer for the wrong
recipient.

### Mechanism

The composer debounces draft autosave by 300ms
(`MessageComposer.svelte:149-171` at base). The timer closed over the text but
read the conversation at write time: `saveDraftSnapshot` called
`messageDeliveryState.saveDraft(conversationId, ...)` (`:179`) with whatever the
prop held when the timer fired.

`MessageThread` is not keyed on the conversation, so switching threads changes
the composer's `conversationId` prop in place. On that change the autosave effect
re-runs and hits its own early return
(`hydratedConversationId !== activeConversationId`, then
`suppressDraftPersistence`) — which returns **without clearing the pending
timer**. The timer then fired against the newly opened thread.

Tapping back and opening another conversation inside 300ms is ordinary use, so
the result was: thread A's last text was never saved, thread B's real draft was
overwritten by it, and the next time B was opened the composer offered text
written for A with B's send button next to it.

### Evidence — measured

`MessageComposer.svelte.test.ts` → "saves an in-flight draft to the conversation
it was typed in". Fill the composer for `conversation-1`, rerender with
`conversation-2` inside the debounce window.

Before: 1 failed. The single `saveDraft` call was
`("conversation-2", { content: "Meant for the first thread", … })` — the text
went to the wrong thread and `conversation-1` was never written at all.

After: 13 passed / 13 in that file (12 pre-existing cases unchanged).

### The fix

The pending snapshot carries its own `conversationId`, and a thread switch
flushes it (to the thread it was captured for) before the composer rebinds. The
unmount path flushes instead of dropping it, except while editing, which matches
the previous behaviour of not persisting edit text as a draft.

The first pass commented that flushing a pending snapshot "is always safe because
it carries its own thread". That was wrong, and the review caught it: the thread
was only half the address. F4 carries the rest.

---

## F3 (fixed) — the open thread outlived the account that opened it

**Severity: high.** One account's conversation could stay on screen, keep
receiving snapshots, and collect a read receipt after a different account signed
in or the session ended. Raised by review of the first pass, then reproduced.

### Mechanism

At `ea203124` the drawer's auth effect switched the delivery user and nothing
else: it did not stop the thread subscription, did not bump `threadGeneration`,
and did not clear `selectedConversation`. So after an account change:

1. the previous account's message listener stayed attached and kept calling
   `setMessages`, including after sign-out;
2. a `getConversation` begun by the old account still resolved into
   `selectConversation`, opening its thread under the new one;
3. `markAsRead` was reached with no re-check, and the messenger resolves the
   current user _after_ its own await, so the read receipt could be written for
   whichever account happened to be live by then.

### Evidence — measured

Three new cases in `InboxDrawer.svelte.test.ts`, driven by a rune-backed account
double (`tests/helpers/inbox/reactive-account-double.svelte.ts`) — a plain
`vi.mock` object cannot wake the effect that reads `authState.user?.uid`.

| Test                                                                   | Failure at `ea203124`                               |
| ---------------------------------------------------------------------- | --------------------------------------------------- |
| drops a conversation load that finishes after another account signs in | `expected { id: 'conversation-a', … } to be null`   |
| drops the open thread when the signed-in account changes               | `expected true to be false` (listener still active) |
| ignores a snapshot that arrives after sign-out                         | `expected [ { … } ] to deeply equal []`             |

All three pass against the correction; the other five cases in the file are
unchanged and still pass.

### The fix

`threadOwner()` is the signed-in uid, and `ownsThread(generation, owner)` is
checked at **every** asynchronous resumption point: after the `getConversation`
await, inside the snapshot callback, immediately before `markAsRead`, and in the
catch. The auth effect now also detects an owner change, stops the subscription
(which bumps the generation, invalidating in-flight lookups) and clears the
selected conversation through `inboxState.backToList()`.

Two deliberate narrow choices:

- The **first** owner assignment is not treated as a change. Clearing on mount
  would tear down a share the app was launched into — `openAttachmentShare`
  stages its attachment before this effect first runs, and `backToList()` clears
  those fields.
- `backToList()` is only called when a conversation is actually selected, for the
  same reason.

### Residual, not fixed here

`messenger.markAsRead` reads the current user after its own `await`
(`messaging/services/messenger.ts:387-399`). The call is now fenced, so the
drawer cannot _start_ one for a superseded owner, but a call already past that
fence still resolves auth internally. Closing that needs the user id to be a
parameter of `markAsRead`, which is a messaging-service signature change outside
this pass's owned paths.

---

## F4 (fixed) — a pending draft could be filed under another account

**Severity: high.** The previous account's unsent text became the new account's
draft, and the composer kept showing it. Raised by review of the first pass, then
reproduced.

### Mechanism

F2 gave the pending snapshot a `conversationId`, but a draft id is
`<userId>:<conversationId>` (`getMessageDraftId`). The write went through
`messageDeliveryState.saveDraft`, which resolves `activeUserId` **live**, and the
composer's hydration key was the conversation alone. So an account change inside
the autosave window filed the old account's text under the new account's id, and
the hydration effect saw no change to re-read from the new ledger.

### Evidence — measured

`MessageComposer.svelte.test.ts`, using the real `createMessageDeliveryState`
with an in-memory ledger (`tests/helpers/inbox/memory-delivery-repository.ts`) so
`activeUserId` and `ready` are real runes:

- _"never writes a pending draft into another account's ledger"_. At
  `ea203124` the second account's ledger ended up holding
  `[ "Typed while the first account was signed in" ]` — its own draft,
  `"Second account's own draft"`, overwritten at `user-b:conversation-1`. With
  the assertions in their shipped order the same test fails on the re-hydration
  half instead (the composer kept showing the first account's text until the
  15-second timeout). Both halves are red at `ea203124`; green after.
- _"keeps a failed save for a closed thread out of the open thread"_. At
  `ea203124` the failure of the _previous_ thread's save rendered
  `"Draft not saved"` under the thread now on screen
  (`expected '… Draft not saved' not to contain 'Draft not saved'`). Green after.

### The fix

`DraftSnapshot` carries `ownerId` as well as `conversationId`.
`saveDraftSnapshot` drops a snapshot whose owner is no longer active — it can
only be written to the wrong ledger — and fences `draftSaveError` /
`draftFailureReported` behind the snapshot's own `<owner>:<conversation>` key, so
neither an older success nor an older failure can change the UI of the thread
now open. The hydration key is that same composite, so an account change
re-reads the composer from the new account's ledger.

**Accepted loss, stated plainly:** on an account switch the last ≤300ms of typing
is discarded rather than written. The state exposes no way to write a draft for a
non-active user, and keeping the text would mean filing it under the wrong
account. A thread switch still flushes (F2); only an owner switch drops.

---

## A1 (fixed this revision) — a send during activation was erased from memory

**Severity: high where reachable; reachability inferred, not observed.** The
first pass left this quarantined under a two-fix budget. Review asked for it to
be resolved inside inbox ownership, and `state/message-delivery-state.svelte.ts`
is inside it, so it is fixed rather than carried.

`activate()` cleared `outbox`, awaited `listDrafts`/`listOutbox`, then
**assigned** the loaded rows over whatever was in memory. `queueMessage` only
needs `activeUserId`, which `activate` sets synchronously before its first await,
so a send inside that window was written to IndexedDB and then erased from the
in-memory outbox. `flush()` reads the in-memory list, so nothing delivered it
that session; the durable row was picked up only by a later activation.

The composer cannot reach this — its textarea is disabled until
`messageDeliveryState.ready`. `SendAttachmentSheet.svelte:320` and
`ShareCollectionSheet.svelte` have no `ready` gate, so the reachable path is the
share flow firing while activation is still reading IndexedDB, e.g. a cold start
straight into the Android share target. That reachability is **inferred** from
the code; it was not observed at runtime.

### Evidence — measured

`tests/unit/messaging/message-delivery-activation-race.test.ts`, previously
`describe.skip`, now running: with `listOutbox` held open, the queued message is
present in `state.outboxFor(...)` before the gate opens, the durable row is still
there afterwards, and before the fix the in-memory row was gone
(`expected [] to have a length of 1 but got +0`) with `coordinator.deliver` never
called. Green after, and the nine pre-existing `message-delivery-state` cases are
unchanged and still pass.

### The fix

`activate()` merges instead of assigning: rows queued during the read win over
the snapshot, keyed by id. The same window can also promote a draft into the
outbox, and the snapshot predates that deletion, so a draft whose message was
promoted during the read is dropped rather than restored — otherwise the composer
would re-offer text whose message is already on its way out.

Gating the share sheets' send button on `ready` would also close the reachable
path. Not done: it changes share-sheet behaviour (a disabled Send at cold start)
rather than fixing the state bug, and the state bug is the defect.

---

## Confirmed, outside the owned tree — reported, not touched

### H4 from the Firestore cost audit — confirmed by reading

`origin/claude/firestore-cost-audit-8l6vvx` reports an inbox participant refresh
that never terminates. Independently confirmed from the code:
`conversation-mappers.ts:133-152` returns a uid to refresh whenever
`participantInfo.<uid>.username === undefined`, while
`refreshParticipantInfo` (`:167-175`) writes the `username` key only when
`userInfo.username !== undefined`, and `conversation-manager.ts:96-122` returns
`{ displayName: "Unknown User" }` with no `username` (`:121`) for a missing or
unreadable user document. The exit condition is therefore unsatisfiable for that
participant, so the conversation **attempts** one `getDoc` and one `updateDoc` on
every snapshot of an app-root listener, indefinitely.

Wording matters here and the first revision of this report got it wrong. What the
source proves is the repeated _attempt_: `previewNeedsRefresh` keeps returning the
same uid and `refreshParticipantInfo` keeps being called. It does not prove a
billed read and write per snapshot — for an unreadable document the `getDoc` may
be rejected by rules, the `updateDoc` may fail inside the swallowed `catch`
(`conversation-mappers.ts:176-181`), and Firestore's own caching and the SDK's
listener de-duplication sit in between. No billing was measured by this audit and
none is claimed. The cost-audit branch's own numbers are operation counts against
a mocked SDK, which is the same distinction.

Not fixed here, for three reasons: both files are in `src/lib/shared/messaging`,
outside this pass's owned paths; the cost audit already owns the finding and has
the measured repro, so a second patch would only collide with its branch; and the
substantive half of the fix changes `fetchUserInfo`'s error semantics (it has to
stop collapsing "document missing" and "read threw" into one return), which is a
messaging-service decision, not an inbox-state one. The fix belongs on that
branch.

Nothing inside `src/lib/shared/inbox` makes this defect worse or better. Its only
inbox-side consequence is extra snapshot churn through
`InboxSubscriptionProvider` → `setConversations`, which re-runs the drawer's
reconcile effect; that effect is a no-op when no outbox row matches.

### Residual in `subscribeToMessages`' own disposer

`messenger.ts:374-381` returns a disposer that looks the listener up in a map the
async IIFE has not necessarily populated yet. Calling it during that window
unsubscribes nothing and the `onSnapshot` attaches afterwards. F1's generation
guard means such a listener can no longer write into the wrong thread — the
user-visible defect is closed — but the listener itself can still leak on a very
fast switch. That line is in `messaging`, and it is the same class as the cost
audit's H2 (`disposed`-flag pattern); it is left to that owner. The new test
"keeps the live listener when the same conversation is reopened" pins the other
half of this hazard from the inbox side: because the disposer resolves by
conversation id, tearing down a stale listener must not take a live listener for
the same conversation with it. That test passes both before and after this
revision — it is a guard, not a reproduction.

---

## Examined and found correct — do not "fix" these

- **Optimistic vs acknowledged duplicates.** `MessageThread.svelte:93-106` filters
  outbox rows whose id is already in the server snapshot, and outbox ids are the
  message ids (`queueMessage` uses the image attachment's `messageId` or a minted
  id). A delivered-but-unreconciled row cannot render a second bubble.
- **`reconcile` against an in-flight delivery.** `deliverOne` re-reads the row
  after every await and returns when it is gone, so a snapshot that reconciles a
  message mid-send does not resurrect or re-deliver it.
- **Manual retry during a send.** `retry()` refuses `sending`/`sent`, and
  `deliverOne` moves `queued → sending` synchronously before its first await, so
  a manual retry cannot double-deliver.
- **Flush coalescing.** `requestFlush`'s `flushRequested` latch and the
  `activation` token checks in `deliverOne` behave correctly across
  `deactivate()` and sign-out; the interrupted-persistence path returns
  `sending` rows to the idempotent queue.
- **`setMessages` clearing a stale edit target** (`inbox-state.svelte:366-377`)
  already handles a message deleted under an open edit.

---

## Commands and results

All run in the cloud container at the final SHA unless noted.

| Command                                                                                     | Result                                                                                                   |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `vitest run --config tests/config/vitest.components.config.ts …/InboxDrawer.svelte.test.ts` | 8 passed. With `ea203124`'s drawer restored: 3 failed (F3). With the base drawer: 4 failed (F1)          |
| `… /MessageComposer.svelte.test.ts`                                                         | 15 passed. With `ea203124`'s composer: 2 failed (F4). With the base composer: 1 failed (F2)              |
| `… src/lib/shared/inbox` (all inbox component tests)                                        | 51 passed, 4 failed — the same 4 that fail at the base SHA, see limitations                              |
| `vitest run --config tests/config/vitest.config.ts tests/unit/messaging`                    | 19 passed / 19, including the un-quarantined activation-race case (red before the A1 fix)                |
| `vitest run --config tests/config/vitest.config.ts tests/unit/messaging tests/unit/inbox …` | 65 passed / 65 (16 files), nothing skipped                                                               |
| `pnpm run check:fast`                                                                       | 582 errors / 44 warnings — **identical at the base SHA**, none in the changed files                      |
| `prettier --check` on the changed files                                                     | clean                                                                                                    |
| `eslint` on the changed files                                                               | 0 errors (the `.svelte` and `tests/**` paths are eslint-ignored by config, which it reports as warnings) |

Harness note: the container ships Chromium build 1194 at `/opt/pw-browsers`
while `playwright@1.61.1` expects 1228, so the browser project was run through a
scratchpad config that only overrides `launchOptions.executablePath`. No browser
was downloaded and no repository config was changed. `pnpm install
--frozen-lockfile` and `pnpm run build:packages` were needed first; the workspace
packages are not prebuilt in a fresh clone.

## Regressions and limitations

- **No regression was observed in the suites that were run.** Every pre-existing
  assertion in the touched files still passes (12 in the composer, 9 in the
  delivery state), the inbox unit suites are green, and `check:fast` reports
  exactly the same 582/44 as the base SHA with no error in a changed file. That is
  the evidence; it is not a claim that the change cannot regress anything
  unexercised — in particular nothing here was run in a real browser against real
  Firestore, and no account switch was exercised on a device.
- **Deliberate behaviour changes**, each narrower than the defect it closes:
  - an account switch discards the last ≤300ms of typing rather than filing it
    under the wrong account (F4);
  - an account change clears the selected conversation and so returns the drawer
    to its list (F3);
  - a draft whose message was promoted into the outbox during activation is no
    longer restored to the composer (A1).
- **One new test is a guard, not a reproduction.** "keeps the live listener when
  the same conversation is reopened" passes at `ea203124` as well as after. It
  pins the map-keyed-disposer hazard described below; it did not find a defect,
  and it is listed as a guard rather than counted as a fix.
- **Pre-existing failures, not mine.** `SequenceMessageCard.svelte.test.ts` (1)
  and `InboxNotificationItem.svelte.test.ts` (3) fail identically with the changed
  source files reverted to base — an argument-shape mismatch in a viewer call and
  three navigation-route assertions. Left alone: other components' behaviour, and
  another owner may be mid-change on them.
- **Residuals left to the `messaging` owner**, both named above with line
  references: `markAsRead` resolving auth after its own await, and
  `subscribeToMessages`' disposer losing an unsubscribe issued before its async
  attach completes. Each needs a messaging-service change; the inbox-side fences
  mean neither can now write into the wrong thread, but the listener leak and the
  late receipt remain possible.
- **The drawer test clicks through the DOM**, not the browser driver: the drawer's
  entrance never reaches Playwright's "stable" condition in the runner, so
  `locator.click()` times out on controls that are already interactive. The same
  condition is the likely cause of the driver-based pre-existing failures above;
  that was not chased down.
- **Two new test helpers duplicate an existing in-memory ledger.**
  `tests/unit/messaging/message-delivery-state.test.ts` has its own copy of the
  memory repository. It was left untouched rather than refactored, to avoid
  churning a file another session may be editing; the helper's doc comment records
  that.
- **No visual verification, and none required.** Every change is subscription,
  ownership and persistence lifetime — no geometry, markup or styling. A
  device/UI gate on the real app was not run and is not claimed.
