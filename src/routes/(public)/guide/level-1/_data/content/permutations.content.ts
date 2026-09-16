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
import { mirroredPool, rotatedPool, swappedPool } from "../example-pools/pool-adapter";

// Verbatim prose lifted from _pages/LoopsPage.svelte (Austen's words - never
// AI-written); the pictograph construction below is a FAITHFUL COPY of that
// same file's LOOPS/handMotion/stepData/startBox authoring (same helpers, same
// locations/orientations/reversal flags → identical staff pictographs), minus
// the reader-only wiring (selection, overrides, click-to-animate, PARAS/RULES/
// HEADS sheet geometry).

const { NORTH: N, EAST: E, SOUTH: SO_, WEST: W } = GridLocation;
const { IN, OUT } = Orientation;
const CW = RotationDirection.CLOCKWISE;
const CCW = RotationDirection.COUNTER_CLOCKWISE;
const NOROT = RotationDirection.NO_ROTATION;

const HP_CW = new Set(["s-w", "w-n", "n-e", "e-s"]);
type HandStep = { t: "pro" | "anti" | "dash" | "static"; from: GridLocation; to: GridLocation; so: Orientation };
const handMotion = (color: HandSide, h: HandStep) => {
  const dir = HP_CW.has(`${h.from}-${h.to}`) ? CW : CCW;
  const type =
    h.t === "pro" ? MotionType.PRO : h.t === "anti" ? MotionType.ANTI : h.t === "dash" ? MotionType.DASH : MotionType.STATIC;
  const flips = h.t === "anti" || h.t === "dash";
  return createMotionData({
    motionType: type,
    rotationDirection: h.t === "pro" ? dir : h.t === "anti" ? (dir === CW ? CCW : CW) : NOROT,
    startLocation: h.from,
    endLocation: h.to,
    startOrientation: h.so,
    endOrientation: flips ? (h.so === IN ? OUT : IN) : h.so,
    turns: 0,
    hand: color,
    propType: PropType.STAFF,
    gridMode: GridMode.DIAMOND,
  });
};

type Step = { letter: Letter; name: string; left: HandStep; right: HandStep; bRev?: boolean; rRev?: boolean };
const hs = (t: HandStep["t"], from: GridLocation, to: GridLocation, so: Orientation = IN): HandStep => ({ t, from, to, so });

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
    // Mirrored: AABB + its horizontal-plane reflection (R R on step 5).
    key: "loop-mirror",
    word: "AABB Mirrored",
    startLetter: Letter.ALPHA,
    startLeft: W,
    startRight: E,
    steps: [
      { letter: Letter.A, name: "A", left: hs("pro", W, N), right: hs("pro", E, SO_) },
      { letter: Letter.A, name: "A", left: hs("pro", N, E), right: hs("pro", SO_, W) },
      { letter: Letter.B, name: "B", left: hs("anti", E, N), right: hs("anti", W, SO_) },
      { letter: Letter.B, name: "B", left: hs("anti", N, W, OUT), right: hs("anti", SO_, E, OUT) },
      { letter: Letter.A, name: "A", left: hs("pro", W, SO_), right: hs("pro", E, N), bRev: true, rRev: true },
      { letter: Letter.A, name: "A", left: hs("pro", SO_, E), right: hs("pro", N, W) },
      { letter: Letter.B, name: "B", left: hs("anti", E, SO_), right: hs("anti", W, N) },
      { letter: Letter.B, name: "B", left: hs("anti", SO_, W, OUT), right: hs("anti", N, E, OUT) },
    ],
  },
  {
    // Rotated: each DΨ repetition lands 90° around (S→W→N→E→S).
    key: "loop-rotate",
    word: "DΨDΨDΨDΨ Rotated",
    startLetter: Letter.BETA,
    startLeft: SO_,
    startRight: SO_,
    steps: [
      { letter: Letter.D, name: "D", left: hs("pro", SO_, W), right: hs("pro", SO_, E) },
      { letter: Letter.PSI, name: "Ψ", left: hs("static", W, W), right: hs("dash", E, W) },
      { letter: Letter.D, name: "D", left: hs("pro", W, N), right: hs("pro", W, SO_, OUT) },
      { letter: Letter.PSI, name: "Ψ", left: hs("static", N, N), right: hs("dash", SO_, N, OUT) },
      { letter: Letter.D, name: "D", left: hs("pro", N, E), right: hs("pro", N, W) },
      { letter: Letter.PSI, name: "Ψ", left: hs("static", E, E), right: hs("dash", W, E) },
      { letter: Letter.D, name: "D", left: hs("pro", E, SO_), right: hs("pro", E, N, OUT) },
      { letter: Letter.PSI, name: "Ψ", left: hs("static", SO_, SO_), right: hs("dash", N, SO_, OUT) },
    ],
  },
  {
    // Swapped: Δ-TQZ- twice, second repetition swaps right/left roles.
    key: "loop-swap",
    word: "Δ-TQZ- Swapped",
    startLetter: Letter.BETA,
    startLeft: SO_,
    startRight: SO_,
    steps: [
      { letter: Letter.DELTA_DASH, name: "Δ-", left: hs("dash", SO_, N), right: hs("anti", SO_, E) },
      { letter: Letter.T, name: "T", left: hs("anti", N, W, OUT), right: hs("anti", E, N, OUT) },
      { letter: Letter.Q, name: "Q", left: hs("anti", W, N), right: hs("anti", N, W), bRev: true },
      { letter: Letter.Z_DASH, name: "Z-", left: hs("dash", N, SO_, OUT), right: hs("anti", W, SO_, OUT) },
      { letter: Letter.DELTA_DASH, name: "Δ-", left: hs("anti", SO_, E), right: hs("dash", SO_, N), bRev: true },
      { letter: Letter.T, name: "T", left: hs("anti", E, N, OUT), right: hs("anti", N, W, OUT) },
      { letter: Letter.Q, name: "Q", left: hs("anti", N, W), right: hs("anti", W, N), rRev: true },
      { letter: Letter.Z_DASH, name: "Z-", left: hs("anti", W, SO_, OUT), right: hs("dash", N, SO_, OUT) },
    ],
  },
];

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

const stepData = (l: LoopDef, i: number): StepData => {
  const st = l.steps[i]!;
  return {
    id: `${l.key}-${i + 1}`,
    letter: st.letter,
    gridMode: GridMode.DIAMOND,
    startPlacement: getGridPlacementFromLocations(st.left.from, st.right.from),
    endPlacement: getGridPlacementFromLocations(st.left.to, st.right.to),
    stepNumber: i + 1,
    leftReversal: !!st.bRev,
    rightReversal: !!st.rRev,
    motions: {
      left: handMotion(HandSide.LEFT, st.left),
      right: handMotion(HandSide.RIGHT, st.right),
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

// Start + 8 steps per LOOP, reversal dots derived from the motions themselves
// (bakeReversals; never hand-authored for display) - matches _pages/LoopsPage
// .svelte's resolvedStrip (minus the admin-override seam).
const loopStrip = (l: LoopDef): PictographData[] => {
  const authored = [startBox(l), ...l.steps.map((_, i) => stepData(l, i))];
  return [authored[0], ...bakeReversals(authored.slice(1))] as unknown as PictographData[];
};

/** STAFF props with reversal dots - matching LoopsPage's PICTO_FLAGS. */
const RENDER = { propType: PropType.STAFF, showReversals: true } as const;

// Build each print example's strip ONCE - the card's `items` and the pool's
// entry 0 (the default, prerendered example) are the SAME strip.
const mirrorStrip = loopStrip(LOOPS[0]!);
const rotateStrip = loopStrip(LOOPS[1]!);
const swapStrip = loopStrip(LOOPS[2]!);

// The per-example ("In this example…") prose that used to sit in the flow now
// rides with entry 0 of each pool - it explains THIS specific instance, so it
// belongs to the example, not the section. The concept prose + heading stay in
// the flow, absorbed into the banner as before.
export const permutationsContent: GuideBlock[] = [
  { kind: "heading", level: 1, text: "LOOPs" },
  {
    kind: "prose",
    html:
      "When a word ends on a variation of its start position, we can repeat it to trace a<br>" +
      "complimentary pattern, eventually returning back to the start position (aka home).<br>" +
      "This type of sequence is called a <strong><em>LOOP</em></strong>.",
  },
  {
    kind: "prose",
    html: "Three common types of LOOPs are <em>Mirrored</em>, <em>Rotated</em>, and <em>Swapped</em>.",
  },
  { kind: "heading", level: 2, text: "Mirrored" },
  {
    kind: "prose",
    html: "In a mirrored LOOP, the second repetition’s pictographs reflect the first, which changes their rotation direction.",
  },
  {
    kind: "pictographGroup",
    items: mirrorStrip,
    flowCols: 3,
    card: true,
    render: RENDER,
    caption: LOOPS[0]!.word,
    pool: {
      entries: [
        {
          word: "AABB",
          loopLabel: "Mirrored",
          proseHtml: "In this example, each column is reflected across a horizontal plane.",
          items: mirrorStrip,
        },
        ...mirroredPool,
      ],
    },
  },
  { kind: "heading", level: 2, text: "Rotated" },
  {
    kind: "prose",
    html: "In a rotated LOOP, each repetition ends in a rotated variation on its previous position.",
  },
  {
    kind: "pictographGroup",
    items: rotateStrip,
    flowCols: 3,
    card: true,
    render: RENDER,
    caption: LOOPS[1]!.word,
    pool: {
      entries: [
        {
          word: "DΨ",
          loopLabel: "Rotated 90°",
          proseHtml: "In this example, there is a 90° rotation, finally returning to the start position (aka “home”).",
          items: rotateStrip,
        },
        ...rotatedPool,
      ],
    },
  },
  { kind: "heading", level: 2, text: "Swapped" },
  {
    kind: "prose",
    html: 'In a swapped LOOP, each repetition swaps the roles of <strong class="cR">right</strong>/<strong class="cB">left</strong>.',
  },
  {
    kind: "pictographGroup",
    items: swapStrip,
    flowCols: 3,
    card: true,
    render: RENDER,
    caption: LOOPS[2]!.word,
    pool: {
      entries: [
        {
          word: "Δ-TQZ-",
          loopLabel: "Swapped",
          proseHtml: "Though the prop’s shapes look the same, this swap changes the body motion significantly.",
          items: swapStrip,
        },
        ...swappedPool,
      ],
    },
  },
];
