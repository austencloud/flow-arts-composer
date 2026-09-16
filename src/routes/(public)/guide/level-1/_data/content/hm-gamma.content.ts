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
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

/**
 * Verbatim prose lifted from _pages/GammaPage.svelte (Austen's words - never
 * AI-written). Pictograph construction is a faithful copy of that same file's
 * `motion`/`box`/STRIPS derivation, minus the reader-only wiring (selection,
 * overrides, click-to-animate, edit-mode dragging, pt geometry).
 */

const { NORTH: N, EAST: E, SOUTH: SO_, WEST: W } = GridLocation;

// A hand that moves → PRO shift (hand-path mode converts to FLOAT); a hand
// that stays → STATIC (no arrow). Positions/elemental/numbers all derive
// downstream from the motions.
const motion = (color: HandSide, from: GridLocation, to: GridLocation) =>
  createMotionData({
    motionType: from === to ? MotionType.STATIC : MotionType.PRO,
    startLocation: from,
    endLocation: to,
    hand: color,
    propType: PropType.HAND,
    gridMode: GridMode.DIAMOND,
  });

// [leftFrom, leftTo, rightFrom, rightTo]; Start boxes hold (from === to).
type Move = [GridLocation, GridLocation, GridLocation, GridLocation];
const box = (m: Move, step: number, letter: Letter | null = null): StepData =>
  ({
    id: `gamma-${step}-${m.join("-")}`,
    letter,
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

// letter is null on every box EXCEPT the QO same-edge "antiparallel" cells:
// there blue and red float along the SAME edge (e.g. W→N vs N→W), so their
// arrows collide. The arrow pipeline separates them only through the
// special-placement tier, which is letter-gated - letter "P" (both-PRO
// Quarter-Opp, canonical DiamondPictographDataframe rows 187/188) unlocks the
// separated placement. No other strip has a same-edge box.
type Cell = { m: Move; step: number; letter?: Letter | null } | null;
type Strip = { rows: Cell[][] };
const c = (m: Move, step: number, letter: Letter | null = null): Cell => ({
  m,
  step,
  letter,
});

const STRIPS: Strip[] = [
  // γ→γ Quarter-Opp - opposite spin, hands 90° apart the whole loop.
  {
    rows: [
      [
        c([SO_, SO_, E, E], 0), // Start: blue S, red E
        c([SO_, W, E, N], 1), //  Parallel
        c([W, N, N, W], 2, Letter.P), //    Antiparallel - same W↔N edge; P separates
        c([N, E, W, SO_], 3), //  Parallel
        c([E, SO_, SO_, E], 4, Letter.P), // Antiparallel - same E↔S edge; P separates
      ],
    ],
  },
  // γ→γ Quarter-Same - same spin, red leads blue by one point.
  {
    rows: [
      [
        c([SO_, SO_, E, E], 0), // Start
        c([SO_, E, E, N], 1),
        c([E, N, N, W], 2),
        c([N, W, W, SO_], 3),
        c([W, SO_, SO_, E], 4),
      ],
    ],
  },
  // Switching sequence - alternates QO/QS each count; closes back to Start.
  {
    rows: [
      [
        c([SO_, SO_, E, E], 0), // Start
        c([SO_, W, E, N], 1), //  QO
        c([W, SO_, N, W], 2), //  QS
        c([SO_, E, W, N], 3), //  QO
        c([E, N, N, W], 4), //    QS
      ],
      [
        null,
        c([N, E, W, SO_], 5), // QO
        c([E, N, SO_, E], 6), // QS
        c([N, W, E, SO_], 7), // QO
        c([W, SO_, SO_, E], 8), // QS
      ],
    ],
  },
];

// Flatten a strip's rows (row-major, skipping null cells) into ordered
// pictographs - Start(0) then 1..n. GammaPage's PICTO_FLAGS keep showReversals
// off, so this is used directly - no bakeReversals needed.
const stripSteps = (strip: Strip): PictographData[] =>
  strip.rows
    .flat()
    .filter(
      (cell): cell is { m: Move; step: number; letter?: Letter | null } =>
        cell !== null
    )
    .map((cell) =>
      box(cell.m, cell.step, cell.letter ?? null)
    ) as unknown as PictographData[];

/** HAND props - matching GammaPage's PICTO_FLAGS. */
const RENDER = { propType: PropType.HAND } as const;

export const hmGammaContent: GuideBlock[] = [
  {
    kind: "heading",
    level: 1,
    text: "Gamma: Quarter-Opposite and Quarter-Same",
  },
  {
    kind: "prose",
    html:
      "Gamma, aka quarter-time, is based on two often forgotten modes:<br>" +
      "<strong>Quarter-Opp</strong> and <strong>Quarter-Same</strong>.<br>" +
      "Quarter-Opp has variations of parallel and antiparallel.",
  },
  { kind: "heading", level: 2, text: "Quarter-Opp" },
  {
    kind: "pictographGroup",
    items: stripSteps(STRIPS[0]!),
    flowCols: 5,
    layout: "strip",
    stepLabels: ["Start", "1", "2", "3", "4"],
    card: true,
    render: RENDER,
    caption: "γ→γ Quarter-Opp",
  },
  { kind: "prose", html: "In Quarter-Same, this doesn’t happen:" },
  { kind: "heading", level: 2, text: "Quarter-Same" },
  {
    kind: "pictographGroup",
    items: stripSteps(STRIPS[1]!),
    flowCols: 5,
    layout: "strip",
    stepLabels: ["Start", "1", "2", "3", "4"],
    card: true,
    render: RENDER,
    caption: "γ→γ Quarter-Same",
  },
  {
    kind: "prose",
    html:
      "When in gamma, you can move to any other variation of gamma.<br>" +
      "These examples are continuous, but non-continuous sequence are also possible.",
  },
  {
    kind: "prose",
    html: "Here’s one that switches between Quarter-Opp and Quarter-Same:",
  },
  {
    kind: "pictographGroup",
    items: stripSteps(STRIPS[2]!),
    flowCols: 5,
    card: true,
    render: RENDER,
    caption: "Quarter-Opp / Same switch",
  },
  {
    kind: "prose",
    html:
      '<strong>Practice using <span class="cy">Dual</span><span class="pu">-Shifts</span> ' +
      "to create other non-continuous γ→γ variations!</strong>",
  },
];
