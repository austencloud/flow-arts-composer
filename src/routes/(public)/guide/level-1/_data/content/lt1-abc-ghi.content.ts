/**
 * Single source for the Alpha and Beta Words SEO doorway (manifest id
 * "lt1-abc-ghi"). Prose is lifted VERBATIM from _pages/AlphaBetaWordsPage.svelte
 * (Austen's words - never AI-written); the pictograph construction is a
 * FAITHFUL COPY of that same file's word-strip derivation (same enums,
 * locations, orientations, rotation directions → identical staff pictographs),
 * minus the reader-only wiring (selection, overrides, click-to-animate, shared
 * Start-box ringing). AlphaBetaWordsPage sets showReversals={false} on its
 * PictographContainer, so no bakeReversals/showReversals here either. See the
 * reflow spec + no-ghostwriting rule.
 */
import type { GuideBlock } from "../guide-content-blocks";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  MotionType,
  HandSide,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  GridMode,
  GridLocation,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

const { NORTH: N, EAST: E, SOUTH: SO_, WEST: W } = GridLocation;
const { IN, OUT } = Orientation;
const CW = RotationDirection.CLOCKWISE;
const CCW = RotationDirection.COUNTER_CLOCKWISE;

// ── Motion authoring - copied from AlphaBetaWordsPage.svelte. Pro rides the
// CW handpath (prop CW, in→in); anti counter-rotates (prop CCW) and flips the
// thumb every letter, so its legs alternate in→out / out→in.
type Leg = [GridLocation, GridLocation];
const proHand = (color: HandSide, [from, to]: Leg) =>
  createMotionData({
    motionType: MotionType.PRO,
    rotationDirection: CW,
    startLocation: from,
    endLocation: to,
    startOrientation: IN,
    endOrientation: IN,
    turns: 0,
    hand: color,
    propType: PropType.STAFF,
    gridMode: GridMode.DIAMOND,
  });
const antiHand = (color: HandSide, [from, to]: Leg, legIndex: number) =>
  createMotionData({
    motionType: MotionType.ANTI,
    rotationDirection: CCW,
    startLocation: from,
    endLocation: to,
    startOrientation: legIndex % 2 === 0 ? IN : OUT,
    endOrientation: legIndex % 2 === 0 ? OUT : IN,
    turns: 0,
    hand: color,
    propType: PropType.STAFF,
    gridMode: GridMode.DIAMOND,
  });
const staticHand = (color: HandSide, loc: GridLocation) =>
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

// The CW quarter-loop both blocks ride: s→w→n→e→s.
const CW_LOOP: Leg[] = [
  [SO_, W],
  [W, N],
  [N, E],
  [E, SO_],
];
// The α block's right hand runs the same loop two legs ahead (n→e→s→w→n).
const CW_LOOP_RED: Leg[] = [
  [N, E],
  [E, SO_],
  [SO_, W],
  [W, N],
];

type WordDef = {
  key: string;
  word: string;
  letter: Letter;
  block: "alpha" | "beta";
  leftAnti: boolean;
  rightAnti: boolean;
};
const WORDS: WordDef[] = [
  {
    key: "w-aaaa",
    word: "AAAA",
    letter: Letter.A,
    block: "alpha",
    leftAnti: false,
    rightAnti: false,
  },
  {
    key: "w-bbbb",
    word: "BBBB",
    letter: Letter.B,
    block: "alpha",
    leftAnti: true,
    rightAnti: true,
  },
  {
    key: "w-cccc",
    word: "CCCC",
    letter: Letter.C,
    block: "alpha",
    leftAnti: true,
    rightAnti: false,
  },
  {
    key: "w-gggg",
    word: "GGGG",
    letter: Letter.G,
    block: "beta",
    leftAnti: false,
    rightAnti: false,
  },
  {
    key: "w-hhhh",
    word: "HHHH",
    letter: Letter.H,
    block: "beta",
    leftAnti: true,
    rightAnti: true,
  },
  {
    key: "w-iiii",
    word: "IIII",
    letter: Letter.I,
    block: "beta",
    leftAnti: true,
    rightAnti: false,
  },
];

const legOf = (w: WordDef, hand: "left" | "right", i: number): Leg =>
  w.block === "alpha" && hand === "right" ? CW_LOOP_RED[i]! : CW_LOOP[i]!;

const wordStep = (w: WordDef, i: number): StepData => {
  const bl = legOf(w, "left", i);
  const rl = legOf(w, "right", i);
  return {
    id: `${w.key}-${i + 1}`,
    letter: w.letter,
    gridMode: GridMode.DIAMOND,
    startPlacement: getGridPlacementFromLocations(bl[0], rl[0]),
    endPlacement: getGridPlacementFromLocations(bl[1], rl[1]),
    stepNumber: i + 1,
    motions: {
      left: w.leftAnti
        ? antiHand(HandSide.LEFT, bl, i)
        : proHand(HandSide.LEFT, bl),
      right: w.rightAnti
        ? antiHand(HandSide.RIGHT, rl, i)
        : proHand(HandSide.RIGHT, rl),
    },
  } as unknown as StepData;
};

// Block Start boxes: α = left S / right N (thumbs in); β = both S.
const startBox = (block: "alpha" | "beta"): StepData =>
  ({
    id: `w-${block}-start`,
    letter: block === "alpha" ? Letter.ALPHA : Letter.BETA,
    gridMode: GridMode.DIAMOND,
    stepNumber: 0,
    startPlacement:
      block === "alpha"
        ? getGridPlacementFromLocations(SO_, N)
        : getGridPlacementFromLocations(SO_, SO_),
    endPlacement:
      block === "alpha"
        ? getGridPlacementFromLocations(SO_, N)
        : getGridPlacementFromLocations(SO_, SO_),
    motions: {
      left: staticHand(HandSide.LEFT, SO_),
      right: staticHand(HandSide.RIGHT, block === "alpha" ? N : SO_),
    },
  }) as unknown as StepData;

// Start + 4 letters - the full playable strip, matching words.content.ts's
// rowStrip pattern.
const wordStrip = (w: WordDef): PictographData[] =>
  [
    startBox(w.block),
    ...[0, 1, 2, 3].map((i) => wordStep(w, i)),
  ] as unknown as PictographData[];

/** STAFF props, TKA letter glyph on - matching AlphaBetaWordsPage's PictographContainer flags. */
const RENDER = { propType: PropType.STAFF } as const;

export const lt1AbcGhiContent: GuideBlock[] = [
  { kind: "heading", level: 1, text: "Alpha and Beta Words" },
  { kind: "heading", level: 2, text: "Same Direction" },
  {
    kind: "prose",
    html:
      "The first words we will learn correspond to VTG’s 1:1 motions.<br>" +
      "To execute these, <strong><em>you’ll need to use body turns and/or negative space</em></strong>.",
  },
  {
    kind: "prose",
    html: "Practice each word once in both directions, then again starting with thumbs out.",
  },
  {
    kind: "pictographGroup",
    items: wordStrip(WORDS[0]!),
    flowCols: 5,
    layout: "strip",
    stepLabels: ["Start", "1", "2", "3", "4"],
    card: true,
    render: RENDER,
    caption: "AAAA: α→α Split-Same",
  },
  {
    kind: "pictographGroup",
    items: wordStrip(WORDS[1]!),
    flowCols: 5,
    layout: "strip",
    stepLabels: ["Start", "1", "2", "3", "4"],
    card: true,
    render: RENDER,
    caption: "BBBB: α→α Split-Same",
  },
  {
    kind: "pictographGroup",
    items: wordStrip(WORDS[2]!),
    flowCols: 5,
    layout: "strip",
    stepLabels: ["Start", "1", "2", "3", "4"],
    card: true,
    render: RENDER,
    caption: "CCCC: α→α Split-Same",
  },
  {
    kind: "pictographGroup",
    items: wordStrip(WORDS[3]!),
    flowCols: 5,
    layout: "strip",
    stepLabels: ["Start", "1", "2", "3", "4"],
    card: true,
    render: RENDER,
    caption: "GGGG: β→β Tog-Same",
  },
  {
    kind: "pictographGroup",
    items: wordStrip(WORDS[4]!),
    flowCols: 5,
    layout: "strip",
    stepLabels: ["Start", "1", "2", "3", "4"],
    card: true,
    render: RENDER,
    caption: "HHHH: β→β Tog-Same",
  },
  {
    kind: "pictographGroup",
    items: wordStrip(WORDS[5]!),
    flowCols: 5,
    layout: "strip",
    stepLabels: ["Start", "1", "2", "3", "4"],
    card: true,
    render: RENDER,
    caption: "IIII: β→β Tog-Same",
  },
];
