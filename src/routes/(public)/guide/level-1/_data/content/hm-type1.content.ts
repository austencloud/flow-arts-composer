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
 * Verbatim prose lifted from _pages/Type1AlphaBetaPage.svelte (Austen's words -
 * never AI-written). Pictograph construction is a faithful copy of that same
 * file's `motion`/`box`/STRIPS derivation (identical enums, locations, letters
 * → identical hand pictographs), minus the reader-only wiring (selection,
 * overrides, click-to-animate, edit-mode paragraph/label dragging, pt geometry).
 */

const { NORTH: N, EAST: E, SOUTH: SO_, WEST: W } = GridLocation;

// A hand that moves is authored as a PRO shift; because both props are HAND,
// PictographPreparer's hand-path mode converts it to a FLOAT (handPath derived
// from the locations) and the arrow pipeline renders the system float arrow
// along the path - the same route the app itself takes for hand pictographs.
// A hand that stays is STATIC (no arrow).
const motion = (color: HandSide, from: GridLocation, to: GridLocation) =>
  createMotionData({
    motionType: from === to ? MotionType.STATIC : MotionType.PRO,
    startLocation: from,
    endLocation: to,
    hand: color,
    propType: PropType.HAND,
    gridMode: GridMode.DIAMOND,
  });

// [leftFrom, leftTo, rightFrom, rightTo]; start boxes hold (from === to).
// MCP-confirmed: A = α→α, G = β→β, D = β→α, J = α→β (all Type 1 dual-pro).
type Move = [GridLocation, GridLocation, GridLocation, GridLocation];
const box = (m: Move, stepNumber: number, letter: Letter | null): StepData =>
  ({
    id: `t1ab-${stepNumber}-${m.join("-")}`,
    letter,
    gridMode: GridMode.DIAMOND,
    startPlacement: getGridPlacementFromLocations(m[0], m[2]),
    endPlacement: getGridPlacementFromLocations(m[1], m[3]),
    motions: {
      left: motion(HandSide.LEFT, m[0], m[1]),
      right: motion(HandSide.RIGHT, m[2], m[3]),
    },
    stepNumber,
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
  }) as unknown as StepData;

// Each row = Start + a four-count loop, read straight off the proof page.
type Strip = { moves: Move[]; letters: (Letter | null)[] };
const STRIPS: Strip[] = [
  // Split-Same: α→α (letter A), both hands clockwise.
  {
    letters: [null, Letter.A, Letter.A, Letter.A, Letter.A],
    moves: [
      [SO_, SO_, N, N],
      [SO_, W, N, E],
      [W, N, E, SO_],
      [N, E, SO_, W],
      [E, SO_, W, N],
    ],
  },
  // Tog-Same: β→β (letter G), both hands clockwise together.
  {
    letters: [null, Letter.G, Letter.G, Letter.G, Letter.G],
    moves: [
      [SO_, SO_, SO_, SO_],
      [SO_, W, SO_, W],
      [W, N, W, N],
      [N, E, N, E],
      [E, SO_, E, SO_],
    ],
  },
  // Split-Opp: side-point start (β at W); β→α = D, α→β = J.
  {
    letters: [null, Letter.D, Letter.J, Letter.D, Letter.J],
    moves: [
      [W, W, W, W],
      [W, N, W, SO_],
      [N, E, SO_, E],
      [E, SO_, E, N],
      [SO_, W, N, W],
    ],
  },
  // Tog-Opp: bottom start (β at S), the same shape a quarter-turn around.
  {
    letters: [null, Letter.D, Letter.J, Letter.D, Letter.J],
    moves: [
      [SO_, SO_, SO_, SO_],
      [SO_, W, SO_, E],
      [W, N, E, N],
      [N, E, N, W],
      [E, SO_, W, SO_],
    ],
  },
];

// Strip → Start + 4 real pictographs. Type1AlphaBetaPage's PICTO_FLAGS keep
// showReversals off, so the strip is used directly - no bakeReversals needed.
const stripSteps = (strip: Strip): PictographData[] =>
  strip.moves.map((m, i) =>
    box(m, i, strip.letters[i] ?? null)
  ) as unknown as PictographData[];

/** HAND props - matching Type1AlphaBetaPage's PICTO_FLAGS. */
const RENDER = { propType: PropType.HAND } as const;

const SEQ_WORDS = [
  "α→α Split-Same",
  "β→β Tog-Same",
  "α↔β Split-Opp",
  "α↔β Tog-Opp",
];

export const hmType1Content: GuideBlock[] = [
  { kind: "heading", level: 1, text: "Type 1 Dual-Shifts: Alpha and Beta" },
  {
    kind: "prose",
    html:
      'When both hands move to adjacent locations, it’s called a <span class="cy">Dual</span><span class="pu">-Shift</span>.<br>' +
      'Our first <span class="cy">Dual</span><span class="pu">-Shifts</span> correspond to the four modes of time/direction: SS, TS, SO, TO.<br>' +
      "You can determine the start position by looking at the non-pointed end of the arrow.",
  },
  { kind: "heading", level: 2, text: "Split-Same" },
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
  { kind: "heading", level: 2, text: "Tog-Same" },
  {
    kind: "pictographGroup",
    items: stripSteps(STRIPS[1]!),
    flowCols: 5,
    layout: "strip",
    stepLabels: ["Start", "1", "2", "3", "4"],
    card: true,
    render: RENDER,
    caption: SEQ_WORDS[1],
  },
  {
    kind: "prose",
    html:
      "The Kinetic Alphabet puts focus on simultaneous motions between<br>" +
      "two positions, relative to the center point.<br>" +
      'Let’s try another type of <span class="cy">Dual</span><span class="pu">-Shift</span>.<br>' +
      "What happens when we move between α and β?",
  },
  { kind: "heading", level: 2, text: "Split-Opp" },
  {
    kind: "pictographGroup",
    items: stripSteps(STRIPS[2]!),
    flowCols: 5,
    layout: "strip",
    stepLabels: ["Start", "1", "2", "3", "4"],
    card: true,
    render: RENDER,
    caption: SEQ_WORDS[2],
  },
  { kind: "heading", level: 2, text: "Tog-Opp" },
  {
    kind: "pictographGroup",
    items: stripSteps(STRIPS[3]!),
    flowCols: 5,
    layout: "strip",
    stepLabels: ["Start", "1", "2", "3", "4"],
    card: true,
    render: RENDER,
    caption: SEQ_WORDS[3],
  },
  {
    kind: "prose",
    html: "Notice that it can be either <em>Split-Opp</em> or <em>Tog-Opp</em> depending on start position.",
  },
  {
    kind: "prose",
    html: '<strong>Practice using <span class="cy">Dual</span><span class="pu">-Shifts</span> to travel between Alpha and Beta in each mode.</strong>',
  },
];
