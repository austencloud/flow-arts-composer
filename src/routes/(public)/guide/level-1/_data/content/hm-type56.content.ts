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
 * Verbatim prose lifted from _pages/Type456Page.svelte (Austen's words -
 * never AI-written). Pictograph construction is a faithful copy of that same
 * file's `motion`/`box`/STRIPS derivation, minus the reader-only wiring
 * (selection, overrides, click-to-animate, edit-mode dragging, pt geometry,
 * the three calligraphic section-title/rule elements).
 */

const { NORTH: N, EAST: E, SOUTH: SO_, WEST: W } = GridLocation;
const OPP: Partial<Record<GridLocation, GridLocation>> = {
  [N]: SO_,
  [SO_]: N,
  [E]: W,
  [W]: E,
};

// Motion type from the location pair: same → STATIC, opposite cardinals → DASH.
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

// Positions only derive for cardinal pairs.
const gp = (a: GridLocation, b: GridLocation) => {
  try {
    return getGridPlacementFromLocations(a, b);
  } catch {
    return null;
  }
};

// [leftFrom, leftTo, rightFrom, rightTo]
type Move = [GridLocation, GridLocation, GridLocation, GridLocation];
const box = (
  m: Move,
  step: number | null,
  id: string,
  letter: Letter | null = null
): StepData =>
  ({
    id,
    letter,
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

// ── Strips. LETTERS carry real MCP-verified values, because the dash-location
// calculator keys arrow placement off the letter (dash-location-calculator.ts):
//   - Type 4 (one dash + one static) never collides → letter null.
//   - Type 5 α→α (Φ-) / β→β (Ψ-) put TWO dashes on the SAME vertical line;
//     Φ-/Ψ- route through PHI_DASH_PSI_DASH_MAP → blue side WEST, red side EAST.
//   - Type 5 γ→γ needs Λ- (LAMBDA_DASH_ZERO_TURNS_MAP): blue S→N→EAST, red
//     E→W→SOUTH (letter null would wrongly place blue WEST).
//   - Type 6 α/β/γ → the canonical Type-6 static letters.
type Cell = { m: Move; step: number; letter?: Letter };
type Strip = { key: string; word: string; cells: Cell[] };

const STRIPS: Strip[] = [
  // Type 4 - Dash. One hand dashes, one static → one arrow, never collides.
  {
    key: "t56-4a",
    word: "α → β",
    cells: [
      { m: [SO_, SO_, SO_, SO_], step: 0 }, // Start: both S (beta)
      { m: [SO_, SO_, SO_, N], step: 1 }, //  β→α  red dash S→N, blue static S
      { m: [SO_, SO_, N, SO_], step: 2 }, //  α→β  red dash N→S, blue static S
    ],
  },
  {
    key: "t56-4b",
    word: "γ → γ",
    cells: [
      { m: [SO_, SO_, E, E], step: 0 }, // Start: blue S, red E (gamma)
      { m: [SO_, N, E, E], step: 1 }, //  blue dash S→N, red static E
      { m: [N, N, E, W], step: 2 }, //    red dash E→W, blue static N
      { m: [N, SO_, W, W], step: 3 }, //  blue dash N→S, red static W
      { m: [SO_, SO_, W, E], step: 4 }, //  red dash W→E, blue static S  (→ Start)
    ],
  },
  // Type 5 - Dual-Dash. Both dash → letters key the arrow separation.
  {
    key: "t56-5a",
    word: "α → α",
    cells: [
      { m: [SO_, SO_, N, N], step: 0 }, // Start: blue S, red N (alpha)
      { m: [SO_, N, N, SO_], step: 1, letter: Letter.PHI_DASH }, // α→α = Φ- (MCP); dash arrows blue W / red E
    ],
  },
  {
    key: "t56-5b",
    word: "β → β",
    cells: [
      { m: [SO_, SO_, SO_, SO_], step: 0 }, // Start: both S (beta)
      { m: [SO_, N, SO_, N], step: 1, letter: Letter.PSI_DASH }, // β→β = Ψ- (MCP); dash arrows blue W / red E
    ],
  },
  {
    key: "t56-5c",
    word: "γ → γ",
    cells: [
      { m: [SO_, SO_, E, E], step: 0 }, // Start: blue S, red E (gamma)
      { m: [SO_, N, E, W], step: 1, letter: Letter.LAMBDA_DASH }, // blue S→N (E) / red E→W (S)
    ],
  },
  // Type 6 - Static. No hand movement → no arrows; the letter glyph is the point.
  {
    key: "t56-6a",
    word: "α",
    cells: [
      { m: [SO_, SO_, N, N], step: 0, letter: Letter.ALPHA },
      { m: [SO_, SO_, N, N], step: 1, letter: Letter.ALPHA },
    ],
  },
  {
    key: "t56-6b",
    word: "β",
    cells: [
      { m: [SO_, SO_, SO_, SO_], step: 0, letter: Letter.BETA },
      { m: [SO_, SO_, SO_, SO_], step: 1, letter: Letter.BETA },
    ],
  },
  {
    key: "t56-6c",
    word: "γ",
    cells: [
      { m: [SO_, SO_, E, E], step: 0, letter: Letter.GAMMA },
      { m: [SO_, SO_, E, E], step: 1, letter: Letter.GAMMA },
    ],
  },
];

// Flatten a strip into ordered pictographs. Type456Page's PICTO_FLAGS keep
// showReversals off, so this is used directly - no bakeReversals needed.
const stripSteps = (s: Strip): PictographData[] =>
  s.cells.map((cell, i) =>
    box(cell.m, cell.step, `seq-${i}`, cell.letter ?? null)
  ) as unknown as PictographData[];
const stripByKey = (key: string): Strip => STRIPS.find((s) => s.key === key)!;

const T4A = stripByKey("t56-4a");
const T4B = stripByKey("t56-4b");
const T5A = stripByKey("t56-5a");
const T5B = stripByKey("t56-5b");
const T5C = stripByKey("t56-5c");
const T6A = stripByKey("t56-6a");
const T6B = stripByKey("t56-6b");
const T6C = stripByKey("t56-6c");

/** HAND props - matching Type456Page's PICTO_FLAGS. */
const RENDER = { propType: PropType.HAND } as const;

export const hmType56Content: GuideBlock[] = [
  { kind: "heading", level: 1, text: "Type 4, 5, 6: Dash, Dual-Dash, Static" },

  { kind: "heading", level: 2, text: "Type 4 - Dash" },
  {
    kind: "prose",
    html:
      'With a <span class="k-dash">Dash</span>, one hand executes a dash while the other hand remains static.<br>' +
      "With alpha → beta, this creates a two-step sequence:",
  },
  {
    kind: "pictographGroup",
    items: stripSteps(T4A),
    flowCols: 3,
    layout: "strip",
    stepLabels: ["Start", "1", "2"],
    card: true,
    render: RENDER,
    caption: T4A.word,
  },
  {
    kind: "prose",
    html: "And with gamma → gamma, it creates a 4-step sequence:",
  },
  {
    kind: "pictographGroup",
    items: stripSteps(T4B),
    flowCols: 5,
    layout: "strip",
    stepLabels: ["Start", "1", "2", "3", "4"],
    card: true,
    render: RENDER,
    caption: T4B.word,
  },

  { kind: "heading", level: 2, text: "Type 5 - Dual-Dash" },
  {
    kind: "prose",
    html: 'With a <span class="k-dual">Dual</span><span class="k-dash">-Dash</span>, both hands dash simultaneously to their opposite points.',
  },
  {
    kind: "pictographGroup",
    items: stripSteps(T5A),
    flowCols: 2,
    layout: "strip",
    stepLabels: ["Start", "1"],
    card: true,
    render: RENDER,
    caption: T5A.word,
  },
  {
    kind: "pictographGroup",
    items: stripSteps(T5B),
    flowCols: 2,
    layout: "strip",
    stepLabels: ["Start", "1"],
    card: true,
    render: RENDER,
    caption: T5B.word,
  },
  {
    kind: "pictographGroup",
    items: stripSteps(T5C),
    flowCols: 2,
    layout: "strip",
    stepLabels: ["Start", "1"],
    card: true,
    render: RENDER,
    caption: T5C.word,
  },
  {
    kind: "prose",
    html:
      'Practice using <span class="k-dual">Dual</span><span class="k-dash">-Dashes</span>, <span class="k-dash">Dashes</span>, and <span class="k-cross">Cross</span><span class="k-shift">-Shifts</span><br>' +
      "from different start positions.",
  },

  { kind: "heading", level: 2, text: "Type 6 - Static" },
  {
    kind: "prose",
    html: 'Finally, <span class="k-static">Static</span> motions are indicated by no arrow:',
  },
  {
    kind: "pictographGroup",
    items: stripSteps(T6A),
    flowCols: 2,
    render: RENDER,
    caption: T6A.word,
  },
  {
    kind: "pictographGroup",
    items: stripSteps(T6B),
    flowCols: 2,
    render: RENDER,
    caption: T6B.word,
  },
  {
    kind: "pictographGroup",
    items: stripSteps(T6C),
    flowCols: 2,
    render: RENDER,
    caption: T6C.word,
  },
  {
    kind: "prose",
    html: "Later on, static sequences gain complexity when adding prop rotations.",
  },
];
