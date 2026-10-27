/**
 * Type 1 Dual-Shifts' shared teaching content: Austen's verbatim proof copy
 * (verified_level1_hm_type1_*) and the six mode loops, Split-Same, Tog-Same,
 * Split-Opp, Tog-Opp, Quarter-Opp and Quarter-Same, each a start box and a
 * four-count loop, plus the eight-count sequence that switches between the
 * two Quarter modes. The Guide web page, the written-guide sheet and the
 * Gamma flow content read from here. The proof breaks each paragraph into
 * lines; the web page sets the opening line as its lede and wraps the rest,
 * with the words unchanged.
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

/** The page title without the proof's ": Alpha and Beta" subtitle, which
 *  no longer fits a page that also teaches the Quarter modes. */
export function dualShiftsTitle(): string {
  return t(DUAL_SHIFTS_TOPIC_UNITS.title)
    .replace(/\s*[:\uFF1A].*$/, "")
    .trim();
}

/**
 * Web-only copy beside the verified units: the web page spells the six modes
 * out, leads each mode with where it travels, and drops three of the book's
 * sentences, while the printed sheet keeps the proof's words. Timing and
 * direction are named with the Timing and Direction lesson's own lines, so the
 * Guide and the lesson say the same. The Quarter names and notes, the
 * switching line and the closing lines are Austen's words from the Gamma page,
 * kept in English in every catalog.
 */
export const DUAL_SHIFTS_WEB_COPY = {
  modesLead: "guide_topic_dual_shifts_modes_lead",
  sameLeadSplit: "guide_topic_dual_shifts_same_lead_split",
  sameLeadTog: "guide_topic_dual_shifts_same_lead_tog",
  oppLead: "guide_topic_dual_shifts_opp_lead",
  quarterOpp: "guide_topic_dual_shifts_quarter_opp",
  quarterSame: "guide_topic_dual_shifts_quarter_same",
  quarterOppLead: "guide_topic_dual_shifts_quarter_opp_lead",
  quarterSameLead: "guide_topic_dual_shifts_quarter_same_lead",
  switchingLead: "guide_topic_dual_shifts_switching_lead",
  continuous: "guide_topic_dual_shifts_continuous",
  gammaPractice: "guide_topic_dual_shifts_gamma_practice",
} as const satisfies Record<string, TranslationKey>;

export type DualShiftTiming = "split" | "tog" | "quarter";
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
    quarter: {
      name: "learn_timing_intro_option_quarter",
      says: "learn_timing_intro_timing_quarter",
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

/** The key's rows and columns, in reading order. */
export const DUAL_SHIFT_TIMINGS = ["split", "tog", "quarter"] as const;
export const DUAL_SHIFT_DIRECTIONS = ["same", "opp"] as const;

export type DualShiftModeId =
  | "split-same"
  | "tog-same"
  | "split-opp"
  | "tog-opp"
  | "quarter-opp"
  | "quarter-same";

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
  "quarter-opp": "/timing-and-direction/quarter-time-opposite-direction",
  "quarter-same": "/timing-and-direction/quarter-time-same-direction",
} as const satisfies Record<DualShiftModeId, `/timing-and-direction/${string}`>;

/** [leftFrom, leftTo, rightFrom, rightTo]; a start box holds (from === to). */
export type DualShiftMove = [
  GridLocation,
  GridLocation,
  GridLocation,
  GridLocation,
];
type Move = DualShiftMove;

export type DualShiftMode = {
  id: DualShiftModeId;
  name: TranslationKey;
  timing: DualShiftTiming;
  /** Same modes stay in one placement; Opp modes travel between the two. */
  pair: DualShiftDirection;
  /** The book's row label: where the loop travels. */
  travel: "α→α" | "β→β" | "α↔β" | "γ→γ";
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
  // From the Gamma page (Austen's strips). Opposite spin, hands 90° apart:
  // counts 1 and 3 are parallel; on 2 and 4 both hands travel the same edge
  // in opposite directions (antiparallel). Those two arrows collide unless
  // the arrow pipeline's letter-gated special placement separates them, so
  // they carry letter P (both-PRO Quarter-Opp); every other box has none.
  {
    id: "quarter-opp",
    name: DUAL_SHIFTS_WEB_COPY.quarterOpp,
    timing: "quarter",
    pair: "opp",
    travel: "γ→γ",
    letters: [null, null, Letter.P, null, Letter.P],
    moves: [
      [S, S, E, E],
      [S, W, E, N],
      [W, N, N, W],
      [N, E, W, S],
      [E, S, S, E],
    ],
  },
  // Same spin, red one point ahead of blue the whole loop.
  {
    id: "quarter-same",
    name: DUAL_SHIFTS_WEB_COPY.quarterSame,
    timing: "quarter",
    pair: "same",
    travel: "γ→γ",
    letters: [null, null, null, null, null],
    moves: [
      [S, S, E, E],
      [S, E, E, N],
      [E, N, N, W],
      [N, W, W, S],
      [W, S, S, E],
    ],
  },
];

/**
 * The Gamma page's switching sequence: Start, then eight counts alternating
 * Quarter-Opp and Quarter-Same, closing back on the start. No count has both
 * hands on one edge, so no box needs a letter.
 */
export const DUAL_SHIFT_SWITCHING_MOVES: readonly DualShiftMove[] = [
  [S, S, E, E],
  [S, W, E, N], // Quarter-Opp
  [W, S, N, W], // Quarter-Same
  [S, E, W, N], // Quarter-Opp
  [E, N, N, W], // Quarter-Same
  [N, E, W, S], // Quarter-Opp
  [E, N, S, E], // Quarter-Same
  [N, W, E, S], // Quarter-Opp
  [W, S, S, E], // Quarter-Same
];

/** The mode's element (water, earth, fire, air) and its colours, from the
 *  choreo-card owner every other surface reads. */
export function dualShiftElement(mode: DualShiftMode): TnDElement {
  const element = TND_BY_FAMILY[mode.id];
  if (!element) throw new Error(`No TnD element for ${mode.id}`);
  return element;
}

/** The mode at one timing and direction, for the 3 x 2 key. */
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
  mode: DualShiftModeId | "switching",
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

/** The switching sequence's boxes: the start box, then counts 1 to 8. */
export function dualShiftSwitchingSteps(): StepData[] {
  return DUAL_SHIFT_SWITCHING_MOVES.map((m, n) => box("switching", m, n, null));
}
