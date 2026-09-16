/**
 * Single source for the Gamma Letters SEO doorway (manifest id
 * "lt1-mp-nq-or-stuv"). Prose is lifted VERBATIM from
 * _pages/GammaLettersPage.svelte (Austen's words - never AI-written), including
 * the three word captions (the page's own "memorable phrase"s). The pictograph
 * construction is a FAITHFUL COPY of that same file's cell/word derivation
 * (same enums, locations, orientations, rotation directions → identical staff
 * pictographs), minus the reader-only wiring (selection, overrides,
 * click-to-animate). GammaLettersPage's PICTO_FLAGS sets showReversals: false,
 * so no bakeReversals/showReversals here either. See the reflow spec +
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

// ── Motion authoring - copied from GammaLettersPage.svelte (same helpers as
// CompoundLettersPage). ─────────────────────────────────────────────────────
const HP_CW = new Set(["s-w", "w-n", "n-e", "e-s"]);
const hpDir = (from: GridLocation, to: GridLocation) =>
  HP_CW.has(`${from}-${to}`) ? CW : CCW;
type HandSpec = {
  from: GridLocation;
  to: GridLocation;
  anti: boolean;
  so?: Orientation;
};
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

type CellDef = {
  letter: Letter;
  name: string;
  left: HandSpec;
  right: HandSpec;
};
const cell = (
  letter: Letter,
  name: string,
  left: HandSpec,
  right: HandSpec
): CellDef => ({ letter, name, left, right });
const mv = (
  from: GridLocation,
  to: GridLocation,
  anti = false,
  so?: Orientation
): HandSpec => ({
  from,
  to,
  anti,
  ...(so ? { so } : {}),
});

// ── Quarter-Opp grid (M N O / P Q R) ────────────────────────────────────────
const QO_ROWS: CellDef[][] = [
  [
    cell(Letter.M, "M", mv(W, N), mv(SO_, E)),
    cell(Letter.N, "N", mv(W, N, true), mv(SO_, E, true)),
    cell(Letter.O, "O", mv(W, N, true), mv(SO_, E)),
  ],
  [
    cell(Letter.P, "P", mv(N, E), mv(E, N)),
    cell(Letter.Q, "Q", mv(N, E, true), mv(E, N, true)),
    cell(Letter.R, "R", mv(N, E, true), mv(E, N)),
  ],
];

// ── Quarter-Same row (S T U V; right positionally leads) ────────────────────
// U = leader pro (right pro / left anti); V = leader anti (right anti / left pro).
const QS_ROW: CellDef[] = [
  cell(Letter.S, "S", mv(W, SO_), mv(SO_, E)),
  cell(Letter.T, "T", mv(W, SO_, true), mv(SO_, E, true)),
  cell(Letter.U, "U", mv(W, SO_, true), mv(SO_, E)),
  cell(Letter.V, "V", mv(W, SO_), mv(SO_, E, true)),
];

// ── Word strips: MP / NQ / OR (anti hands continue out→in on step 2) ────────
type WordDef = { word: string; phrase: string; steps: CellDef[] };
const WORDS: WordDef[] = [
  {
    word: "MP",
    phrase: "Magic Potion",
    steps: [
      cell(Letter.M, "M", mv(W, N), mv(SO_, E)),
      cell(Letter.P, "P", mv(N, E), mv(E, N)),
    ],
  },
  {
    word: "NQ",
    phrase: "Never Quit",
    steps: [
      cell(Letter.N, "N", mv(W, N, true), mv(SO_, E, true)),
      cell(Letter.Q, "Q", mv(N, E, true, OUT), mv(E, N, true, OUT)),
    ],
  },
  {
    word: "OR",
    phrase: "Open Road",
    steps: [
      cell(Letter.O, "O", mv(W, N, true), mv(SO_, E)),
      cell(Letter.R, "R", mv(N, E, true, OUT), mv(E, N)),
    ],
  },
];

const cellStep = (
  c: CellDef,
  key: string,
  stepNumber: number | null = null
): StepData =>
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
    id: `gl-start-${c.left.from}-${c.right.from}`,
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

const rowGroup = (row: CellDef[]): PictographData[] =>
  row.map((c) => cellStep(c, `gl-${c.name}`)) as unknown as PictographData[];

const wordKey = (w: WordDef) => `gl-word-${w.word}`;
// Start + 2 letters - the full playable strip.
const wordStrip = (w: WordDef): PictographData[] =>
  [
    startFor(w.steps[0]!),
    ...w.steps.map((c, i) => cellStep(c, `${wordKey(w)}-s`, i + 1)),
  ] as unknown as PictographData[];

/** STAFF props, TKA letter glyph on - matching GammaLettersPage's PICTO_FLAGS. */
const RENDER = { propType: PropType.STAFF } as const;

export const lt1MpNqOrStuvContent: GuideBlock[] = [
  { kind: "heading", level: 1, text: "Gamma Letters" },
  {
    kind: "prose",
    html:
      "γ→γ motions can combine with any other γ→γ motion to create lots of words!<br>" +
      "First let’s look at the compound letters (<em>Quarter-Opp</em>).",
  },
  {
    kind: "pictographGroup",
    items: rowGroup(QO_ROWS[0]!),
    flowCols: 3,
    render: RENDER,
    caption: "M · N · O: γ→γ Quarter-Opp",
  },
  {
    kind: "pictographGroup",
    items: rowGroup(QO_ROWS[1]!),
    flowCols: 3,
    render: RENDER,
    caption: "P · Q · R: γ→γ Quarter-Opp",
  },
  {
    kind: "prose",
    html:
      "When combined as a continuous motion, these form MP, NQ, and OR.<br>" +
      "Here they are along with a memorable phrase:",
  },
  {
    kind: "pictographGroup",
    items: wordStrip(WORDS[0]!),
    flowCols: 3,
    layout: "strip",
    stepLabels: ["Start", "1", "2"],
    card: true,
    render: RENDER,
    caption: "MP: Magic Potion",
  },
  {
    kind: "prose",
    html: '<span class="tka-font">MP</span> - <em>Magic Potion</em>',
  },
  {
    kind: "pictographGroup",
    items: wordStrip(WORDS[1]!),
    flowCols: 3,
    layout: "strip",
    stepLabels: ["Start", "1", "2"],
    card: true,
    render: RENDER,
    caption: "NQ: Never Quit",
  },
  {
    kind: "prose",
    html: '<span class="tka-font">NQ</span> - <em>Never Quit</em>',
  },
  {
    kind: "pictographGroup",
    items: wordStrip(WORDS[2]!),
    flowCols: 3,
    layout: "strip",
    stepLabels: ["Start", "1", "2"],
    card: true,
    render: RENDER,
    caption: "OR: Open Road",
  },
  {
    kind: "prose",
    html: '<span class="tka-font">OR</span> - <em>Open Road</em>',
  },
  {
    kind: "prose",
    html:
      "The final γ→γ group (<em>Quarter-Same</em>) has 4 instead of 3.<br>" +
      "It may seem like U and V contain the same information, but it’s impossible to rotate or<br>" +
      "reflect U in order to turn it into V, and vice-versa, so they must be disambiguated.",
  },
  {
    kind: "pictographGroup",
    items: rowGroup(QS_ROW),
    flowCols: 4,
    render: RENDER,
    caption: "S · T · U · V: γ→γ Quarter-Same",
  },
  {
    kind: "prose",
    html:
      "Note that all four have a <em>leading</em> hand and a <em>following</em> hand.<br>" +
      'Here, the <strong class="cR">right</strong> is leading and <strong class="cB">left</strong> is following, but it’s equally valid to swap this.<br>' +
      "<strong><em>U leads with an isolation</em></strong> (a round motion like the letter U).<br>" +
      "<strong><em>V leads with an antispin</em></strong> (a spiky motion like the letter V).<br>" +
      "These self-combine to form the words SS, TT, UU, and VV.",
  },
];
