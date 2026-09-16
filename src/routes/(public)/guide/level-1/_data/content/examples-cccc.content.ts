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

// Verbatim prose lifted from _pages/HybridReversalsPage.svelte (Austen's
// words - never AI-written); the pictograph construction below is a FAITHFUL
// COPY of that same file's SEQS/handMotion/stepData/startPose authoring (same
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

type SeqDef = { key: string; word: string; label?: string; steps: Step[] };
const SEQS: SeqDef[] = [
  {
    // AABB ×2, reversals after the second B (step 4) - R/R derives on step 5.
    key: "hr-aabb",
    word: "AABB ×2 (reversals after the second B)",
    steps: [
      st(A, h(false, SO_, W), h(false, N, E)),
      st(A, h(false, W, N), h(false, E, SO_)),
      st(B, h(true, N, W), h(true, SO_, E)),
      st(B, h(true, W, SO_, OUT), h(true, E, N, OUT)),
      st(A, h(false, SO_, E), h(false, N, W)),
      st(A, h(false, E, N), h(false, W, SO_)),
      st(B, h(true, N, E), h(true, SO_, W)),
      st(B, h(true, E, SO_, OUT), h(true, W, N, OUT)),
    ],
  },
  {
    // CCCC hand-reversal: handpath flips per step, prop rotation continues -
    // the pro/anti roles trade each step; NO prop-reversal flags derive.
    key: "hr-hand",
    word: "CCCC Hand-reversal",
    label: "Hand-reversal",
    steps: [
      st(C, h(true, SO_, W), h(false, N, E)),
      st(C, h(false, W, SO_, OUT), h(true, E, N)),
      st(C, h(true, SO_, W, OUT), h(false, N, E, OUT)),
      st(C, h(false, W, SO_), h(true, E, N, OUT)),
    ],
  },
  {
    // CCCC prop-reversal: handpath continues CW, prop rotation flips each
    // step - R/R derives on 2, 3, 4.
    key: "hr-prop",
    word: "CCCC Prop-reversal",
    label: "Prop-reversal",
    steps: [
      st(C, h(true, SO_, W), h(false, N, E)),
      st(C, h(false, W, N, OUT), h(true, E, SO_)),
      st(C, h(true, N, E, OUT), h(false, SO_, W, OUT)),
      st(C, h(false, E, SO_), h(true, W, N, OUT)),
    ],
  },
  {
    // CCCC full-reversal: handpath AND prop flip together - each hand keeps
    // its pro/anti role while retracing; R/R derives on 2, 3, 4.
    key: "hr-full",
    word: "CCCC Full-reversal",
    label: "Full-reversal",
    steps: [
      st(C, h(true, SO_, W), h(false, N, E)),
      st(C, h(true, W, SO_, OUT), h(false, E, N)),
      st(C, h(true, SO_, W), h(false, N, E)),
      st(C, h(true, W, SO_, OUT), h(false, E, N)),
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

// Start + N steps per sequence, reversal dots derived from the motions
// themselves (bakeReversals; never hand-authored) - matches _pages/
// HybridReversalsPage.svelte's resolvedSeqSteps (minus the admin-override seam).
const seqStrip = (q: SeqDef): PictographData[] => {
  const authored = [startPose(q), ...q.steps.map((_, i) => stepData(q, i))];
  return [authored[0], ...bakeReversals(authored.slice(1))] as unknown as PictographData[];
};

const byKey = (key: string) => SEQS.find((q) => q.key === key)!;

/** STAFF props with reversal dots - matching HybridReversalsPage's PICTO_FLAGS. */
const RENDER = { propType: PropType.STAFF, showReversals: true } as const;

export const examplesCcccContent: GuideBlock[] = [
  { kind: "heading", level: 1, text: "Hybrid Reversals: CCCC" },
  {
    kind: "prose",
    html: "Let’s add reversals after the second B.",
  },
  {
    kind: "pictographGroup",
    items: seqStrip(byKey("hr-aabb")),
    flowCols: 4,
    card: true,
    render: RENDER,
    caption: byKey("hr-aabb").word,
  },
  {
    kind: "prose",
    html:
      "Take note - step 5 has the right hand coming down on the left side of the grid, so it’s " +
      "impossible to follow through to step 6 while remaining square with the audience in wall " +
      "plane. We must <em>body turn</em> on step 5. If turning left, we can bring the left staff into the " +
      "plane behind us as it comes up, moving our relative position into wheel plane.",
  },
  {
    kind: "prose",
    html:
      "This sequence is a good example of how body turns can serve both as a method of " +
      "motion execution and a body movement that can add energy and contrast.",
  },
  {
    kind: "prose",
    html:
      "Now let’s observe how reversals affect pro/anti hybrid words like CCCC.<br>" +
      "They present more variations than non-hybrids:",
  },
  { kind: "heading", level: 2, text: "Hand-reversal" },
  {
    kind: "pictographGroup",
    items: seqStrip(byKey("hr-hand")),
    flowCols: 5,
    layout: "strip",
    stepLabels: ["Start", "1", "2", "3", "4"],
    card: true,
    render: RENDER,
    caption: byKey("hr-hand").word,
  },
  { kind: "heading", level: 2, text: "Prop-reversal" },
  {
    kind: "pictographGroup",
    items: seqStrip(byKey("hr-prop")),
    flowCols: 5,
    layout: "strip",
    stepLabels: ["Start", "1", "2", "3", "4"],
    card: true,
    render: RENDER,
    caption: byKey("hr-prop").word,
  },
  { kind: "heading", level: 2, text: "Full-reversal" },
  {
    kind: "pictographGroup",
    items: seqStrip(byKey("hr-full")),
    flowCols: 5,
    layout: "strip",
    stepLabels: ["Start", "1", "2", "3", "4"],
    card: true,
    render: RENDER,
    caption: byKey("hr-full").word,
  },
];
