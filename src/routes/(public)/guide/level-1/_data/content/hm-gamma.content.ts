import type { GuideBlock } from "../guide-content-blocks";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  MotionType,
  HandSide,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  GridMode,
  GridLocation,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { getGridPlacementFromLocations } from "#lib/shared/pictograph/grid/services/grid-placement-deriver.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import {
  DUAL_SHIFT_MODES,
  DUAL_SHIFT_SWITCHING_MOVES,
  type DualShiftMove,
} from "#lib/shared/guide-topics/dual-shifts-topic.js";

/**
 * Prose lifted from _pages/GammaPage.svelte (Austen's words - never
 * AI-written). The reflow order differs from the sheet: each mode's note sits
 * on its own example, and the two Quarter-Opp/Quarter-Same notes name what
 * the strips below show (STRIPS comments). The printed sheet keeps its text.
 * The strips' moves come from the shared Dual-Shifts record; the `motion` and
 * `box` construction follows GammaPage, minus the reader-only wiring
 * (selection, overrides, click-to-animate, edit-mode dragging, pt geometry).
 * On the web, /guide/level-1/hm-gamma redirects into the Dual-Shifts page;
 * this content stays for the in-app reader's flow view.
 */

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
type Move = DualShiftMove;
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

// The strips' moves and letters come from the shared Dual-Shifts record, so
// this flow page and the Dual-Shifts web page draw the same boxes. Letter P
// sits only on Quarter-Opp's two same-edge (antiparallel) counts, where it
// unlocks the arrow pipeline's separated placement (see the record).
type Cell = { m: Move; step: number; letter?: Letter | null } | null;
type Strip = { rows: Cell[][] };
const c = (m: Move, step: number, letter: Letter | null = null): Cell => ({
  m,
  step,
  letter,
});

const modeRow = (id: "quarter-opp" | "quarter-same"): Cell[] => {
  const mode = DUAL_SHIFT_MODES.find((m) => m.id === id)!;
  return mode.moves.map((m, n) => c(m, n, mode.letters[n] ?? null));
};
const switching = DUAL_SHIFT_SWITCHING_MOVES.map((m, n) => c(m, n));

const STRIPS: Strip[] = [
  // γ→γ Quarter-Opp - opposite spin, hands 90° apart the whole loop.
  { rows: [modeRow("quarter-opp")] },
  // γ→γ Quarter-Same - same spin, red leads blue by one point.
  { rows: [modeRow("quarter-same")] },
  // Switching sequence - alternates QO/QS each count; closes back to Start.
  { rows: [switching.slice(0, 5), [null, ...switching.slice(5)]] },
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
  {
    kind: "prose",
    attach: "previous",
    html:
      "The hands spin opposite ways. Steps 1 and 3 are parallel. " +
      "On steps 2 and 4 both hands travel the same edge in opposite directions: antiparallel.",
  },
  { kind: "heading", level: 2, text: "Quarter-Same" },
  {
    kind: "prose",
    html:
      "In Quarter-Same that never happens. Both hands spin the same way, " +
      "and red stays one point ahead of blue.",
  },
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
  { kind: "heading", level: 2, text: "Switching between them" },
  {
    kind: "prose",
    html:
      "When in gamma, you can move to any other variation of gamma. " +
      "Here’s one that switches between Quarter-Opp and Quarter-Same:",
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
    html: "These examples are continuous, but non-continuous sequences are also possible.",
  },
  {
    kind: "prose",
    html:
      '<strong>Practice using <span class="cy">Dual</span><span class="pu">-Shifts</span> ' +
      "to create other non-continuous γ→γ variations!</strong>",
  },
];
