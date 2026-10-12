# Hand Motions Lesson Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `hand-motions-intro` lesson as three stages (motion
map, two hands finding the six combinations, wrap-up board) and give Timing
and Direction its own orchestrator.

**Architecture:** The shared record `hand-motions-topic.ts` gains the six
combinations. Two small seams in the placement grid (which hand was placed,
which hand is being dragged) and one in the placement motion (a second
travelling hand) let the lesson replay a two-hand move. A pure round module
decides combinations and mirror pairs; Svelte stages render it. The old
`timingDirectionOnly` branch moves, unchanged in behavior, into
`TimingDirectionConceptExperience`.

**Tech Stack:** Svelte 5 runes, TypeScript, Vitest, the existing
PictographContainer / PropPlacementGrid renderers.

**Spec:** [hand-motions-rebuild-design.md](../specs/2026-10-10-hand-motions-rebuild-design.md),
build-order step 2. Approved motion map: commit a5fe7cdbf5.

---

## Deviation from the spec (stage 2)

The spec's stage 2 shows a ghost hand at each target while the real hand waits
at its origin. `PropPlacementGrid` commits a hand where it is dropped, and the
approved stage 1 also lands the hand on drop. Stage 2 keeps that: each hand
lands where it is dropped and its one arrow stays drawn from the round's start
point. When both hands have moved, both moves replay together from the start
points, the combination is named and its board cell fills. Re-dragging a hand
in the same round re-targets it from the round's start point. Austen is told
of this in the stage-2 review.

## File structure

| File                                                                                                                                                                                     | Change        | Responsibility                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------- |
| `src/lib/shared/guide-topics/hand-motions-topic.ts`                                                                                                                                      | modify        | six combinations, name colors, pictograph data, move direction                                 |
| `src/lib/shared/guide-topics/hand-motions-topic.test.ts`                                                                                                                                 | modify        | record tests                                                                                   |
| `src/lib/shared/guide-topics/MotionMapArrows.svelte`                                                                                                                                     | modify        | `hand` prop: blue or red arrows and halo                                                       |
| `src/lib/shared/guide-topics/HandCombinationBoard.svelte`                                                                                                                                | create        | six cells: pictograph, name with two-tone bar, optional description                            |
| `src/lib/shared/pictograph/grid/domain/prop-placement.ts`                                                                                                                                | modify        | `PropPlacementChange.placedHand`                                                               |
| `src/lib/shared/pictograph/grid/state/prop-placement-state.svelte.ts`                                                                                                                    | modify        | report the placed hand                                                                         |
| `src/lib/shared/pictograph/grid/components/PropPlacementGrid.svelte`                                                                                                                     | modify        | `onDragTarget(location, hand)`                                                                 |
| `src/lib/shared/pictograph/grid/services/prop-placement-view-model.ts`                                                                                                                   | modify        | `partnerMove` in `buildPlacementTransition`                                                    |
| `src/lib/shared/pictograph/grid/state/prop-placement-motion.svelte.ts`                                                                                                                   | modify        | `PlacementMotionMove.partner`                                                                  |
| `src/lib/features/learn/components/interactive/motions/hand-pairs-round.ts`                                                                                                              | create        | round, combination and mirror logic (pure)                                                     |
| `src/lib/features/learn/components/interactive/motions/HandMotionsMapStage.svelte`                                                                                                       | create        | stage 1: motion map beside its three captions                                                  |
| `src/lib/features/learn/components/interactive/motions/HandPairsStage.svelte`                                                                                                            | create        | stage 2: two-hand grid, readout, board                                                         |
| `src/lib/features/learn/components/interactive/motions/MotionsConceptExperience.svelte`                                                                                                  | rewrite       | Hand Motions orchestrator, three stages                                                        |
| `src/lib/features/learn/components/interactive/motions/hand-motions-stage.ts`                                                                                                            | modify        | schema 3, older saves restart at stage 1                                                       |
| `src/lib/features/learn/components/interactive/motions/TimingDirectionConceptExperience.svelte`                                                                                          | rewrite       | Timing and Direction orchestrator (moved branch)                                               |
| `src/lib/features/learn/components/interactive/motions/timing-lesson-stage.ts`                                                                                                           | modify        | `TIMING_LESSON_SAVED_STEP_OFFSET = 3`                                                          |
| `messages/en.json`, `messages/de.json`                                                                                                                                                   | modify        | `learn_motion_pairs_prompt`, `learn_motion_pairs_mirror`, `learn_ui_continue_timing_direction` |
| `docs/learn/copy-reviews/hand-motions-intro.md`                                                                                                                                          | modify        | record the three keys                                                                          |
| `tests/unit/learn/canonical-concept-lessons.test.ts`, `tests/unit/learn/hand-pairs-round.test.ts`, `tests/unit/learn/timing-lesson-stage.test.ts`, `tests/unit/prop-placement-*.test.ts` | modify/create | contracts                                                                                      |

## Task 1: Six combinations in the shared record

**Files:** `hand-motions-topic.ts`, `hand-motions-topic.test.ts`

- [ ] Write failing tests:
  - `HAND_COMBINATIONS` ids in book order `dual-shift, shift, cross-shift,
dash, dual-dash, static`, each name and description key resolving to
    `verified_level1_hand_motions_77…87` and letter types TYPE1…TYPE6;
  - `combinationFor(blue, red)` is symmetric and covers all nine pairs;
  - `combinationNameSegments("Dual-Shift", TYPE1)` gives `Dual-` in
    `#36c3ff` and `Shift` in `#6F2DA8`; `Shift` is one segment;
  - `combinationPictographData(c)` gives both hands with the demo's motion
    types (PRO for shift, DASH, STATIC) and locations copied from
    `COMBO_DEMOS` in `HandMotionsPage.svelte`;
  - `handMoveDirection(W, N)` is `clockwise`, `(W, S)` counterclockwise;
  - `motionMapArrowData(from, target, HandSide.RIGHT)` puts the motion on
    the right hand.
- [ ] Run `pnpm exec vitest run src/lib/shared/guide-topics/hand-motions-topic.test.ts`: FAIL.
- [ ] Implement:

```ts
export type HandCombinationId =
  | "dual-shift"
  | "shift"
  | "cross-shift"
  | "dash"
  | "dual-dash"
  | "static";
interface ComboHand {
  move: HandMove;
  from: GridLocation;
  to: GridLocation;
}
export interface HandCombination {
  id: HandCombinationId;
  name: TranslationKey;
  description: TranslationKey;
  letterType: LetterType;
  guideSlug: string;
  /** The book's example: blue does the description's first move. */
  demo: { left: ComboHand; right: ComboHand };
}
export const HAND_COMBINATIONS: readonly HandCombination[];
export function combinationFor(blue: HandMove, red: HandMove): HandCombination;
export function combinationNameSegments(
  name: string,
  letterType: LetterType
): readonly { text: string; color: string }[];
export function combinationPictographData(c: HandCombination): PictographData;
export function handMoveDirection(from, to): "clockwise" | "counterclockwise";
export function motionMapArrowData(from, target, hand = HandSide.LEFT);
```

The Guide's descriptions carry `<br>`; `plainTopicText(key)` returns them with
the break as a space.

- [ ] Run the test: PASS. Commit with pathspecs.

## Task 2: Grid seams

**Files:** `prop-placement.ts`, `prop-placement-state.svelte.ts`,
`PropPlacementGrid.svelte`, `prop-placement-view-model.ts`,
`prop-placement-motion.svelte.ts`; tests in `tests/unit/prop-placement-state.test.ts`,
`tests/unit/prop-placement-transition.test.ts`, `tests/unit/prop-placement-motion.test.ts`.

- [ ] Failing tests: `selectPoint` publishes `placedHand` (also when the hand
      is put back on its own point); `edit`, `undo` and `reset` publish `null`.
      `buildPlacementTransition` with `partnerMove` starts both hands at their
      `from` points and gives the partner a PRO (or DASH) motion; without it the
      partner stays a static hold (unchanged). The motion state passes
      `partner` through.
- [ ] Implement: `placedHand?: HandSide | null` on `PropPlacementChange`;
      `publishChange(placedHand = null)`; `onDragTarget?: (location, hand) => void`
      using `aim.locationDragColor`; `partnerMove?: { fromLocation, toLocation,
direction, path }` on `PlacementTransitionInput`;
      `partner?: { from, to, direction, path? }` on `PlacementMotionMove`.
- [ ] Run the three test files: PASS. Commit.

## Task 3: Red arrows on the motion map layer

**Files:** `MotionMapArrows.svelte`

- [ ] Add `hand?: HandSide` (default LEFT). Arrow data uses it, `visibleHand`
      follows it, the halo uses `--prop-red` for the right hand.
- [ ] `/test/motion-map` still draws blue arrows (browser check). Commit.

## Task 4: Round logic

**Files:** create `hand-pairs-round.ts`, `tests/unit/learn/hand-pairs-round.test.ts`

```ts
export interface PairRound {
  start: Record<HandSide, GridLocation>;
  moves: Partial<Record<HandSide, { to: GridLocation; move: HandMove }>>;
}
export function startRound(left: GridLocation, right: GridLocation): PairRound;
export function placeHand(
  round: PairRound,
  hand: HandSide,
  to: GridLocation
): PairRound;
export function roundPair(
  round: PairRound
): { blue: HandMove; red: HandMove } | null;
/** Found once with the hands' moves the other way round. */
export function isMirrorPair(first: Pair, next: Pair): boolean;
```

- [ ] Tests: a round needs both hands; placing a hand twice re-targets from
      the start; a hand back on its start is static; all nine pairs map to six
      combinations; Shift found as blue-shift then blue-static/red-shift is a
      mirror, Dual-Shift twice is not.
- [ ] Implement, PASS, commit.

## Task 5: Combination board

**Files:** create `src/lib/shared/guide-topics/HandCombinationBoard.svelte`

- [ ] Props: `found: ReadonlySet<HandCombinationId> | null` (null shows all),
      `lit: HandCombinationId | null`, `showDescriptions = false`,
      `compact = false`. Each cell: the combination pictograph (two hands, real
      arrows, faded in when found), the name in theme text over a two-tone bar in
      its `LETTER_TYPE_COLORS` (purple and green text fail contrast on the
      lesson's dark and light surfaces), the description when asked. Unfound
      cells keep their size and show the name dimmed.
- [ ] Commit after it renders in stage 2 (Task 7).

## Task 6: Timing and Direction gets its own orchestrator

**Files:** `TimingDirectionConceptExperience.svelte`, `timing-lesson-stage.ts`,
`tests/unit/learn/timing-lesson-stage.test.ts`, `tests/unit/learn/canonical-concept-lessons.test.ts`

- [ ] Move the `timingDirectionOnly` branch of `MotionsConceptExperience`
      into `TimingDirectionConceptExperience` with every condition resolved for
      Timing and Direction: persistence key `timing-and-direction`, schema key
      `timingLessonSchemaVersion`, saved steps offset by
      `TIMING_LESSON_SAVED_STEP_OFFSET` (3, the old hand-path stage count),
      topics then comparison board without choreo cards, `device-fit` CSS,
      `onComplete("reading-choreo-cards")`, keyboard label
      `learn_ui_timing_direction_keyboard`.
- [ ] Test: the offset equals 3 and the migration still maps old step 5 to 7.
      The source contract asserts the new file owns `TimingDirectionBoard`,
      `TimingDirectionExamples`, `migrateTimingLessonSavedStep` and
      `"reading-choreo-cards"`, and no longer renders `MotionsConceptExperience`.
- [ ] Commit.

## Task 7: Hand Motions lesson, three stages

**Files:** `MotionsConceptExperience.svelte` (rewrite), `HandMotionsMapStage.svelte`,
`HandPairsStage.svelte`, `hand-motions-stage.ts`, messages, copy review,
`tests/unit/learn/canonical-concept-lessons.test.ts`.

- [ ] `HAND_MOTIONS_STAGE_SCHEMA_VERSION = 3`;
      `migrateHandMotionsSavedStep(step, version)` returns 1 for older saves,
      else clamps to 1…3. Found moves and combinations persist as phase data
      `mapFound` and `pairsFound`.
- [ ] Stage 1 (`HandMotionsMapStage`): heading "Hand Motions", description
      `learn_motion_map_prompt`; `MotionMapFigure interactive` beside the three
      captions with found marks; Next enabled once all three are found.
- [ ] Stage 2 (`HandPairsStage`): `PropPlacementGrid` with both hands (blue W,
      red E), two `MotionMapArrows` layers, readout line, board. Drop → the
      round records the move and keeps that hand's arrow. Both moved → replay
      (`motionMove` with `partner`, `DURATION.scene`), then the name, description
      and live announcement, the board cell fills; a mirror pair shows
      `learn_motion_pairs_mirror`. After two beats the arrows fade and the next
      round starts from where the hands are. Grabbing a hand ends the hold early.
      Next enabled once all six are found.
- [ ] Stage 3: full board with descriptions, description
      `verified_level1_hand_motions_76`; primary action
      `learn_ui_continue_timing_direction` calls
      `onComplete("timing-and-direction")`. Scroll view opens here.
- [ ] Copy: add `learn_motion_pairs_prompt` "Drag both hands. Find all six.",
      `learn_motion_pairs_mirror` "Same pair, hands swapped." (approved
      2026-10-11) and `learn_ui_continue_timing_direction` "Continue to Timing
      and Direction" (follows `learn_ui_continue_hand_motions`), English and
      German.
- [ ] Update the source contract for the new orchestrator. Commit.

## Task 8: Verify and hand off

- [ ] `pnpm exec vitest run` on the touched test files; `npm run check:fast`
      after the resource gate.
- [ ] Browser, task preview on 5196, `/learn/concepts/hand-motions-intro`:
      each stage at 375×812, 1440×900, 2560×1440; drag and keyboard find all
      three moves and all six combinations; a mirror pair shows the message;
      reduced motion shows results without travel;
      `/learn/concepts/timing-and-direction` behaves as before.
- [ ] Spec: stage 2 text, the handbook and Guide-page "all arrows" lines
      flagged for Austen. Memory update. Keep unmerged until Austen approves the
      lesson in the browser.
