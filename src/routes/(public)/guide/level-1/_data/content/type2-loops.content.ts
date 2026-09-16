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
import {
  alphaGammaPool,
  betaGammaPool,
  gammaBetaPool,
} from "../example-pools/type2-loops-pools";

// Verbatim prose lifted from _pages/Type2LoopsPage.svelte (Austen's words - never AI-written);
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
const { B, U, O, T, H: HL, X, Y, Z } = Letter;
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
    // BΣTX ×2 - α↔γ; blue CCW (statics between), red CCW throughout.
    key: "t2l-bstx",
    word: "BΣTX Rotated",
    startLetter: Letter.ALPHA,
    startLeft: SO_,
    startRight: N,
    steps: [
      st(B, h(true, SO_, W), h(true, N, E)),
      st(SIG, sh(W, OUT), h(false, E, N, OUT)),
      st(T, h(true, W, N, OUT), h(true, N, E, OUT)),
      st(X, sh(N), h(true, E, SO_)),
      st(B, h(true, N, E), h(true, SO_, W, OUT)),
      st(SIG, sh(E, OUT), h(false, W, SO_)),
      st(T, h(true, E, SO_, OUT), h(true, SO_, W)),
      st(X, sh(SO_), h(true, W, N, OUT)),
    ],
  },
  {
    // EΔUZ ×2 - β↔γ; blue CCW, red CW.
    key: "t2l-eduz",
    word: "EΔUZ Rotated",
    startLetter: Letter.BETA,
    startLeft: SO_,
    startRight: SO_,
    steps: [
      st(EL, h(true, SO_, W), h(true, SO_, E)),
      st(DEL, sh(W, OUT), h(true, E, N, OUT)),
      st(U, h(true, W, N, OUT), h(false, N, E)),
      st(Z, sh(N), h(true, E, N)),
      st(EL, h(true, N, E), h(true, N, W, OUT)),
      st(DEL, sh(E, OUT), h(true, W, SO_)),
      st(U, h(true, E, SO_, OUT), h(false, SO_, W, OUT)),
      st(Z, sh(SO_), h(true, W, SO_, OUT)),
    ],
  },
  {
    // OYHΘ ×2 - γ↔β; both hands CCW throughout.
    key: "t2l-oyht",
    word: "OYHΘ Rotated",
    startLetter: Letter.GAMMA,
    startLeft: W,
    startRight: SO_,
    steps: [
      st(O, h(true, W, N), h(false, SO_, E)),
      st(Y, sh(N, OUT), h(false, E, N)),
      st(HL, h(true, N, E, OUT), h(true, N, E)),
      st(THE, sh(E), h(false, E, N, OUT)),
      st(O, h(true, E, SO_), h(false, N, W, OUT)),
      st(Y, sh(SO_, OUT), h(false, W, SO_, OUT)),
      st(HL, h(true, SO_, W, OUT), h(true, SO_, W, OUT)),
      st(THE, sh(W), h(false, W, SO_)),
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

// Each LOOP's full strip (start + 8 steps), reversal dots derived from the
// motions themselves via bakeReversals (never hand-authored) - matching
// Type2LoopsPage.svelte's PICTO_FLAGS.showReversals: true. Constant per-hand
// prop rotation (statics inert) means bakeReversals derives no flags here,
// matching the artboard.
const loopStrip = (l: LoopDef): PictographData[] => {
  const authored = [startBox(l), ...l.steps.map((_, i) => stepData(l, i))];
  return [authored[0], ...bakeReversals(authored.slice(1))] as unknown as PictographData[];
};

/** STAFF props with reversal dots - matching Type2LoopsPage's PICTO_FLAGS. */
const RENDER = { propType: PropType.STAFF, showReversals: true } as const;

// Build each print example's strip ONCE - the card's `items` and the pool's
// entry 0 (the default, prerendered example) are the SAME strip.
const bstxStrip = loopStrip(LOOPS[0]!);
const eduzStrip = loopStrip(LOOPS[1]!);
const oyhtStrip = loopStrip(LOOPS[2]!);

// No per-slot prose was ever authored for this trio - the shared prose above
// (the two flow blocks) covers all three and stays put. Entry-0 proseHtml
// below is a placeholder pending Austen's curation pass (rollout spec section
// 2c): a neutral factual sentence naming the word and its travel family, no
// motion/color/direction claims until verified against step data.
export const type2LoopsContent: GuideBlock[] = [
  { kind: "heading", level: 1, text: "Type 2 LOOPs" },
  { kind: "prose", html: "These words use the Type 2 letters to travel between α/β and γ." },
  { kind: "prose", html: "Since each repetition is rotated by 180°, these are all <em>Rotated LOOPs</em>." },
  {
    kind: "pictographGroup",
    items: bstxStrip,
    flowCols: 3,
    card: true,
    render: RENDER,
    caption: LOOPS[0]!.word,
    pool: {
      entries: [
        {
          word: "BΣTX",
          loopLabel: "Rotated",
          proseHtml: "BΣTX is the print example for this slot: a Rotated LOOP that travels between alpha and gamma.",
          items: bstxStrip,
        },
        ...alphaGammaPool,
      ],
    },
  },
  {
    kind: "pictographGroup",
    items: eduzStrip,
    flowCols: 3,
    card: true,
    render: RENDER,
    caption: LOOPS[1]!.word,
    pool: {
      entries: [
        {
          word: "EΔUZ",
          loopLabel: "Rotated",
          proseHtml: "EΔUZ is the print example for this slot: a Rotated LOOP that travels between beta and gamma.",
          items: eduzStrip,
        },
        ...betaGammaPool,
      ],
    },
  },
  {
    kind: "pictographGroup",
    items: oyhtStrip,
    flowCols: 3,
    card: true,
    render: RENDER,
    caption: LOOPS[2]!.word,
    pool: {
      entries: [
        {
          word: "OYHΘ",
          loopLabel: "Rotated",
          proseHtml: "OYHΘ is the print example for this slot: a Rotated LOOP that travels between gamma and beta.",
          items: oyhtStrip,
        },
        ...gammaBetaPool,
      ],
    },
  },
];
