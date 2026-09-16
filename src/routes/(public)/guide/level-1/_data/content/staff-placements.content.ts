import type { GuideBlock } from "../guide-content-blocks";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { MotionType, HandSide, Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { GridMode, GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

const { EAST: E, SOUTH: SO_, WEST: W } = GridLocation;

// 12 staff pictographs: 3 placements × 4 thumb-orientation columns - copied
// verbatim from _pages/StaffPlacementsPage.svelte.
const staticMotion = (color: HandSide, loc: GridLocation, ori: Orientation) =>
  createMotionData({
    motionType: MotionType.STATIC,
    startLocation: loc,
    endLocation: loc,
    startOrientation: ori,
    endOrientation: ori,
    hand: color,
    propType: PropType.STAFF,
    gridMode: GridMode.DIAMOND,
  });

type Row = { letter: Letter; left: GridLocation; right: GridLocation };
const ROWS: Row[] = [
  { letter: Letter.ALPHA, left: W, right: E },
  { letter: Letter.BETA, left: SO_, right: SO_ },
  { letter: Letter.GAMMA, left: SO_, right: E },
];

// Column thumb orientations, blue/red order (matches the artboard's colored header).
const COL_ORI: [Orientation, Orientation][] = [
  [Orientation.IN, Orientation.IN],
  [Orientation.OUT, Orientation.OUT],
  [Orientation.OUT, Orientation.IN],
  [Orientation.IN, Orientation.OUT],
];

const cell = (row: Row, col: number): StepData =>
  ({
    id: `sp-${row.letter}-${col}`,
    letter: row.letter,
    gridMode: GridMode.DIAMOND,
    startPlacement: getGridPlacementFromLocations(row.left, row.right),
    endPlacement: getGridPlacementFromLocations(row.left, row.right),
    motions: {
      left: staticMotion(HandSide.LEFT, row.left, COL_ORI[col]![0]),
      right: staticMotion(HandSide.RIGHT, row.right, COL_ORI[col]![1]),
    },
    stepNumber: null,
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
  }) as unknown as StepData;

const rowCells = (row: Row): PictographData[] =>
  [0, 1, 2, 3].map((col) => cell(row, col)) as unknown as PictographData[];

/** STAFF props (TKA letter glyph stays on - the default) - matching StaffPlacementsPage's PICTO_FLAGS. */
const RENDER = { propType: PropType.STAFF } as const;

// Row glyph height, copied from StaffPlacementsPage.svelte's GLYPH_H.
const GLYPH_H = 26;

// Verbatim prose lifted from _pages/StaffPlacementsPage.svelte (Austen's words - never AI-written).
export const staffPlacementsContent: GuideBlock[] = [
  { kind: "heading", level: 1, text: "Staff Placements" },
  {
    kind: "prose",
    html:
      "When writing sequences with staves, it helps to mark the thumb end with a line.<br>" +
      "The performer can use it to keep track of rotations and check their position on every step.<br>" +
      "It also encourages negative space/body turns instead of finger spinning.",
  },
  { kind: "prose", html: "In the following examples, an end is always at the center point." },
  { kind: "prose", html: "Practice each placement below, paying attention to the thumb orientation." },
  {
    kind: "prose",
    html:
      'Thumbs: in out <span class="cB">(out</span>/<span class="cR">in)</span> <span class="cB">(in</span>/<span class="cR">out)</span>',
  },

  { kind: "glyphImage", src: "/images/letters_trimmed/Type6/α.svg", alt: "Alpha (α)", heightPt: GLYPH_H },
  { kind: "heading", level: 2, text: "Alpha" },
  { kind: "pictographGroup", items: rowCells(ROWS[0]!), flowCols: 4, render: RENDER },

  { kind: "glyphImage", src: "/images/letters_trimmed/Type6/β.svg", alt: "Beta (β)", heightPt: GLYPH_H },
  { kind: "heading", level: 2, text: "Beta" },
  { kind: "pictographGroup", items: rowCells(ROWS[1]!), flowCols: 4, render: RENDER },

  { kind: "glyphImage", src: "/images/letters_trimmed/Type6/γ.svg", alt: "Gamma (γ)", heightPt: GLYPH_H },
  { kind: "heading", level: 2, text: "Gamma" },
  { kind: "pictographGroup", items: rowCells(ROWS[2]!), flowCols: 4, render: RENDER },

  {
    kind: "prose",
    html:
      "Many of the pictographs in this guide are depicted with no thumb ends<br>" +
      "when categorizing. It is usually noted only during sequences.",
  },
  {
    kind: "prose",
    html:
      "Most sequences in this guide start with thumbs in for consistency.<br>" +
      "It’s equally valid to start any sequence from a different thumb orientation.",
  },
];
