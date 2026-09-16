import type { GuideBlock } from "../guide-content-blocks";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  MotionType,
  HandSide,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  GridMode,
  GridLocation,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

/**
 * Verbatim prose lifted from _pages/Type3CrossShiftsPage.svelte (Austen's
 * words - never AI-written). Pictograph construction is a faithful copy of
 * that same file's `motion`/`box`/BREAKDOWN/SEQ1/SEQ2 derivation, minus the
 * reader-only wiring (selection, overrides, click-to-animate, edit-mode
 * dragging, pt geometry).
 */

const {
  NORTH: N,
  EAST: E,
  SOUTH: SO_,
  WEST: W,
  SOUTHEAST: SE,
  CENTER: C,
} = GridLocation;
const OPP: Partial<Record<GridLocation, GridLocation>> = {
  [N]: SO_,
  [SO_]: N,
  [E]: W,
  [W]: E,
};

// Motion type from the location pair: same → STATIC, opposite cardinals →
// DASH, otherwise (adjacent) → PRO shift (hand-path mode floats it).
const motion = (color: HandSide, from: GridLocation, to: GridLocation) =>
  createMotionData({
    motionType:
      from === to
        ? MotionType.STATIC
        : OPP[from] === to
          ? MotionType.DASH
          : MotionType.PRO,
    startLocation: from,
    endLocation: to,
    hand: color,
    propType: PropType.HAND,
    gridMode: GridMode.DIAMOND,
  });

// Positions only derive for cardinal pairs; the breakdown's halfway pose
// (centre/diagonal) doesn't resolve a position glyph, so a null position is fine.
const gp = (a: GridLocation, b: GridLocation) => {
  try {
    return getGridPlacementFromLocations(a, b);
  } catch {
    return null;
  }
};

// [leftFrom, leftTo, rightFrom, rightTo]
type Move = [GridLocation, GridLocation, GridLocation, GridLocation];
const box = (m: Move, step: number | null, id: string): StepData =>
  ({
    id,
    letter: null,
    gridMode: GridMode.DIAMOND,
    startPlacement: gp(m[0], m[2]),
    endPlacement: gp(m[1], m[3]),
    motions: {
      left: motion(HandSide.LEFT, m[0], m[1]),
      right: motion(HandSide.RIGHT, m[2], m[3]),
    },
    stepNumber: step,
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
  }) as unknown as StepData;

// ── Breakdown: one Cross-Shift decomposed (blue dashes S→N, red shifts S→E) ──
// start (both S) → halfway (dash hand at centre, shift hand on the SE
// diagonal) → end (blue N, red E) → the combined pictograph with both real
// arrows. start/half/end are poses (from === to on both hands → STATIC, no
// arrow); only "combined" carries the real dash + shift arrows.
type BD = { key: string; m: Move };
const BREAKDOWN: BD[] = [
  { key: "start", m: [SO_, SO_, SO_, SO_] },
  { key: "half", m: [C, C, SE, SE] },
  { key: "end", m: [N, N, E, E] },
  { key: "combined", m: [SO_, N, SO_, E] },
];
const breakdownSteps = (): PictographData[] =>
  BREAKDOWN.map((b) =>
    box(b.m, null, `t3-${b.key}`)
  ) as unknown as PictographData[];

// The DISPLAY breakdown shows 4 poses (start/half/end/combined) - only "start"
// and "combined" are a real playable pair (half/end are static poses with no
// stepNumber of their own). This is the animation-only strip: same real
// motion data as `combined` above, just given explicit stepNumber 0/1.
const breakdownSequenceItems = (): PictographData[] => {
  const start = BREAKDOWN.find((b) => b.key === "start")!;
  const combined = BREAKDOWN.find((b) => b.key === "combined")!;
  return [
    box(start.m, 0, "t3-anim-start"),
    box(combined.m, 1, "t3-anim-combined"),
  ] as unknown as PictographData[];
};

// ── Sequences: Start + 8, alpha→gamma and beta→gamma ──────────────────────────
type Cell = { m: Move; step: number } | null;
const c = (m: Move, step: number): Cell => ({ m, step });
type Strip = { rows: Cell[][] };

// Sequence 1 - alpha→gamma. Shifts all CW; dash & shift swap hands each count.
const SEQ1: Strip = {
  rows: [
    [
      c([SO_, SO_, N, N], 0), // Start: blue S, red N (alpha)
      c([SO_, N, N, E], 1), //  α→γ  blue dash S→N, red shift N→E
      c([N, E, E, W], 2), //    γ→α  blue shift N→E, red dash E→W
      c([E, W, W, N], 3), //    α→γ  blue dash E→W, red shift W→N
      c([W, N, N, SO_], 4), //  γ→α  blue shift W→N, red dash N→S
    ],
    [
      null,
      c([N, SO_, SO_, W], 5), //  α→γ  blue dash N→S, red shift S→W
      c([SO_, W, W, E], 6), //    γ→α  blue shift S→W, red dash W→E
      c([W, E, E, SO_], 7), //    α→γ  blue dash W→E, red shift E→S
      c([E, SO_, SO_, N], 8), //  γ→α  blue shift E→S, red dash S→N  (→ Start)
    ],
  ],
};

// Sequence 2 - beta→gamma. Shifts all CCW; returns to both-S (beta).
const SEQ2: Strip = {
  rows: [
    [
      c([SO_, SO_, SO_, SO_], 0), // Start: both S (beta)
      c([SO_, N, SO_, E], 1), //  β→γ  blue dash S→N, red shift S→E
      c([N, W, E, W], 2), //      γ→β  blue shift N→W, red dash E→W
      c([W, E, W, SO_], 3), //    β→γ  blue dash W→E, red shift W→S
      c([E, N, SO_, N], 4), //    γ→β  blue shift E→N, red dash S→N
    ],
    [
      null,
      c([N, SO_, N, W], 5), //    β→γ  blue dash N→S, red shift N→W
      c([SO_, E, W, E], 6), //    γ→β  blue shift S→E, red dash W→E
      c([E, W, E, N], 7), //      β→γ  blue dash E→W, red shift E→N
      c([W, SO_, N, SO_], 8), //  γ→β  blue shift W→S, red dash N→S  (→ Start)
    ],
  ],
};

// Flatten a strip's rows (row-major, skipping null cells) into ordered
// pictographs - Start(0) then 1..8. Type3CrossShiftsPage's PICTO_FLAGS keep
// showReversals off, so this is used directly - no bakeReversals needed.
const stripSteps = (strip: Strip): PictographData[] =>
  strip.rows
    .flat()
    .filter((cell): cell is { m: Move; step: number } => cell !== null)
    .map((cell) =>
      box(cell.m, cell.step, `seq-${cell.step}`)
    ) as unknown as PictographData[];

/** HAND props - matching Type3CrossShiftsPage's PICTO_FLAGS. */
const RENDER = { propType: PropType.HAND } as const;

export const hmType34Content: GuideBlock[] = [
  { kind: "heading", level: 1, text: "Type 3 Cross-Shifts" },
  {
    kind: "prose",
    html:
      'A <span class="cross">Cross</span><span class="shift">-Shift</span> combines a shift and a dash.<br>' +
      "Since a dash has further to travel, it moves slightly faster.<br>" +
      'To understand <span class="cross">Cross</span><span class="shift">-Shifts</span>, let’s break one down into parts:',
  },
  {
    kind: "pictographGroup",
    items: breakdownSteps(),
    flowCols: 4,
    layout: "strip",
    card: true,
    sequenceItems: breakdownSequenceItems(),
    render: RENDER,
    caption: "start → halfway → end = combined",
  },
  {
    kind: "prose",
    html:
      "Note the halfway point. One hand is in the center point and one is on a diagonal hand point.<br>" +
      "By pausing at this halfway point, it ensures that the dash moves at the correct speed.<br>" +
      "The following sequences demonstrate their capabilities.<br>" +
      "This one explores alpha → gamma:",
  },
  {
    kind: "pictographGroup",
    items: stripSteps(SEQ1),
    flowCols: 5,
    card: true,
    render: RENDER,
    caption: "α → γ",
  },
  { kind: "prose", html: "And this one shows beta → gamma:" },
  {
    kind: "pictographGroup",
    items: stripSteps(SEQ2),
    flowCols: 5,
    card: true,
    render: RENDER,
    caption: "β → γ",
  },
  {
    kind: "prose",
    html: 'Tech nerds will notice these <span class="cross">Cross</span><span class="shift">-Shifts</span> create <em>Zan’s Diamond</em> variations. Neat!',
  },
];
