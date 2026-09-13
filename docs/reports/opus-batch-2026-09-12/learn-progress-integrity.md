# Learn progress persistence and state integrity

Date: 2026-09-13. Domain: Learn progress/checkpoint services and state under
`src/lib/features/learn`. Branch: `claude/learn-progress-defects-3p215o`.

Base SHA: `6e4c1b5a388625d9c95f92e9a717f8ca2ab77f20` (equal to `origin/main` at
the start of this task). `origin/main` has since moved to `cb4d4210`, which
changes nothing under `src/lib/features/learn` — `git diff 6e4c1b5a cb4d4210 --
src/lib/features/learn` is empty — so this branch's base is still current for
its own paths.

Code commits: `3a24958b` (round 1), `5c728b15` (round 2), `76dc5e92` (round 3).
Each report commit follows its code commit, so the branch tip is docs-only.

## Owned files

| File                                                                       | Change                                                       |
| -------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `src/lib/features/learn/services/concept-progress-tracker.ts`              | Defects 1–3, 5                                               |
| `src/lib/features/learn/services/concept-progress-tracker.test.ts`         | New; 26 cases                                                |
| `src/lib/features/learn/services/user-knowledge-profile-persister.ts`      | Defect 4 (subscription cancellation), plus a prettier reflow |
| `src/lib/features/learn/services/user-knowledge-profile-persister.test.ts` | New; 6 cases                                                 |
| `docs/reports/opus-batch-2026-09-12/learn-progress-integrity.md`           | This report                                                  |

Nothing else was touched. Lesson content, curriculum, exercise design, quiz
interactions, auth, library, account upgrade and settings sync were left alone.

The persister carries five pre-existing lines that prettier reformats (a brace
on its own line, three long ternaries, one long assignment). `npm run lint`
runs `prettier --check .`, so an edited file has to come out formatted; those
reflows are whitespace only. Other unformatted files in the same directory
(`quiz-history-recorder.ts`, `types.ts`, …) were left alone.

## Contracts inspected before changing anything

- `ConceptProgressTracker` (`services/concept-progress-tracker.ts`) — dual-write
  owner: localStorage `tka_learning_progress` plus Firestore through the
  persister, `lastUpdated` last-writer-wins, subscriber fan-out.
- `UserKnowledgeProfilePersister` (`services/user-knowledge-profile-persister.ts`)
  — `setDoc(..., { merge: true })` on `users/{uid}/learningProgress/current`,
  `onSnapshot` for cross-device sync, Map/Set serialized to object/array.
- `LearningProgress` / `ConceptProgress` (`domain/types.ts`) and
  `isConceptUnlocked` (`domain/concepts.ts`, currently a deliberate
  always-`true` stub with a `TODO(learn-unlock)`).
- Consumers: `ConceptPathView.svelte`, `ConceptDetailView.svelte`,
  `TikaModule.svelte`, `services/concept-recommender.ts`.
- Play arcade counterpart: `play/services/play-progress-store.ts`,
  `play/domain/progression.ts`, `data/firestore-paths.ts`.
- Experience checkpoints: `state/experience-persistence.svelte.ts`.

Definition of completed, as the code already enforces it and as this change
preserves it: a concept is completed when its id is in
`progress.completedConcepts`. That set is what gates unlocking, what
`overallProgress` and every badge threshold count, and what TIKA and the
recommender read. `concepts.get(id).status === "completed"` is the same fact
expressed for rendering. No gate, threshold or pedagogy was altered.

## Defect 1 — a completed lesson can render as unstarted

`getConceptStatus` consulted only the per-concept record and then fell through
to `isConceptUnlocked` (always `true`) → `"available"`. It never consulted
`completedConcepts`. Because nothing inside the class can make the two records
disagree, the contradiction only arrives with hydrated state, and both
directions are reachable:

- **Set without record.** A write that adds ids to `completedConcepts` without
  leaving a per-concept record. `services/user-knowledge-profile-persister.ts`
  reads `data.concepts` and yields an empty Map when the field is absent, so the
  loaded document carries the completions and no records.
- **Record without set.** `completedConcepts` serializes as an array, and an
  array is replaced wholesale by a `merge: true` write. A client that writes a
  shorter array leaves the older `concepts.<id>` records behind (the concepts
  field is a map and merges key-by-key).

Observable result in the UI, read from the current components rather than from
a browser run: `ConceptPathView.svelte:251` renders each `ConceptCard` from
`getConceptStatus`, while `CategoryHeader`'s count and `completedAvailableCount`
(`ConceptPathView.svelte:43`) come from `progress.completedConcepts`. The two
disagree on screen. Worse, `currentConcept()` (`ConceptPathView.svelte:87`)
picks the first concept whose status is `"available"`, so "Continue" points the
user back into a lesson they already finished, and `ConceptDetailView`'s
`isCompleted` stays false so scroll mode never unlocks.

**Fix.** One private `reconcileCompletion(progress)` runs on every hydrated
snapshot — localStorage load, the document adopted at sign-in, each live
snapshot, and `importProgress`. It takes the union of the two records:
completion is never revoked, a missing record is synthesized as completed at
100%, and an existing record keeps its own stats while its status and
percentage are raised. Everything downstream of that union is then re-derived
rather than trusted, through the class's own owners (`updateOverallProgress`
and `checkBadges`, both parameterized so they can run on progress that is not
yet `this.progress`):

- `overallProgress` is recomputed unconditionally. The first round only
  recomputed it when the set _grew_, which left the commonest shape wrong:
  `completedConcepts: ["grid"]` with no record and a stored `overallProgress`
  of 0 kept the 0, because reconciliation added the record, not the id.
- A record already marked completed has `percentComplete` set to 100. The first
  round only wrote 100 when it had to change the status, so a stored
  `{status: "completed", percentComplete: 40}` kept the 40.
- Badges are recomputed. `checkBadges` was previously only reachable from
  `completeConcept`, so completions arriving from a document (the server-side
  TIKA writer never touches `badges`) never crossed a threshold. The function
  is additive by contract — it unions into the stored list and never revokes —
  so recomputing cannot take a badge away, and every threshold reads the
  reconciled set, which is exactly what the normal write path would have used.

`recordPracticeAttempt` now floors `percentComplete` at its previous value,
because a reconciled record has no answer counts behind its 100 and practising
a finished lesson again must not walk it back to 10%. For a normally tracked
concept that floor is a no-op — `correctAnswers` only grows.

## Defect 2 — a failed sign-in load wrote un-merged local state over the server's

`initializeForUser` set `this.userId` and `this.initialized` _before_ awaiting
`loadProgress`. Two consequences, both from a single ordinary trigger (offline
sign-in, a permission hiccup, a transient Firestore error):

1. **Remote overwrite.** `saveProgress()` writes whenever `persister && userId`
   are set. With `userId` set before the load, every completion recorded after
   a _failed_ load was pushed to Firestore even though the merge never
   happened. Since `completedConcepts` is an array and an array is replaced by a
   merge write, a fresh install whose sign-in load failed replaced the server's
   completion list with its own — every completion earned on another device,
   gone on the first lesson finished here.
2. **Permanent latch.** With `initialized` already `true`, the early return
   `if (this.initialized && this.userId === userId) return;` blocked every later
   attempt for the rest of the session, and the code after the `await` never
   ran, so `subscribeToProgress` was never called. The promise also rejected
   into `TikaModule.svelte:145`, which calls it un-awaited — an unhandled
   rejection.

**Fix.** The async body moved to a private `connectUser`. `this.userId` and
`this.initialized` are now assigned only after the merge settles, so remote
writes stay disabled until the tracker has seen the server's document; local
writes are unaffected and the next successful attempt pushes them. A failure is
logged, resets both flags, tears down any subscription, and resolves — the
method now documents that it never rejects, matching its only caller.
Concurrent calls for the same user share one in-flight attempt through a stored
promise, which also covers the `$effect` re-running.

Side effect worth noting: this narrows, but does not close, the cross-account
issue in the follow-ups below — a failed load for user B can no longer push
user A's local progress into B's document.

## Defect 3 — a superseded sign-in attempt could land on top of the current one

Found by review of the first round, and reproduced here. `initializeForUser`
returns early only for the _same_ user, so signing in as B while A's load is
still in the air starts a second attempt rather than replacing the first. Both
attempts then resumed after their awaits and wrote to the same fields, in
completion order rather than call order. With A slower than B, the recorded
sequence was `subscribe:user-b`, `unsubscribe:user-b`, `subscribe:user-a`, and
`this.userId` ended as A: user B, the account actually signed in, was left
watching nothing while B's completions were written to A's document. The same
hole existed for `disconnect()` — it cleared the flags but nothing stopped an
in-flight attempt from resuming afterwards and re-connecting the account that
had just signed out.

**Fix.** A monotonic `syncGeneration`, bumped by every new attempt and by
`disconnect()`. An attempt captures its generation and checks it after each
await, before assigning `userId`/`initialized`, before subscribing, and inside
the snapshot and error callbacks; a superseded attempt returns without touching
state (including in its `catch`, so a stale failure cannot disconnect the user
who took over). The `finally` that clears the in-flight bookkeeping is
generation-guarded too, so a late attempt cannot erase its successor's promise.

## Defect 4 — an unsubscribe during setup could not cancel the listener

Also from review. `UserKnowledgeProfilePersister.subscribeToProgress` sets up
asynchronously — `getDocRef` awaits the Firestore instance — but its cancel
function only knew how to call a stored `unsubscribe`. For the whole setup
window nothing is stored, so cancelling there cancelled nothing: `onSnapshot`
was registered afterwards and stayed live, delivering one account's document
into a callback its owner believed was torn down. The single `this.unsubscribe`
field made it worse: two overlapping subscriptions shared it, so the first
one's cancel could tear down the second's listener.

**Fix.** Each call owns a `cancelled` flag and its own snapshot handle. The
flag is checked before registering the listener and inside the snapshot and
error callbacks, and only the call that is still the persister's active one
clears the shared pointer. The tracker's generation guard covers the same seam
from the other side; both are needed, because the tracker cannot see the
persister's setup window and the persister cannot see whose session it is.

## Defect 5 — a switch window that wrote to the account being left

Found by review of the round-2 commit, and self-inflicted: the fix for Defect 2
moved `this.userId = userId` to _after_ the load, and the fix for Defect 3
bumped the generation when a different user's sign-in began — but neither
cleared the old `userId`. So between `initializeForUser(B)` and B's load
resolving, `this.userId` was still A while `saveProgress()` only checks that it
is set. Any Learn action in that window wrote to A's document.

This one is a regression, not a pre-existing defect: the base code assigned
`this.userId = B` synchronously, so the same window wrote to B. It is narrower
than what Defect 2 fixed (which wrote un-merged state to the _current_ user's
document) but it points at the wrong account, which is worse per write.
Reproduced as `expected [ 'user-a' ] to deeply equal []` on `5c728b15`.

**Fix.** A switch to a different user now retires the previous account's
ownership synchronously, before the new load is awaited: one
`retireRemoteOwnership()` (cancel the subscription, `userId = null`,
`initialized = false`), which the failure path and `disconnect()` share as a
single owner. The window is now write-free rather than misdirected — local
writes continue and the new user's first successful merge pushes them, exactly
as Defect 2's fix intends. The generation guards are untouched; this only
changes _when_ the outgoing user stops being the write target.

Note on what this does **not** fix: the progress cached in `localStorage` is
not namespaced per account, so work done during the window is still pushed to
whoever connects next. That is follow-up 2 below, unchanged in scope by this
fix — it is a storage-key question, not a race.

## Verification

All measured on this branch in this cloud checkout, not inferred.

Both suites were run against every prior state of this branch as well as the
current one. Only the source file under test was swapped; the tests are the same
file in every column.

| Check (`npx vitest run --config tests/config/vitest.config.ts …`)                    | base `6e4c1b5a` | round 1 `3a24958b`   | round 2 `5c728b15` | current       |
| ------------------------------------------------------------------------------------ | --------------- | -------------------- | ------------------ | ------------- |
| `src/lib/features/learn/services/concept-progress-tracker.test.ts` (26 cases)        | 17 failed       | 10 failed            | 1 failed           | **26 passed** |
| `src/lib/features/learn/services/user-knowledge-profile-persister.test.ts` (6 cases) | 3 failed        | 3 failed (untouched) | —                  | **6 passed**  |
| `src/lib/features/learn` (whole feature)                                             | —               | —                    | —                  | **38 passed** |

Failure-to-finding map:

- **Round 1 → 10 tracker failures.** 4 race/disconnect cases (Defect 3), 3
  derived-value cases (`overallProgress` from the set, a completed record's
  100%, badges), 2 remote-adoption cases whose `overallProgress` assertion the
  round-1 reconciliation did not satisfy, and the Defect 5 window (which round
  1 also had, for the same reason).
- **Round 2 → 1 tracker failure.** Exactly the Defect 5 window:
  `expected [ 'user-a' ] to deeply equal []` on the list of save targets.
- **Base and round 1 → 3 persister failures.** Defect 4's three seams: no
  listener after a cancel during setup, a snapshot dropped after cancel, and one
  subscription's cancel not reaching the next one's listener.

The Defect 5 pair is deliberately asymmetric: the success-path test reproduces
the regression, while the failure-path one
(`does not write to the previous user when the switch is to a load that fails`)
passes on `5c728b15` too — that branch already cleared `userId` in its `catch`.
It is a pin, not a reproduction, and it is kept so the two switch outcomes stay
covered together.

The cases that pass on the older code are deliberate regression pins — normal
percentage tracking, a shared load for concurrent same-user calls, newer-remote
wins, local-newer is pushed, writes still reach Firestore after a successful
sign-in, a live snapshot is still delivered, an already-registered listener is
still torn down.

| Other gate                                         | Result                                                               |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| `npx eslint` on the four changed source/test files | clean                                                                |
| `npx prettier --check` on all five owned files     | clean                                                                |
| `npm run check:fast`                               | 645 errors / 44 warnings project-wide, **none** naming an owned file |

The 645 `check:fast` diagnostics are pre-existing and live in files this branch
does not touch (the learn ones are in `Type1ConceptExperience.svelte`,
`PlacementComparison.svelte`, `RotationDirectionConceptExperience.svelte`,
`CategoryHeader.svelte`, `concept-place-registry.ts`,
`concept-place-routes.ts`). The count is identical to the round-1 run, and zero
diagnostics name an owned file; I did not run the gate on the base commit to
produce an independent baseline.

### What is measured, what is mocked, what is inferred

- **Measured.** Every assertion above ran against the real
  `ConceptProgressTracker` and the real `TKA_CONCEPTS` / `isConceptUnlocked`
  domain module, under the project's own Vitest config (jsdom, real
  `localStorage`).
- **Mocked.** In the tracker suite the persister is a hand-written double
  exposing the three methods the tracker uses (`loadProgress`, `saveProgress`,
  `subscribeToProgress`), logging `subscribe:`/`unsubscribe:`/`save:` per user
  id so ownership after a race is asserted on an ordered event log rather than
  on a flag. In the persister suite the mock is one level lower —
  `firebase/firestore`, `getFirestoreInstance` and `trackWrite` — with the real
  persister under test. No Firestore client, emulator, network or production
  data was involved; no production read or write was performed. The tests
  therefore prove the tracker's and the persister's own bookkeeping, not what
  Firestore does with the bytes.
- **Inferred (documented Firestore semantics, not executed here).** That a
  `merge: true` write replaces an array field wholesale while merging a map
  field key-by-key. This is the mechanism behind the "record without set"
  producer and behind the data-loss severity of Defect 2. The fixes do not
  depend on it — both are contradictions the tracker can be handed by _any_
  producer — but the severity framing does.
- **Not verified.** No browser run. The UI consequences (card status vs.
  category count, "Continue" targeting a finished lesson, scroll mode staying
  locked) are read from the current component source cited above, not observed
  in a rendered page. This cloud session has no dev server or browser, and the
  change is non-visual logic.

## Risks

- `reconcileCompletion` can _raise_ a concept to completed at hydration where
  the previous build displayed it as available. That is the intended repair, but
  it is user-visible: an affected user's path view will show lessons flipping to
  completed and the overall percentage rising on their next load. Nothing is
  ever demoted.
- Reconciliation now always recomputes `overallProgress` and re-runs
  `checkBadges`, so a stored percentage or badge list that disagreed with the
  reconciled set is replaced. Neither formula changed
  (`completedConcepts.size / TKA_CONCEPTS.length`; the same badge thresholds),
  and badges are only ever added. One consequence worth naming: the server-side
  TIKA writer computes its own `overallProgress` over `KNOWLEDGE_GRAPH.length`
  (33 concept ids in `packages/domain/src/curriculum/knowledge-graph.ts`) while
  the client divides by `TKA_CONCEPTS.length` (31 in
  `src/lib/features/learn/domain/concepts.ts`), so a document that writer
  produced will now be re-derived to the client owner's number on load. That is
  the client's own formula winning over a second one, not a new formula — but
  two writers disagreeing on the denominator is a follow-up in its own right.
- Deferring `this.userId` means progress made between sign-in and the merge
  landing is local-only for that window. It is pushed by the next successful
  attempt, and localStorage holds it meanwhile — but if the merge never
  succeeds in a session, that session never writes to Firestore. That is the
  intended trade: silence over destroying the server's copy.
- The generation guard makes a superseded attempt a silent no-op. That is
  correct for the account-switch and sign-out cases it exists for, but it means
  a caller awaiting `initializeForUser` cannot distinguish "connected" from
  "superseded" — both resolve. Nothing in the tree awaits it today.
- `checkBadges` and `updateOverallProgress` now take an optional progress
  argument. The parameterless calls in `completeConcept` are unchanged; the
  default keeps `this.progress` as the implicit target.
- `initializeForUser` no longer rejects. A future caller that wants to know
  whether sync succeeded needs a new signal; today's only caller ignores the
  promise.

## Follow-ups (inspected read-only, not changed)

1. **`src/lib/features/tika/services/server/tika-progress-writer.ts:115-152`** —
   builds keys of the form `` `concepts.${id}` `` and passes them to
   `batch.set(ref, {...}, { merge: true })`. In the Firestore SDKs only
   `update()` interprets dot-separated field paths; `set()` treats the key as a
   literal field name. If that holds for `firebase-admin` 13.10.0, every
   TIKA-verified completion lands as a top-level field literally named
   `concepts.<id>`, never enters the `concepts` map the client deserializes, and
   produces exactly the "set without record" state of Defect 1. **I did not
   execute this** — it is admin-SDK behavior against live Firestore, out of this
   task's read-only-audit boundary, and the file is outside my paths. Worth a
   dedicated check by whoever owns `features/tika`; `update()` or nested-object
   `set()` would be the fix.
2. **localStorage is not namespaced by user, and nothing calls
   `disconnect()`.** Grep found no caller — the method is now correct (it
   invalidates in-flight attempts) but unreached, so no sign-out clears the
   cached progress. Signing in as a second account in one page session runs
   `initializeForUser(B)` against user A's cached progress; if A's
   `lastUpdated` is newer, A's progress is pushed into B's document. Defects 2
   and 3 close the failed-load and the out-of-order variants; the
   successful-load one is unchanged, because it is not a race — it is one
   device's storage holding one account's data under a key no account owns.
   Excluded from this task as account-boundary work; a per-user storage key
   plus a `disconnect()` call on sign-out is the shape of the fix.
3. **Two owners compute `overallProgress` with different denominators.** The
   client divides by `TKA_CONCEPTS.length` (31) and
   `features/tika/services/server/tika-progress-writer.ts` by
   `KNOWLEDGE_GRAPH.length` (33), so the same completion set yields a different
   percentage depending on who wrote last. Reconciliation now settles it toward
   the client's owner on every load, which is consistent but papers over the
   disagreement. Whoever owns the curriculum data should decide which set is
   the denominator.
4. **`resetProgress()` has no callers**, and if wired up it would not clear the
   remote document: the merge write sends `concepts: {}`, which deletes nothing,
   and it sends `currentConceptId: undefined`, which the Firestore client
   rejects unless `ignoreUndefinedProperties` is set — it is not, at
   `src/lib/shared/auth/firebase.ts:441`. Both are source readings, not executed.
5. **`loadFromLocalStorage` does not guard `lastUpdated`.** A stored payload
   without the field yields `new Date(undefined)` → Invalid Date, whose
   `getTime()` is `NaN`, so every merge comparison is false, and whose
   `toISOString()` throws — silently disabling both the localStorage and the
   Firestore write for the session. `importProgress` already guards this
   (`new Date(data.lastUpdated || Date.now())`); the load path should too. Left
   alone because I found no current producer of such a payload, so it did not
   meet this task's "reproduced defect" bar.
6. **`play/domain/progression.ts` `mergeProgress` is whole-document
   last-writer-wins.** Two devices that played different games offline lose one
   side's bests entirely on merge, rather than merging per game. Same
   `merge: true` array/map exposure as the concept tracker.
7. **Resumed experience checkpoints are unclamped in some lessons.**
   `state/experience-persistence.svelte.ts` stores a bare `step` with no schema
   version and no bound. The grid experience clamps
   (`normalizeGridStep`, `GRID_LAST_STEP`), but e.g.
   `vtg/VTGConceptExperience.svelte:32` and `staff/StaffConceptExperience.svelte:44`
   restore `persistence.load().step || 1` raw against a hard-coded page count,
   so a stored step above that count renders no branch and `handleNext` is
   gated off — a stuck blank lesson. Latent: it needs a lesson to lose steps
   between releases, and I found no evidence that has happened, so this is a
   content-drift risk rather than a reproduced defect. The clamp belongs to the
   experience components, which are outside my paths.
