/**
 * Single source for the Base Letters SEO doorway (manifest id "base-letters").
 * Prose is lifted VERBATIM from _pages/BaseLettersPage.svelte (Austen's words -
 * never AI-written); the pictograph construction is a FAITHFUL COPY of that same
 * file's letterStep() builder (same enums, locations, orientations → identical
 * staff pictographs), minus the reader-only wiring (selection, overrides,
 * click-to-animate strip). See the reflow spec + no-ghostwriting rule.
 */
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

const { NORTH: N, EAST: E, SOUTH: SO_, WEST: W } = GridLocation;
const { IN, OUT } = Orientation;
const CW = RotationDirection.CLOCKWISE;
const CCW = RotationDirection.COUNTER_CLOCKWISE;

// ── The six letters, straight from MCP pictograph data - copied from
// BaseLettersPage.svelte. Pro keeps the prop with the handpath (CW, in→in);
// anti counter-rotates (CCW, in→out). Hybrid = blue anti + red pro (proof:
// right pro, left anti).
type Hand = { type: MotionType; rot: RotationDirection; from: GridLocation; to: GridLocation; eo: Orientation };
type Cell = { letter: Letter; name: string; left: Hand; right: Hand };
const pro = (from: GridLocation, to: GridLocation): Hand => ({ type: MotionType.PRO, rot: CW, from, to, eo: IN });
const anti = (from: GridLocation, to: GridLocation): Hand => ({ type: MotionType.ANTI, rot: CCW, from, to, eo: OUT });

type Box = { key: string; cells: Cell[] };
const BOXES: Box[] = [
  // A/B/C - α→α Split-Same: blue s→w, red n→e.
  {
    key: "abc",
    cells: [
      { letter: Letter.A, name: "A", left: pro(SO_, W), right: pro(N, E) },
      { letter: Letter.B, name: "B", left: anti(SO_, W), right: anti(N, E) },
      { letter: Letter.C, name: "C", left: anti(SO_, W), right: pro(N, E) },
    ],
  },
  // G/H/I - β→β Tog-Same: both hands e→s.
  {
    key: "ghi",
    cells: [
      { letter: Letter.G, name: "G", left: pro(E, SO_), right: pro(E, SO_) },
      { letter: Letter.H, name: "H", left: anti(E, SO_), right: anti(E, SO_) },
      { letter: Letter.I, name: "I", left: anti(E, SO_), right: pro(E, SO_) },
    ],
  },
];

const hand = (color: HandSide, h: Hand) =>
  createMotionData({
    motionType: h.type,
    rotationDirection: h.rot,
    startLocation: h.from,
    endLocation: h.to,
    startOrientation: IN,
    endOrientation: h.eo,
    turns: 0,
    hand: color,
    propType: PropType.STAFF,
    gridMode: GridMode.DIAMOND,
  });

const letterStep = (c: Cell, stepNumber: number | null = null): StepData =>
  ({
    id: `bl-${c.name}${stepNumber === null ? "" : `-${stepNumber}`}`,
    letter: c.letter,
    gridMode: GridMode.DIAMOND,
    startPlacement: getGridPlacementFromLocations(c.left.from, c.right.from),
    endPlacement: getGridPlacementFromLocations(c.left.to, c.right.to),
    motions: {
      left: hand(HandSide.LEFT, c.left),
      right: hand(HandSide.RIGHT, c.right),
    },
    stepNumber,
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
  }) as unknown as StepData;

const boxGroup = (bx: Box): PictographData[] => bx.cells.map((c) => letterStep(c)) as unknown as PictographData[];

/** STAFF props, TKA letter glyph on - matching BaseLettersPage's PictographContainer flags. */
const RENDER = { propType: PropType.STAFF } as const;

export const baseLettersContent: GuideBlock[] = [
  { kind: "heading", level: 1, text: "Base Letters" },
  { kind: "heading", level: 2, text: "Type 1 - Dual-Shift" },
  {
    kind: "prose",
    html:
      "Just like positions, each motion pictograph can be rotated, reflected, or color swapped.<br>" +
      "Letters are organized on the page by end position, Alpha, Beta, then Gamma.<br>" +
      "Let’s look at each type individually.",
  },
  {
    kind: "prose",
    html: "First we’ll look at A, B, and C. Their handpath is <em>Split-Same</em> and they move from α→α:",
  },
  {
    kind: "pictographGroup",
    items: boxGroup(BOXES[0]!),
    flowCols: 3,
    render: RENDER,
    caption: "A · B · C: α→α Split-Same",
  },
  {
    kind: "prose",
    html:
      "Notice the pattern: <strong>Pro - Anti - Hybrid</strong><br>" +
      "This pattern helps you navigate/memorize the letters.",
  },
  {
    kind: "prose",
    html:
      "If you only remember that A has prospins, you can infer that B has antispins.<br>" +
      "If you only remember that B has antispins, you can infer that C is a hybrid.<br>" +
      "<strong><em>If you memorize only one letter in each group, you know all of them.</em></strong>",
  },
  {
    kind: "prose",
    html: "Next let’s look at G, H, and I. Their handpaths are <em>Tog-Same</em> and they move from β→β:",
  },
  {
    kind: "pictographGroup",
    items: boxGroup(BOXES[1]!),
    flowCols: 3,
    render: RENDER,
    caption: "G · H · I: β→β Tog-Same",
  },
  {
    kind: "prose",
    html: "In hybrids like C and I, either hand can execute a prospin or antispin.",
  },
  {
    kind: "prose",
    html:
      "Here, the <strong class=\"cR\">right</strong> is in pro and <strong class=\"cB\">left</strong> in anti, " +
      "but it’s equally valid to swap this.",
  },
];
