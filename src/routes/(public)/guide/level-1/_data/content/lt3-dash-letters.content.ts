/**
 * Single source for the Type 3 Cross-Shift Letters SEO doorway (manifest id
 * "lt3-dash-letters"). Prose is lifted VERBATIM from
 * _pages/Type3CrossShiftLettersPage.svelte (Austen's words - never
 * AI-written); the pictograph construction is a FAITHFUL COPY of that same
 * file's dash+shift derivation (same helpers, same locations/orientations →
 * identical staff pictographs), minus the reader-only wiring (selection,
 * overrides, click-to-animate), the bespoke sheet-only halfway/end frame
 * artwork (a hand-composed bare grid + raw staff SVG at fixed rotation poses
 * - not derived pictograph data), and sheet geometry. See the reflow spec +
 * no-ghostwriting rule.
 *
 * Box labels follow the SOURCE PAGE's dataset-corrected positions (not the
 * old artboard): Σ-/Δ- start at beta, Θ-/Ω- start at alpha - see that file's
 * header comment for the flagged correction. The two breakdown letters (W-,
 * Δ-) are real, distinct pictograph instances chosen for the page's Staff
 * Motions recipe - same letter as a box cell, different start position.
 */
import type { GuideBlock } from "../guide-content-blocks";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  MotionType,
  HandSide,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { GridMode, GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

const { NORTH: N, EAST: E, SOUTH: SO_, WEST: W } = GridLocation;
const { IN, OUT } = Orientation;
const CW = RotationDirection.CLOCKWISE;
const CCW = RotationDirection.COUNTER_CLOCKWISE;
const NOROT = RotationDirection.NO_ROTATION;

// ── Motion authoring - copied from Type3CrossShiftLettersPage.svelte ───────
const HP_CW = new Set(["s-w", "w-n", "n-e", "e-s"]);
const hpDir = (from: GridLocation, to: GridLocation) => (HP_CW.has(`${from}-${to}`) ? CW : CCW);
const shift = (color: HandSide, from: GridLocation, to: GridLocation, anti: boolean, so: Orientation = IN) => {
  const dir = hpDir(from, to);
  return createMotionData({
    motionType: anti ? MotionType.ANTI : MotionType.PRO,
    rotationDirection: anti ? (dir === CW ? CCW : CW) : dir,
    startLocation: from,
    endLocation: to,
    startOrientation: so,
    endOrientation: anti ? (so === IN ? OUT : IN) : so,
    turns: 0,
    hand: color,
    propType: PropType.STAFF,
    gridMode: GridMode.DIAMOND,
  });
};
const dash = (color: HandSide, from: GridLocation, to: GridLocation) =>
  createMotionData({
    motionType: MotionType.DASH,
    rotationDirection: NOROT,
    startLocation: from,
    endLocation: to,
    startOrientation: IN,
    endOrientation: OUT,
    turns: 0,
    hand: color,
    propType: PropType.STAFF,
    gridMode: GridMode.DIAMOND,
  });
const stat = (color: HandSide, loc: GridLocation, ori: Orientation = IN) =>
  createMotionData({
    motionType: MotionType.STATIC,
    startLocation: loc,
    endLocation: loc,
    startOrientation: ori,
    endOrientation: ori,
    hand: color,
    propType: PropType.STAFF,
    gridMode: GridMode.DIAMOND,
  });

// ── The four letter boxes (blue dashes, red shifts) ─────────────────────────
type CellDef = {
  letter: Letter;
  name: string;
  bFrom: GridLocation;
  bTo: GridLocation;
  rFrom: GridLocation;
  rTo: GridLocation;
  anti: boolean;
};
type BoxDef = { label: string; cells: CellDef[] };
const BOXES: BoxDef[] = [
  {
    label: "γ→α",
    cells: [
      { letter: Letter.W_DASH, name: "W-", bFrom: E, bTo: W, rFrom: SO_, rTo: E, anti: false },
      { letter: Letter.X_DASH, name: "X-", bFrom: E, bTo: W, rFrom: SO_, rTo: E, anti: true },
    ],
  },
  {
    label: "γ→β",
    cells: [
      { letter: Letter.Y_DASH, name: "Y-", bFrom: N, bTo: SO_, rFrom: W, rTo: SO_, anti: false },
      { letter: Letter.Z_DASH, name: "Z-", bFrom: N, bTo: SO_, rFrom: W, rTo: SO_, anti: true },
    ],
  },
  {
    label: "β→γ",
    cells: [
      { letter: Letter.SIGMA_DASH, name: "Σ-", bFrom: E, bTo: W, rFrom: E, rTo: SO_, anti: false },
      { letter: Letter.DELTA_DASH, name: "Δ-", bFrom: E, bTo: W, rFrom: E, rTo: SO_, anti: true },
    ],
  },
  {
    label: "α→γ",
    cells: [
      { letter: Letter.THETA_DASH, name: "Θ-", bFrom: N, bTo: SO_, rFrom: SO_, rTo: E, anti: false },
      { letter: Letter.OMEGA_DASH, name: "Ω-", bFrom: N, bTo: SO_, rFrom: SO_, rTo: E, anti: true },
    ],
  },
];

const cellStep = (c: CellDef, id: string, stepNumber: number | null): StepData =>
  ({
    id,
    letter: c.letter,
    gridMode: GridMode.DIAMOND,
    startPlacement: getGridPlacementFromLocations(c.bFrom, c.rFrom),
    endPlacement: getGridPlacementFromLocations(c.bTo, c.rTo),
    stepNumber,
    motions: {
      left: dash(HandSide.LEFT, c.bFrom, c.bTo),
      right: shift(HandSide.RIGHT, c.rFrom, c.rTo, c.anti),
    },
  }) as unknown as StepData;

const boxGroup = (box: BoxDef, key: string): PictographData[] =>
  box.cells.map((c) => cellStep(c, `${key}-${c.name}`, null)) as unknown as PictographData[];

// ── The two step-by-step breakdown letters (Staff Motions recipe): real
// Start + combined-letter strips, copied from Type3CrossShiftLettersPage's
// BREAKDOWNS (only the start/end pose + full-letter data - the halfway
// bare-grid/raw-SVG composite is sheet-only artwork, dropped). ─────────────
type Breakdown = { key: string; name: string; cell: CellDef; startOris: [Orientation, Orientation] };
const BREAKDOWNS: Breakdown[] = [
  {
    key: "t3-bd-w",
    name: "W-",
    cell: { letter: Letter.W_DASH, name: "W-", bFrom: E, bTo: W, rFrom: SO_, rTo: E, anti: false },
    startOris: [IN, IN],
  },
  {
    key: "t3-bd-d",
    name: "Δ-",
    cell: { letter: Letter.DELTA_DASH, name: "Δ-", bFrom: SO_, bTo: N, rFrom: SO_, rTo: E, anti: true },
    startOris: [IN, IN],
  },
];

const bdStart = (b: Breakdown): StepData =>
  ({
    id: `${b.key}-start`,
    letter: null,
    gridMode: GridMode.DIAMOND,
    stepNumber: null,
    motions: {
      left: stat(HandSide.LEFT, b.cell.bFrom, b.startOris[0]),
      right: stat(HandSide.RIGHT, b.cell.rFrom, b.startOris[1]),
    },
  }) as unknown as StepData;

// Type3CrossShiftLettersPage's PICTO_FLAGS keeps showReversals off, so the
// strip is used directly - no bakeReversals needed for the display.
const bdStrip = (b: Breakdown): PictographData[] =>
  [bdStart(b), cellStep(b.cell, `${b.key}-full`, 1)] as unknown as PictographData[];

/** STAFF props, TKA letter glyph on - matching Type3CrossShiftLettersPage's PICTO_FLAGS. */
const RENDER = { propType: PropType.STAFF } as const;

export const lt3DashLettersContent: GuideBlock[] = [
  { kind: "heading", level: 1, text: "Type 3 Cross-Shift Letters" },
  {
    kind: "prose",
    html:
      '<strong style="color:#26e600">Cross</strong><strong style="color:#6F2DA8">-Shifts</strong> use the same letters as <strong style="color:#6F2DA8">Shifts</strong>, but each letter is followed by a<br>' +
      "dash to indicate that the other hand is dashing into its end position.<br>" +
      "They are spoken as “W Dash” or “Sigma Dash”.<br>" +
      "<em>A dash symbol in the glyph equals a dash arrow on the graph.</em><br>" +
      "<strong><em>The end position for each Type 2/3 letter remains the same.</em></strong>",
  },
  { kind: "pictographGroup", items: boxGroup(BOXES[0]!, "t3-a"), flowCols: 2, render: RENDER, caption: "γ→α: W-, X-" },
  { kind: "pictographGroup", items: boxGroup(BOXES[1]!, "t3-b"), flowCols: 2, render: RENDER, caption: "γ→β: Y-, Z-" },
  { kind: "pictographGroup", items: boxGroup(BOXES[2]!, "t3-c"), flowCols: 2, render: RENDER, caption: "β→γ: Sig Dash, Del Dash" },
  { kind: "pictographGroup", items: boxGroup(BOXES[3]!, "t3-d"), flowCols: 2, render: RENDER, caption: "α→γ: The Dash, Om Dash" },
  {
    kind: "prose",
    html:
      '<strong style="color:#26e600">Cross</strong><strong style="color:#6F2DA8">-Shifts</strong> can be tricky to remember. It helps to first picture the corresponding<br>' +
      "Type 2 pictograph, then add the dash arrow without changing any other variables.",
  },
  {
    kind: "prose",
    html:
      'Just like we did with hands, let’s break down some <strong style="color:#26e600">Cross</strong><strong style="color:#6F2DA8">-Shifts</strong> step-by-step.',
  },
  { kind: "pictographGroup", items: bdStrip(BREAKDOWNS[0]!), flowCols: 2, layout: "strip", stepLabels: ["Start", "1"], render: RENDER, caption: "W-: step by step" },
  { kind: "pictographGroup", items: bdStrip(BREAKDOWNS[1]!), flowCols: 2, layout: "strip", stepLabels: ["Start", "1"], render: RENDER, caption: "Δ-: step by step" },
  {
    kind: "prose",
    html:
      "<strong><em>When initially learning, it’s useful to pause at the halfway point to ensure proper timing.</em></strong>",
  },
];
