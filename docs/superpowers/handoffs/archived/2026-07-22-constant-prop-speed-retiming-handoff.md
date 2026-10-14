> Archived 2026-10-14: Superseded scope is retained in `docs/superpowers/specs/archived/2026-07-22-constant-prop-speed-retiming-design.md`.

# Constant Prop Speed Retiming Handoff

## Mission

Redesign the unfinished constant-prop-speed feature from the approved correction in:

[2026-07-22-constant-prop-speed-retiming-design.md](./2026-07-22-constant-prop-speed-retiming-design.md)

The feature changes one shared duration per pictograph. It must never imply that Blue or Red can receive an independent duration. Remove the prop target, evaluate both props as one pair, resolve the WAA5 runtime timing discrepancy, and make deliberate duration Apply survive HMR, reload, and library round trips.

This is not a finished feature. The current UI and solver still expose the invalid single-prop model.

The initial design commit is `e9f65e34f07a980a2a0a7e113f0b719ab098585f`.

## Done, verified

### Product correction captured

- The design makes duration a pictograph-level value shared by both props.
- The design removes Blue, Red, Left, and Right targeting from constant-speed retiming.
- The first version requires equal Blue and Red turn counts within every pictograph, followed by validation of the actual effective staff rotation.
- The wider unequal-ratio case is explicitly out of scope.
- The design blocks the `Exact` badge until production animation sampling proves the claim.

### Existing implementation traced

The following source was read directly:

- `src/lib/features/create/shared/services/constant-prop-speed.ts`
- `src/lib/features/create/shared/components/sequence-actions/DurationPatternView.svelte`
- `src/lib/features/create/shared/components/sequence-actions/DurationPreviewWorkspace.svelte`
- `src/lib/features/create/shared/components/sequence-actions/SequenceActionsPanel.svelte`
- `src/lib/features/create/shared/services/duration-pattern-manager.ts`
- `src/lib/features/create/shared/domain/models/duration-pattern-data.ts`
- `src/lib/shared/foundation/domain/models/step-data.ts`
- `src/lib/shared/foundation/domain/models/solo-prop-step-data.ts`
- `src/lib/shared/foundation/domain/models/step-pairing-data.ts`
- `src/lib/shared/foundation/services/sequence-decomposer.ts`
- `src/lib/shared/foundation/services/step-deriver.ts`
- `src/lib/shared/foundation/services/sequence-hydrator.ts`
- `src/lib/features/create/shared/services/sequence-persister.ts`
- `src/lib/shared/persistence/services/dexie-persistence-service.ts`
- `src/lib/features/create/shared/state/persistence/sequence-persistence-coordinator.svelte.ts`
- `src/lib/features/create/shared/state/sequence-state-orchestrator.svelte.ts`
- `src/lib/shared/browse/services/claude-code-copier.ts`
- `src/lib/shared/animation-engine/services/endpoint-calculator.ts`
- `src/lib/shared/animation-engine/services/prop-interpolator.ts`
- `src/lib/shared/animation-engine/services/step-calculator.ts`
- `src/lib/shared/animation-engine/services/sequence-animation-orchestrator.ts`

Source confirms:

- `StepData` has one duration for the whole pictograph.
- Duration-pattern application writes one value to the step.
- Sequence decomposition writes that shared value into both solo-prop records.
- Hydration currently restores the step duration from Blue.
- Workspace persistence serializes the entire current sequence to local storage.
- A deliberate sequence-state update normally reaches persistence through a 500 ms debounce.
- The current solver accepts `blue`, `red`, or `both`.
- Single-prop success constrains only the selected prop while the other prop inherits the same duration without a constant-rate guarantee.
- The current UI renders a `HandSelector` inside the constant-speed card.

### Existing commits identified

- `573f4fde9e5bf3e86a20d7ae1b94c7ac9ff55026` added the constant-speed service, duration preview UI, apply flow, and related sequence-action work.
- `c10b60fa483c59439133003bb81142f916231aca` added constant-speed tests and duration serialization in copied sequence text.

### Adjacent color-policy work identified

This conversation also produced a separate uncommitted color-policy pass:

- `SegmentedControl.svelte` accepts semantic `blue`, `red`, and `accent` option tones and moves the selected indicator to the selected option's tone.
- `SegmentedControl.svelte` accepts accessible group labels.
- `HandSelector.svelte` now delegates to the shared segmented-control primitive instead of maintaining its own track implementation.
- `MobileHandSelector.svelte` uses prop and accent tokens for selected and unselected labels.
- `MotionColorChips.svelte` supports caller labels, row or column layout, optional visibility icons, and persistent Blue or Red identity.
- Focused component assertions were added beside `SegmentedControl.svelte` and `MotionColorChips.svelte`.

Those changes implement the broader rule that Blue or Left and Red or Right controls retain their semantic colors even while unselected. They are useful elsewhere, but constant-speed retiming must remove the hand selector rather than relying on the improved primitive.

The color-policy files remain uncommitted and are not part of the design commit.

### Copy-format fix verified

`claude-code-copier.ts` emits `d=beats` on every copied step. The focused test verifies default, integer, and fractional values.

### Current test baseline recorded

Command:

```text
pnpm exec vitest run --config tests/config/vitest.config.ts tests/unit/services/constant-prop-speed.test.ts tests/unit/services/ClaudeCodeCopier.test.ts tests/unit/SequenceDecomposer.test.ts
```

Result on 2026-07-22:

```text
3 test files passed
25 tests passed
Duration 898 ms
```

This green result does not verify the product. One passing constant-speed test explicitly expects the invalid single-prop behavior. The test is evidence of the mismatch and must be rewritten.

### Domain grounding completed

The Flow Arts MCP `base-rotation` topic was queried in this session. It confirms:

- turn count is additional rotation
- one TKA turn is 180 degrees
- shifts contain base rotation even at 0 turns
- 0-turn dashes and statics follow different rotation behavior

The solver therefore must use effective animation rotation, not raw turn count alone.

### External timing model reviewed

MoveIt time parameterization and Ruckig multi-degree-of-freedom synchronization were reviewed. Both support the product correction: preserve the path and solve one shared timeline across channels.

### Document checks completed

- Every local Markdown link in the design resolves to a real file.
- The writing scan found no em dashes, canned transitions, inflated claims, or prohibited marketing language.
- No application code was changed during this handoff.

## Believed done, not yet verified

- The 500 ms debounced autosave is a plausible cause of duration loss during rapid HMR, but no runtime reproduction was performed.
- Current sequence composition should preserve duration through a new library save because both solo-prop records receive it, but no Dexie or Firestore runtime round trip was executed.
- A legacy document that retains duration only in its old `steps` payload may need a hydration backfill. Representative Firestore documents were not queried.
- The duration preview appears to use the shared duration values correctly, but it has not been compared frame by frame with the main Sequence Viewer.
- Equal raw turn counts should be a useful product gate, but base rotation means the effective-delta check remains mandatory.
- The adjacent semantic-tone component assertions have not run. The normal unit-test config excludes `.svelte.test.ts` files. A focused attempt returned `No test files found`, so there is no component-test proof to report.

## In flight

No corrective application code is in flight from this handoff.

The current repository still contains:

- a target-based `analyzeConstantPropSpeed(sequence, target)`
- a constant-speed `HandSelector`
- single-prop success and failure copy
- an invalid single-prop success test
- an `Exact` badge based on calculated averages
- no immediate persistence flush dedicated to duration Apply

The adjacent semantic-tone primitive changes are in flight and uncommitted. Preserve them as a separate concern. Do not sweep them into the constant-speed correction or discard them when removing `HandSelector` from the duration card.

The next implementation should begin with the WAA5 animation truth test, not the UI.

## Loose ends, ranked

### P0: Resolve WAA5 timing

- Build the exact four-step WAA5 fixture from canonical domain data.
- Sample unwrapped staff angles through the production animation path.
- Test the screenshot timing `[2, 1, 2, 1]`.
- Test the current solver timing `[5, 1, 5, 1]`.
- Identify whether effort easing changes instantaneous staff speed.
- Make the runtime result the expected value before changing product copy.

### P0: Replace the single-prop contract

- Remove `TargetHand` from the analyzer API.
- Remove nullable selected-hand rate fields.
- Require matched per-pictograph turns and matched effective rotation magnitude for the first version.
- Reject missing motion, zero spin, direction changes, turn mismatch, effective-rotation mismatch, and duration overflow.
- Recalculate both output rate series as a postcondition.

### P0: Remove the misleading UI

- Remove `HandSelector` from `DurationPatternView.svelte`.
- Do not change or revert the shared `HandSelector.svelte` primitive as part of this removal. That file has unrelated uncommitted work in the shared checkout.
- Replace all single-prop result and error branches with pair-level copy.
- Keep Blue and Red labels visibly color-coded through established tokens while retaining text labels.
- Withhold `Exact` until the runtime test earns it.

### P0: Make Apply durable

- Keep preview temporary.
- On Apply, update the active sequence and flush the active create-mode persistence record immediately.
- Await the flush before leaving duration preview.
- Add a restoration test that loads the saved record through the real state path.

### P1: Prove every save path

- Verify local-storage restoration after HMR and full reload.
- Verify Dexie save and load.
- Verify Firestore decomposition and hydration.
- Assert that Blue solo duration, Red solo duration, and hydrated step duration match.
- Query representative old and new cards before proposing any migration.
- Default truly missing legacy duration to `1`. Never invent nondefault timing.

### P1: Preserve interchange

- Keep `d=beats` in copied sequence text.
- Add WAA5 copy coverage after its timing is resolved.
- Confirm any other export or share format that reconstructs steps from solo-prop data carries the same duration.

### P1: Finish the separate color-policy pass

- Run the two Svelte component tests through the repository's approved component-test path.
- Check current `SegmentedControl` consumers for prop-tone regressions.
- Verify Left or Blue and Right or Red remain visibly semantic while unselected.
- Commit only the six owned color-policy files with explicit pathspecs after proof.
- Keep this work separate from removal of the constant-speed hand selector.

### P1: Runtime and browser proof

- Obtain explicit browser-control permission in the active conversation before interactive DevTools use.
- Open the exact WAA5 route.
- Preview, apply, inspect persistence, reload, and compare values.
- Capture angle-rate or animation evidence, not only a build result.

## Decisions already made

### Constant speed is a pair operation

There is no Blue-only or Red-only mode. One pictograph duration affects both props.

### The first version is deliberately narrow

Blue and Red need matching turn counts in each pictograph, plus matching effective rotation magnitudes. Do not retain the current wider proportional-ratio behavior without a later product decision.

### Runtime animation is the timing oracle

The screenshot reports `2×` while the current test derives `5×`. The existing test is not allowed to decide the result by itself.

### Exact means measured

If effort easing or another runtime path makes instantaneous speed vary, rename the result to even average speed or change the animation behavior before using `Exact`.

### Duration copy is valid

The `d=beats` copy-format work stays.

### Missing legacy data is not recoverable by guess

Use `1` when duration is absent. A migration may preserve an older trustworthy field, but it may not infer a creative timing pattern from turn counts.

### This handoff does not claim a fix

The design is committed. The application remains incorrect until the listed acceptance gates pass.

## Gotchas

### Shared checkout

The checkout is on `main` and contains extensive unrelated modified and untracked files.

- Never switch branches or create a worktree without Austen's explicit request.
- Never run `git add -A`, `git add .`, or a bare `git commit`.
- Commit only owned files with explicit pathspecs.
- Do not revert, format, stage, or include unrelated changes.

`HandSelector.svelte`, `MobileHandSelector.svelte`, and several color-control primitives already have unrelated changes. Removing a use site does not authorize editing those primitives.

### Green tests currently lie about product correctness

`constant-prop-speed.test.ts` expects Blue-only success after Both fails. Change that test first so the suite cannot preserve the wrong model.

### Turn count is not total angular distance

Shift base rotation changes the actual staff delta. Use the canonical endpoint calculation and verify that it matches the production animator.

### Average speed is not instantaneous speed

`prop-interpolator.ts` multiplies staff rotation delta by progress, while the orchestrator may pass eased progress. Retiming durations alone may not create constant instantaneous angular velocity.

### Duration bounds disagree in source

`duration-pattern-manager.ts` clamps values to `0.1` through `10`, while `duration-pattern-data.ts` treats valid values as `1` or greater. Establish one canonical range before accepting generated timing below `1`.

### Preview and Apply have different durability

Preview should never persist. Apply must persist immediately. Do not fix HMR loss by autosaving every preview change.

### Main viewer and preview may not share every timing path

The dedicated duration preview has its own animation loop. Prove parity with Sequence Viewer before using it as the sole timing oracle.

### Dev server and browser control

Port 5173 belongs to Austen's HTTPS dev server. Never start, stop, restart, or kill it. Interactive Chrome control needs explicit permission in the current conversation.

### TKA rendering

If pictograph or sequence rendering is needed, use only the Flow Arts MCP `generate_pictograph` or `generate_sequence` tools. If the MCP is unavailable, stop and ask for a Codex restart.
