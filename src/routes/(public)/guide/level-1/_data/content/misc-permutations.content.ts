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
  mirroredPool,
  rotatedSwappedPool,
  mirroredSwappedPool,
} from "../example-pools/misc-permutations-pools";

// Verbatim prose lifted from _pages/Type1LoopsPage.svelte (Austen's words - never AI-written);
// pictograph construction is a FAITHFUL COPY of that same file's step authoring (same
// helpers, same locations/orientations → identical staff pictographs), minus the
// reader-only wiring (selection, overrides, click-to-animate, sheet geometry).

const { NORTH: N, EAST: E, SOUTH: SO_, WEST: W } = GridLocation;
const { IN, OUT } = Orientation;
const CW = RotationDirection.CLOCKWISE;
const CCW = RotationDirection.COUNTER_CLOCKWISE;

const HP_CW = new Set(["s-w", "w-n", "n-e", "e-s"]);
const flip = (o: Orientation) => (o === IN ? OUT : IN);
type HandStep = { anti: boolean; from: GridLocation; to: GridLocation; so: Orientation };
const h = (anti: boolean, from: GridLocation, to: GridLocation, so: Orientation = IN): HandStep => ({ anti, from, to, so });
const handMotion = (color: HandSide, x: HandStep) => {
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
const stat = (color: HandSide, loc: GridLocation) =>
  createMotionData({
    motionType: MotionType.STATIC,
    startLocation: loc,
    endLocation: loc,
    startOrientation: IN,
    endOrientation: IN,
    hand: color,
    propType: PropType.STAFF,
    gridMode: GridMode.DIAMOND,
  });

type Step = { letter: Letter; left: HandStep; right: HandStep };
const st = (letter: Letter, left: HandStep, right: HandStep): Step => ({ letter, left, right });

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
    // DJII ×2 - Mirrored LOOP from β (both S).
    key: "t1l-djii",
    word: "DJII Mirrored",
    startLetter: Letter.BETA,
    startLeft: SO_,
    startRight: SO_,
    steps: [
      st(Letter.D, h(false, SO_, W), h(false, SO_, E)),
      st(Letter.J, h(false, W, N), h(false, E, N)),
      st(Letter.I, h(true, N, W), h(false, N, W)),
      st(Letter.I, h(true, W, SO_, OUT), h(false, W, SO_)),
      st(Letter.D, h(false, SO_, W), h(false, SO_, E)),
      st(Letter.J, h(false, W, N), h(false, E, N)),
      st(Letter.I, h(true, N, E), h(false, N, E)),
      st(Letter.I, h(true, E, SO_, OUT), h(false, E, SO_)),
    ],
  },
  {
    // BBLF ×2 - Swapped & Rotated LOOP from α (blue S / red N).
    key: "t1l-bblf",
    word: "BBLF Swapped & Rotated",
    startLetter: Letter.ALPHA,
    startLeft: SO_,
    startRight: N,
    steps: [
      st(Letter.B, h(true, SO_, W), h(true, N, E)),
      st(Letter.B, h(true, W, N, OUT), h(true, E, SO_, OUT)),
      st(Letter.L, h(true, N, E), h(false, SO_, E)),
      st(Letter.F, h(true, E, SO_, OUT), h(false, E, N)),
      st(Letter.B, h(true, SO_, W), h(true, N, E)),
      st(Letter.B, h(true, W, N, OUT), h(true, E, SO_, OUT)),
      st(Letter.L, h(false, N, W), h(true, SO_, W)),
      st(Letter.F, h(false, W, SO_), h(true, W, N, OUT)),
    ],
  },
  {
    // KIEC ×2 - Swapped & Mirrored LOOP from α (blue W / red E); the second
    // half swaps the colors' pro/anti roles (compare steps 4 and 8's C).
    key: "t1l-kiec",
    word: "KIEC Swapped & Mirrored",
    startLetter: Letter.ALPHA,
    startLeft: W,
    startRight: E,
    steps: [
      st(Letter.K, h(true, W, N), h(true, E, N)),
      st(Letter.I, h(false, N, W, OUT), h(true, N, W, OUT)),
      st(Letter.E, h(true, W, N, OUT), h(true, W, SO_)),
      st(Letter.C, h(false, N, W), h(true, SO_, E, OUT)),
      st(Letter.K, h(true, W, N), h(true, E, N)),
      st(Letter.I, h(true, N, E, OUT), h(false, N, E, OUT)),
      st(Letter.E, h(true, E, SO_), h(true, E, N, OUT)),
      st(Letter.C, h(true, SO_, W, OUT), h(false, N, E)),
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
      left: stat(HandSide.LEFT, l.startLeft),
      right: stat(HandSide.RIGHT, l.startRight),
    },
  }) as unknown as StepData;

// Each LOOP's full strip (start + 8 steps), reversal dots derived from the
// motions themselves via bakeReversals (never hand-authored) - matching
// Type1LoopsPage.svelte's PICTO_FLAGS.showReversals: true.
const loopStrip = (l: LoopDef): PictographData[] => {
  const authored = [startBox(l), ...l.steps.map((_, i) => stepData(l, i))];
  return [authored[0], ...bakeReversals(authored.slice(1))] as unknown as PictographData[];
};

/** STAFF props with reversal dots - matching Type1LoopsPage's PICTO_FLAGS. */
const RENDER = { propType: PropType.STAFF, showReversals: true } as const;

// Build each print example's strip ONCE - the card's `items` and the pool's
// entry 0 (the default, prerendered example) are the SAME strip.
const djiiStrip = loopStrip(LOOPS[0]!);
const bblfStrip = loopStrip(LOOPS[1]!);
const kiecStrip = loopStrip(LOOPS[2]!);

// The per-example ("In this example of…") prose that used to sit in the flow
// (DJII preceding its card, KIEC following its card) now rides with entry 0 of
// each pool - it explains THIS specific instance, so it belongs to the
// example, not the section. `proseHtml` renders as plain text (SequenceShowcase
// interpolates it directly, no `<br>`/`<em>`), so the wording moves verbatim
// but the markup is dropped.
export const miscPermutationsContent: GuideBlock[] = [
  { kind: "heading", level: 1, text: "Type 1 LOOPs" },
  {
    kind: "pictographGroup",
    items: djiiStrip,
    flowCols: 3,
    card: true,
    render: RENDER,
    caption: LOOPS[0]!.word,
    pool: {
      entries: [
        {
          word: "DJII",
          loopLabel: "Mirrored",
          proseHtml:
            "In this example of DJII, the graphs in the second repetition (steps 5-8) mirror the graphs in the first repetition (steps 1-4), classifying it as a Mirrored LOOP.",
          items: djiiStrip,
        },
        ...mirroredPool,
      ],
    },
  },
  { kind: "prose", html: "Swapped & Rotated LOOP" },
  {
    kind: "pictographGroup",
    items: bblfStrip,
    flowCols: 3,
    card: true,
    render: RENDER,
    caption: LOOPS[1]!.word,
    pool: {
      entries: [
        {
          word: "BBLF",
          loopLabel: "Swapped & Rotated",
          // Placeholder prose pending Austen's curation pass - no authored
          // per-slot prose exists for BBLF today (rollout spec section 2c);
          // no motion/color/direction claims until verified against step data.
          proseHtml: "BBLF is the print example for this slot: a Swapped & Rotated LOOP.",
          items: bblfStrip,
        },
        ...rotatedSwappedPool,
      ],
    },
  },
  {
    kind: "pictographGroup",
    items: kiecStrip,
    flowCols: 3,
    card: true,
    render: RENDER,
    caption: LOOPS[2]!.word,
    pool: {
      entries: [
        {
          word: "KIEC",
          loopLabel: "Swapped & Mirrored",
          proseHtml:
            "In this example of KIEC, the colors are swapped in the second half, so it is classified as a Swapped & Mirrored LOOP.",
          items: kiecStrip,
        },
        ...mirroredSwappedPool,
      ],
    },
  },
];
