# Inbox concurrency and state audit — 2026-09-12 Opus batch

Scope: reproduced concurrency/state defects in `src/lib/shared/inbox` and its
tests. Two fixed, one reproduced and quarantined, two confirmed outside the
owned tree. No production data was written and no message was sent anywhere;
every result below comes from the repository's own test harnesses in this cloud
container.

| Field       | Value                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------ |
| Branch      | `claude/inbox-concurrency-fixes-7fu4t7`                                                    |
| Base SHA    | `c4be16199e390e8bdab766051a0042c7827b8d30` (`origin/main` at session start)                |
| Final SHA   | `FINAL_SHA_PLACEHOLDER`                                                                    |
| Owned paths | `src/lib/shared/inbox/**`, `tests/unit/messaging/message-delivery-activation-race.test.ts` |

Files changed:

- `src/lib/shared/inbox/components/InboxDrawer.svelte` (fix F1)
- `src/lib/shared/inbox/components/InboxDrawer.svelte.test.ts` (new, proves F1)
- `src/lib/shared/inbox/components/messages/MessageComposer.svelte` (fix F2)
- `src/lib/shared/inbox/components/messages/MessageComposer.svelte.test.ts` (one new case, proves F2)
- `tests/unit/messaging/message-delivery-activation-race.test.ts` (new, quarantined repro for A1)
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

---

## A1 (reproduced, NOT fixed) — a send during activation is erased from memory

**Severity: high where reachable; reachability inferred, not observed.** The
fix budget for this pass was two defects, so this one ships as a quarantined
red reproduction instead of a patch.

`message-delivery-state.svelte.ts:102-150`: `activate()` clears `outbox`, awaits
`listDrafts`/`listOutbox`, then **assigns** the loaded rows over whatever is in
memory. `queueMessage` only needs `activeUserId`, which `activate` sets
synchronously before its first await, so a send inside that window is written to
IndexedDB and then erased from the in-memory outbox. `flush()` reads the
in-memory list, so nothing delivers it this session; the durable row is picked up
only by a later activation (next app launch).

The composer cannot reach this — its textarea is disabled until
`messageDeliveryState.ready`. `SendAttachmentSheet.svelte:320` and
`ShareCollectionSheet.svelte` have no `ready` gate, so the reachable path is the
share flow firing while activation is still reading IndexedDB, e.g. a cold start
straight into the Android share target. That reachability is **inferred** from
the code; it was not observed at runtime.

### Evidence — measured

`tests/unit/messaging/message-delivery-activation-race.test.ts`
(`describe.skip`, red when unskipped): with `listOutbox` held open, a queued
message is present in `state.outboxFor(...)` before the gate opens, the durable
row `repository.outbox.has("message-1")` is still `true` afterwards, and then
`expected [] to have a length of 1 but got +0` — the in-memory row is gone and
`coordinator.deliver` is never called.

Candidate fix (unimplemented): merge the loaded rows with the in-flight ones by
id (loaded row wins) instead of assigning, and/or gate the share sheets' send
button on `ready` the way the composer already is.

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
participant, and the conversation pays 1 read + 1 write on every snapshot of an
app-root listener.

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
audit's H2 (`disposed`-flag pattern); it is left to that owner.

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

| Command                                                                                                                   | Result                                                                  |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `vitest run --config tests/config/vitest.components.config.ts src/lib/shared/inbox/components/InboxDrawer.svelte.test.ts` | 4 passed; 4 failed with base `InboxDrawer.svelte` restored              |
| `… MessageComposer.svelte.test.ts`                                                                                        | 13 passed; the new case failed with base `MessageComposer.svelte`       |
| `… src/lib/shared/inbox` (all inbox component tests)                                                                      | 45 passed, 4 failed — all 4 pre-existing, see limitations               |
| `vitest run --config tests/config/vitest.config.ts tests/unit/messaging tests/unit/inbox …`                               | 64 passed / 64 (15 files), plus 1 skipped quarantined file              |
| `pnpm run check:fast`                                                                                                     | 582 errors / 44 warnings — **identical at base**, none in changed files |
| `prettier --check` on the changed files                                                                                   | clean                                                                   |
| `eslint` on the changed files                                                                                             | clean (the `.svelte` and `tests/**` paths are eslint-ignored by config) |

Harness note: the container ships Chromium build 1194 at `/opt/pw-browsers`
while `playwright@1.61.1` expects 1228, so the browser project was run through a
scratchpad config that only overrides `launchOptions.executablePath`. No browser
was downloaded and no repository config was changed. `pnpm install
--frozen-lockfile` and `pnpm run build:packages` were needed first; the workspace
packages are not prebuilt in a fresh clone.

## Regressions and limitations

- **No regressions found.** Every pre-existing assertion in the touched files
  still passes, the inbox unit suites are green, and `check:fast` reports exactly
  the same 582/44 as the base SHA.
- **Pre-existing failures, not mine.** `SequenceMessageCard.svelte.test.ts` (1)
  and `InboxNotificationItem.svelte.test.ts` (3) fail identically with both
  changed source files reverted to base — an argument-shape mismatch in a viewer
  call and three navigation-route assertions. Left alone: they are other
  components' behaviour and another owner may be mid-change on them.
- **The drawer test clicks through the DOM**, not the browser driver: the
  drawer's entrance never reaches Playwright's "stable" condition in the runner,
  so `locator.click()` times out on controls that are already interactive. The
  same condition is the likely cause of the driver-based pre-existing failures
  above; that was not chased down.
- **Not verified in a real browser against real Firestore.** Everything here is
  the project's own jsdom and browser-project harnesses with fakes at the
  service boundary. Claims about what Firestore does with a write that
  re-triggers its own listener are _not_ made in this report; F1 and F2 are
  purely client-state defects and are proven at that level.
- **No visual verification, and none required.** Both fixes change subscription
  and persistence lifetime, not geometry or markup. A device/UI gate on the real
  app was not run and is not claimed.
- **A1 is unfixed on purpose** (two-fix budget). Its red test is quarantined with
  `describe.skip` and a pointer to this report; unskip it to drive the fix.
