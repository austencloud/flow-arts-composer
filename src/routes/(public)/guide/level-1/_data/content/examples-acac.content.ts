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

// Verbatim prose lifted from _pages/MixedWordsPage.svelte (Austen's words -
// never AI-written); the pictograph construction below is a FAITHFUL COPY of
// that same file's SEQS/handMotion/stepData/startPose authoring (same
// locations/orientations → identical staff pictographs; reversal dots are
// DERIVED via bakeReversals, never hand-authored), minus the reader-only
// wiring (selection, overrides, click-to-animate, PARAS/RULES sheet geometry).

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
const { A, B, C } = Letter;

type SeqDef = { key: string; word: string; steps: Step[] };
const SEQS: SeqDef[] = [
  {
    // ACAC v1 - blue prop-reverses every step (R derives on 2, 3, 4).
    key: "mw-acac1",
    word: "ACAC (left-hand reversals)",
    steps: [
      st(A, h(false, SO_, W), h(false, N, E)),
      st(C, h(true, W, N), h(false, E, SO_)),
      st(A, h(false, N, E, OUT), h(false, SO_, W)),
      st(C, h(true, E, SO_, OUT), h(false, W, N)),
    ],
  },
  {
    // ACAC v2 - reversals alternate left/right (blue R on 2 and 4, red R on
    // 3); blue's handpath also flips at step 3 (hand reversal, no dot).
    key: "mw-acac2",
    word: "ACAC (alternating reversals)",
    steps: [
      st(A, h(false, SO_, W), h(false, N, E)),
      st(C, h(true, W, N), h(false, E, SO_)),
      st(A, h(false, N, W, OUT), h(false, SO_, E)),
      st(C, h(true, W, SO_, OUT), h(false, E, N)),
    ],
  },
  {
    // BCBC - red prop-reverses every step (R derives on 2, 3, 4).
    key: "mw-bcbc",
    word: "BCBC (right-hand reversals)",
    steps: [
      st(B, h(true, SO_, W), h(true, N, E)),
      st(C, h(true, W, N, OUT), h(false, E, SO_, OUT)),
      st(B, h(true, N, E), h(true, SO_, W, OUT)),
      st(C, h(true, E, SO_, OUT), h(false, W, N)),
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

// Playback-only Start pose (α, blue S / red N, thumbs in).
const startPose = (q: SeqDef): StepData =>
  ({
    id: `${q.key}-0`,
    letter: Letter.ALPHA,
    gridMode: GridMode.DIAMOND,
    stepNumber: 0,
    motions: { left: stat(HandSide.LEFT, SO_), right: stat(HandSide.RIGHT, N) },
  }) as unknown as StepData;

// Start + 4 steps per sequence, reversal dots derived from the motions
// themselves (bakeReversals; never hand-authored) - matches _pages/
// MixedWordsPage.svelte's resolvedSeqSteps (minus the admin-override seam).
const seqStrip = (q: SeqDef): PictographData[] => {
  const authored = [startPose(q), ...q.steps.map((_, i) => stepData(q, i))];
  return [authored[0], ...bakeReversals(authored.slice(1))] as unknown as PictographData[];
};

/** STAFF props with reversal dots - matching MixedWordsPage's PICTO_FLAGS. */
const RENDER = { propType: PropType.STAFF, showReversals: true } as const;

export const examplesAcacContent: GuideBlock[] = [
  { kind: "heading", level: 1, text: "Mixed Words: ACAC and BCBC" },
  {
    kind: "prose",
    html:
      "When combining a hybrid like C with a non-hybrid like A or B, a prop-reversal is necessary.<br>" +
      "Let’s look at the word ACAC.",
  },
  {
    kind: "prose",
    html: "In this variation, the left hand does a reversal on every step. Give it a try:",
  },
  {
    kind: "pictographGroup",
    items: seqStrip(SEQS[0]!),
    flowCols: 5,
    layout: "strip",
    stepLabels: ["Start", "1", "2", "3", "4"],
    card: true,
    render: RENDER,
    caption: SEQS[0]!.word,
  },
  {
    kind: "prose",
    html: "It would be impossible to execute ACAC without using a prop-reversal.",
  },
  {
    kind: "prose",
    html:
      "The previous example shows the hands moving in a <em>continuous</em> path.<br>" +
      "Let’s change that in the next example by including a full-reversal in the middle.<br>" +
      'In this example, the reversals alternate between left (<strong class="cB">R</strong>) and right (<strong class="cR">R</strong>).',
  },
  {
    kind: "prose",
    html:
      "This example uses every type of reversal - <em>hand</em>, <em>prop</em>, and <em>full</em>.<br>" +
      "Challenge yourself to identify where each one occurs.",
  },
  {
    kind: "pictographGroup",
    items: seqStrip(SEQS[1]!),
    flowCols: 5,
    layout: "strip",
    stepLabels: ["Start", "1", "2", "3", "4"],
    card: true,
    render: RENDER,
    caption: SEQS[1]!.word,
  },
  {
    kind: "prose",
    html: "Prop-reversals are also required with BCBC, as shown in this example:",
  },
  {
    kind: "pictographGroup",
    items: seqStrip(SEQS[2]!),
    flowCols: 5,
    layout: "strip",
    stepLabels: ["Start", "1", "2", "3", "4"],
    card: true,
    render: RENDER,
    caption: SEQS[2]!.word,
  },
  {
    kind: "prose",
    html:
      'Here, the <strong class="cR">right</strong> hand is prop-reversing after every step. Eventually, it returns to home.',
  },
];
