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
import { bakeReversals } from "../guide-sequence-adapter";

// Verbatim prose lifted from _pages/SixteenCountPage.svelte (Austen's words - never AI-written);
// pictograph construction is a FAITHFUL COPY of that same file's step authoring (same
// helpers, same locations/orientations → identical staff pictographs), minus the
// reader-only wiring (selection, overrides, click-to-animate, sheet geometry).

const { NORTH: N, EAST: E, SOUTH: SO_, WEST: W } = GridLocation;
const { IN, OUT } = Orientation;
const CW = RotationDirection.CLOCKWISE;
const CCW = RotationDirection.COUNTER_CLOCKWISE;

// ── Step authoring (shift + per-step static, both orientation-tracked) ─────
const HP_CW = new Set(["s-w", "w-n", "n-e", "e-s"]);
const flip = (o: Orientation) => (o === IN ? OUT : IN);
type HandStep = { anti?: boolean; still?: boolean; from: GridLocation; to: GridLocation; so: Orientation };
const h = (anti: boolean, from: GridLocation, to: GridLocation, so: Orientation = IN): HandStep => ({ anti, from, to, so });
const sh = (loc: GridLocation, so: Orientation = IN): HandStep => ({ still: true, from: loc, to: loc, so });
const handMotion = (color: HandSide, x: HandStep) => {
  if (x.still) {
    return createMotionData({
      motionType: MotionType.STATIC,
      startLocation: x.from,
      endLocation: x.to,
      startOrientation: x.so,
      endOrientation: x.so,
      hand: color,
      propType: PropType.STAFF,
      gridMode: GridMode.DIAMOND,
    });
  }
  const dir = HP_CW.has(`${x.from}-${x.to}`) ? CW : CCW;
  return createMotionData({
    motionType: x.anti ? MotionType.ANTI : MotionType.PRO,
    rotationDirection: x.anti ? (dir === CW ? CCW : CW) : dir,
    startLocation: x.from,
    endLocation: x.to,
    startOrientation: x.so,
    endOrientation: x.anti ? flip(x.so) : x.so,
    turns: 0,
    hand: color,
    propType: PropType.STAFF,
    gridMode: GridMode.DIAMOND,
  });
};

type Step = { letter: Letter; left: HandStep; right: HandStep };
const st = (letter: Letter, left: HandStep, right: HandStep): Step => ({ letter, left, right });
const { G, O, Q, Y, Z } = Letter;
const EL = Letter.E;
const DEL = Letter.DELTA;
const THE = Letter.THETA;

type SeqDef = {
  key: string;
  word: string;
  steps: Step[];
};
const SEQS: SeqDef[] = [
  {
    // GΘOZ ×4 - Rotated + Swapped LOOP; both props CCW throughout.
    key: "sc-gtoz",
    word: "GΘOZ ×4",
    steps: [
      st(G, h(false, SO_, E), h(false, SO_, E)),
      st(THE, h(false, E, N), sh(E)),
      st(O, h(false, N, W), h(true, E, SO_)),
      st(Z, sh(W), h(true, SO_, W, OUT)),
      st(G, h(false, W, SO_), h(false, W, SO_)),
      st(THE, sh(SO_), h(false, SO_, E)),
      st(O, h(true, SO_, W), h(false, E, N)),
      st(Z, h(true, W, N, OUT), sh(N)),
      st(G, h(false, N, W), h(false, N, W)),
      st(THE, sh(W), h(false, W, SO_)),
      st(O, h(true, W, N), h(false, SO_, E)),
      st(Z, h(true, N, E, OUT), sh(E)),
      st(G, h(false, E, N), h(false, E, N)),
      st(THE, h(false, N, W), sh(N)),
      st(O, h(false, W, SO_), h(true, N, E)),
      st(Z, sh(SO_), h(true, E, SO_, OUT)),
    ],
  },
  {
    // EΔQY ×4 - Rotated + Mirrored + Swapped LOOP; blue CCW, red CW.
    key: "sc-eqdy",
    word: "EΔQY ×4",
    steps: [
      st(EL, h(true, SO_, W), h(true, SO_, E)),
      st(DEL, sh(W, OUT), h(true, E, N, OUT)),
      st(Q, h(true, W, N, OUT), h(true, N, W)),
      st(Y, sh(N), h(false, W, N, OUT)),
      st(EL, h(true, N, E), h(true, N, W, OUT)),
      st(DEL, sh(E, OUT), h(true, W, SO_)),
      st(Q, h(true, E, SO_, OUT), h(true, SO_, E, OUT)),
      st(Y, sh(SO_), h(false, E, SO_)),
      st(EL, h(true, SO_, W), h(true, SO_, E)),
      st(DEL, h(true, W, N, OUT), sh(E, OUT)),
      st(Q, h(true, N, E), h(true, E, N, OUT)),
      st(Y, h(false, E, N, OUT), sh(N)),
      st(EL, h(true, N, E, OUT), h(true, N, W)),
      st(DEL, h(true, E, SO_), sh(W, OUT)),
      st(Q, h(true, SO_, W, OUT), h(true, W, SO_, OUT)),
      st(Y, h(false, W, SO_), sh(SO_)),
    ],
  },
];

const stepData = (q: SeqDef, i: number): StepData => {
  const s = q.steps[i]!;
  return {
    id: `${q.key}-${i + 1}`,
    letter: s.letter,
    gridMode: GridMode.DIAMOND,
    startPlacement: getGridPlacementFromLocations(s.left.from, s.right.from),
    endPlacement: getGridPlacementFromLocations(s.left.to, s.right.to),
    stepNumber: i + 1,
    motions: {
      left: handMotion(HandSide.LEFT, s.left),
      right: handMotion(HandSide.RIGHT, s.right),
    },
  } as unknown as StepData;
};
// Start box: β, both S, thumbs in.
const startBox = (q: SeqDef): StepData =>
  ({
    id: `${q.key}-0`,
    letter: Letter.BETA,
    gridMode: GridMode.DIAMOND,
    stepNumber: 0,
    startPlacement: getGridPlacementFromLocations(SO_, SO_),
    endPlacement: getGridPlacementFromLocations(SO_, SO_),
    motions: {
      left: handMotion(HandSide.LEFT, sh(SO_)),
      right: handMotion(HandSide.RIGHT, sh(SO_)),
    },
  }) as unknown as StepData;

// Each sequence's full strip (start + 16 steps), reversal dots derived from
// the motions themselves via bakeReversals (never hand-authored) - matching
// SixteenCountPage.svelte's PICTO_FLAGS.showReversals: true. Constant
// per-hand prop rotation (statics inert) means bakeReversals derives no
// flags here, matching the artboard.
const seqStrip = (q: SeqDef): PictographData[] => {
  const authored = [startBox(q), ...q.steps.map((_, i) => stepData(q, i))];
  return [authored[0], ...bakeReversals(authored.slice(1))] as unknown as PictographData[];
};

/** STAFF props with reversal dots - matching SixteenCountPage's PICTO_FLAGS. */
const RENDER = { propType: PropType.STAFF, showReversals: true } as const;

export const sixteenCountContent: GuideBlock[] = [
  { kind: "heading", level: 1, text: "16-Count Sequences" },
  { kind: "prose", html: "These 4-letter words repeat 4 times, giving us 16-count sequences." },
  { kind: "pictographGroup", items: seqStrip(SEQS[0]!), flowCols: 4, card: true, render: RENDER, caption: SEQS[0]!.word },
  {
    kind: "prose",
    html:
      "Here, each repetition of the word ends in a β that is 90° from its start. " +
      "This means it will take 4 repetitions to return to home.",
  },
  { kind: "prose", html: "<em>(Rotated + Swapped LOOP)</em>" },
  { kind: "pictographGroup", items: seqStrip(SEQS[1]!), flowCols: 4, card: true, render: RENDER, caption: SEQS[1]!.word },
  {
    kind: "prose",
    html:
      "Here, the staves return to home after two word repetitions. To make it " +
      "symmetrical, it repeats twice more, filling the rest of the quadrants.",
  },
  { kind: "prose", html: "<em>(Rotated + Mirrored + Swapped LOOP)</em>" },
];
