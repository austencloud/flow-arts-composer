/**
 * Single source for the Compound Letters SEO doorway (manifest id
 * "lt1-dj-ek-fl"). Prose is lifted VERBATIM from _pages/CompoundLettersPage.svelte
 * (Austen's words: never AI-written), including the three word captions ("cute
 * phrases" the page itself refers to). The pictograph construction is a
 * FAITHFUL COPY of that same file's cell/word derivation (same enums,
 * locations, orientations, rotation directions → identical staff pictographs),
 * minus the reader-only wiring (selection, overrides, click-to-animate).
 * CompoundLettersPage's PICTO_FLAGS sets showReversals: false, so no
 * bakeReversals/showReversals here either. See the reflow spec +
 * no-ghostwriting rule.
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

// ── Motion authoring - copied from CompoundLettersPage.svelte. Handpath
// direction on the compass ring (N→E→S→W = CW): pro's prop rides it, anti's
// prop counter-rotates and flips the thumb (in↔out).
const HP_CW = new Set(["s-w", "w-n", "n-e", "e-s"]);
const hpDir = (from: GridLocation, to: GridLocation) => (HP_CW.has(`${from}-${to}`) ? CW : CCW);
type HandSpec = { from: GridLocation; to: GridLocation; anti: boolean; so?: Orientation };
const hand = (color: HandSide, h: HandSpec) => {
  const dir = hpDir(h.from, h.to);
  const so = h.so ?? IN;
  return createMotionData({
    motionType: h.anti ? MotionType.ANTI : MotionType.PRO,
    rotationDirection: h.anti ? (dir === CW ? CCW : CW) : dir,
    startLocation: h.from,
    endLocation: h.to,
    startOrientation: so,
    endOrientation: h.anti ? (so === IN ? OUT : IN) : so,
    turns: 0,
    hand: color,
    propType: PropType.STAFF,
    gridMode: GridMode.DIAMOND,
  });
};
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

// ── The 12 grid cells ───────────────────────────────────────────────────────
// [letter, blue from→to, red from→to]; anti flags from the column (Iso/Anti/
// Hybrid = none/both/blue-only).
type CellDef = { letter: Letter; name: string; left: HandSpec; right: HandSpec };
const cell = (
  letter: Letter,
  name: string,
  bf: GridLocation,
  bt: GridLocation,
  rf: GridLocation,
  rt: GridLocation,
  leftAnti: boolean,
  rightAnti: boolean
): CellDef => ({
  letter,
  name,
  left: { from: bf, to: bt, anti: leftAnti },
  right: { from: rf, to: rt, anti: rightAnti },
});

type Half = { rows: CellDef[][] };
// Tog-Opp: β→α tog at N; α→β from the W/E alpha.
const TOG: Half = {
  rows: [
    [
      cell(Letter.D, "D", N, W, N, E, false, false),
      cell(Letter.E, "E", N, W, N, E, true, true),
      cell(Letter.F, "F", N, W, N, E, true, false),
    ],
    [
      cell(Letter.J, "J", W, SO_, E, SO_, false, false),
      cell(Letter.K, "K", W, SO_, E, SO_, true, true),
      cell(Letter.L, "L", W, SO_, E, SO_, true, false),
    ],
  ],
};
// Split-Opp: β→α tog at W splitting to S/N; α→β from the S/N alpha to E.
const SPLIT: Half = {
  rows: [
    [
      cell(Letter.D, "D", W, SO_, W, N, false, false),
      cell(Letter.E, "E", W, SO_, W, N, true, true),
      cell(Letter.F, "F", W, SO_, W, N, true, false),
    ],
    [
      cell(Letter.J, "J", SO_, E, N, E, false, false),
      cell(Letter.K, "K", SO_, E, N, E, true, true),
      cell(Letter.L, "L", SO_, E, N, E, true, false),
    ],
  ],
};

const cellStep = (c: CellDef, key: string, stepNumber: number | null = null): StepData =>
  ({
    id: `${key}${stepNumber === null ? "" : `-${stepNumber}`}`,
    letter: c.letter,
    gridMode: GridMode.DIAMOND,
    startPlacement: getGridPlacementFromLocations(c.left.from, c.right.from),
    endPlacement: getGridPlacementFromLocations(c.left.to, c.right.to),
    stepNumber,
    motions: {
      left: hand(HandSide.LEFT, c.left),
      right: hand(HandSide.RIGHT, c.right),
    },
  }) as unknown as StepData;

const startFor = (c: CellDef): StepData =>
  ({
    id: `cl-start-${c.left.from}-${c.right.from}`,
    letter: null,
    gridMode: GridMode.DIAMOND,
    stepNumber: 0,
    startPlacement: getGridPlacementFromLocations(c.left.from, c.right.from),
    endPlacement: getGridPlacementFromLocations(c.left.from, c.right.from),
    motions: {
      left: staticHand(HandSide.LEFT, c.left.from),
      right: staticHand(HandSide.RIGHT, c.right.from),
    },
  }) as unknown as StepData;

const rowGroup = (row: CellDef[], keyPrefix: string): PictographData[] =>
  row.map((c) => cellStep(c, `${keyPrefix}-${c.name}`)) as unknown as PictographData[];

// ── The three compound words (β S → α W/E → β N) ────────────────────────────
// Anti hands flip thumb each step, so step 2's start orientation continues
// from step 1's end (in→out, then out→in).
type WordDef = { word: string; phrase: string; steps: CellDef[] };
const WORDS: WordDef[] = [
  {
    word: "DJ",
    phrase: "Disco Jam",
    steps: [
      cell(Letter.D, "D", SO_, W, SO_, E, false, false),
      cell(Letter.J, "J", W, N, E, N, false, false),
    ],
  },
  {
    word: "EK",
    phrase: "Exploding Kitten",
    steps: [
      cell(Letter.E, "E", SO_, W, SO_, E, true, true),
      {
        ...cell(Letter.K, "K", W, N, E, N, true, true),
        left: { from: W, to: N, anti: true, so: OUT },
        right: { from: E, to: N, anti: true, so: OUT },
      },
    ],
  },
  {
    word: "FL",
    phrase: "Fruity Loops",
    steps: [
      cell(Letter.F, "F", SO_, W, SO_, E, true, false),
      { ...cell(Letter.L, "L", W, N, E, N, true, false), left: { from: W, to: N, anti: true, so: OUT } },
    ],
  },
];
const wordKey = (w: WordDef) => `cl-word-${w.word}`;
// Start + 2 letters - the full playable strip.
const wordStrip = (w: WordDef): PictographData[] =>
  [
    startFor(w.steps[0]!),
    ...w.steps.map((c, i) => cellStep(c, `${wordKey(w)}-s`, i + 1)),
  ] as unknown as PictographData[];

/** STAFF props, TKA letter glyph on - matching CompoundLettersPage's PICTO_FLAGS. */
const RENDER = { propType: PropType.STAFF } as const;

export const lt1DjEkFlContent: GuideBlock[] = [
  { kind: "heading", level: 1, text: "Compound Letters" },
  {
    kind: "prose",
    html: "Now let’s look at the letters that move from β→α or α→β.",
  },
  {
    kind: "prose",
    html: "All pictographs can be rotated or mirrored without changing letters.",
  },
  {
    kind: "prose",
    html: "These can be either <em>Tog-Opp</em> or <em>Split-Opp</em> depending on which α/β you start from.",
  },
  {
    kind: "pictographGroup",
    items: rowGroup(TOG.rows[0]!, "cl-tog"),
    flowCols: 3,
    render: RENDER,
    caption: "D · E · F: β→α (Tog-Opp)",
  },
  {
    kind: "pictographGroup",
    items: rowGroup(TOG.rows[1]!, "cl-tog"),
    flowCols: 3,
    render: RENDER,
    caption: "J · K · L: α→β (Tog-Opp)",
  },
  {
    kind: "pictographGroup",
    items: rowGroup(SPLIT.rows[0]!, "cl-split"),
    flowCols: 3,
    render: RENDER,
    caption: "D · E · F: β→α (Split-Opp)",
  },
  {
    kind: "pictographGroup",
    items: rowGroup(SPLIT.rows[1]!, "cl-split"),
    flowCols: 3,
    render: RENDER,
    caption: "J · K · L: α→β (Split-Opp)",
  },
  {
    kind: "prose",
    html: "These compound letters can’t be self-combined like the previous letters.",
  },
  {
    kind: "prose",
    html: "Instead, they combine with other compound letters to form the words DJ, EK, and FL.",
  },
  {
    kind: "prose",
    html: "Here they are along with cute phrases to help you remember:",
  },
  {
    kind: "pictographGroup",
    items: wordStrip(WORDS[0]!),
    flowCols: 3,
    layout: "strip",
    stepLabels: ["Start", "1", "2"],
    card: true,
    render: RENDER,
    caption: "DJ: Disco Jam",
  },
  {
    kind: "prose",
    html: '<span class="tka-font">DJ</span> - <em>Disco Jam</em>',
  },
  {
    kind: "pictographGroup",
    items: wordStrip(WORDS[1]!),
    flowCols: 3,
    layout: "strip",
    stepLabels: ["Start", "1", "2"],
    card: true,
    render: RENDER,
    caption: "EK: Exploding Kitten",
  },
  {
    kind: "prose",
    html: '<span class="tka-font">EK</span> - <em>Exploding Kitten</em>',
  },
  {
    kind: "pictographGroup",
    items: wordStrip(WORDS[2]!),
    flowCols: 3,
    layout: "strip",
    stepLabels: ["Start", "1", "2"],
    card: true,
    render: RENDER,
    caption: "FL: Fruity Loops",
  },
  {
    kind: "prose",
    html: '<span class="tka-font">FL</span> - <em>Fruity Loops</em>',
  },
];
