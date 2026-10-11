import type { GuideBlock } from "../guide-content-blocks";
import {
  createMotionData,
  createPlaceholderMotion,
} from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  MotionType,
  HandSide,
  Orientation,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  GridMode,
  GridLocation,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";

const { NORTH: N, EAST: E, SOUTH: SO_, WEST: W } = GridLocation;

// Single-hand pictograph builder - copied verbatim from _pages/HandMotionsPage.svelte
// (left hand only; the renderer's hand-path mode floats the shifts into the
// canonical float arrows, dash gets the system dash arrow, static shows the
// resting hand).
const singleHand = (
  id: string,
  type: MotionType,
  from: GridLocation,
  to: GridLocation,
  stepNumber?: number
) => ({
  id: `hm-${id}`,
  letter: null,
  gridMode: GridMode.DIAMOND,
  ...(stepNumber === undefined ? {} : { stepNumber }),
  motions: {
    left: createMotionData({
      motionType: type,
      startLocation: from,
      endLocation: to,
      hand: HandSide.LEFT,
      propType: PropType.HAND,
      gridMode: GridMode.DIAMOND,
    }),
  },
});

// The five motion-demo boxes, in the source page's own order (HandMotionsPage.svelte
// `boxes` array) - sheet geometry (x/y) dropped, the box's word kept as its caption.
// "Start" and "Static" hold in place (from === to) - no travel, so they stay a
// single illustrative pictograph. "Shift" (both directions) and "Dash" are real
// hand-path motions, so each becomes a tiny playable Start+1 strip below.
const DEMOS = [
  { caption: "Start", data: singleHand("start", MotionType.STATIC, W, W) },
  { caption: "Static", data: singleHand("static", MotionType.STATIC, W, W) },
];

/**
 * A real hand-path demo (Shift/Dash): Start pose + the demo's own motion,
 * playable. The animation engine's both-required step contract needs a red
 * motion on every step even though this is a single-hand (blue-only) demo -
 * an invisible placeholder (createPlaceholderMotion) satisfies it without
 * rendering a second hand, same recipe negative-space.content.ts uses.
 */
const motionDemo = (
  id: string,
  type: MotionType,
  from: GridLocation,
  to: GridLocation,
  caption: string
) => {
  const withRedPlaceholder = (step: ReturnType<typeof singleHand>) => ({
    ...step,
    motions: {
      ...step.motions,
      right: createPlaceholderMotion(HandSide.RIGHT, {
        location: from,
        orientation: Orientation.IN,
      }),
    },
  });
  return {
    id,
    caption,
    items: [
      withRedPlaceholder(
        singleHand(`${id}-start`, MotionType.STATIC, from, from, 0)
      ),
      withRedPlaceholder(singleHand(`${id}-step`, type, from, to, 1)),
    ] as unknown as PictographData[],
  };
};
const MOTION_DEMOS = [
  motionDemo("hm-shift-cw", MotionType.PRO, W, N, "Shift"),
  motionDemo("hm-shift-ccw", MotionType.PRO, W, SO_, "Shift"),
  motionDemo("hm-dash", MotionType.DASH, W, E, "Dash"),
];

/** HAND props, TKA letter glyph off - matching HandMotionsPage's PICTO_FLAGS (showTKA={false}). */
const RENDER = { propType: PropType.HAND, showTKA: false } as const;

// Verbatim prose lifted from _pages/HandMotionsPage.svelte (Austen's words - never AI-written).
export const handMotionsContent: GuideBlock[] = [
  { kind: "heading", level: 1, text: "Hand Motions" },
  {
    kind: "prose",
    html:
      "There are three fundamental hand motions in the Alphabet.<br>" +
      "The arrow shows the direction of motion.<br>" +
      "The hand shows the end position.",
  },
  {
    kind: "pictograph" as const,
    data: DEMOS[0]!.data as unknown as PictographData,
    render: RENDER,
    caption: DEMOS[0]!.caption,
  },
  ...MOTION_DEMOS.map((d) => ({
    kind: "pictographGroup" as const,
    items: d.items,
    flowCols: 2,
    layout: "strip" as const,
    stepLabels: ["Start", "1"],
    card: true,
    render: RENDER,
    caption: d.caption,
  })),
  {
    kind: "pictograph" as const,
    data: DEMOS[1]!.data as unknown as PictographData,
    render: RENDER,
    caption: DEMOS[1]!.caption,
  },
  { kind: "prose", html: "Move to an<br>adjacent point" },
  { kind: "prose", html: "Move to the<br>opposite point" },
  { kind: "prose", html: "Stay at the<br>current point" },
  {
    kind: "prose",
    html:
      "Using these, we can derive six combinations, named below.<br>" +
      "We’ll explore each one individually:",
  },
  { kind: "heading", level: 2, text: "Dual-Shift" },
  { kind: "prose", html: "Both hands travel to an adjacent point." },
  { kind: "heading", level: 2, text: "Shift" },
  {
    kind: "prose",
    html: "One hand travels to an adjacent point<br>and the other hand remains static.",
  },
  { kind: "heading", level: 2, text: "Cross-Shift" },
  {
    kind: "prose",
    html: "One hand travels to an adjacent point and<br>the other travels to the opposite point.",
  },
  { kind: "heading", level: 2, text: "Dash" },
  {
    kind: "prose",
    html: "One hand travels to the opposite point<br>and the other hand remains static",
  },
  { kind: "heading", level: 2, text: "Dual-Dash" },
  { kind: "prose", html: "Both hands travel to the opposite point" },
  { kind: "heading", level: 2, text: "Static" },
  { kind: "prose", html: "Both hands remain static." },
];
