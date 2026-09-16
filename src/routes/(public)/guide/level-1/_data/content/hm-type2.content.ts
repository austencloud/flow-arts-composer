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
 * Verbatim prose lifted from _pages/Type2ShiftsPage.svelte (Austen's words -
 * never AI-written). Pictograph construction is a faithful copy of that same
 * file's `motion`/`box`/STRIPS derivation, minus the reader-only wiring
 * (selection, overrides, click-to-animate, edit-mode dragging, pt geometry).
 */

const { NORTH: N, EAST: E, SOUTH: SO_, WEST: W } = GridLocation;

// A hand that moves → PRO shift (hand-path mode converts to FLOAT); a hand
// that stays → STATIC (no arrow). Positions/numbers derive downstream. A Type
// 2 motion ("Shift") always has exactly one moving hand, so no same-edge
// collision - no letter is ever needed for placement.
const motion = (color: HandSide, from: GridLocation, to: GridLocation) =>
  createMotionData({
    motionType: from === to ? MotionType.STATIC : MotionType.PRO,
    startLocation: from,
    endLocation: to,
    hand: color,
    propType: PropType.HAND,
    gridMode: GridMode.DIAMOND,
  });

// [leftFrom, leftTo, rightFrom, rightTo]; Start boxes hold (from === to on both).
type Move = [GridLocation, GridLocation, GridLocation, GridLocation];
const box = (m: Move, step: number): StepData =>
  ({
    id: `type2-${step}-${m.join("-")}`,
    letter: null,
    gridMode: GridMode.DIAMOND,
    startPlacement: getGridPlacementFromLocations(m[0], m[2]),
    endPlacement: getGridPlacementFromLocations(m[1], m[3]),
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

type Cell = { m: Move; step: number } | null;
type Strip = { rows: Cell[][] };
const c = (m: Move, step: number): Cell => ({ m, step });

const STRIPS: Strip[] = [
  // Single Shift - blue holds at S; red floats CCW one point per count.
  {
    rows: [
      [
        c([SO_, SO_, SO_, SO_], 0), // Start: both S (beta)
        c([SO_, SO_, SO_, E], 1), //  β→γ  red S→E
        c([SO_, SO_, E, N], 2), //    γ→α  red E→N
        c([SO_, SO_, N, W], 3), //    α→γ  red N→W
        c([SO_, SO_, W, SO_], 4), //  γ→β  red W→S
      ],
    ],
  },
  // Same direction - every shift clockwise; anchor hand swaps at beta.
  {
    rows: [
      [
        c([SO_, SO_, N, N], 0), // Start: blue S, red N (alpha)
        c([SO_, SO_, N, E], 1), //  α→γ  red N→E
        c([SO_, SO_, E, SO_], 2), // γ→β  red E→S
        c([SO_, W, SO_, SO_], 3), // β→γ  blue S→W
        c([W, N, SO_, SO_], 4), //  γ→α  blue W→N
      ],
      [
        null,
        c([N, E, SO_, SO_], 5), //  α→γ  blue N→E
        c([E, SO_, SO_, SO_], 6), // γ→β  blue E→S
        c([SO_, SO_, SO_, W], 7), // β→γ  red S→W
        c([SO_, SO_, W, N], 8), //  γ→α  red W→N  (→ Start)
      ],
    ],
  },
  // Opposite directions - red always CCW, blue always CW; shifting hand alternates.
  {
    rows: [
      [
        c([SO_, SO_, E, E], 0), // Start: blue S, red E (gamma)
        c([SO_, SO_, E, N], 1), //  γ→α  red E→N (CCW)
        c([SO_, W, N, N], 2), //    α→γ  blue S→W (CW)
        c([W, W, N, W], 3), //      γ→β  red N→W (CCW)
        c([W, N, W, W], 4), //      β→γ  blue W→N (CW)
      ],
      [
        null,
        c([N, N, W, SO_], 5), //    γ→α  red W→S (CCW)
        c([N, E, SO_, SO_], 6), //  α→γ  blue N→E (CW)
        c([E, E, SO_, E], 7), //    γ→β  red S→E (CCW)
        c([E, SO_, E, E], 8), //    β→γ  blue E→S (CW)  (→ Start)
      ],
    ],
  },
];

// Flatten a strip's rows (row-major, skipping null cells) into ordered
// pictographs - Start(0) then 1..n. Type2ShiftsPage's PICTO_FLAGS keep
// showReversals off, so this is used directly - no bakeReversals needed.
const stripSteps = (strip: Strip): PictographData[] =>
  strip.rows
    .flat()
    .filter((cell): cell is { m: Move; step: number } => cell !== null)
    .map((cell) => box(cell.m, cell.step)) as unknown as PictographData[];

/** HAND props - matching Type2ShiftsPage's PICTO_FLAGS. */
const RENDER = { propType: PropType.HAND } as const;
const SEQ_WORDS = ["Single Shift", "Same-Direction Shifts", "Opposite Shifts"];

export const hmType2Content: GuideBlock[] = [
  { kind: "heading", level: 1, text: "Type 2 Shifts" },
  {
    kind: "prose",
    html:
      "To move between γ and α/β, you can shift one hand and keep the other hand static.<br>" +
      'This combination is called a <strong class="pu">Shift</strong> (with a capital “S”). Here’s a simple example:',
  },
  {
    kind: "pictographGroup",
    items: stripSteps(STRIPS[0]!),
    flowCols: 5,
    layout: "strip",
    stepLabels: ["Start", "1", "2", "3", "4"],
    card: true,
    render: RENDER,
    caption: SEQ_WORDS[0],
  },
  {
    kind: "prose",
    html:
      "The following examples explore both same and opposite handpaths.<br>" +
      "They alternate the shifting hand.<br>" +
      "Here, they are shifting in the same direction:",
  },
  {
    kind: "pictographGroup",
    items: stripSteps(STRIPS[1]!),
    flowCols: 5,
    card: true,
    render: RENDER,
    caption: SEQ_WORDS[1],
  },
  {
    kind: "prose",
    html: "And here, they are shifting in opposite directions.",
  },
  {
    kind: "pictographGroup",
    items: stripSteps(STRIPS[2]!),
    flowCols: 5,
    card: true,
    render: RENDER,
    caption: SEQ_WORDS[2],
  },
  {
    kind: "prose",
    html: '<span class="pu">Shifts</span> seems mundane here, but they’re very useful later for constructing dynamic sequences.',
  },
];
