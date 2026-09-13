# Learn progress persistence and state integrity

Date: 2026-09-13. Domain: Learn progress/checkpoint services and state under
`src/lib/features/learn`. Branch: `claude/learn-progress-defects-3p215o`.

Base SHA: `6e4c1b5a388625d9c95f92e9a717f8ca2ab77f20` (equal to `origin/main` at
the start of this task).
Final code SHA: `3a24958b` — the only commit on this branch that touches `src/`.
This report is committed after it, so the branch tip is a docs-only commit.

## Owned files

| File                                                                  | Change                                 |
| --------------------------------------------------------------------- | -------------------------------------- |
| `src/lib/features/learn/services/concept-progress-tracker.ts`         | Both fixes                             |
| `src/lib/features/learn/services/concept-progress-tracker.test.ts`    | New; 14 cases covering both fixes      |
| `docs/reports/opus-batch-2026-09-12/learn-progress-integrity.md`      | This report                            |

Nothing else was touched. Lesson content, curriculum, exercise design, quiz
interactions, auth, library, account upgrade and settings sync were left alone.

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
100%, an existing record keeps its own stats and only has its status and
percentage raised, and `overallProgress` is re-derived (through the existing
`updateOverallProgress` owner, now parameterized) only when the set actually
grew. `recordPracticeAttempt` now floors `percentComplete` at its previous
value, because a reconciled record has no answer counts behind its 100 and
practising a finished lesson again must not walk it back to 10%. For a normally
tracked concept that floor is a no-op — `correctAnswers` only grows.

## Defect 2 — a failed sign-in load wrote un-merged local state over the server's

`initializeForUser` set `this.userId` and `this.initialized` *before* awaiting
`loadProgress`. Two consequences, both from a single ordinary trigger (offline
sign-in, a permission hiccup, a transient Firestore error):

1. **Remote overwrite.** `saveProgress()` writes whenever `persister && userId`
   are set. With `userId` set before the load, every completion recorded after
   a *failed* load was pushed to Firestore even though the merge never
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

## Verification

All measured on this branch in this cloud checkout, not inferred.

| Check                                                                                          | Result                                                                      |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `npx vitest run --config tests/config/vitest.config.ts src/lib/features/learn/services/concept-progress-tracker.test.ts` against the **pre-change** tracker | 9 failed, 5 passed                                                          |
| Same command against the fixed tracker                                                         | 14 passed                                                                   |
| `npx vitest run --config tests/config/vitest.config.ts src/lib/features/learn`                  | 20 passed (adds the 6 pre-existing `codex-explorer-persistence` cases)      |
| `npx eslint` on both changed files                                                              | clean                                                                       |
| `npm run check:fast`                                                                            | 645 errors / 44 warnings project-wide, **none** in either changed file       |

The 645 `check:fast` diagnostics are pre-existing and live in files this branch
does not touch (the learn ones are in `Type1ConceptExperience.svelte`,
`PlacementComparison.svelte`, `RotationDirectionConceptExperience.svelte`,
`CategoryHeader.svelte`, `concept-place-registry.ts`,
`concept-place-routes.ts`). I did not re-run the gate on the base commit to
produce a baseline count; the claim made here is only that zero diagnostics name
the changed files.

The 5 cases that pass on the pre-change tracker are deliberate regression pins:
normal percentage tracking, one shared load for concurrent calls, a newer remote
document still winning, local-newer still being pushed, and writes still
reaching Firestore after a successful sign-in.

### What is measured, what is mocked, what is inferred

- **Measured.** Every assertion above ran against the real
  `ConceptProgressTracker` and the real `TKA_CONCEPTS` / `isConceptUnlocked`
  domain module, under the project's own Vitest config (jsdom, real
  `localStorage`).
- **Mocked.** The persister is a hand-written double exposing the three methods
  the tracker uses (`loadProgress`, `saveProgress`, `subscribeToProgress`). No
  Firestore client, emulator, network or production data was involved; no
  production read or write was performed. So the tests prove what the tracker
  does with a persister's answers, not what Firestore does with the bytes.
- **Inferred (documented Firestore semantics, not executed here).** That a
  `merge: true` write replaces an array field wholesale while merging a map
  field key-by-key. This is the mechanism behind the "record without set"
  producer and behind the data-loss severity of Defect 2. The fixes do not
  depend on it — both are contradictions the tracker can be handed by *any*
  producer — but the severity framing does.
- **Not verified.** No browser run. The UI consequences (card status vs.
  category count, "Continue" targeting a finished lesson, scroll mode staying
  locked) are read from the current component source cited above, not observed
  in a rendered page. This cloud session has no dev server or browser, and the
  change is non-visual logic.

## Risks

- `reconcileCompletion` can *raise* a concept to completed at hydration where
  the previous build displayed it as available. That is the intended repair, but
  it is user-visible: an affected user's path view will show lessons flipping to
  completed and the overall percentage rising on their next load. Nothing is
  ever demoted.
- When reconciliation grows `completedConcepts`, `overallProgress` is
  recomputed, so a stored percentage that disagreed with the set is replaced.
  The formula is unchanged (`completedConcepts.size / TKA_CONCEPTS.length`).
- Deferring `this.userId` means progress made between sign-in and the merge
  landing is local-only for that window. It is pushed by the next successful
  attempt, and localStorage holds it meanwhile — but if the merge never
  succeeds in a session, that session never writes to Firestore. That is the
  intended trade: silence over destroying the server's copy.
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
   `disconnect()`.** Grep found no caller. Signing in as a second account in one
   page session runs `initializeForUser(B)` against user A's cached progress; if
   A's `lastUpdated` is newer, A's progress is pushed into B's document. Defect
   2's fix removes the *failed-load* variant of this, not the successful-load
   one. Excluded from this task as account-boundary work.
3. **`resetProgress()` has no callers**, and if wired up it would not clear the
   remote document: the merge write sends `concepts: {}`, which deletes nothing,
   and it sends `currentConceptId: undefined`, which the Firestore client
   rejects unless `ignoreUndefinedProperties` is set — it is not, at
   `src/lib/shared/auth/firebase.ts:441`. Both are source readings, not executed.
4. **`loadFromLocalStorage` does not guard `lastUpdated`.** A stored payload
   without the field yields `new Date(undefined)` → Invalid Date, whose
   `getTime()` is `NaN`, so every merge comparison is false, and whose
   `toISOString()` throws — silently disabling both the localStorage and the
   Firestore write for the session. `importProgress` already guards this
   (`new Date(data.lastUpdated || Date.now())`); the load path should too. Left
   alone because I found no current producer of such a payload, so it did not
   meet this task's "reproduced defect" bar.
5. **`play/domain/progression.ts` `mergeProgress` is whole-document
   last-writer-wins.** Two devices that played different games offline lose one
   side's bests entirely on merge, rather than merging per game. Same
   `merge: true` array/map exposure as the concept tracker.
6. **Resumed experience checkpoints are unclamped in some lessons.**
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
