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

// Verbatim prose lifted from _pages/ExamplesPage.svelte (Austen's words -
// never AI-written); the pictograph construction below is a FAITHFUL COPY of
// that same file's SEQS/handMotion/stepData/startPose authoring (same
// locations/orientations/reversal flags → identical staff pictographs), minus
// the reader-only wiring (selection, overrides, click-to-animate, PARAS/RULES
// sheet geometry). Each sequence's Start pose is synthesized for display, same
// as the _page's RESOLVED[q.key].

const { NORTH: N, EAST: E, SOUTH: SO_, WEST: W } = GridLocation;
const { IN, OUT } = Orientation;
const CW = RotationDirection.CLOCKWISE;
const CCW = RotationDirection.COUNTER_CLOCKWISE;

const HP_CW = new Set(["s-w", "w-n", "n-e", "e-s"]);
const flip = (o: Orientation) => (o === IN ? OUT : IN);
type HandStep = { anti: boolean; from: GridLocation; to: GridLocation; so: Orientation };
const handMotion = (color: HandSide, h: HandStep) => {
  const dir = HP_CW.has(`${h.from}-${h.to}`) ? CW : CCW;
  return createMotionData({
    motionType: h.anti ? MotionType.ANTI : MotionType.PRO,
    rotationDirection: h.anti ? (dir === CW ? CCW : CW) : dir,
    startLocation: h.from,
    endLocation: h.to,
    startOrientation: h.so,
    endOrientation: h.anti ? flip(h.so) : h.so,
    turns: 0,
    hand: color,
    propType: PropType.STAFF,
    gridMode: GridMode.DIAMOND,
  });
};

type Step = { letter: Letter; left: HandStep; right: HandStep; rev?: boolean };
const st = (letter: Letter, bAnti: boolean, bf: GridLocation, bt: GridLocation, rf: GridLocation, rt: GridLocation, so: [Orientation, Orientation], rev = false): Step =>
  ({ letter, left: { anti: bAnti, from: bf, to: bt, so: so[0] }, right: { anti: bAnti, from: rf, to: rt, so: so[1] }, rev });

const A = Letter.A;
const B = Letter.B;
type SeqDef = { key: string; word: string; steps: Step[] };
const SEQS: SeqDef[] = [
  {
    // Prop-reversals after steps 2 and 4 (flags on 3 and, via loop wrap, 1).
    key: "ex-v1",
    word: "AABB (reversals after 2 & 4)",
    steps: [
      st(A, false, SO_, W, N, E, [IN, IN], true),
      st(A, false, W, N, E, SO_, [IN, IN]),
      st(B, true, N, E, SO_, W, [IN, IN], true),
      st(B, true, E, SO_, W, N, [OUT, OUT]),
    ],
  },
  {
    // Mirrored LOOP: reversals after steps 1 and 5 (flags on 2 and 6).
    key: "ex-v2",
    word: "AABB ×2 Mirrored LOOP",
    steps: [
      st(A, false, SO_, W, N, E, [IN, IN]),
      st(A, false, W, SO_, E, N, [IN, IN], true),
      st(B, true, SO_, W, N, E, [IN, IN]),
      st(B, true, W, N, E, SO_, [OUT, OUT]),
      st(A, false, N, W, SO_, E, [IN, IN]),
      st(A, false, W, N, E, SO_, [IN, IN], true),
      st(B, true, N, W, SO_, E, [IN, IN]),
      st(B, true, W, SO_, E, N, [OUT, OUT]),
    ],
  },
  {
    // Reversals after steps 3 and 7 (flags on 4 and 8).
    key: "ex-v3",
    word: "AABB ×2 (reversals after 3 & 7)",
    steps: [
      st(A, false, SO_, W, N, E, [IN, IN]),
      st(A, false, W, N, E, SO_, [IN, IN]),
      st(B, true, N, W, SO_, E, [IN, IN]),
      st(B, true, W, N, E, SO_, [OUT, OUT], true),
      st(A, false, N, W, SO_, E, [IN, IN]),
      st(A, false, W, SO_, E, N, [IN, IN]),
      st(B, true, SO_, W, N, E, [IN, IN]),
      st(B, true, W, SO_, E, N, [OUT, OUT], true),
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
    leftReversal: !!s.rev,
    rightReversal: !!s.rev,
    motions: {
      left: handMotion(HandSide.LEFT, s.left),
      right: handMotion(HandSide.RIGHT, s.right),
    },
  } as unknown as StepData;
};

// Playback-only Start pose (α, blue S / red N, thumbs in).
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
const startPose = (q: SeqDef): StepData =>
  ({
    id: `${q.key}-0`,
    letter: Letter.ALPHA,
    gridMode: GridMode.DIAMOND,
    stepNumber: 0,
    motions: { left: stat(HandSide.LEFT, SO_), right: stat(HandSide.RIGHT, N) },
  }) as unknown as StepData;

// Start + N steps per sequence, reversal dots derived from the motions
// themselves (bakeReversals; never hand-authored for display) - matches
// _pages/ExamplesPage.svelte's resolvedSeqSteps (minus the admin-override seam).
const seqStrip = (q: SeqDef): PictographData[] => {
  const authored = [startPose(q), ...q.steps.map((_, i) => stepData(q, i))];
  return [authored[0], ...bakeReversals(authored.slice(1))] as unknown as PictographData[];
};

/** STAFF props with reversal dots - matching ExamplesPage's PICTO_FLAGS. */
const RENDER = { propType: PropType.STAFF, showReversals: true } as const;

export const examplesAbcContent: GuideBlock[] = [
  { kind: "heading", level: 1, text: "Examples" },
  {
    kind: "prose",
    html:
      "Let’s practice reversals and permutations.<br>" +
      "We’ll use AABB as an example to explore different reversal placements.<br>" +
      "<strong>These start from the same alpha start position. Interpret it from the first motions.</strong>",
  },
  {
    kind: "prose",
    html:
      "Here’s an AABB in which both staves execute <strong>prop-reversals</strong> after steps 2 and 4, notated by an " +
      '“<strong class="cR">R</strong>/<strong class="cB">R</strong>” on the pictographs.',
  },
  {
    kind: "prose",
    html: "This requires negative space or a body turn to execute.",
  },
  {
    kind: "pictographGroup",
    items: seqStrip(SEQS[0]!),
    flowCols: 5,
    card: true,
    render: RENDER,
    caption: SEQS[0]!.word,
  },
  {
    kind: "prose",
    html: "Let’s place the reversals in a different place. This time we’ll put them after step 1.",
  },
  {
    kind: "prose",
    html:
      "This will put our left hand on top after step 4, so we’ll repeat the sequence again mirrored (with a " +
      "reversal after step 5) to return to our original home position.",
  },
  {
    kind: "prose",
    html: "This is a <em>Mirrored LOOP</em>.",
  },
  {
    kind: "pictographGroup",
    items: seqStrip(SEQS[1]!),
    flowCols: 4,
    card: true,
    render: RENDER,
    caption: SEQS[1]!.word,
  },
  {
    kind: "prose",
    html: "Now let’s look at another variation of AABB*2 with reversals after steps 3 & 7:",
  },
  {
    kind: "pictographGroup",
    items: seqStrip(SEQS[2]!),
    flowCols: 4,
    card: true,
    render: RENDER,
    caption: SEQS[2]!.word,
  },
  {
    kind: "prose",
    html:
      "As demonstrated with these examples, a reversal in different locations in the word can lead to a " +
      "notably different outcome.",
  },
  {
    kind: "prose",
    html:
      "The word AABB is not limited to one presentation, it is a broad category of sequences that includes " +
      "those letters with variations on reversals and thumb orientation.",
  },
];
