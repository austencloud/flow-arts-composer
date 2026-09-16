/**
 * Single source for the Words page (manifest id "words"). Prose is lifted
 * VERBATIM from _pages/WordsPage.svelte (Austen's words - never AI-written); the
 * pictograph construction is a FAITHFUL COPY of that same file's AABB derivation
 * (same helpers, same locations/orientations → identical staff pictographs),
 * minus the reader-only wiring (selection, overrides, click-to-animate). FlowFrame
 * stacks the blocks in reading order; the sheet toggle renders the built _pages
 * component. See the reflow spec + no-ghostwriting rule.
 *
 * REFERENCE EXAMPLE for the strip → pictographGroup transformation (the pattern
 * every letter/word/LOOP page follows).
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

// ── AABB: A A around (pro), B B back (anti) - copied from WordsPage.svelte ──
type Leg = { from: GridLocation; to: GridLocation; anti: boolean };
const BLUE_LEGS: Leg[] = [
  { from: SO_, to: W, anti: false },
  { from: W, to: N, anti: false },
  { from: N, to: W, anti: true },
  { from: W, to: SO_, anti: true },
];
const RED_LEGS: Leg[] = [
  { from: N, to: E, anti: false },
  { from: E, to: SO_, anti: false },
  { from: SO_, to: E, anti: true },
  { from: E, to: N, anti: true },
];
const LETTERS = [Letter.A, Letter.A, Letter.B, Letter.B];

const HP_CW = new Set(["s-w", "w-n", "n-e", "e-s"]);
const hpDir = (from: GridLocation, to: GridLocation) => (HP_CW.has(`${from}-${to}`) ? CW : CCW);
const flip = (o: Orientation) => (o === IN ? OUT : IN);
// pro (steps 1-2) preserves the row's starting orientation, anti (step 3) flips
// into step 4, which flips back.
const oriAt = (o0: Orientation, i: number): Orientation => (i === 3 ? flip(o0) : o0);

const hand = (color: HandSide, leg: Leg, so: Orientation) => {
  const dir = hpDir(leg.from, leg.to);
  return createMotionData({
    motionType: leg.anti ? MotionType.ANTI : MotionType.PRO,
    rotationDirection: leg.anti ? (dir === CW ? CCW : CW) : dir,
    startLocation: leg.from,
    endLocation: leg.to,
    startOrientation: so,
    endOrientation: leg.anti ? flip(so) : so,
    turns: 0,
    hand: color,
    propType: PropType.STAFF,
    gridMode: GridMode.DIAMOND,
  });
};
const stat = (color: HandSide, loc: GridLocation, ori: Orientation) =>
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

type RowDef = { key: string; leftOri: Orientation; rightOri: Orientation; label: string };
const ROWS: RowDef[] = [
  { key: "w-aabb-ii", leftOri: IN, rightOri: IN, label: "in | in" },
  { key: "w-aabb-oo", leftOri: OUT, rightOri: OUT, label: "out | out" },
  { key: "w-aabb-io", leftOri: IN, rightOri: OUT, label: "in | out" },
];

const rowStep = (r: RowDef, i: number): StepData =>
  ({
    id: `${r.key}-${i + 1}`,
    letter: LETTERS[i]!,
    gridMode: GridMode.DIAMOND,
    startPlacement: getGridPlacementFromLocations(BLUE_LEGS[i]!.from, RED_LEGS[i]!.from),
    endPlacement: getGridPlacementFromLocations(BLUE_LEGS[i]!.to, RED_LEGS[i]!.to),
    stepNumber: i + 1,
    motions: {
      left: hand(HandSide.LEFT, BLUE_LEGS[i]!, oriAt(r.leftOri, i)),
      right: hand(HandSide.RIGHT, RED_LEGS[i]!, oriAt(r.rightOri, i)),
    },
  }) as unknown as StepData;

const startBox = (r: RowDef): StepData =>
  ({
    id: `${r.key}-0`,
    letter: Letter.ALPHA,
    gridMode: GridMode.DIAMOND,
    stepNumber: 0,
    startPlacement: getGridPlacementFromLocations(SO_, N),
    endPlacement: getGridPlacementFromLocations(SO_, N),
    motions: {
      left: stat(HandSide.LEFT, SO_, r.leftOri),
      right: stat(HandSide.RIGHT, N, r.rightOri),
    },
  }) as unknown as StepData;

// One AABB strip per starting thumb orientation: Start + 4 steps. (WordsPage's
// PICTO_FLAGS keeps showReversals off, so the strip is used directly - no
// bakeReversals needed for the display.)
const rowStrip = (r: RowDef): PictographData[] =>
  [startBox(r), ...[0, 1, 2, 3].map((i) => rowStep(r, i))] as unknown as PictographData[];

/** STAFF props, TKA letter glyph on - matching WordsPage's PICTO_FLAGS. */
const RENDER = { propType: PropType.STAFF } as const;

/** Step captions above each strip cell: the start box, then the four AABB steps. */
const STEP_LABELS = ["Start", "1", "2", "3", "4"];

export const wordsContent: GuideBlock[] = [
  { kind: "heading", level: 1, text: "Words" },
  { kind: "prose", html: "Let’s create more complex words using pictographs!" },
  {
    kind: "prose",
    html:
      "In order to perform the words in this section correctly without finger-spinning,<br>" +
      "you must be familiar with negative space and body turns.",
  },
  {
    kind: "prose",
    html:
      "If you finger-spin instead of using negative space, you’ll lose precision and<br>" +
      "the ability to check your thumb orientation on each step to see if you’re still on track.",
  },
  {
    kind: "prose",
    html:
      "We’ll use the word AABB as an example. Here are three variations on AABB, starting from<br>" +
      'different thumb orientations. Use staves or <strong><span class="cR">red</span>/<span class="cB">blue</span></strong> pens to follow along.',
  },
  { kind: "pictographGroup", items: rowStrip(ROWS[0]!), flowCols: 5, layout: "strip", stepLabels: STEP_LABELS, card: true, render: RENDER, caption: "AABB: thumbs in | in" },
  { kind: "pictographGroup", items: rowStrip(ROWS[1]!), flowCols: 5, layout: "strip", stepLabels: STEP_LABELS, card: true, render: RENDER, caption: "AABB: thumbs out | out" },
  { kind: "pictographGroup", items: rowStrip(ROWS[2]!), flowCols: 5, layout: "strip", stepLabels: STEP_LABELS, card: true, render: RENDER, caption: "AABB: thumbs in | out" },
  {
    kind: "prose",
    html:
      "As you execute these with staves, notice that each of these sequences requires a different type<br>" +
      "of negative space, either above/below the shoulder or behind the elbow.",
  },
  {
    kind: "prose",
    html:
      "The execution of the same word can feel completely different depending on factors like<br>" +
      "the start position, rotation direction, and thumb orientation. That’s why it’s necessary to<br>" +
      "draw the full sequence with pictographs for complete clarity.",
  },
  {
    kind: "prose",
    html:
      "<strong>The Alphabet is primarily a system of <em>pictographs</em>,<br>" +
      "organized by letters for convenient communication.</strong>",
  },
  {
    kind: "prose",
    html:
      "The letters do not give all of the information, and are merely intended to separate<br>" +
      "motion combinations into categories which can be further clarified with detailed pictographs.",
  },
];
