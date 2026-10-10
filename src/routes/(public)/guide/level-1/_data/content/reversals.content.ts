import type { GuideBlock } from "../guide-content-blocks";
import {
  createMotionData,
  createPlaceholderMotion,
} from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  MotionType,
  HandSide,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  GridMode,
  GridLocation,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import { bakeReversals } from "../guide-sequence-adapter";

// Verbatim prose lifted from _pages/ReversalsPage.svelte (Austen's words -
// never AI-written); the pictograph construction below is a FAITHFUL COPY of
// that same file's STRIPS/motionOf/stepData/startBox authoring (single-staff
// strips, other hand an invisible placeholder - same locations/orientations/
// reversal flags → identical staff pictographs), minus the reader-only wiring
// (selection, overrides, click-to-animate, PARAS/RULES/HEADS sheet geometry).

const { NORTH: N, EAST: E, SOUTH: SO_, WEST: W } = GridLocation;
const { IN, OUT } = Orientation;
const CW = RotationDirection.CLOCKWISE;
const CCW = RotationDirection.COUNTER_CLOCKWISE;
const NOROT = RotationDirection.NO_ROTATION;

// ── Single-staff step authoring (other hand = invisible placeholder) ───────
type M = {
  t: "pro" | "anti" | "static";
  from: GridLocation;
  to: GridLocation;
  rot: RotationDirection;
  so: Orientation;
  eo: Orientation;
};
const m = (
  t: M["t"],
  from: GridLocation,
  to: GridLocation,
  rot: RotationDirection,
  so: Orientation,
  eo: Orientation
): M => ({ t, from, to, rot, so, eo });

const motionOf = (hand: HandSide, x: M) =>
  createMotionData({
    motionType:
      x.t === "pro"
        ? MotionType.PRO
        : x.t === "anti"
          ? MotionType.ANTI
          : MotionType.STATIC,
    rotationDirection: x.t === "static" ? NOROT : x.rot,
    startLocation: x.from,
    endLocation: x.to,
    startOrientation: x.so,
    endOrientation: x.eo,
    turns: 0,
    hand,
    propType: PropType.STAFF,
    gridMode: GridMode.DIAMOND,
  });

type StripDef = {
  key: string;
  label: string;
  hand: HandSide;
  steps: M[];
  revStep?: number;
};
const STRIPS: StripDef[] = [
  // Hand-reversal: prop keeps its spin, hand comes back. No R.
  {
    key: "rev-hand-pro",
    label: "Pro→Anti",
    hand: HandSide.RIGHT,
    steps: [m("pro", N, E, CW, IN, IN), m("anti", E, N, CW, IN, OUT)],
  },
  {
    key: "rev-hand-anti",
    label: "Anti→Pro",
    hand: HandSide.LEFT,
    steps: [m("anti", N, W, CW, IN, OUT), m("pro", W, N, CW, OUT, OUT)],
  },
  // Prop-reversal: hand continues, prop flips. R on step 2.
  {
    key: "rev-prop-pro",
    label: "Pro→Anti",
    hand: HandSide.RIGHT,
    revStep: 2,
    steps: [m("pro", N, E, CW, IN, IN), m("anti", E, SO_, CCW, IN, OUT)],
  },
  {
    key: "rev-prop-anti",
    label: "Anti→Pro",
    hand: HandSide.LEFT,
    revStep: 2,
    steps: [m("anti", N, W, CW, IN, OUT), m("pro", W, SO_, CCW, OUT, OUT)],
  },
  // Full-reversal: prop and hand retrace. R on step 2.
  {
    key: "rev-full-pro",
    label: "Pro→Pro",
    hand: HandSide.RIGHT,
    revStep: 2,
    steps: [m("pro", N, E, CW, IN, IN), m("pro", E, N, CCW, IN, IN)],
  },
  {
    key: "rev-full-anti",
    label: "Anti→Anti",
    hand: HandSide.LEFT,
    revStep: 2,
    steps: [m("anti", N, W, CW, IN, OUT), m("anti", W, N, CCW, OUT, IN)],
  },
];

const stepData = (s: StripDef, i: number): StepData => {
  const isRight = s.hand === HandSide.RIGHT;
  const live = motionOf(s.hand, s.steps[i]!);
  const ghost = createPlaceholderMotion(
    isRight ? HandSide.LEFT : HandSide.RIGHT,
    { location: SO_, orientation: IN }
  );
  return {
    id: `${s.key}-${i + 1}`,
    letter: null,
    gridMode: GridMode.DIAMOND,
    stepNumber: i + 1,
    leftReversal: !isRight && s.revStep === i + 1,
    rightReversal: isRight && s.revStep === i + 1,
    motions: { left: isRight ? ghost : live, right: isRight ? live : ghost },
  } as unknown as StepData;
};

const startBox = (s: StripDef): StepData => {
  const isRight = s.hand === HandSide.RIGHT;
  const live = motionOf(s.hand, m("static", N, N, NOROT, IN, IN));
  const ghost = createPlaceholderMotion(
    isRight ? HandSide.LEFT : HandSide.RIGHT,
    { location: SO_, orientation: IN }
  );
  return {
    id: `${s.key}-0`,
    letter: null,
    gridMode: GridMode.DIAMOND,
    stepNumber: 0,
    motions: { left: isRight ? ghost : live, right: isRight ? live : ghost },
  } as unknown as StepData;
};

// Start + 2 steps per strip, reversal dots derived from the motions themselves
// (bakeReversals; never hand-authored for display) - matches _pages/
// ReversalsPage.svelte's resolvedStripSteps (minus the admin-override seam).
const stripSteps = (s: StripDef): PictographData[] => {
  const authored = [startBox(s), stepData(s, 0), stepData(s, 1)];
  return [
    authored[0],
    ...bakeReversals(authored.slice(1)),
  ] as unknown as PictographData[];
};

const byKey = (key: string) => STRIPS.find((s) => s.key === key)!;
const captionFor = (s: StripDef) => `${s.label} (${s.hand})`;

/** STAFF props with reversal dots, TKA glyph off - matching ReversalsPage's PICTO_FLAGS. */
const RENDER = {
  propType: PropType.STAFF,
  showTKA: false,
  showReversals: true,
} as const;

export const reversalsContent: GuideBlock[] = [
  { kind: "heading", level: 1, text: "Reversals" },
  {
    kind: "prose",
    html: "Reversals open up a huge number of possibilities!<br>There are three types of reversals:",
  },
  { kind: "heading", level: 2, text: "Hand-reversal" },
  {
    kind: "prose",
    html:
      "With a hand reversal, the hand returns to the point it came from previously, without changing the " +
      "prop’s direction of spin. Relative to the center point, this changes a prospin to an antispin and vice-versa.",
  },
  {
    kind: "prose",
    html: "This is the simplest and least disruptive reversal. We’ve already used it in the previous examples.",
  },
  {
    kind: "pictographGroup",
    items: stripSteps(byKey("rev-hand-pro")),
    flowCols: 3,
    layout: "strip",
    stepLabels: ["Start", "1", "2"],
    render: RENDER,
    caption: captionFor(byKey("rev-hand-pro")),
  },
  {
    kind: "pictographGroup",
    items: stripSteps(byKey("rev-hand-anti")),
    flowCols: 3,
    layout: "strip",
    stepLabels: ["Start", "1", "2"],
    render: RENDER,
    caption: captionFor(byKey("rev-hand-anti")),
  },
  { kind: "heading", level: 2, text: "Prop-reversal" },
  {
    kind: "prose",
    html:
      "With a prop reversal, the hand continues to the next point while the prop reverses direction. " +
      "This reversal also changes a prospin into an antispin and vice-versa.",
  },
  {
    kind: "prose",
    html:
      'Since a prop reversal is less intuitive, an “<strong class="cR">R</strong>/<strong class="cB">R</strong>” is shown in the ' +
      "corresponding color on the pictograph to indicate it.",
  },
  {
    kind: "pictographGroup",
    items: stripSteps(byKey("rev-prop-pro")),
    flowCols: 3,
    layout: "strip",
    stepLabels: ["Start", "1", "2"],
    render: RENDER,
    caption: captionFor(byKey("rev-prop-pro")),
  },
  {
    kind: "pictographGroup",
    items: stripSteps(byKey("rev-prop-anti")),
    flowCols: 3,
    layout: "strip",
    stepLabels: ["Start", "1", "2"],
    render: RENDER,
    caption: captionFor(byKey("rev-prop-anti")),
  },
  { kind: "heading", level: 2, text: "Full-reversal" },
  {
    kind: "prose",
    html:
      "With a full-reversal, the prop and hand retrace their paths and return to their previous position, " +
      "as if going backwards in time.",
  },
  {
    kind: "prose",
    html:
      'Because this contains a prop reversal, the “<strong class="cR">R</strong>/<strong class="cB">R</strong>” draws attention to it. ' +
      "This succinctly indicates to the performer that something unusual is happening.",
  },
  {
    kind: "pictographGroup",
    items: stripSteps(byKey("rev-full-pro")),
    flowCols: 3,
    layout: "strip",
    stepLabels: ["Start", "1", "2"],
    render: RENDER,
    caption: captionFor(byKey("rev-full-pro")),
  },
  {
    kind: "pictographGroup",
    items: stripSteps(byKey("rev-full-anti")),
    flowCols: 3,
    layout: "strip",
    stepLabels: ["Start", "1", "2"],
    render: RENDER,
    caption: captionFor(byKey("rev-full-anti")),
  },
];
