/**
 * Type 1 Dual-Shifts' shared teaching content: Austen's verbatim proof copy
 * (verified_level1_hm_type1_*) and the four mode loops, Split-Same, Tog-Same,
 * Split-Opp and Tog-Opp, each a start box and a four-count loop. The Guide web
 * page and the written-guide sheet read from here. The proof breaks each
 * paragraph into lines; the web page sets the opening line as its lede and
 * wraps the rest, with the words unchanged.
 * Spec: docs/superpowers/specs/2026-10-10-guide-rethink-design.md
 */
import { t } from "#lib/shared/i18n/i18n.svelte.js";
import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  MotionType,
  HandSide,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  GridMode,
  GridLocation,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { getGridPlacementFromLocations } from "#lib/shared/pictograph/grid/services/grid-placement-deriver.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import {
  TND_BY_FAMILY,
  type TnDElement,
} from "#lib/features/choreo-card/domain/tnd-element.js";

export const DUAL_SHIFTS_TOPIC_UNITS = {
  title: "verified_level1_hm_type1_105",
  intro: "verified_level1_hm_type1_106",
  splitSame: "verified_level1_hm_type1_107",
  togSame: "verified_level1_hm_type1_108",
  betweenPositions: "verified_level1_hm_type1_109",
  splitOpp: "verified_level1_hm_type1_110",
  togOpp: "verified_level1_hm_type1_111",
  notice: "verified_level1_hm_type1_112",
  practice: "verified_level1_hm_type1_113",
} as const satisfies Record<string, TranslationKey>;

export type DualShiftsTopicUnit = keyof typeof DUAL_SHIFTS_TOPIC_UNITS;

/** The proof's lines of one unit, its `<br>` breaks removed; markup kept. */
export function dualShiftsTopicLines(unit: DualShiftsTopicUnit): string[] {
  return t(DUAL_SHIFTS_TOPIC_UNITS[unit])
    .split(/<br\s*\/?>/i)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** One unit as wrapping web text: the proof's line breaks become spaces. */
export function dualShiftsTopicHtml(unit: DualShiftsTopicUnit): string {
  return dualShiftsTopicLines(unit).join(" ");
}

/** A line without its markup, for a plain-text slot such as the lede. */
export function plainLine(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Web-only copy beside the verified units: the web page spells the four modes
 * out, leads each pair with where its modes travel, and drops three of the
 * book's sentences, while the printed sheet keeps the proof's words. Timing
 * and direction are named with the Timing and Direction lesson's own lines,
 * so the Guide and the lesson say the same.
 */
export const DUAL_SHIFTS_WEB_COPY = {
  modesLead: "guide_topic_dual_shifts_modes_lead",
  sameLeadSplit: "guide_topic_dual_shifts_same_lead_split",
  sameLeadTog: "guide_topic_dual_shifts_same_lead_tog",
  oppLead: "guide_topic_dual_shifts_opp_lead",
} as const satisfies Record<string, TranslationKey>;

export type DualShiftTiming = "split" | "tog";
export type DualShiftDirection = "same" | "opp";

/** The lesson's name and one-line meaning for each timing and direction. */
export const DUAL_SHIFT_KEY = {
  timing: {
    split: {
      name: "learn_timing_intro_option_split",
      says: "learn_timing_intro_timing_split",
    },
    tog: {
      name: "learn_timing_intro_option_together",
      says: "learn_timing_intro_timing_together",
    },
  },
  direction: {
    same: {
      name: "learn_timing_intro_option_same",
      says: "learn_timing_intro_direction_same",
    },
    opp: {
      name: "learn_timing_intro_option_opposite",
      says: "learn_timing_intro_direction_opposite",
    },
  },
} as const satisfies Record<
  string,
  Record<string, { name: TranslationKey; says: TranslationKey }>
>;

export type DualShiftModeId =
  | "split-same"
  | "tog-same"
  | "split-opp"
  | "tog-opp";

/**
 * Each mode's one full explainer: its Timing and Direction mode guide. The
 * Guide page names the modes and links here rather than teaching timing and
 * direction again (one explainer per concept, 2026-10-12).
 */
export const DUAL_SHIFT_MODE_GUIDES = {
  "split-same": "/timing-and-direction/split-time-same-direction",
  "tog-same": "/timing-and-direction/together-time-same-direction",
  "split-opp": "/timing-and-direction/split-time-opposite-direction",
  "tog-opp": "/timing-and-direction/together-time-opposite-direction",
} as const satisfies Record<DualShiftModeId, `/timing-and-direction/${string}`>;

/** [leftFrom, leftTo, rightFrom, rightTo]; a start box holds (from === to). */
type Move = [GridLocation, GridLocation, GridLocation, GridLocation];

export type DualShiftMode = {
  id: DualShiftModeId;
  name: TranslationKey;
  timing: DualShiftTiming;
  /** Same modes stay in one placement; Opp modes travel between the two. */
  pair: DualShiftDirection;
  /** The book's row label: where the loop travels. */
  travel: "α→α" | "β→β" | "α↔β";
  /** Letter of each box; the start box has none. */
  letters: readonly (Letter | null)[];
  /** Start box, then the four counts of the loop. */
  moves: readonly Move[];
};

const { NORTH: N, EAST: E, SOUTH: S, WEST: W } = GridLocation;

/**
 * Each loop as read off the proof page. MCP-confirmed letters: A = α→α,
 * G = β→β, D = β→α, J = α→β (all Type 1 dual-pro).
 */
export const DUAL_SHIFT_MODES: readonly DualShiftMode[] = [
  // Both hands clockwise from opposite points.
  {
    id: "split-same",
    name: DUAL_SHIFTS_TOPIC_UNITS.splitSame,
    timing: "split",
    pair: "same",
    travel: "α→α",
    letters: [null, Letter.A, Letter.A, Letter.A, Letter.A],
    moves: [
      [S, S, N, N],
      [S, W, N, E],
      [W, N, E, S],
      [N, E, S, W],
      [E, S, W, N],
    ],
  },
  // Both hands clockwise together from one point.
  {
    id: "tog-same",
    name: DUAL_SHIFTS_TOPIC_UNITS.togSame,
    timing: "tog",
    pair: "same",
    travel: "β→β",
    letters: [null, Letter.G, Letter.G, Letter.G, Letter.G],
    moves: [
      [S, S, S, S],
      [S, W, S, W],
      [W, N, W, N],
      [N, E, N, E],
      [E, S, E, S],
    ],
  },
  // Side-point start (β at West): β→α = D, α→β = J.
  {
    id: "split-opp",
    name: DUAL_SHIFTS_TOPIC_UNITS.splitOpp,
    timing: "split",
    pair: "opp",
    travel: "α↔β",
    letters: [null, Letter.D, Letter.J, Letter.D, Letter.J],
    moves: [
      [W, W, W, W],
      [W, N, W, S],
      [N, E, S, E],
      [E, S, E, N],
      [S, W, N, W],
    ],
  },
  // Bottom start (β at South): the same shape a quarter-turn around.
  {
    id: "tog-opp",
    name: DUAL_SHIFTS_TOPIC_UNITS.togOpp,
    timing: "tog",
    pair: "opp",
    travel: "α↔β",
    letters: [null, Letter.D, Letter.J, Letter.D, Letter.J],
    moves: [
      [S, S, S, S],
      [S, W, S, E],
      [W, N, E, N],
      [N, E, N, W],
      [E, S, W, S],
    ],
  },
];

/** The mode's element (water, earth, fire, air) and its colours, from the
 *  choreo-card owner every other surface reads. */
export function dualShiftElement(mode: DualShiftMode): TnDElement {
  const element = TND_BY_FAMILY[mode.id];
  if (!element) throw new Error(`No TnD element for ${mode.id}`);
  return element;
}

/** The mode at one timing and direction, for the 2 x 2 key. */
export function dualShiftModeAt(
  timing: DualShiftTiming,
  direction: DualShiftDirection
): DualShiftMode {
  const mode = DUAL_SHIFT_MODES.find(
    (m) => m.timing === timing && m.pair === direction
  );
  if (!mode) throw new Error(`No mode for ${timing}-${direction}`);
  return mode;
}

export const DUAL_SHIFT_MODES_BY_PAIR = {
  same: DUAL_SHIFT_MODES.filter((mode) => mode.pair === "same"),
  opp: DUAL_SHIFT_MODES.filter((mode) => mode.pair === "opp"),
} as const;

// A hand that moves is authored as a PRO shift; because both props are HAND,
// PictographPreparer's hand-path mode floats it along the path, the same
// route the app takes for hand pictographs. A hand that stays is STATIC.
const motion = (hand: HandSide, from: GridLocation, to: GridLocation) =>
  createMotionData({
    motionType: from === to ? MotionType.STATIC : MotionType.PRO,
    startLocation: from,
    endLocation: to,
    hand,
    propType: PropType.HAND,
    gridMode: GridMode.DIAMOND,
  });

const box = (
  mode: DualShiftModeId,
  m: Move,
  stepNumber: number,
  letter: Letter | null
): StepData =>
  ({
    id: `t1-${mode}-${stepNumber}`,
    letter,
    gridMode: GridMode.DIAMOND,
    startPlacement: getGridPlacementFromLocations(m[0], m[2]),
    endPlacement: getGridPlacementFromLocations(m[1], m[3]),
    motions: {
      left: motion(HandSide.LEFT, m[0], m[1]),
      right: motion(HandSide.RIGHT, m[2], m[3]),
    },
    stepNumber,
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
  }) as unknown as StepData;

/** A mode's boxes: the start box (step 0), then counts 1 to 4. */
export function dualShiftSteps(mode: DualShiftMode): StepData[] {
  return mode.moves.map((m, n) => box(mode.id, m, n, mode.letters[n] ?? null));
}
