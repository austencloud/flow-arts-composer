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

// Verbatim prose lifted from _pages/PropReversalLoopsPage.svelte (Austen's words - never AI-written).
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
const { B, K, M, Q, T, W: WL, X, Y } = Letter;
const EL = Letter.E;
const SIG = Letter.SIGMA;
const DEL = Letter.DELTA;
const THE = Letter.THETA;

type LoopDef = {
  key: string;
  word: string;
  startLetter: Letter;
  startLeft: GridLocation;
  startRight: GridLocation;
  steps: Step[];
};
const LOOPS: LoopDef[] = [
  {
    // EΣQY ×2 - red R derives on 2, 3, 6, 7; blue CCW throughout.
    key: "prl-esqy",
    word: "EΣQY Rotated",
    startLetter: Letter.BETA,
    startLeft: SO_,
    startRight: SO_,
    steps: [
      st(EL, h(true, SO_, W), h(true, SO_, E)),
      st(SIG, sh(W, OUT), h(false, E, N, OUT)),
      st(Q, h(true, W, N, OUT), h(true, N, W, OUT)),
      st(Y, sh(N), h(false, W, N)),
      st(EL, h(true, N, E), h(true, N, W)),
      st(SIG, sh(E, OUT), h(false, W, SO_, OUT)),
      st(Q, h(true, E, SO_, OUT), h(true, SO_, E, OUT)),
      st(Y, sh(SO_), h(false, E, SO_)),
    ],
  },
  {
    // TWKΘ ×2 - blue R on 2 and 8, red R on 4 and 6, both on 5.
    key: "prl-twkt",
    word: "TWKΘ Rotated",
    startLetter: Letter.GAMMA,
    startLeft: SO_,
    startRight: E,
    steps: [
      st(T, h(true, SO_, W), h(true, E, SO_)),
      st(WL, h(false, W, N, OUT), sh(SO_, OUT)),
      st(K, h(true, N, W, OUT), h(true, SO_, W, OUT)),
      st(THE, sh(W), h(false, W, N)),
      st(T, h(true, W, N), h(true, N, E)),
      st(WL, sh(N, OUT), h(false, E, SO_, OUT)),
      st(K, h(true, N, E, OUT), h(true, SO_, E, OUT)),
      st(THE, h(false, E, SO_), sh(E)),
    ],
  },
  {
    // BΔMX ×2 - red R on 3, 5, 7 with red stopping on the even steps; blue
    // CCW throughout.
    key: "prl-bdmx",
    word: "BΔMX Rotated",
    startLetter: Letter.ALPHA,
    startLeft: SO_,
    startRight: N,
    steps: [
      st(B, h(true, SO_, W), h(true, N, E)),
      st(DEL, h(true, W, N, OUT), sh(E, OUT)),
      st(M, h(false, N, W), h(false, E, SO_, OUT)),
      st(X, h(true, W, N), sh(SO_, OUT)),
      st(B, h(true, N, E, OUT), h(true, SO_, W, OUT)),
      st(DEL, h(true, E, SO_), sh(W)),
      st(M, h(false, SO_, E, OUT), h(false, W, N)),
      st(X, h(true, E, SO_, OUT), sh(N)),
    ],
  },
];

const stepData = (l: LoopDef, i: number): StepData => {
  const s = l.steps[i]!;
  return {
    id: `${l.key}-${i + 1}`,
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
const startBox = (l: LoopDef): StepData =>
  ({
    id: `${l.key}-0`,
    letter: l.startLetter,
    gridMode: GridMode.DIAMOND,
    stepNumber: 0,
    startPlacement: getGridPlacementFromLocations(l.startLeft, l.startRight),
    endPlacement: getGridPlacementFromLocations(l.startLeft, l.startRight),
    motions: {
      left: handMotion(HandSide.LEFT, sh(l.startLeft)),
      right: handMotion(HandSide.RIGHT, sh(l.startRight)),
    },
  }) as unknown as StepData;

// Start + 8 steps, reversal dots derived from the motions themselves
// (bakeReversals; never hand-authored) - matching PICTO_FLAGS.showReversals
// on the source page.
const strip = (l: LoopDef): PictographData[] => {
  const authored = [startBox(l), ...l.steps.map((_, i) => stepData(l, i))];
  return [authored[0]!, ...bakeReversals(authored.slice(1))] as unknown as PictographData[];
};

/** STAFF props with reversal dots - matching PropReversalLoopsPage's PICTO_FLAGS. */
const RENDER = { propType: PropType.STAFF, showReversals: true } as const;

export const propReversalLoopsContent: GuideBlock[] = [
  { kind: "heading", level: 1, text: "Prop-Reversal LOOPs" },
  {
    kind: "prose",
    html:
      "Each of these words uses a prop-reversal.<br>" +
      "These examples are <em>Rotated LOOPs</em>.",
  },
  { kind: "pictographGroup", items: strip(LOOPS[0]!), flowCols: 3, card: true, render: RENDER, caption: "EΣQY Rotated" },
  { kind: "pictographGroup", items: strip(LOOPS[1]!), flowCols: 3, card: true, render: RENDER, caption: "TWKΘ Rotated" },
  { kind: "pictographGroup", items: strip(LOOPS[2]!), flowCols: 3, card: true, render: RENDER, caption: "BΔMX Rotated" },
  {
    kind: "prose",
    html:
      'In this example of BΔMX, the <strong class="cR">right</strong> hand stops on steps 2 and 4 before resuming its ' +
      "motion around the center point. Even when there is a step with no motion in<br>" +
      "between, we can still mark the reversal with an “<strong class=\"cR\">R</strong>” to indicate the prop reversal.",
  },
];
