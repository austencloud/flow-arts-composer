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

// Verbatim prose lifted from _pages/FullReversalLoopsPage.svelte (Austen's words - never AI-written).
// Pictograph construction is a FAITHFUL COPY of that same file's step authoring (same
// helpers, same locations/orientations → identical staff pictographs), minus the
// reader-only wiring (selection, overrides, click-to-animate, sheet geometry).

const { NORTH: N, EAST: E, SOUTH: SO_, WEST: W } = GridLocation;
const { IN, OUT } = Orientation;
const CW = RotationDirection.CLOCKWISE;
const CCW = RotationDirection.COUNTER_CLOCKWISE;

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
const { A, C, D, F, I, K, L } = Letter;
const EL = Letter.E;

type SeqDef = {
  key: string;
  word: string;
  startLetter: Letter;
  startLeft: GridLocation;
  startRight: GridLocation;
  steps: Step[];
};
const SEQS: SeqDef[] = [
  {
    // CCKE ×2 - full reversal at each C-C corner; R/R derives on 2,3,5,6,7.
    key: "frl-ccke",
    word: "CCKE",
    startLetter: Letter.ALPHA,
    startLeft: SO_,
    startRight: N,
    steps: [
      st(C, h(true, SO_, W), h(false, N, E)),
      st(C, h(false, W, N, OUT), h(true, E, SO_)),
      st(K, h(true, N, E, OUT), h(true, SO_, E, OUT)),
      st(EL, h(true, E, SO_), h(true, E, N)),
      st(C, h(true, SO_, E, OUT), h(false, N, W, OUT)),
      st(C, h(false, E, N), h(true, W, SO_, OUT)),
      st(K, h(true, N, W), h(true, SO_, W)),
      st(EL, h(true, W, SO_, OUT), h(true, W, N, OUT)),
    ],
  },
  {
    // FLII ×2 - blue R on 3, red R on 5 and 7.
    key: "frl-flii",
    word: "FLII",
    startLetter: Letter.BETA,
    startLeft: SO_,
    startRight: SO_,
    steps: [
      st(F, h(false, SO_, W), h(true, SO_, E)),
      st(L, h(false, W, N), h(true, E, N, OUT)),
      st(I, h(false, N, W), h(true, N, W)),
      st(I, h(false, W, SO_), h(true, W, SO_, OUT)),
      st(F, h(true, SO_, W), h(false, SO_, E)),
      st(L, h(true, W, N, OUT), h(false, E, N)),
      st(I, h(true, N, E), h(false, N, E)),
      st(I, h(true, E, SO_, OUT), h(false, E, SO_)),
    ],
  },
  {
    // DAK ×4 - alternating single-hand flips: blue R on 2,6,8,12; red R on
    // 3,5,9,11.
    key: "frl-dak",
    word: "DAK",
    startLetter: Letter.BETA,
    startLeft: SO_,
    startRight: SO_,
    steps: [
      st(D, h(false, SO_, W), h(false, SO_, E)),
      st(A, h(false, W, SO_), h(false, E, N)),
      st(K, h(true, SO_, W), h(true, N, W)),
      st(D, h(false, W, SO_, OUT), h(false, W, N, OUT)),
      st(A, h(false, SO_, E, OUT), h(false, N, W, OUT)),
      st(K, h(true, E, N, OUT), h(true, W, N, OUT)),
      st(D, h(false, N, E), h(false, N, W)),
      st(A, h(false, E, N), h(false, W, SO_)),
      st(K, h(true, N, E), h(true, SO_, E)),
      st(D, h(false, E, N, OUT), h(false, E, SO_, OUT)),
      st(A, h(false, N, W, OUT), h(false, SO_, E, OUT)),
      st(K, h(true, W, SO_, OUT), h(true, E, SO_, OUT)),
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

// Start + N steps, reversal dots derived from the motions themselves
// (bakeReversals; never hand-authored) - matching PICTO_FLAGS.showReversals
// on the source page.
const strip = (q: SeqDef): PictographData[] => {
  const authored = [startBox(q), ...q.steps.map((_, i) => stepData(q, i))];
  return [authored[0]!, ...bakeReversals(authored.slice(1))] as unknown as PictographData[];
};

/** STAFF props with reversal dots - matching FullReversalLoopsPage's PICTO_FLAGS. */
const RENDER = { propType: PropType.STAFF, showReversals: true } as const;

export const fullReversalLoopsContent: GuideBlock[] = [
  { kind: "heading", level: 1, text: "Full-Reversal LOOPs" },
  {
    kind: "prose",
    html:
      "Each of these words uses a full-reversal.<br>" +
      "There are also prop-reversals within these words.<br>" +
      "Challenge yourself to identify each one.",
  },
  { kind: "pictographGroup", items: strip(SEQS[0]!), flowCols: 3, card: true, render: RENDER, caption: "CCKE" },
  { kind: "pictographGroup", items: strip(SEQS[1]!), flowCols: 3, card: true, render: RENDER, caption: "FLII" },
  { kind: "pictographGroup", items: strip(SEQS[2]!), flowCols: 6, card: true, render: RENDER, caption: "DAK" },
];
