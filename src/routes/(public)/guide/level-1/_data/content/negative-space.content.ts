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
import { GridMode, GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";

const { NORTH: N, EAST: E, SOUTH: SO_, WEST: W } = GridLocation;
const { IN, OUT } = Orientation;
const CCW = RotationDirection.COUNTER_CLOCKWISE;
const CW = RotationDirection.CLOCKWISE;
const NOROT = RotationDirection.NO_ROTATION;

// Two real single-staff sequences (red hand; blue is an invisible placeholder -
// the both-hands step contract) - copied verbatim from _pages/NegativeSpacePage.svelte.
type Cell = {
  step: number;
  type: MotionType;
  from: GridLocation;
  to: GridLocation;
  so: Orientation;
  eo: Orientation;
  rot: RotationDirection;
};
const cellData = (stripId: string, c: Cell) => ({
  id: `ns-${stripId}-${c.step}`,
  letter: null,
  gridMode: GridMode.DIAMOND,
  stepNumber: c.step,
  motions: {
    left: createPlaceholderMotion(HandSide.LEFT, { location: SO_, orientation: IN }),
    right: createMotionData({
      motionType: c.type,
      rotationDirection: c.rot,
      startLocation: c.from,
      endLocation: c.to,
      startOrientation: c.so,
      endOrientation: c.eo,
      turns: 0,
      hand: HandSide.RIGHT,
      propType: PropType.STAFF,
      gridMode: GridMode.DIAMOND,
    }),
  },
});

type Strip = { id: string; word: string; cells: Cell[] };
const STRIPS: Strip[] = [
  {
    // 360° Isolation - pro all the way around, thumb in throughout.
    id: "iso",
    word: "360° Isolation",
    cells: [
      { step: 0, type: MotionType.STATIC, from: SO_, to: SO_, so: IN, eo: IN, rot: NOROT },
      { step: 1, type: MotionType.PRO, from: SO_, to: E, so: IN, eo: IN, rot: CCW },
      { step: 2, type: MotionType.PRO, from: E, to: N, so: IN, eo: IN, rot: CCW },
      { step: 3, type: MotionType.PRO, from: N, to: W, so: IN, eo: IN, rot: CCW },
      { step: 4, type: MotionType.PRO, from: W, to: SO_, so: IN, eo: IN, rot: CCW },
    ],
  },
  {
    // 4-Petal Antispin - same handpath, prop counter-rotates (CW), thumb alternates.
    id: "anti",
    word: "4-Petal Antispin",
    cells: [
      { step: 0, type: MotionType.STATIC, from: SO_, to: SO_, so: IN, eo: IN, rot: NOROT },
      { step: 1, type: MotionType.ANTI, from: SO_, to: E, so: IN, eo: OUT, rot: CW },
      { step: 2, type: MotionType.ANTI, from: E, to: N, so: OUT, eo: IN, rot: CW },
      { step: 3, type: MotionType.ANTI, from: N, to: W, so: IN, eo: OUT, rot: CW },
      { step: 4, type: MotionType.ANTI, from: W, to: SO_, so: OUT, eo: IN, rot: CW },
    ],
  },
];

const stripItems = (s: Strip): PictographData[] =>
  s.cells.map((c) => cellData(s.id, c)) as unknown as PictographData[];

/** STAFF props, TKA letter glyph off - matching NegativeSpacePage's PICTO_FLAGS (showTKA={false}). */
const RENDER = { propType: PropType.STAFF, showTKA: false } as const;

// Verbatim prose lifted from _pages/NegativeSpacePage.svelte (Austen's words - never AI-written).
export const negativeSpaceContent: GuideBlock[] = [
  { kind: "heading", level: 1, text: "Negative Space and Body Turns" },
  {
    kind: "prose",
    html:
      "Many sequences seem impossible, but most can be solved by using negative space or body turns.<br>" +
      "<strong><em>Negative space</em></strong> lets you face the audience and reduces body movement<br>" +
      "<strong><em>Body turns</em></strong> add movement and help you execute patterns with longer staves.<br>" +
      "Each method is equally important, and learning both will maximize capability.<br>" +
      "This guide will assume some knowledge of these fundamental concepts.",
  },
  { kind: "prose", html: "To make the most of the Alphabet, it’s highly recommended that you learn the following." },

  { kind: "heading", level: 2, text: "360° Isolation" },
  {
    kind: "pictographGroup",
    items: stripItems(STRIPS[0]!),
    flowCols: 5,
    layout: "strip",
    stepLabels: ["Start", "1", "2", "3", "4"],
    card: true,
    render: RENDER,
    caption: "Start + steps 1–4",
  },
  {
    kind: "prose",
    html:
      "To execute this without finger-spinning, turn your torso to the left on step 3. During this " +
      "step, the staff moves briefly in wheel-plane relative to your left-facing view. On step 4, turn your " +
      "body back to center as you return to the start position.",
  },
  {
    kind: "prose",
    html:
      "Practice in reverse, then do both directions in the other hand.<br>Then practice it with the thumb out, isolating the pinky end.",
  },

  { kind: "heading", level: 2, text: "4-Petal Antispin" },
  {
    kind: "pictographGroup",
    items: stripItems(STRIPS[1]!),
    flowCols: 5,
    layout: "strip",
    stepLabels: ["Start", "1", "2", "3", "4"],
    card: true,
    render: RENDER,
    caption: "Start + steps 1–4",
  },
  { kind: "prose", html: "To execute this in wall plane, you must do one of the following on step 2:" },
  {
    kind: "prose",
    html:
      "• Pass the thumb end through the negative space above your right shoulder on step 2.<br>" +
      "• Turn your torso to the left on step 2 and pass the thumb end in front, then pass the pinky end on " +
      "the inside of your right arm as you move to step 3.",
  },
  {
    kind: "prose",
    html:
      "Practice in reverse, then do both directions in the other hand.<br>" +
      "Then practice everything again starting with the thumb out.<br>" +
      "Try using both negative space and turns. Good luck!",
  },
];
