/**
 * Single source for the Type 4, 5, 6 Letters SEO doorway (manifest id
 * "lt456-phi-psi-lambda"). Prose is lifted VERBATIM from
 * _pages/Type456LettersPage.svelte (Austen's words - never AI-written); the
 * pictograph construction is a FAITHFUL COPY of that same file's dash/static
 * derivation (same helpers, same locations/orientations → identical staff
 * pictographs), minus the reader-only wiring (selection, overrides,
 * click-to-animate) and sheet geometry. See the reflow spec +
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
const NOROT = RotationDirection.NO_ROTATION;

// ── Motion authoring - copied from Type456LettersPage.svelte ───────────────
const dash = (color: HandSide, from: GridLocation, to: GridLocation) =>
  createMotionData({
    motionType: MotionType.DASH,
    rotationDirection: NOROT,
    startLocation: from,
    endLocation: to,
    startOrientation: IN,
    endOrientation: OUT,
    turns: 0,
    hand: color,
    propType: PropType.STAFF,
    gridMode: GridMode.DIAMOND,
  });
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

type Hand = { from: GridLocation; to: GridLocation; dash: boolean };
const mv = (from: GridLocation, to: GridLocation): Hand => ({ from, to, dash: true });
const st = (loc: GridLocation): Hand => ({ from: loc, to: loc, dash: false });
type CellDef = { letter: Letter; name: string; left: Hand; right: Hand };

// ── Type 4 - Dash · Type 5 - Dual-Dash · Type 6 - Static - copied from
// Type456LettersPage.svelte's SECTIONS. ─────────────────────────────────────
type Section = { key: string; cells: CellDef[] };
const SECTIONS: Section[] = [
  {
    key: "t4",
    cells: [
      { letter: Letter.PHI, name: "Φ", left: st(W), right: mv(W, E) },
      { letter: Letter.PSI, name: "Ψ", left: st(SO_), right: mv(N, SO_) },
      { letter: Letter.LAMBDA, name: "Λ", left: st(SO_), right: mv(W, E) },
    ],
  },
  {
    key: "t5",
    cells: [
      { letter: Letter.PHI_DASH, name: "Φ-", left: mv(W, E), right: mv(E, W) },
      { letter: Letter.PSI_DASH, name: "Ψ-", left: mv(N, SO_), right: mv(N, SO_) },
      { letter: Letter.LAMBDA_DASH, name: "Λ-", left: mv(N, SO_), right: mv(W, E) },
    ],
  },
  {
    key: "t6",
    cells: [
      { letter: Letter.ALPHA, name: "α", left: st(W), right: st(E) },
      { letter: Letter.BETA, name: "β", left: st(SO_), right: st(SO_) },
      { letter: Letter.GAMMA, name: "γ", left: st(SO_), right: st(E) },
    ],
  },
];

const hand = (color: HandSide, h: Hand) => (h.dash ? dash(color, h.from, h.to) : stat(color, h.from));

const cellStep = (c: CellDef, id: string, stepNumber: number | null): StepData =>
  ({
    id,
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

const sectionGroup = (sec: Section): PictographData[] =>
  sec.cells.map((c, ci) => cellStep(c, `t456-${sec.key}-${ci}`, null)) as unknown as PictographData[];

/** STAFF props, TKA letter glyph on - matching Type456LettersPage's PICTO_FLAGS. */
const RENDER = { propType: PropType.STAFF } as const;

export const lt456PhiPsiLambdaContent: GuideBlock[] = [
  { kind: "heading", level: 1, text: "Type 4, 5, 6 Letters: Phi, Psi, Lambda" },
  { kind: "heading", level: 2, text: "Type 4 - Dash" },
  { kind: "pictographGroup", items: sectionGroup(SECTIONS[0]!), flowCols: 3, render: RENDER, caption: "Phi, Psi, Lambda" },
  {
    kind: "prose",
    html:
      'With a <strong style="color:#26e600">Dash</strong>, one prop executes a dash and the other remains static.<br><br>' +
      "“Lambda” can be further shortened by calling it “Lam”.",
  },
  { kind: "heading", level: 2, text: "Type 5 - Dual-Dash" },
  { kind: "pictographGroup", items: sectionGroup(SECTIONS[1]!), flowCols: 3, render: RENDER, caption: "Phi Dash, Psi Dash, Lam Dash" },
  {
    kind: "prose",
    html:
      'In a <strong style="color:#00b3ff">Dual</strong><strong style="color:#26e600">-Dash</strong>, both hands are dashing.<br>' +
      "The end position remains the same.",
  },
  { kind: "heading", level: 2, text: "Type 6 - Static" },
  { kind: "pictographGroup", items: sectionGroup(SECTIONS[2]!), flowCols: 3, render: RENDER, caption: "Alpha, Beta, Gamma" },
  {
    kind: "prose",
    html:
      'In a <strong style="color:#eb7d00">Static</strong> motion, both hands remain still for a beat.<br>' +
      "These become more interesting when adding turns.",
  },
];
