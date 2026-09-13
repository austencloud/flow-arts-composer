# Undo/Redo Integrity — Opus batch 2026-09-12

Scope: `src/lib/shared/history/command-stack.svelte.ts`, the Create module edit
history managers and their call sites, plus focused tests. Excluded by
assignment and untouched here: generation/inversion transforms, guest/library
persistence, prop-swap playback baseline, timeline rendering.

## Result

Two silent defects reproduced against real code and fixed. Both lose user work
without an error, a log line, or any visible failure.

| | Defect | Status |
| - | - | - |
| 1 | A redone or newly created sequence is wiped by a clear that was already in flight | Fixed, before/after proof |
| 2 | One Beat Editor delete records two history entries; the second undo press changes nothing | Fixed, before/after proof |

Five further findings are reported below without runtime edits.

## Revisions

- Base: `c4be16199e390e8bdab766051a0042c7827b8d30` (`origin/main` at the start)
- Merged: `6e4c1b5aa` (`origin/main` after PR #49) — no conflict, and it does
  not touch either fixed file
- Branch: `claude/undo-redo-integrity-fy8xr2`
- Final SHA: see the last commit on that branch; the verification below ran on
  the working tree that became it

### Review revision (post local review of `f2f7d9ef`)

- Fixtures rebuilt from canonical factory data; the `motions: {}` placeholders
  that pushed `setCurrentSequence` into its derivation failure branch are gone,
  and the three orchestrator tests now assert stderr stays silent rather than
  suppressing it.
- The F3/F5 "unbounded redo stack" claim was wrong and is corrected below with
  measured bounds and two new tests.
- Code fixes unchanged: no new evidence called for a change, and the
  before/after proof still holds against the canonical fixtures.

## Files owned by this task

| File | Change |
| - | - |
| `src/lib/features/create/shared/state/sequence-state-orchestrator.svelte.ts` | +15 lines: `clearSequenceCompletely` ownership guard |
| `src/lib/features/create/shared/components/coordinators/StepEditorCoordinator.svelte` | -2/+7 lines: removed the duplicate delete snapshot |
| `src/lib/features/create/shared/state/create-module/__tests__/undo-redo-integrity.test.ts` | New, 469 lines |

No instruction file, no shared history primitive, and no other agent's path was
modified. `src/lib/shared/history/command-stack.svelte.ts` was audited and left
unchanged — see finding F5.

---

## Defect 1 — a pending clear outlives the state it was told to clear

**Where:** `sequence-state-orchestrator.svelte.ts::clearSequenceCompletely`,
reached from `undo-controller.svelte.ts:165` (undo) and `:294` (jump), and from
`step-removal-handler.ts:31`.

**Mechanism.** `clearSequenceCompletely()` starts the clearing animation, waits
out the 300 ms step-grid transition, and only then nulls the sequence, resets
selection and calls `persistenceCoordinator.clearState()`. The undo controller
fires it with `void` and returns `true` immediately:

```ts
if (lastEntry.type === UndoOperationType.SELECT_START_POSITION) {
  void sequenceState.clearSequenceCompletely();
  ...
  return true;
}
```

That leaves a 300 ms window in which the workspace can legitimately acquire a
new sequence — by Redo, by a second Undo/jump, or by the user simply picking a
start position again on the picker the undo just opened. The pending clear then
lands on top of it and destroys both the in-memory sequence and its saved copy.
Nothing surfaces: no throw, no toast, no history entry to recover from, and the
undo stack still claims the redo already happened.

**Measured, real code.** Real `createSequenceState` orchestrator + real
`UndoManager` + real `createUndoController`, fake timers:

```
right after redo:                 A
after clear animation window:     undefined
```

**Fix.** The clear now remembers the sequence it agreed to clear and stands down
if something else has taken the workspace since:

```ts
const clearingSequence = coreState.currentSequence;
await new Promise((resolve) => setTimeout(resolve, 300));
const sequenceNow = coreState.currentSequence;
if (sequenceNow !== null && sequenceNow !== clearingSequence) {
  animationState.endClearing();
  return;
}
```

The animation itself is untouched, and a clear with nothing racing it still
clears (covered by a third test). The guard compares object identity, which is
exact here because every Create edit path replaces the sequence object rather
than mutating it — verified by grepping for in-place sequence/step assignment
across `src/lib/features/create` and `src/lib/shared/create` (no hits), and by
reading `processReversals`, `updateStepTurns`, `applyBatchChanges` and
`persistBeatWithAdjustments`, all of which rebuild.

**Residual risk (stated, not measured):** if some future path replaced the
sequence with a re-normalized but content-identical object inside the same
300 ms, the guard would abort a legitimate clear. No such path exists today —
`setCurrentSequence` is only reached from explicit edits, and the orchestrator's
own autosave does not call it.

## Defect 2 — one delete, two history entries

**Where:** `StepEditorCoordinator.svelte::handleStepDelete` and
`step-operations/step-removal-handler.ts::removeStep`.

**Mechanism.** The coordinator pushed its own `REMOVE_BEATS` snapshot and then
called `StepOperator.removeStep`, which pushes a `REMOVE_BEATS` snapshot of its
own (with the step index and removed count in metadata). Both captures happen
before the mutation, so both hold the identical pre-delete state. The two other
`removeStep` call sites (`WorkspacePanel.svelte:186`,
`create-module-handlers.ts:88`) correctly leave the snapshot to the handler, so
only the Beat Editor path doubled up.

User-visible result: deleting a step from the Beat Editor costs two Undo
presses. The first restores the step. The second pops the phantom, restores the
same sequence again, and still fires `Undid Remove Steps` — a toast for a change
that did not happen. Redo has the same doubling in reverse, and every press
spent on a phantom pushes the user's real earlier history one step further away.

**Measured, real code.** Real `removeStep` handler driven through the real
controller and manager, replaying the coordinator's two calls:

```
entries recorded for ONE delete: 2  [ '', 'Remove step 2 and 0 subsequent steps' ]
after 1st undo: 3 steps
canUndo still:  true
after 2nd undo: 3 steps        <- no change
```

**Fix.** Removed the coordinator's push. The removal handler owns the snapshot,
which is also the path that carries the useful metadata.

## Verification

All commands run in this cloud checkout; no laptop, no dev server, no browser.

| Command | Result |
| - | - |
| `npx vitest run --config tests/config/vitest.config.ts src/lib/features/create/shared/state/create-module/__tests__/undo-redo-integrity.test.ts` | 10/10 passed, no stderr |
| Same file with both fixed sources reverted to the base commit | 3 failed / 7 passed — the three defect guards |
| `npx vitest run --config tests/config/vitest.config.ts src/lib/features/create src/lib/shared/create src/lib/shared/history src/lib/features/assemble-lab` | 53 files, 373 tests passed |
| `npm run check:fast` at `HEAD` | 582 errors, 44 warnings |
| `npm run check:fast` with the fixed sources reverted to the base commit | 582 errors, 44 warnings — identical baseline, no new errors |
| `npm run check:fast`, filtered to the changed files | no errors or warnings in any of them |
| `npx eslint` on the changed `.ts` files | clean (the `.svelte` file is in the eslint ignore list) |

Setup required in the cloud container before any of this: `pnpm install
--frozen-lockfile` and `npx tsc --build packages/tsconfig.build.json` (the
workspace packages must be built or `@tka/tka-types` fails to resolve under
vitest).

The failing-before run is the precise before/after proof asked for. The
"records a single REMOVE_BEATS entry" test passes in both states by design — it
only exercises the handler; the source-contract test next to it is what catches
a coordinator re-adding the duplicate push.

### Tests added

`undo-redo-integrity.test.ts`, 10 cases:

- three-edit trace, undo to the start and redo to the end, asserting the exact
  sequence at every step;
- redo future dropped when a new edit lands on an undo;
- 55 edits against the 50-entry limit — 50 presses available, oldest forgotten;
- redo bounded at the undo cap within one tab (200 pushes, drained);
- another tab's redo survives a push, so the combined stack reaches 2x the cap;
- one `removeStep` call records exactly one entry and one effective undo;
- source contract: `handleStepDelete` delegates without pushing;
- redo inside the clear window survives (real orchestrator);
- a sequence created inside the clear window survives (real orchestrator);
- an unraced clear still clears (real orchestrator).

### Fixtures

Sequences are built from the project factories — `createSequence`,
`createStepData`, `createStartPositionData`, `createMotionData` — as a canonical
alpha1 -> alpha3 shift (left south to west, right north to east) with an
explicit alpha1 start position and both hands visible. The three
orchestrator tests construct it with the real `reversalDetector`, matching how
the Construct tab wires `createSequenceState`.

An earlier revision used `motions: {}` placeholder steps. Those are not
renderable, so `setCurrentSequence` fell into `startPositionDeriver`'s failure
branch and logged `Failed to derive start position from first beat` on every
call. The assertions still passed, but they were passing on a path the app never
takes. The canonical fixtures run the real start-position and reversal paths
instead. Rather than silencing that output, the three orchestrator tests now
assert it never happens: they spy on `console.warn`/`console.error` without a
mock implementation — so anything logged still reaches stderr — and fail if
either was called.

Evidence classes: the orchestrator, manager, controller and removal handler are
the shipping implementations. The workspace stand-in in the first group is a
fake that mirrors the real contract (immutable replacement); the clear-window
group uses no fake at all.

---

## Findings reported, not fixed

**F1 — an operation that changes nothing still destroys the redo future.**
`pushUndoSnapshot` records unconditionally and `UndoManager.pushUndo` clears the
section's redo stack at push time. An operation that pushes a snapshot and then
bails without mutating therefore adds a phantom undo entry *and* discards the
whole redo future. Measured: with a redo available, a snapshot pushed with no
following mutation flipped `canRedo` from `true` to `false` and left an entry
whose undo restores an identical state. Reachable triggers found by inspection:

- `sequence-actions-orchestrator.ts` `appendBridge` (:145), `applyLoop` (:177)
  and `applyOrientationRepeat` (:205) push before awaiting the coordinator and
  return on the failure branch without mutating;
- `batch-edit-handler.ts:37` pushes, then returns if there is no current
  sequence;
- `arrow-adjustment-handler.ts:124` pushes, then returns if there is no existing
  start position;
- `StepEditorCoordinator.handleTurnsChange` clamps to `[minTurns, 3]` after
  pushing, and `PropTurnsControl.svelte`'s ± buttons are never disabled at the
  bounds, so tapping `+` at 3 turns (or `−` at 0) writes back the value it
  already had. `updateStepTurns` has no unchanged-value early return.

The mechanism is measured; the individual triggers are read from source, not
executed. The clean fix for the first three is to move `pushUndoSnapshot` below
the `await` and inside the success branch — it captures the live sequence
reference synchronously, so it stays correct there. The turns case wants a guard
on `newTurns === currentTurns`. Not done here: those files sit in extension-flow
and step-editor territory that other agents in this batch may hold, and the
change is a behavioural one at each call site rather than a history fix.

Deferred no-op detection inside `pushUndoSnapshot`'s existing `queueMicrotask`
is **not** a safe fix and was rejected: several real operations mutate after the
microtask has already run (`appendBridge` awaits, `removeStepAndSubsequentWith\
Animation` animates, `executeClearSequenceWorkflow` waits 300 ms), so the guard
would silently drop legitimate undo entries.

**F2 — `jumpToState` lands one entry off and strands the future.** Measured on
the real `UndoManager`. Given entries whose before-states are `S0, S1, S2` and a
current state of `S3`, jumping to the `S1` entry leaves:

```
undo stack: [S0, S1]   redo stack: [S2]   next redo entry afterState: undefined
```

Two problems. The undo stack still contains the entry that was just rolled back,
so the next Undo press restores `S1` again — a no-op. And entries moved to the
redo stack by a jump never had `afterState` written (only `undo()` writes it),
so `UndoController.canRedo` is `false` and the future is unreachable.

Not fixed because it is unreachable: `CreateModuleState.jumpToState` and
`UndoController.jumpToState` have no `.svelte` caller anywhere in the tree. It
is latent, not live, and fixing it would be speculative work on dead API.

**F3 — the redo stack has no cap of its own, but it is not a memory-growth bug.**
An earlier draft of this report called `_redoHistory` "unbounded". That was
wrong, and the correction is the measured bound below.

`pushUndo` trims `_undoHistory` to 50; nothing trims `_redoHistory`. It does not
need trimming within a tab: entries reach redo one press at a time from an
already-capped undo stack, so a saturated tab drains to exactly the cap.
Measured on the real `UndoManager` (200 pushes, then undo until it refuses):

```
single section:   undo stack 50 -> 50 undo presses -> redo 50
```

The reachable way past the cap is cross-tab, because `pushUndo` invalidates redo
only for the section that pushed — deliberate, and the reason the tabs can hold
independent futures. Measured, saturating and draining one tab at a time:

```
drain construct:  redo  50
60 generate pushes: redo 50   (construct's future survives, by design)
drain generate:   redo 100
drain a third section stamp: redo 150
```

So the bound is `50 x (distinct section stamps)`, not 50 and not unbounded. In
practice two stamps reach `UndoManager` — `construct` and `generate`, with
`spell` routed into `generate` and `assemble` going to `CommandStack` instead —
so the real ceiling is ~100 entries. Reaching it takes 50+ edits and 50 undo
presses in each of two tabs: reachable, but not a trace a user falls into.

What is worth knowing is the persisted payload, not the entry count:
`saveHistory()` `JSON.stringify`s both complete stacks — every entry carrying a
full sequence snapshot — into `localStorage` on every push, undo, redo and
clear. At the ceiling that is ~150 snapshots serialized per keystroke-level
edit. A quota error is caught and logged, so persistence then fails silently.
That is the cost worth measuring if this is ever revisited; the redo count is
not.

Both bounds are now pinned by tests in `undo-redo-integrity.test.ts`.

**F4 — history survives a reload that the sequence does not.** `UndoManager`'s
constructor reloads both stacks from `localStorage`, and nothing clears them when
a different sequence is loaded into a tab. Undo after such a load restores a
sequence from an earlier session. Not reproduced end-to-end here (it needs the
persistence layer and a real browser), so this is an inference from the code,
flagged rather than claimed.

**F5 — `CommandStack` is sound; two small gaps.** Audited
`src/lib/shared/history/command-stack.svelte.ts` and its consumers
(`assemble-history-controller.ts`, `composer-editor-state.svelte.ts`). Behaviour
is correct, including `_redoStack.length = 0` on a `$state` array — Svelte's
proxy has an explicit `length` branch in its `set` trap, so reactivity does fire.
One gap worth knowing: a command whose `undo()`/`execute()` throws is dropped
from both stacks — it is popped before the push that would re-file it. Not a
reproduced user-facing defect, so no change was made.

An earlier draft also called `CommandStack._redoStack` unbounded. That was
wrong. `record()` clears redo outright and `undo()` moves one entry at a time
off a stack already capped at `maxEntries`, so redo can never exceed the cap.
Measured: 200 `record()` calls, then undo until refused — 50 presses, redo 50.

Also noted while tracing, below the bar for action: `UndoController`'s
`undoHistory`/`redoHistory` getters return plain arrays without touching
`undoChangeCounter`, so any consumer deriving from them would not update
reactively — there is no such consumer today; `createUndoController` subscribes
to the singleton manager with `onChange` and never unsubscribes; and
`UndoController.redo()` does not restore `activeSection` while `undo()` does.

## Limitations

- No browser, visual, or device verification was performed or is claimed. Both
  fixes are non-visual: one is a state-ownership guard, the other removes a
  duplicate history push. The clearing animation timing is unchanged.
- The 300 ms race is reproduced with fake timers. Real wall-clock behaviour is
  the same by construction, but has not been observed in a running app.
- `npm run check` (full `svelte-check`), the production build, and emulator
  suites were not run; the change does not cross type or build boundaries and
  `check:fast` shows an unchanged baseline.
- F1 and F4 remain open in the tree.
- Local integration (`wt:finish`) has not been run and is not claimed; that step
  waits on the local review branch.
