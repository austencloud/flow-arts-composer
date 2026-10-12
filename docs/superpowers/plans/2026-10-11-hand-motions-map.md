# Hand Motions Motion Map Draft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the motion map figure (one grid, the blue hand at West, all three moves drawn at once, a self-build that runs each move, and drag-to-name) on a dev review page, so Austen can approve it in the browser before the two-hand stage is built.

**Architecture:** The figure composes existing owners. `PropPlacementGrid` stays the one drag owner and gains a one-hand mode, a `showProps` switch, an `onReady` passthrough and a `figureLayer` snippet that draws extra art in the grid's own square. Its placement motion learns a straight dash and a per-move duration. The arrows are three arrow-only `PictographContainer` layers in that snippet. The self-build beats move out of `HubHeroBuild.svelte` into a shared `createBuildSequence` (second use), and the hero moves onto it. Words and figure states live in a new shared topic record, `hand-motions-topic.ts`.

**Tech Stack:** SvelteKit, Svelte 5 runes, TypeScript, Vitest (jsdom unit project), the in-app browser for visual checks.

**Spec:** `docs/superpowers/specs/2026-10-10-hand-motions-rebuild-design.md` (build order step 1 only). The lesson stages, the Timing and Direction split, the Guide web page and the handbook page get their own plan after Austen approves this draft.

**Worktree:** `E:/worktrees/tka-platform/hand-motions-map`, branch `codex/hand-motions-map`, `node_modules` junctioned to the primary checkout. Run every command below from the worktree unless a step says otherwise. Never run `pnpm install` here (it relinks the primary through the junction).

---

## File map

| File                                                                   | Change | Responsibility                                                                  |
| ---------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| `src/lib/shared/guide-topics/hand-motions-topic.ts`                    | create | Words (translation keys), the three moves, move naming, map targets, arrow data |
| `src/lib/shared/guide-topics/hand-motions-topic.test.ts`               | create | Record and move-naming tests                                                    |
| `src/lib/shared/pictograph/grid/services/prop-placement-view-model.ts` | modify | `buildPlacementTransition`: dash path, optional partner                         |
| `src/lib/shared/pictograph/grid/state/prop-placement-motion.svelte.ts` | modify | `PlacementMotionMove.path` and `.durationMs`; no partner needed                 |
| `tests/unit/prop-placement-transition.test.ts`                         | modify | Dash and one-hand transition tests                                              |
| `tests/unit/prop-placement-motion.test.ts`                             | create | Motion state plays a one-hand dash for its duration                             |
| `src/lib/shared/pictograph/grid/state/prop-placement-state.svelte.ts`  | modify | `getHands` input: left-hand-only placement                                      |
| `tests/unit/prop-placement-state.test.ts`                              | modify | Left-hand-only tests                                                            |
| `src/lib/shared/pictograph/grid/components/PropPlacementGrid.svelte`   | modify | `hands`, `showProps`, `onReady`, `figureLayer` props                            |
| `src/lib/shared/transitions/build-sequence.ts`                         | create | Shared self-build beats (`createBuildSequence`, `whenOnScreen`)                 |
| `tests/unit/build-sequence.test.ts`                                    | create | Beat order, reduced motion, cancel                                              |
| `src/routes/(public)/guide/_components/HubHeroBuild.svelte`            | modify | Moves onto `createBuildSequence`, same behavior                                 |
| `src/lib/shared/guide-topics/MotionMapArrows.svelte`                   | create | Three arrow-only layers plus the static halo                                    |
| `src/lib/shared/guide-topics/MotionMapFigure.svelte`                   | create | The figure: grid, hand, arrows, self-build, drag-to-name                        |
| `messages/en.json`, `messages/de.json`                                 | modify | `learn_motion_map_prompt` (approved 2026-10-11)                                 |
| `src/routes/test/motion-map/+page.svelte`                              | create | Dev review page: prompt, figure, three captions, Play again                     |
| `docs/architecture/canonical-capabilities.md`                          | modify | Record the build-sequence owner and the placement-grid extensions               |

Already done in this worktree before Task 1: the spec's Wording section records Austen's 2026-10-11 choices (Static caption "Remain at the same point", three prompts approved), and `docs/learn/copy-reviews/hand-motions-intro.md` has matching approval entries.

## Capability decisions (never-hand-roll)

Search terms used: drag, dragLocations, motionMove, motionProgress, placement motion, hero build, self-build, staged reveal, single hand, one hand, visibleHand, figure layer, crossfade, LETTER_TYPE_COLORS.

- Reusing `PropPlacementGrid` for dragging and keyboard placement of the hand.
- Extending `PropPlacementGrid` with `hands="left"`, `showProps`, `onReady` and `figureLayer`. Closest match: none; the grid has no one-hand mode (`prop-placement-state.svelte.ts` always asks for the right hand next).
- Extending `prop-placement-motion.svelte.ts` with a straight dash path and a per-move duration. The travel renderer (`calculatePictographMotionPositions` via `interpolatePropAngles`) already interpolates DASH in a straight line through the center.
- Creating the build sequence with `createBuildSequence` as owner. Closest match: `HubHeroBuild.svelte`'s page-local `after`/`animate` helpers; this is their second use, so they move to the shared owner and the hero uses it.
- Reusing `PictographContainer` for the arrows (three arrow-only layers: no grid, no props, transparent background). Its own content transition crossfades an arrow when its data changes, so no `Crossfade` wrapper is needed (that would remount heavy pictographs).
- Reusing `PanelButton` for the review page's Play again action.

## Draft choices Austen judges in the browser

- Demonstration: each move plays out and back from West along its own arrow (shift north, dash east), then Static lights the halo. The hand never jumps.
- A learner drop does not replay travel (the finger already carried the hand; same rule as the step editor). The move's arrows light, the others dim, and after one beat pause the map redraws around the point where the hand landed.
- Static halo: a soft blue ring on the hand's own point, brighter when Static is lit.
- Pace: travel uses `DURATION.scene` (800 ms), pauses use `BUILD_BEAT_PAUSE_MS` (650 ms, the hero's current value).

---

### Task 1: Shared topic record and move naming

**Files:**

- Create: `src/lib/shared/guide-topics/hand-motions-topic.ts`
- Test: `src/lib/shared/guide-topics/hand-motions-topic.test.ts`
- Modify: `messages/en.json` (after line 5829, `"learn_motion_path_aria"`), `messages/de.json` (after `"learn_motion_path_aria"`, line 5121)

- [ ] **Step 1: Add the approved prompt to both catalogs**

In `messages/en.json`, directly after `"learn_motion_path_aria": "{name}: {caption}",` add:

```json
  "learn_motion_map_prompt": "Drag the hand to a point.",
```

In `messages/de.json`, directly after its `"learn_motion_path_aria"` line add:

```json
  "learn_motion_map_prompt": "Ziehe die Hand auf einen Punkt.",
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/shared/guide-topics/hand-motions-topic.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import en from "../../../../messages/en.json";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  HandSide,
  MotionType,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  HAND_MOTIONS_TOPIC_UNITS,
  MOTION_MAP_HOME,
  MOTION_MAP_MOVES,
  classifyHandMove,
  handMotionsTopicText,
  motionMapArrowData,
  motionMapTargets,
} from "./hand-motions-topic";

const english = en as Record<string, string>;
const { NORTH: N, EAST: E, SOUTH: S, WEST: W } = GridLocation;

describe("Hand Motions topic record", () => {
  it("resolves every unit to an English message", () => {
    for (const [unit, key] of Object.entries(HAND_MOTIONS_TOPIC_UNITS)) {
      expect(english[key], `${unit} -> ${key}`).toBeTruthy();
    }
  });

  it("uses Austen's chosen Static caption", () => {
    expect(handMotionsTopicText("staticCaption")).toBe(
      "Remain at the same point"
    );
  });

  it("carries the approved motion map prompt", () => {
    expect(handMotionsTopicText("mapPrompt")).toBe("Drag the hand to a point.");
  });

  it("lists the three moves in the book's order", () => {
    expect(MOTION_MAP_MOVES.map((move) => move.id)).toEqual([
      "shift",
      "dash",
      "static",
    ]);
  });
});

describe("classifyHandMove", () => {
  it.each([
    [W, N, "shift"],
    [W, S, "shift"],
    [W, E, "dash"],
    [W, W, "static"],
    [N, E, "shift"],
    [N, S, "dash"],
  ] as const)("%s to %s is a %s", (from, to, move) => {
    expect(classifyHandMove(from, to)).toBe(move);
  });

  it("names no move for a 45-degree step", () => {
    expect(classifyHandMove(W, GridLocation.NORTHWEST)).toBeNull();
  });
});

describe("motion map targets", () => {
  it("draws the book's map from West: shifts north and south, dash east", () => {
    expect(
      motionMapTargets(MOTION_MAP_HOME).map((target) => [
        target.slot,
        target.to,
      ])
    ).toEqual([
      ["shift-clockwise", N],
      ["shift-counterclockwise", S],
      ["dash", E],
    ]);
  });

  it("redraws around wherever the hand lands", () => {
    expect(motionMapTargets(N).map((target) => target.to)).toEqual([E, W, S]);
  });

  it("builds one blue arrow per target with the move's motion type", () => {
    const [shift, , dash] = motionMapTargets(W);
    expect(
      motionMapArrowData(W, shift!).motions?.[HandSide.LEFT]?.motionType
    ).toBe(MotionType.PRO);
    const dashData = motionMapArrowData(W, dash!);
    expect(dashData.motions?.[HandSide.LEFT]?.motionType).toBe(MotionType.DASH);
    expect(dashData.motions?.[HandSide.RIGHT]).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/guide-topics/hand-motions-topic.test.ts`
Expected: FAIL, cannot resolve `./hand-motions-topic`.

- [ ] **Step 4: Write the record**

Create `src/lib/shared/guide-topics/hand-motions-topic.ts`:

```ts
/**
 * Hand Motions' shared teaching content. The lesson, the Guide web page and
 * the print handbook read their words and figure states from here, so one
 * edit reaches all three. The captions are the lesson's approved wording;
 * Austen chose "Remain at the same point" for Static in every new view on
 * 2026-10-11 (the frozen first edition keeps the book's line). Interaction,
 * pacing and progress stay with each view.
 * Spec: docs/superpowers/specs/2026-10-10-hand-motions-rebuild-design.md
 */
import {
  getShortestRotationStepsBetweenLocations,
  rotateLocation,
} from "#lib/shared/create/services/rotation-helpers.js";
import { t } from "#lib/shared/i18n/i18n.svelte.js";
import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";
import {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  HandSide,
  MotionType,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";

export const HAND_MOTIONS_TOPIC_UNITS = {
  title: "verified_level1_hand_motions_71",
  intro: "verified_level1_hand_motions_72",
  shiftName: "learn_motion_path_shift_name",
  shiftCaption: "learn_motion_path_shift_caption",
  dashName: "learn_motion_path_dash_name",
  dashCaption: "learn_motion_path_dash_caption",
  staticName: "learn_motion_path_static_name",
  staticCaption: "learn_motion_path_static_caption",
  mapPrompt: "learn_motion_map_prompt",
} as const satisfies Record<string, TranslationKey>;

export type HandMotionsTopicUnit = keyof typeof HAND_MOTIONS_TOPIC_UNITS;

export function handMotionsTopicText(unit: HandMotionsTopicUnit): string {
  return t(HAND_MOTIONS_TOPIC_UNITS[unit]);
}

export type HandMove = "shift" | "dash" | "static";

export const MOTION_MAP_MOVES = [
  { id: "shift", name: "shiftName", caption: "shiftCaption" },
  { id: "dash", name: "dashName", caption: "dashCaption" },
  { id: "static", name: "staticName", caption: "staticCaption" },
] as const satisfies readonly {
  id: HandMove;
  name: HandMotionsTopicUnit;
  caption: HandMotionsTopicUnit;
}[];

/** Where the motion map's blue hand rests, as in the book. */
export const MOTION_MAP_HOME: GridLocation = GridLocation.WEST;

/**
 * Names the move a hand makes between two hand points: the same point is
 * static, a quarter turn is a shift, a half turn is a dash. A 45-degree step
 * is no hand motion and returns null.
 */
export function classifyHandMove(
  from: GridLocation,
  to: GridLocation
): HandMove | null {
  const steps = getShortestRotationStepsBetweenLocations(from, to);
  if (steps === 0) return "static";
  if (steps === 2 || steps === -2) return "shift";
  if (steps === 4 || steps === -4) return "dash";
  return null;
}

export type MotionMapSlot =
  | "shift-clockwise"
  | "shift-counterclockwise"
  | "dash";

export interface MotionMapTarget {
  slot: MotionMapSlot;
  move: Exclude<HandMove, "static">;
  to: GridLocation;
  direction: "clockwise" | "counterclockwise";
}

/** The three moves drawn from a hand point: both shifts, then the dash. */
export function motionMapTargets(
  from: GridLocation
): readonly MotionMapTarget[] {
  const turned = (eighths: number) =>
    rotateLocation(from, eighths) as GridLocation;
  return [
    {
      slot: "shift-clockwise",
      move: "shift",
      to: turned(2),
      direction: "clockwise",
    },
    {
      slot: "shift-counterclockwise",
      move: "shift",
      to: turned(-2),
      direction: "counterclockwise",
    },
    { slot: "dash", move: "dash", to: turned(4), direction: "clockwise" },
  ];
}

/**
 * One blue hand's move as a pictograph, built like the book's motion boxes
 * (HandMotionsPage.svelte `singleHand`): shifts author as PRO and render as
 * the float arc for hand props, dashes as the straight dash arrow.
 */
export function motionMapArrowData(
  from: GridLocation,
  target: MotionMapTarget
): PictographData {
  return {
    id: `motion-map-${target.slot}-${from}`,
    letter: null,
    gridMode: GridMode.DIAMOND,
    motions: {
      [HandSide.LEFT]: createMotionData({
        motionType: target.move === "dash" ? MotionType.DASH : MotionType.PRO,
        startLocation: from,
        endLocation: target.to,
        hand: HandSide.LEFT,
        propType: PropType.HAND,
        gridMode: GridMode.DIAMOND,
      }),
    },
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/guide-topics/hand-motions-topic.test.ts tests/unit/german-catalog-contract.test.ts`
Expected: PASS (all record tests; the German contract still passes with the new key).

- [ ] **Step 6: Commit**

```bash
git add src/lib/shared/guide-topics/hand-motions-topic.ts src/lib/shared/guide-topics/hand-motions-topic.test.ts messages/en.json messages/de.json docs/superpowers/specs/2026-10-10-hand-motions-rebuild-design.md docs/learn/copy-reviews/hand-motions-intro.md docs/superpowers/plans/2026-10-11-hand-motions-map.md
git commit -m "feat(guide): Hand Motions topic record and approved copy" -- src/lib/shared/guide-topics/hand-motions-topic.ts src/lib/shared/guide-topics/hand-motions-topic.test.ts messages/en.json messages/de.json docs/superpowers/specs/2026-10-10-hand-motions-rebuild-design.md docs/learn/copy-reviews/hand-motions-intro.md docs/superpowers/plans/2026-10-11-hand-motions-map.md
```

---

### Task 2: Placement motion plays a dash, with or without a partner

**Files:**

- Modify: `src/lib/shared/pictograph/grid/services/prop-placement-view-model.ts` (`PlacementTransitionInput` at line 188, `buildPlacementTransition` at line 247)
- Modify: `src/lib/shared/pictograph/grid/state/prop-placement-motion.svelte.ts`
- Test: `tests/unit/prop-placement-transition.test.ts` (append), `tests/unit/prop-placement-motion.test.ts` (create)

- [ ] **Step 1: Write the failing transition tests**

Append to `tests/unit/prop-placement-transition.test.ts`:

```ts
describe("one-hand moves", () => {
  const oneHand = {
    ...baseInput,
    leftPropType: PropType.HAND,
    rightPropType: PropType.HAND,
    movingColor: HandSide.LEFT,
    rightLocation: null,
  };
  const positions = (
    from: { x: number; y: number },
    to: { x: number; y: number }
  ) => ({
    gridMode: GridMode.DIAMOND,
    leftPropType: PropType.HAND,
    rightPropType: PropType.HAND,
    startPlacements: { left: { ...from, rotation: 0 } },
    endPlacements: { left: { ...to, rotation: 0 } },
  });

  it("plays a dash straight through the center with no partner", () => {
    const { startData, transitionStep } = buildPlacementTransition({
      ...oneHand,
      path: "dash",
      fromLocation: GridLocation.WEST,
      toLocation: GridLocation.EAST,
      direction: "clockwise",
      leftLocation: GridLocation.EAST,
    });
    expect(transitionStep.motions.left.motionType).toBe(MotionType.DASH);
    expect(transitionStep.motions.right).toBeUndefined();
    expect(startData.motions.right).toBeUndefined();
    const midpoint = calculatePictographMotionPositions({
      ...positions({ x: 325, y: 475 }, { x: 625, y: 475 }),
      step: transitionStep,
      progress: 0.5,
    });
    expect(midpoint.left?.x).toBeCloseTo(475);
    expect(midpoint.left?.y).toBeCloseTo(475);
  });

  it("keeps a one-hand shift on its arc around the center", () => {
    const { transitionStep } = buildPlacementTransition({
      ...oneHand,
      fromLocation: GridLocation.WEST,
      toLocation: GridLocation.NORTH,
      direction: "clockwise",
      leftLocation: GridLocation.NORTH,
    });
    expect(transitionStep.motions.left.pathShape).toBe("arc");
    const midpoint = calculatePictographMotionPositions({
      ...positions({ x: 325, y: 475 }, { x: 475, y: 325 }),
      step: transitionStep,
      progress: 0.5,
    });
    // A straight line would pass 106 units from the center; the arc keeps
    // the hand on its 150-unit circle.
    expect(
      Math.hypot(midpoint.left!.x - 475, midpoint.left!.y - 475)
    ).toBeGreaterThan(140);
  });
});
```

- [ ] **Step 2: Write the failing motion-state test**

Create `tests/unit/prop-placement-motion.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  createPropPlacementMotionState,
  type PlacementMotionMove,
} from "#lib/shared/pictograph/grid/state/prop-placement-motion.svelte.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  HandSide,
  MotionType,
  Orientation,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { DURATION } from "#lib/shared/transitions/transitions.js";

describe("placement motion state", () => {
  afterEach(() => vi.useRealTimers());

  it("plays a one-hand dash for the move's own duration", () => {
    vi.useFakeTimers({
      toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"],
    });
    const move: PlacementMotionMove = {
      epoch: 1,
      color: HandSide.LEFT,
      from: GridLocation.WEST,
      to: GridLocation.EAST,
      direction: "clockwise",
      path: "dash",
      durationMs: DURATION.scene,
    };
    const motion = createPropPlacementMotionState({
      getMove: () => move,
      getGridMode: () => GridMode.DIAMOND,
      getLeftPropType: () => PropType.HAND,
      getRightPropType: () => PropType.HAND,
      getLeftOrientation: () => Orientation.IN,
      getRightOrientation: () => Orientation.IN,
      getLeftLocation: () => GridLocation.EAST,
      getRightLocation: () => null,
      getBetaSwapped: () => false,
      getPreviewPictographData: () => null,
    });

    motion.synchronize();
    expect(motion.active).toBe(true);
    expect(motion.step?.motions.left?.motionType).toBe(MotionType.DASH);

    vi.advanceTimersByTime(DURATION.dramatic + 50);
    expect(motion.active).toBe(true);

    vi.advanceTimersByTime(DURATION.scene);
    expect(motion.active).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/prop-placement-transition.test.ts tests/unit/prop-placement-motion.test.ts`
Expected: FAIL. The transition tests fail on `rightLocation: null` / `path` (type errors surface as runtime: `buildMotion(null, …)` throws or the moving motion is PRO). The motion test fails because `begin` finishes at once when the right location is null.

- [ ] **Step 4: Extend `buildPlacementTransition`**

In `src/lib/shared/pictograph/grid/services/prop-placement-view-model.ts`, change `PlacementTransitionInput`:

```ts
export interface PlacementTransitionInput {
  gridMode: GridMode;
  movingColor: HandSide;
  fromLocation: GridLocation;
  toLocation: GridLocation;
  direction: "clockwise" | "counterclockwise";
  /** "arc" (default) is the pro shift around the center; "dash" goes straight through it. */
  path?: "arc" | "dash";
  /** Null when the grid holds only the moving hand. */
  leftLocation: GridLocation | null;
  rightLocation: GridLocation | null;
  leftOrientation: Orientation;
  rightOrientation: Orientation;
  leftPropType: PropType;
  rightPropType: PropType;
  betaSwapped: boolean;
  previewPictographData: StepData | PictographData | null;
}
```

In `buildPlacementTransition`, replace the `movingMotion` and `partnerMotion` declarations with:

```ts
const dash = input.path === "dash";
const movingMotion = createMotionData({
  motionType: dash ? MotionType.DASH : MotionType.PRO,
  rotationDirection: dash
    ? RotationDirection.NO_ROTATION
    : input.direction === "clockwise"
      ? RotationDirection.CLOCKWISE
      : RotationDirection.COUNTER_CLOCKWISE,
  startLocation: input.fromLocation,
  endLocation: input.toLocation,
  turns: 0,
  startOrientation: isBlueMoving
    ? input.leftOrientation
    : input.rightOrientation,
  endOrientation: isBlueMoving ? input.leftOrientation : input.rightOrientation,
  isVisible: true,
  propType: isBlueMoving ? input.leftPropType : input.rightPropType,
  arrowLocation: input.toLocation,
  hand: input.movingColor,
  gridMode: input.gridMode,
  // Force the circular path around the grid center regardless of the global
  // animation path-shape setting — this preview IS the pathway. A dash is
  // always straight, so it needs no override.
  ...(dash ? {} : { pathShape: "arc" as const }),
});
const partnerLocation = isBlueMoving ? input.rightLocation : input.leftLocation;
const partnerColor = isBlueMoving ? HandSide.RIGHT : HandSide.LEFT;
const partnerMotion = partnerLocation
  ? buildMotion(
      partnerLocation,
      partnerColor,
      isBlueMoving ? input.rightOrientation : input.leftOrientation,
      isBlueMoving ? input.rightPropType : input.leftPropType,
      input.gridMode
    )
  : null;
```

and replace the `motions` entry of `transitionStep` with:

```ts
    motions: {
      [input.movingColor]: movingMotion,
      ...(partnerMotion ? { [partnerColor]: partnerMotion } : {}),
    },
```

Update the doc comment above the function to say the moving prop travels a pro arc (or a straight dash) and the partner, when there is one, resolves its beta offset.

- [ ] **Step 5: Extend the motion state**

In `src/lib/shared/pictograph/grid/state/prop-placement-motion.svelte.ts`:

Add two fields to `PlacementMotionMove`:

```ts
  /** "arc" (default) is the pro shift; "dash" travels straight through the center. */
  path?: "arc" | "dash";
  /** Travel time; defaults to DURATION.dramatic. A teaching demo uses DURATION.scene. */
  durationMs?: number;
```

Give `start` a duration parameter and use it in `tick`:

```ts
function start(durationMs: number = MOTION_DURATION_MS) {
  if (!transition || frame) return;
  if (reducedMotion()) {
    finish();
    return;
  }
  const startedAt = performance.now();
  const tick = (now: number) => {
    const t = reducedMotion() ? 1 : Math.min(1, (now - startedAt) / durationMs);
    progress = cubicInOut(t);
    if (t < 1) frame = requestAnimationFrame(tick);
    else finish();
  };
  frame = requestAnimationFrame(tick);
}
```

In `begin`, replace the both-locations guard and the `prepare(...)`/`start()` calls with:

```ts
const isBlueMoving = move.color === HandSide.LEFT;
const leftLocation = isBlueMoving ? move.to : deps.getLeftLocation();
const rightLocation = isBlueMoving ? deps.getRightLocation() : move.to;

prepare(
  buildPlacementTransition({
    gridMode: deps.getGridMode(),
    movingColor: move.color,
    fromLocation: move.from,
    toLocation: move.to,
    direction: move.direction,
    path: move.path ?? "arc",
    leftLocation,
    rightLocation,
    leftOrientation: deps.getLeftOrientation(),
    rightOrientation: deps.getRightOrientation(),
    leftPropType: deps.getLeftPropType(),
    rightPropType: deps.getRightPropType(),
    betaSwapped: deps.getBetaSwapped(),
    previewPictographData: deps.getPreviewPictographData(),
  })
);
start(move.durationMs);
```

Update the file's header comment: the moving prop travels a pro arc or a straight dash; the partner, when present, glides out of or into its beta offset.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/prop-placement-transition.test.ts tests/unit/prop-placement-motion.test.ts tests/unit/prop-placement-view-model.test.ts`
Expected: PASS, including every existing transition test (two-hand arcs unchanged).

- [ ] **Step 7: Commit**

```bash
git add tests/unit/prop-placement-motion.test.ts
git commit -m "feat(placement): dash travel and one-hand moves in the placement motion" -- src/lib/shared/pictograph/grid/services/prop-placement-view-model.ts src/lib/shared/pictograph/grid/state/prop-placement-motion.svelte.ts tests/unit/prop-placement-transition.test.ts tests/unit/prop-placement-motion.test.ts
```

---

### Task 3: Left-hand-only placement state

**Files:**

- Modify: `src/lib/shared/pictograph/grid/state/prop-placement-state.svelte.ts`
- Test: `tests/unit/prop-placement-state.test.ts`

- [ ] **Step 1: Add the input to the test harness**

In `tests/unit/prop-placement-state.test.ts`, inside `createHarness`, add `hands: "both" as "both" | "left",` to `values` (after `canAim: false,`), and add `getHands: () => values.hands,` to the inputs object passed to `createPropPlacementState` (after `getActivePoints`).

- [ ] **Step 2: Write the failing tests**

Append to `tests/unit/prop-placement-state.test.ts`:

```ts
describe("left-hand-only placement", () => {
  function leftOnly(initialLeft: GridLocation | null) {
    const harness = createHarness();
    harness.values.hands = "left";
    harness.values.initialLeftLocation = initialLeft;
    harness.state.synchronizeInputs();
    return harness;
  }

  it("counts one placed hand as a complete placement", () => {
    const { state } = leftOnly(GridLocation.WEST);
    expect(state.activeHand).toBeNull();
    expect(state.isComplete).toBe(true);
  });

  it("moves the hand without ever asking for the right hand", () => {
    const { state, onChange, onPlacementComplete } = leftOnly(
      GridLocation.WEST
    );
    state.edit(HandSide.LEFT);
    state.selectPoint(GridLocation.NORTH);
    expect(state.leftLocation).toBe(GridLocation.NORTH);
    expect(state.rightLocation).toBeNull();
    expect(state.activeHand).toBeNull();
    expect(state.liveAnnouncement).not.toContain("right prop");
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        leftLocation: GridLocation.NORTH,
        rightLocation: null,
        activeHand: null,
        complete: true,
      })
    );
    expect(onPlacementComplete).not.toHaveBeenCalled();
  });

  it("places a first hand and stops there", () => {
    const { state } = leftOnly(null);
    expect(state.activeHand).toBe(HandSide.LEFT);
    state.selectPoint(GridLocation.EAST);
    expect(state.activeHand).toBeNull();
    expect(state.isComplete).toBe(true);
  });

  it("ignores a right-hand selection", () => {
    const { state } = leftOnly(GridLocation.WEST);
    state.selectPoint(GridLocation.SOUTH, HandSide.RIGHT);
    expect(state.rightLocation).toBeNull();
    expect(state.historyLength).toBe(0);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/prop-placement-state.test.ts`
Expected: FAIL. `activeHand` is `"right"` after the first test's sync, and `isComplete` is false.

- [ ] **Step 4: Implement the one-hand input**

In `src/lib/shared/pictograph/grid/state/prop-placement-state.svelte.ts`:

Add to `PropPlacementStateInputs`:

```ts
  /** "left" keeps one blue hand; the right hand is never asked for. */
  getHands?: () => "both" | "left";
```

Add `:${inputs.getHands?.() ?? "both"}` to the end of the template string in `buildInitializationKey`.

At the top of `createPropPlacementState`, before the `$state` declarations, add:

```ts
const leftOnly = () => inputs.getHands?.() === "left";

function initialActiveHand(): HandSide | null {
  if (!inputs.getInitialLeftLocation()) return HandSide.LEFT;
  if (leftOnly() || inputs.getInitialRightLocation()) return null;
  return HandSide.RIGHT;
}
```

Replace the `activeHand` initializer with `let activeHand = $state<HandSide | null>(initialActiveHand());` and, in `synchronizeInputs`, replace the nested ternary with `activeHand = initialActiveHand();`.

Change `isComplete`:

```ts
function isComplete(): boolean {
  return leftLocation !== null && (leftOnly() || rightLocation !== null);
}
```

In `selectPoint`, after the `if (inputs.getDisabled() || color === null) return;` line add:

```ts
if (color === HandSide.RIGHT && leftOnly()) return;
```

and replace the `if (color === HandSide.LEFT) { … }` branch body with:

```ts
if (color === HandSide.LEFT) {
  const previous = leftLocation;
  leftLocation = location;
  activeHand = rightLocation === null && !leftOnly() ? HandSide.RIGHT : null;
  dependencies.triggerHaptic();
  liveAnnouncement = leftOnly()
    ? `${inputs.getLeftNoun()} ${previous === null ? "placed at" : "moved to"} ${label}.`
    : rightLocation === null
      ? `${inputs.getLeftNoun()} placed at ${label}. Place the ${inputs.getRightNoun()}.`
      : `${inputs.getLeftNoun()} moved to ${label}. Position ready.`;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/prop-placement-state.test.ts tests/unit/prop-placement-grid-decomposition-contract.test.ts`
Expected: PASS, including every existing two-hand test.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(placement): left-hand-only placement state" -- src/lib/shared/pictograph/grid/state/prop-placement-state.svelte.ts tests/unit/prop-placement-state.test.ts
```

---

### Task 4: PropPlacementGrid props for one-hand figures

**Files:**

- Modify: `src/lib/shared/pictograph/grid/components/PropPlacementGrid.svelte`

No new unit test: the state change is covered by Task 3, and these are pass-through props. The browser check in Task 9 exercises them.

- [ ] **Step 1: Add the props**

Add `import type { Snippet } from "svelte";` beside the existing `import { untrack } from "svelte";`.

In the `Props` interface (line 43), after `gridJoin?: GridJoin | null;` add:

```ts
    /** "left" keeps one blue hand on the grid; the right hand is never placed. */
    hands?: "both" | "left";
    /** False hides the hands and shows the grid alone, as a self-building figure starts. */
    showProps?: boolean;
    /** Fires once the pictograph has drawn (PictographContainer onReady). */
    onReady?: () => void;
    /** Figure art drawn over the pictograph and under the touch targets, in the grid's own square. */
    figureLayer?: Snippet;
```

In the destructuring, after `gridJoin = null,` add:

```ts
    hands = "both",
    showProps = true,
    onReady,
    figureLayer,
```

In the `createPropPlacementState` inputs object, after `getActivePoints: () => activePoints,` add `getHands: () => hands,`.

- [ ] **Step 2: Wire them into the markup**

On the `<PictographContainer` inside `.pictograph-layer`, add after `arrowOpacity={motion.active ? 0 : 1}`:

```svelte
{showProps}
{onReady}
```

Directly after the closing `</div>` of `.pictograph-layer` and before `<PropPlacementInteractionOverlay`, add:

```svelte
{#if figureLayer}
  <div class="figure-layer" aria-hidden="true">
    {@render figureLayer()}
  </div>
{/if}
```

In the `<style>` block, after the `.pictograph-layer` rule, add:

```css
/* Figure art shares the pictograph's square and never takes a pointer. */
.figure-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
```

- [ ] **Step 3: Check the overlay draws above the figure layer**

Run: `grep -n "\.interaction-overlay {" -A6 src/lib/shared/pictograph/grid/components/PropPlacementInteractionOverlay.svelte`
Expected: the overlay is `position: absolute` with `inset: 0` (or equivalent). It comes later in the DOM, so it stacks above `.figure-layer`. If it sets no position, stop and report; do not add a z-index war.

- [ ] **Step 4: Run the grid tests**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/prop-placement-state.test.ts tests/unit/prop-placement-grid-decomposition-contract.test.ts tests/unit/prop-placement-view-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(placement): one-hand, showProps, onReady and figure layer on PropPlacementGrid" -- src/lib/shared/pictograph/grid/components/PropPlacementGrid.svelte
```

---

### Task 5: Shared build sequence, and the hero moves onto it

**Files:**

- Create: `src/lib/shared/transitions/build-sequence.ts`
- Test: `tests/unit/build-sequence.test.ts`
- Modify: `src/routes/(public)/guide/_components/HubHeroBuild.svelte`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/build-sequence.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBuildSequence } from "#lib/shared/transitions/build-sequence.js";

describe("build sequence", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        "setTimeout",
        "clearTimeout",
        "requestAnimationFrame",
        "cancelAnimationFrame",
        "performance",
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete document.documentElement.dataset.motionPreference;
  });

  it("plays acts, pauses and tweens in order, then finishes", () => {
    const log: string[] = [];
    const tweened: number[] = [];
    createBuildSequence().play(
      [
        { act: () => log.push("grid") },
        { pause: 100 },
        { act: () => log.push("hand") },
        { tween: 200, step: (t) => tweened.push(t) },
      ],
      () => log.push("done")
    );

    expect(log).toEqual(["grid"]);
    vi.advanceTimersByTime(100);
    expect(log).toEqual(["grid", "hand"]);
    vi.advanceTimersByTime(300);
    expect(tweened[0]).toBe(0);
    expect(tweened.at(-1)).toBe(1);
    expect(log).toEqual(["grid", "hand", "done"]);
  });

  it("skips to the finished picture under reduced motion", () => {
    document.documentElement.dataset.motionPreference = "reduce";
    const act = vi.fn();
    const finish = vi.fn();
    createBuildSequence().play([{ act }, { pause: 500 }], finish);
    expect(act).not.toHaveBeenCalled();
    expect(finish).toHaveBeenCalledOnce();
  });

  it("stops a cancelled build before its next beat and never finishes it", () => {
    const act = vi.fn();
    const finish = vi.fn();
    const sequence = createBuildSequence();
    sequence.play([{ pause: 100 }, { act }], finish);
    sequence.cancel();
    vi.advanceTimersByTime(500);
    expect(act).not.toHaveBeenCalled();
    expect(finish).not.toHaveBeenCalled();
  });

  it("replaces a running build when played again", () => {
    const first = vi.fn();
    const second = vi.fn();
    const sequence = createBuildSequence();
    sequence.play([{ pause: 100 }], first);
    sequence.play([{ pause: 100 }], second);
    vi.advanceTimersByTime(200);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/build-sequence.test.ts`
Expected: FAIL, cannot resolve `build-sequence.js`.

- [ ] **Step 3: Write the owner**

Create `src/lib/shared/transitions/build-sequence.ts`:

```ts
/**
 * A figure that builds itself: a short list of beats (pause, change some
 * state, tween a value from 0 to 1) played once, in order. The Guide front
 * page's hero and the Hand Motions motion map use it. Reduced motion skips
 * straight to the finished picture. cancel() stops a build nobody wants any
 * more (the learner grabbed the hand, the figure unmounted); playing again
 * replaces the running build.
 */
import { reducedMotion } from "./motion.js";

/** Pause between beats, long enough to read each one. */
export const BUILD_BEAT_PAUSE_MS = 650;

export type BuildBeat =
  | { pause: number }
  | { act: () => void }
  | { tween: number; step: (t: number) => void };

export interface BuildSequence {
  play(beats: readonly BuildBeat[], finish: () => void): void;
  cancel(): void;
}

export function createBuildSequence(): BuildSequence {
  let run = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let frame = 0;

  function cancel(): void {
    run += 1;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }

  function play(beats: readonly BuildBeat[], finish: () => void): void {
    cancel();
    if (reducedMotion()) {
      finish();
      return;
    }
    const current = run;
    let index = 0;

    const next = (): void => {
      if (current !== run) return;
      const beat = beats[index++];
      if (!beat) {
        finish();
        return;
      }
      if ("act" in beat) {
        beat.act();
        next();
        return;
      }
      if ("pause" in beat) {
        timer = setTimeout(next, beat.pause);
        return;
      }
      let startedAt: number | null = null;
      const tick = (now: number) => {
        if (current !== run) return;
        startedAt ??= now;
        const t = Math.min(1, (now - startedAt) / beat.tween);
        beat.step(t);
        if (t < 1) {
          frame = requestAnimationFrame(tick);
        } else {
          frame = 0;
          next();
        }
      };
      frame = requestAnimationFrame(tick);
    };

    next();
  }

  return { play, cancel };
}

/** Calls start once, the first time the element is on screen. */
export function whenOnScreen(
  element: Element,
  start: () => void,
  threshold = 0.6
): () => void {
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      start();
    },
    { threshold }
  );
  observer.observe(element);
  return () => observer.disconnect();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/build-sequence.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Move the hero onto the owner**

In `src/routes/(public)/guide/_components/HubHeroBuild.svelte`:

Add to the imports:

```ts
import {
  BUILD_BEAT_PAUSE_MS,
  createBuildSequence,
  whenOnScreen,
} from "#lib/shared/transitions/build-sequence.js";
```

Delete `const BEAT_PAUSE_MS = 650;` and its comment, the `timer` and `frame` variables, and the `after` and `animate` functions. Add `const sequence = createBuildSequence();` after the `$state` declarations. Replace `play()` and `onMount` with:

```ts
function play() {
  if (started || !ready || !onScreen) return;
  started = true;
  sequence.play(
    [
      { pause: BUILD_BEAT_PAUSE_MS },
      { act: () => (phase = "hands") },
      { pause: BUILD_BEAT_PAUSE_MS },
      { act: () => (phase = "arrows") },
      { tween: DURATION.emphasis, step: (t) => (arrowOpacity = t) },
      { pause: BUILD_BEAT_PAUSE_MS },
      { act: () => (phase = "travel") },
      { tween: DURATION.scene, step: (t) => (progress = cubicInOut(t)) },
    ],
    finish
  );
}

onMount(() => {
  if (reducedMotion()) finish();
  mounted = true;
  const stopWatching = whenOnScreen(host, () => {
    onScreen = true;
    play();
  });
  return () => {
    stopWatching();
    sequence.cancel();
  };
});
```

Keep `reducedMotion` imported (onMount still uses it). Update the header comment's last paragraph only if it names the deleted helpers (it does not today).

- [ ] **Step 6: Commit**

```bash
git add src/lib/shared/transitions/build-sequence.ts tests/unit/build-sequence.test.ts
git commit -m "refactor(motion): shared build sequence; Guide hero uses it" -- src/lib/shared/transitions/build-sequence.ts tests/unit/build-sequence.test.ts "src/routes/(public)/guide/_components/HubHeroBuild.svelte"
```

---

### Task 6: Motion map arrows layer

**Files:**

- Create: `src/lib/shared/guide-topics/MotionMapArrows.svelte`

Presentational; covered by Task 1's data tests and the browser check in Task 9.

- [ ] **Step 1: Write the component**

Create `src/lib/shared/guide-topics/MotionMapArrows.svelte`:

```svelte
<!--
  Every move the blue hand can make from one point, drawn at once over the
  grid: both shift arcs and the dash as real arrows (one arrow-only
  pictograph each), plus a soft halo on the hand's own point for static,
  which has no arrow in the book. A lit move stays bright and the others dim.
  When `from` changes, each arrow's pictograph crossfades to its new path
  through PictographContainer's own content transition.
-->
<script lang="ts">
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import {
    GridMode,
    type GridLocation,
  } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { getPlacementGridPoints } from "#lib/shared/pictograph/grid/services/placement-grid-points.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import {
    motionMapArrowData,
    motionMapTargets,
    type HandMove,
  } from "./hand-motions-topic.js";

  interface Props {
    from: GridLocation;
    lit: HandMove | null;
    /** 0 to 1, for the build's fade-in. */
    opacity: number;
  }

  let { from, lit, opacity }: Props = $props();

  const targets = $derived(motionMapTargets(from));
  const halo = $derived(
    getPlacementGridPoints(GridMode.DIAMOND).find(
      (point) => point.location === from
    ) ?? null
  );
  const dimmed = (move: HandMove) => lit !== null && lit !== move;
</script>

<div class="motion-map-arrows" style:opacity>
  {#each targets as target (target.slot)}
    <div class="layer" class:dim={dimmed(target.move)}>
      <PictographContainer
        pictographData={motionMapArrowData(from, target)}
        gridMode={GridMode.DIAMOND}
        leftPropTypeOverride={PropType.HAND}
        rightPropTypeOverride={PropType.HAND}
        visibleHand={HandSide.LEFT}
        showGrid={false}
        showProps={false}
        transparentBackground={true}
        showTKA={false}
        showReversals={false}
        showTnD={false}
        showElemental={false}
        showPlacements={false}
        showNonRadialPoints={false}
        showHandPoints={false}
        stepNumberOverride={false}
      />
    </div>
  {/each}
  {#if halo}
    <svg class="layer halo" viewBox="0 0 950 950" aria-hidden="true">
      <circle
        r="78"
        class:lit={lit === "static"}
        class:dim={dimmed("static")}
        style:transform={`translate(${halo.x}px, ${halo.y}px)`}
      />
    </svg>
  {/if}
</div>

<style>
  .motion-map-arrows {
    position: absolute;
    inset: 0;
  }
  .layer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    transition: opacity var(--transition-normal);
  }
  .layer.dim {
    opacity: 0.3;
  }
  .halo circle {
    fill: color-mix(in srgb, var(--prop-blue, #3b82f6) 8%, transparent);
    stroke: var(--prop-blue, #3b82f6);
    stroke-width: 5;
    stroke-opacity: 0.45;
    transition:
      transform var(--transition-emphasis),
      stroke-opacity var(--transition-normal),
      fill var(--transition-normal);
  }
  .halo circle.lit {
    stroke-opacity: 0.9;
    fill: color-mix(in srgb, var(--prop-blue, #3b82f6) 18%, transparent);
  }
  .halo circle.dim {
    stroke-opacity: 0.15;
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/shared/guide-topics/MotionMapArrows.svelte
git commit -m "feat(guide): motion map arrows layer" -- src/lib/shared/guide-topics/MotionMapArrows.svelte
```

---

### Task 7: Motion map figure

**Files:**

- Create: `src/lib/shared/guide-topics/MotionMapFigure.svelte`

- [ ] **Step 1: Write the component**

Create `src/lib/shared/guide-topics/MotionMapFigure.svelte`:

```svelte
<!--
  The motion map: one diamond grid, the blue hand, and every move it can make
  from where it stands, drawn at once (two shifts, the dash, a halo for
  static). It builds itself once it is drawn and on screen: the grid, then
  the hand, then the arrows, then each move out and back along its own arrow,
  then Static. Reduced motion shows the finished map.

  With `interactive`, the hand can be grabbed at any time; that ends the
  demonstration. A drop names the move: its arrows light, and after one beat
  the map redraws around the point where the hand landed. Dragging and the
  keyboard both come from PropPlacementGrid.
  Spec: docs/superpowers/specs/2026-10-10-hand-motions-rebuild-design.md
-->
<script lang="ts">
  import { onMount } from "svelte";
  import PropPlacementGrid from "#lib/shared/pictograph/grid/components/PropPlacementGrid.svelte";
  import type { PropPlacementChange } from "#lib/shared/pictograph/grid/domain/prop-placement.js";
  import {
    GridMode,
    type GridLocation,
  } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import type { PlacementMotionMove } from "#lib/shared/pictograph/grid/state/prop-placement-motion.svelte.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import {
    BUILD_BEAT_PAUSE_MS,
    createBuildSequence,
    whenOnScreen,
    type BuildBeat,
  } from "#lib/shared/transitions/build-sequence.js";
  import { reducedMotion } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import {
    MOTION_MAP_HOME,
    classifyHandMove,
    motionMapTargets,
    type HandMove,
    type MotionMapTarget,
  } from "./hand-motions-topic.js";
  import MotionMapArrows from "./MotionMapArrows.svelte";

  interface Props {
    /** Lets the learner drag the hand (or pick it up with Enter) to make a move. */
    interactive?: boolean;
    /** A move was shown, by the demonstration or by the learner. */
    onMove?: (move: HandMove, by: "demo" | "learner") => void;
    leftNoun?: string;
  }

  let { interactive = false, onMove, leftNoun = "blue hand" }: Props = $props();

  let host: HTMLDivElement;
  /** The hand's committed point. */
  let handAt = $state<GridLocation>(MOTION_MAP_HOME);
  /** The point the drawn moves start from. */
  let mapFrom = $state<GridLocation>(MOTION_MAP_HOME);
  let lit = $state<HandMove | null>(null);
  let showHand = $state(false);
  let arrowOpacity = $state(0);
  let building = $state(true);
  let motionMove = $state<PlacementMotionMove | null>(null);
  let ready = false;
  let onScreen = false;
  let started = false;

  const build = createBuildSequence();
  const settle = createBuildSequence();

  function finishBuild() {
    building = false;
    showHand = true;
    arrowOpacity = 1;
    lit = null;
  }

  function travel(
    to: GridLocation,
    direction: "clockwise" | "counterclockwise",
    path: "arc" | "dash"
  ): BuildBeat[] {
    return [
      {
        act: () => {
          motionMove = {
            epoch: (motionMove?.epoch ?? 0) + 1,
            color: HandSide.LEFT,
            from: handAt,
            to,
            direction,
            path,
            durationMs: DURATION.scene,
          };
          handAt = to;
        },
      },
      { pause: DURATION.scene },
    ];
  }

  function outAndBack(target: MotionMapTarget): BuildBeat[] {
    const path = target.move === "dash" ? "dash" : "arc";
    const back =
      target.direction === "clockwise" ? "counterclockwise" : "clockwise";
    return [
      {
        act: () => {
          lit = target.move;
          onMove?.(target.move, "demo");
        },
      },
      ...travel(target.to, target.direction, path),
      { pause: BUILD_BEAT_PAUSE_MS },
      ...travel(MOTION_MAP_HOME, back, path),
      { pause: BUILD_BEAT_PAUSE_MS },
    ];
  }

  function play() {
    if (started || !ready || !onScreen || !building) return;
    started = true;
    const [shift, , dash] = motionMapTargets(MOTION_MAP_HOME);
    build.play(
      [
        { pause: BUILD_BEAT_PAUSE_MS },
        { act: () => (showHand = true) },
        { pause: BUILD_BEAT_PAUSE_MS },
        { tween: DURATION.emphasis, step: (t) => (arrowOpacity = t) },
        { pause: BUILD_BEAT_PAUSE_MS },
        ...outAndBack(shift!),
        ...outAndBack(dash!),
        {
          act: () => {
            lit = "static";
            onMove?.("static", "demo");
          },
        },
        { pause: BUILD_BEAT_PAUSE_MS * 2 },
      ],
      finishBuild
    );
  }

  /** Grabbing the hand ends the demonstration where it stands. */
  function takeOver() {
    if (!interactive || !building) return;
    build.cancel();
    finishBuild();
    mapFrom = handAt;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") takeOver();
  }

  function changed(change: PropPlacementChange) {
    if (!interactive) return;
    takeOver();
    // Picked up (tap or Enter) but not yet put down.
    if (change.activeHand !== null || change.leftLocation === null) return;
    const from = handAt;
    const to = change.leftLocation;
    handAt = to;
    const move = classifyHandMove(from, to);
    if (!move) return;
    lit = move;
    onMove?.(move, "learner");
    settle.play([{ pause: BUILD_BEAT_PAUSE_MS }], () => {
      mapFrom = to;
      lit = null;
    });
  }

  onMount(() => {
    if (reducedMotion()) finishBuild();
    const stopWatching = whenOnScreen(host, () => {
      onScreen = true;
      play();
    });
    return () => {
      stopWatching();
      build.cancel();
      settle.cancel();
    };
  });
</script>

<div
  class="motion-map"
  bind:this={host}
  onpointerdowncapture={takeOver}
  onkeydowncapture={handleKeydown}
>
  <PropPlacementGrid
    gridMode={GridMode.DIAMOND}
    hands="left"
    leftPropType={PropType.HAND}
    rightPropType={PropType.HAND}
    {leftNoun}
    promptText=""
    renderTray={false}
    showUndo={false}
    initialLeftLocation={handAt}
    initialRightLocation={null}
    {motionMove}
    showProps={showHand}
    editAfterCompletion={interactive}
    dragLocations={interactive}
    animateContent={true}
    onReady={() => {
      ready = true;
      play();
    }}
    onChange={changed}
  >
    {#snippet figureLayer()}
      <MotionMapArrows from={mapFrom} {lit} opacity={arrowOpacity} />
    {/snippet}
  </PropPlacementGrid>
</div>

<style>
  .motion-map {
    width: 100%;
    aspect-ratio: 1;
  }
</style>
```

- [ ] **Step 2: Type-check the new and changed Svelte files**

Check the resource gate first (PowerShell):

```powershell
(Get-Counter '\Memory\Available MBytes').CounterSamples[0].CookedValue
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'svelte-check' } | Select-Object ProcessId
```

Expected: at least 4096 MB free and no running svelte-check (wait for one to finish rather than starting a second). Then run, from the worktree: `npm run check:fast`
Expected: no new errors in `hand-motions-topic.ts`, `MotionMapArrows.svelte`, `MotionMapFigure.svelte`, `PropPlacementGrid.svelte`, `prop-placement-*.ts`, `build-sequence.ts` or `HubHeroBuild.svelte`. Errors elsewhere that also exist on `main` are not this task's (the repo carries a known backlog); compare against the same command's output on `main` before calling one new.

- [ ] **Step 3: Commit**

```bash
git add src/lib/shared/guide-topics/MotionMapFigure.svelte
git commit -m "feat(guide): motion map figure with self-build and drag-to-name" -- src/lib/shared/guide-topics/MotionMapFigure.svelte
```

---

### Task 8: Dev review page and capability record

**Files:**

- Create: `src/routes/test/motion-map/+page.svelte`
- Modify: `docs/architecture/canonical-capabilities.md` (append at the end)

- [ ] **Step 1: Write the review page**

Create `src/routes/test/motion-map/+page.svelte`:

```svelte
<!--
  Dev-only review page for the Hand Motions motion map draft (the /test
  layout guards it out of production). The figure is the shared
  MotionMapFigure; the prompt and caption list stand in for the lesson stage
  that follows once Austen approves this draft.
-->
<script lang="ts">
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import MotionMapFigure from "#lib/shared/guide-topics/MotionMapFigure.svelte";
  import {
    MOTION_MAP_MOVES,
    handMotionsTopicText,
    type HandMove,
  } from "#lib/shared/guide-topics/hand-motions-topic.js";

  let take = $state(0);
  let lit = $state<HandMove | null>(null);
  let found = $state<readonly HandMove[]>([]);
  let announcement = $state("");

  function moved(move: HandMove, by: "demo" | "learner") {
    lit = move;
    if (by === "demo") return;
    if (!found.includes(move)) found = [...found, move];
    const entry = MOTION_MAP_MOVES.find((candidate) => candidate.id === move);
    if (!entry) return;
    announcement = t("learn_motion_path_aria", {
      name: handMotionsTopicText(entry.name),
      caption: handMotionsTopicText(entry.caption),
    });
  }

  function replay() {
    take += 1;
    lit = null;
    found = [];
    announcement = "";
  }
</script>

<main class="motion-map-review">
  <p class="prompt">{handMotionsTopicText("mapPrompt")}</p>
  <div class="stage">
    <div class="figure">
      {#key take}
        <MotionMapFigure interactive onMove={moved} />
      {/key}
    </div>
    <ul class="moves">
      {#each MOTION_MAP_MOVES as move (move.id)}
        <li class:lit={lit === move.id}>
          <span class="name">{handMotionsTopicText(move.name)}</span>
          <span class="caption">{handMotionsTopicText(move.caption)}</span>
          <i
            class="fa-solid fa-check found"
            class:shown={found.includes(move.id)}
            aria-hidden="true"
          ></i>
        </li>
      {/each}
    </ul>
  </div>
  <PanelButton onclick={replay}>Play again</PanelButton>
  <span class="sr-only" aria-live="polite">{announcement}</span>
</main>

<style>
  .motion-map-review {
    container-type: inline-size;
    display: grid;
    justify-items: center;
    gap: 1.25rem;
    padding: 1.5rem 1rem 2rem;
    color: var(--theme-text, #f5f5f5);
  }
  .prompt {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 600;
  }
  .stage {
    display: grid;
    gap: 1.5rem;
    justify-items: center;
    align-items: center;
    width: 100%;
  }
  .figure {
    width: min(100%, 34rem);
  }
  @container (min-width: 52rem) {
    .stage {
      grid-template-columns: minmax(0, 34rem) minmax(0, 20rem);
      justify-content: center;
    }
  }
  .moves {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 0.5rem;
    width: min(100%, 20rem);
  }
  .moves li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 1.25rem;
    grid-template-areas:
      "name found"
      "caption found";
    align-items: center;
    padding: 0.6rem 0.85rem;
    border-radius: 0.75rem;
    border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
    transition:
      background-color var(--transition-normal),
      border-color var(--transition-normal);
  }
  .moves li.lit {
    background: color-mix(in srgb, var(--prop-blue, #3b82f6) 16%, transparent);
    border-color: color-mix(
      in srgb,
      var(--prop-blue, #3b82f6) 55%,
      transparent
    );
  }
  .name {
    grid-area: name;
    font-weight: 700;
  }
  .caption {
    grid-area: caption;
    opacity: 0.85;
  }
  /* The check's slot is always reserved, so finding a move moves nothing. */
  .found {
    grid-area: found;
    opacity: 0;
    transition: opacity var(--transition-normal);
  }
  .found.shown {
    opacity: 1;
  }
</style>
```

- [ ] **Step 2: Record the owners**

Append to `docs/architecture/canonical-capabilities.md`:

```markdown
A figure that builds itself (pause, change state, tween 0 to 1, in order)
uses `createBuildSequence` in `shared/transitions/build-sequence.ts`, with
`whenOnScreen` to start it once the figure is on screen and
`BUILD_BEAT_PAUSE_MS` between beats. Reduced motion jumps to the finished
picture. The Guide front-page hero (`HubHeroBuild.svelte`) and the Hand
Motions map (`shared/guide-topics/MotionMapFigure.svelte`) use it. Searches:
self-build, hero build, build sequence, staged reveal, beats. Decision:
created on the second use (2026-10-11).

`PropPlacementGrid` also carries one-hand figures: `hands="left"` keeps a
single blue hand (its placement state never asks for the right hand),
`showProps` hides the hands while a figure builds, `onReady` reports the first
draw, and `figureLayer` draws figure art in the grid's own square under the
touch targets. A `motionMove` with `path: "dash"` travels straight through the
center (the default is the pro arc), for `durationMs`. Searches: one hand,
single hand, motion map, dash travel, figure layer, arrow overlay. Decision:
extend the owner (2026-10-11).
```

- [ ] **Step 3: Format the changed docs**

Run: `E:/tka-platform/node_modules/.bin/prettier --check docs/architecture/canonical-capabilities.md docs/superpowers/plans/2026-10-11-hand-motions-map.md`
Expected: both pass (fix with `--write` if not).

- [ ] **Step 4: Commit**

```bash
git add src/routes/test/motion-map/+page.svelte
git commit -m "feat(guide): motion map review page; record shared owners" -- src/routes/test/motion-map/+page.svelte docs/architecture/canonical-capabilities.md
```

---

### Task 9: Browser verification and preview hand-off

The gate is Austen's approval in the browser, so the draft stays unmerged and is delivered as a task-worktree preview.

- [ ] **Step 1: Focused test run**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/guide-topics tests/unit/prop-placement-transition.test.ts tests/unit/prop-placement-motion.test.ts tests/unit/prop-placement-state.test.ts tests/unit/prop-placement-view-model.test.ts tests/unit/prop-placement-grid-decomposition-contract.test.ts tests/unit/build-sequence.test.ts tests/unit/german-catalog-contract.test.ts`
Expected: all PASS. Capture the summary line for the report.

- [ ] **Step 2: Start the task preview server**

Check the resource gate (Task 7 Step 2 commands, plus the Vite count): at most two agent-owned Vite servers may run. Find a free port (`Get-NetTCPConnection -LocalPort 5196 -ErrorAction SilentlyContinue` returns nothing). Read the primary `E:/tka-platform/.claude/launch.json` (it has uncommitted entries from other tasks; keep them) and add one entry named `verify-hand-motions-map` that runs Vite from `E:/worktrees/tka-platform/hand-motions-map` on that port, modeled on the existing worktree entries there. Start it with `preview_start { name: "verify-hand-motions-map" }`. Never touch port 5173.

- [ ] **Step 3: Check the build and the arrows**

Open `https://localhost:<port>/test/motion-map` in the in-app browser.

- The build plays: grid alone, then the hand at West, then the arrows fade in, then the hand shifts north and back, dashes east and back, then Static lights the halo. The caption beside the figure lights with each move.
- Alignment: each shift arrow ends at the North or South hand point, the dash arrow runs West to East, and the halo circles the West hand point. Measure with `javascript_tool`: compare the hand glyph's bounding-box center after a drop on North with the shift arrowhead's bounding box. They must overlap.
- No console errors (`read_console_messages`).

- [ ] **Step 4: Check the interactions**

- Drag the hand West to North during the build: the build stops, Shift lights and gets its check, and after a beat the arrows redraw around North (shifts to East and West, dash to South).
- Drag North to South: Dash. Drag the hand off and back onto its own point: Static.
- Keyboard: Tab to the hand, Enter, Tab to a target point, Enter. The move is named and announced (read the `aria-live` span).
- Reduced motion: run `document.documentElement.dataset.motionPreference = "reduce"`, press Play again: the finished map shows at once and a drag still names the move.
- The front-page hero still builds: open `https://localhost:<port>/guide`, scroll the hero into view, and watch grid, hands, arrows, travel, then the letter.

- [ ] **Step 5: Viewport spot check for the draft**

Check 375×667, 1440×900 and 2560×1440 with `resize_window`: the figure is square and fully visible, the captions sit beside it on wide screens and below it on the phone, nothing overflows horizontally, and no caption row moves when its check appears. Reset with `preset: "desktop"`. (The full seven-viewport pass and ui-bust review come with the lesson and Guide page plan.)

- [ ] **Step 6: Fix, commit, deliver**

Fix any defect found, rerun only the affected check, and commit with explicit pathspecs. Leave the server running and the tab open. Report to Austen in plain words with the clickable `https://localhost:<port>/test/motion-map` link, the three draft choices listed at the top of this plan for him to judge, and a note that nothing is merged or live. Record the preview's port, process and log in task context, and update `memory/project_guide_rethink.md`.

---

## After Austen approves

Write the next plan: lesson stage 1 on this figure (prompt, captions, found marks, saved progress v3), the two-hand stage and wrap-up, the Timing and Direction split, then the Guide web page and handbook page, the shared-edit test, the seven-viewport pass, ui-bust, and `wt:finish`. Fold in any timing or halo changes he asks for here first.
