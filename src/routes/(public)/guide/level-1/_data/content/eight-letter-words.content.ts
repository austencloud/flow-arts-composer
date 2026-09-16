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

// Verbatim prose lifted from _pages/EightLetterWordsPage.svelte (Austen's words - never AI-written).
// Pictograph construction is a FAITHFUL COPY of that same file's step authoring (same
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
const { C, I, K, U, W: WL, X, Y, Z } = Letter;
const NL = Letter.N;
const EL = Letter.E;
const SIG = Letter.SIGMA;
const THE = Letter.THETA;
const OME = Letter.OMEGA;

type SeqDef = {
  key: string;
  word: string;
  tag: string;
  startLetter: Letter;
  startLeft: GridLocation;
  startRight: GridLocation;
  steps: Step[];
};
const SEQS: SeqDef[] = [
  {
    // IIΩXKEΣY ×2 - Rotated LOOP; blue CCW, red CW throughout.
    key: "el-iixksy",
    word: "IIΩXKEΣY",
    tag: "Rotated LOOP",
    startLetter: Letter.BETA,
    startLeft: SO_,
    startRight: SO_,
    steps: [
      st(I, h(true, SO_, W), h(false, SO_, W)),
      st(I, h(true, W, N, OUT), h(false, W, N)),
      st(OME, sh(N), h(true, N, W)),
      st(X, sh(N), h(true, W, SO_, OUT)),
      st(K, h(true, N, E), h(true, SO_, E)),
      st(EL, h(true, E, SO_, OUT), h(true, E, N, OUT)),
      st(SIG, h(false, SO_, E), sh(N)),
      st(Y, h(false, E, N), sh(N)),
      st(I, h(true, N, E), h(false, N, E)),
      st(I, h(true, E, SO_, OUT), h(false, E, SO_)),
      st(OME, sh(SO_), h(true, SO_, E)),
      st(X, sh(SO_), h(true, E, N, OUT)),
      st(K, h(true, SO_, W), h(true, N, W)),
      st(EL, h(true, W, N, OUT), h(true, W, SO_, OUT)),
      st(SIG, h(false, N, W), sh(SO_)),
      st(Y, h(false, W, SO_), sh(SO_)),
    ],
  },
  {
    // CΣNZIΘUW ×2 - Mirrored + Swapped LOOP; blue prop CCW and red CW the
    // whole way (fully continuous, no reversals). The margin letter is U,
    // not V - U[8]/U[5] are the dataset steps that keep both hands
    // continuous (V has no variation pairing these paths).
    key: "el-csnzvw",
    word: "CΣNZIΘUW",
    tag: "Mirrored + Swapped LOOP",
    startLetter: Letter.ALPHA,
    startLeft: SO_,
    startRight: N,
    steps: [
      st(C, h(true, SO_, W), h(false, N, E)),
      st(SIG, sh(W, OUT), h(false, E, SO_)),
      st(NL, h(true, W, N, OUT), h(true, SO_, E)),
      st(Z, sh(N), h(true, E, N, OUT)),
      st(I, h(false, N, W), h(true, N, W)),
      st(THE, h(false, W, SO_), sh(W, OUT)),
      st(U, h(false, SO_, E), h(true, W, SO_, OUT)),
      st(WL, h(false, E, N), sh(SO_)),
      st(C, h(false, N, W), h(true, SO_, E)),
      st(SIG, h(false, W, SO_), sh(E, OUT)),
      st(NL, h(true, SO_, W), h(true, E, N, OUT)),
      st(Z, h(true, W, N, OUT), sh(N)),
      st(I, h(true, N, E), h(false, N, E)),
      st(THE, sh(E, OUT), h(false, E, SO_)),
      st(U, h(true, E, SO_, OUT), h(false, SO_, W)),
      st(WL, sh(SO_), h(false, W, N)),
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
const startBox = (q: SeqDef): StepData =>
  ({
    id: `${q.key}-0`,
    letter: q.startLetter,
    gridMode: GridMode.DIAMOND,
    stepNumber: 0,
    startPlacement: getGridPlacementFromLocations(q.startLeft, q.startRight),
    endPlacement: getGridPlacementFromLocations(q.startLeft, q.startRight),
    motions: {
      left: handMotion(HandSide.LEFT, sh(q.startLeft)),
      right: handMotion(HandSide.RIGHT, sh(q.startRight)),
    },
  }) as unknown as StepData;

// Start + 16 steps, reversal dots derived from the motions themselves
// (bakeReversals; never hand-authored) - matching PICTO_FLAGS.showReversals
// on the source page.
const strip = (q: SeqDef): PictographData[] => {
  const authored = [startBox(q), ...q.steps.map((_, i) => stepData(q, i))];
  return [authored[0]!, ...bakeReversals(authored.slice(1))] as unknown as PictographData[];
};

/** STAFF props with reversal dots - matching EightLetterWordsPage's PICTO_FLAGS. */
const RENDER = { propType: PropType.STAFF, showReversals: true } as const;

export const eightLetterWordsContent: GuideBlock[] = [
  { kind: "heading", level: 1, text: "8-Letter Words" },
  {
    kind: "prose",
    html:
      "Words can be any length.<br>" +
      "These 8-letter words repeat twice, to create 16-count sequences.",
  },
  { kind: "pictographGroup", items: strip(SEQS[0]!), flowCols: 4, card: true, render: RENDER, caption: "IIΩXKEΣY" },
  { kind: "prose", html: "(Rotated LOOP)" },
  { kind: "pictographGroup", items: strip(SEQS[1]!), flowCols: 4, card: true, render: RENDER, caption: "CΣNZIΘUW" },
  { kind: "prose", html: "(Mirrored + Swapped LOOP)" },
];
