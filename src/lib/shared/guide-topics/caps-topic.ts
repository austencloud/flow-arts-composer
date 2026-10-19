/**
 * Gage DeMello's twelve-beat CAPs, the record behind the /guide/three-levels
 * essay and /guide/eight-step. Transcribed into TKA from Mentive's SpiroAnim,
 * whose Eight Step chart lays them out; the full transcription is
 * docs/research/spiroanim/eightstep-72-sequences.json.
 *
 * In every one, one hand caps: it travels two beats round the diamond and
 * doubles back for one, changing its spin on the way back. The other hand keeps
 * circling. The pages sort them by VTG timing and direction, read from where
 * the hands start and which way each sets off, and give each hand one of three
 * spins, which TKA writes as anti with one turn, pro with no turns and pro
 * with one turn.
 *
 * Each row keeps only what the page needs: where each hand starts, the points
 * it reaches beat by beat, and its spin on each beat. Rotation direction and
 * orientation follow from those, and caps-topic.test.ts rebuilds every step
 * and checks it against the transcription. The chart codes stay here as ids;
 * the pages never show them.
 */
import { ratioLabel } from "#lib/shared/shape-matrix/domain/flower-signature.js";
import { deriveTnDFromPictograph } from "#lib/shared/pictograph/shared/domain/utils/tnd-deriver.js";
import {
  TND_ELEMENTS,
  type TnDElement,
} from "#lib/features/choreo-card/domain/tnd-element.js";
import { calculateEndOrientation } from "#lib/shared/render/core/calculations/orientation.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  GridMode,
  type GridLocation,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { getGridPlacementFromLocations } from "#lib/shared/pictograph/grid/services/grid-placement-deriver.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import type { SoloPropStepData } from "#lib/shared/foundation/domain/models/solo-prop-step-data.js";

/** A hand's spin on one beat: pro with no turns, anti with one, pro with one. */
export type CapSpin = "extension" | "antispin" | "prospin";

/**
 * Where the hands start against each other, in VTG's terms: at the same
 * point (together), on opposite sides (split), or a quarter apart.
 */
export type CapTiming = "split" | "together" | "quarter";
/** Whether the hands set off round the circle the same way or opposite ways. */
export type CapDirection = "same" | "opposite";

export const CAP_TIMINGS: readonly CapTiming[] = [
  "split",
  "together",
  "quarter",
];
export const CAP_DIRECTIONS: readonly CapDirection[] = ["same", "opposite"];

export const CAP_BEATS = 12;

const SPIN_BY_CODE: Record<string, CapSpin> = {
  E: "extension",
  A: "antispin",
  P: "prospin",
};

export const CAP_SPIN_MOTION: Record<
  CapSpin,
  { motionType: MotionType; turns: number }
> = {
  extension: { motionType: MotionType.PRO, turns: 0 },
  antispin: { motionType: MotionType.ANTI, turns: 1 },
  prospin: { motionType: MotionType.PRO, turns: 1 },
};

export interface CapHand {
  start: GridLocation;
  /** The point the hand reaches on each beat. */
  path: readonly GridLocation[];
  spins: readonly CapSpin[];
}

export interface Cap {
  /** The SpiroAnim chart code, kept as an id only. */
  id: string;
  word: string;
  timing: CapTiming;
  direction: CapDirection;
  left: CapHand;
  right: CapHand;
}

type Row = [
  id: string,
  word: string,
  leftStart: string,
  leftPath: string,
  leftSpins: string,
  rightStart: string,
  rightPath: string,
  rightSpins: string,
];

const CAP_ROWS: readonly Row[] = [
  [
    "1-AA",
    "KECKECKECKEC",
    "n",
    "eseswswnwnen",
    "AAEAAEAAEAAE",
    "s",
    "enwsenwsenws",
    "AAAAAAAAAAAA",
  ],
  [
    "1-AE",
    "LFALFALFALFA",
    "n",
    "eseswswnwnen",
    "AAEAAEAAEAAE",
    "s",
    "enwsenwsenws",
    "EEEEEEEEEEEE",
  ],
  [
    "1-AI",
    "LFALFALFALFA",
    "n",
    "eseswswnwnen",
    "AAEAAEAAEAAE",
    "s",
    "enwsenwsenws",
    "PPEPPEPPEPPE",
  ],
  [
    "1-EA",
    "LFBLFBLFBLFB",
    "n",
    "eseswswnwnen",
    "EEAEEAEEAEEA",
    "s",
    "enwsenwsenws",
    "AAAAAAAAAAAA",
  ],
  [
    "1-EE",
    "JDCJDCJDCJDC",
    "n",
    "eseswswnwnen",
    "EEAEEAEEAEEA",
    "s",
    "enwsenwsenws",
    "EEEEEEEEEEEE",
  ],
  [
    "1-EI",
    "JDCJDCJDCJDC",
    "n",
    "eseswswnwnen",
    "EEAEEAEEAEEA",
    "s",
    "enwsenwsenws",
    "PPEPPEPPEPPE",
  ],
  [
    "1-IA",
    "LFBLFBLFBLFB",
    "n",
    "eseswswnwnen",
    "PPAPPAPPAPPA",
    "s",
    "enwsenwsenws",
    "AAAAAAAAAAAA",
  ],
  [
    "1-IE",
    "JDCJDCJDCJDC",
    "n",
    "eseswswnwnen",
    "PPAPPAPPAPPA",
    "s",
    "enwsenwsenws",
    "EEEEEEEEEEEE",
  ],
  [
    "1-II",
    "JDCJDCJDCJDC",
    "n",
    "eseswswnwnen",
    "PPAPPAPPAPPA",
    "s",
    "enwsenwsenws",
    "PPEPPEPPEPPE",
  ],
  [
    "2-AA",
    "EKIEKIEKIEKI",
    "s",
    "enenwnwswses",
    "AAEAAEAAEAAE",
    "s",
    "wneswneswnes",
    "AAAAAAAAAAAA",
  ],
  [
    "2-AE",
    "FLGFLGFLGFLG",
    "s",
    "enenwnwswses",
    "AAEAAEAAEAAE",
    "s",
    "wneswneswnes",
    "EEEEEEEEEEEE",
  ],
  [
    "2-AI",
    "FLGFLGFLGFLG",
    "s",
    "enenwnwswses",
    "AAEAAEAAEAAE",
    "s",
    "wneswneswnes",
    "PPEPPEPPEPPE",
  ],
  [
    "2-EA",
    "FLHFLHFLHFLH",
    "s",
    "enenwnwswses",
    "EEAEEAEEAEEA",
    "s",
    "wneswneswnes",
    "AAAAAAAAAAAA",
  ],
  [
    "2-EE",
    "DJIDJIDJIDJI",
    "s",
    "enenwnwswses",
    "EEAEEAEEAEEA",
    "s",
    "wneswneswnes",
    "EEEEEEEEEEEE",
  ],
  [
    "2-EI",
    "DJIDJIDJIDJI",
    "s",
    "enenwnwswses",
    "EEAEEAEEAEEA",
    "s",
    "wneswneswnes",
    "PPEPPEPPEPPE",
  ],
  [
    "2-IA",
    "FLHFLHFLHFLH",
    "s",
    "enenwnwswses",
    "PPAPPAPPAPPA",
    "s",
    "wneswneswnes",
    "AAAAAAAAAAAA",
  ],
  [
    "2-IE",
    "DJIDJIDJIDJI",
    "s",
    "enenwnwswses",
    "PPAPPAPPAPPA",
    "s",
    "wneswneswnes",
    "EEEEEEEEEEEE",
  ],
  [
    "2-II",
    "DJIDJIDJIDJI",
    "s",
    "enenwnwswses",
    "PPAPPAPPAPPA",
    "s",
    "wneswneswnes",
    "PPEPPEPPEPPE",
  ],
  [
    "3-AA",
    "HHFBBLHHFBBL",
    "s",
    "enenwnwswses",
    "AAEAAEAAEAAE",
    "s",
    "enwsenwsenws",
    "AAAAAAAAAAAA",
  ],
  [
    "3-AE",
    "IIDCCJIIDCCJ",
    "s",
    "enenwnwswses",
    "AAEAAEAAEAAE",
    "s",
    "enwsenwsenws",
    "EEEEEEEEEEEE",
  ],
  [
    "3-AI",
    "IIDCCJIIDCCJ",
    "s",
    "enenwnwswses",
    "AAEAAEAAEAAE",
    "s",
    "enwsenwsenws",
    "PPEPPEPPEPPE",
  ],
  [
    "3-EA",
    "IIECCKIIECCK",
    "s",
    "enenwnwswses",
    "EEAEEAEEAEEA",
    "s",
    "enwsenwsenws",
    "AAAAAAAAAAAA",
  ],
  [
    "3-EE",
    "GGFAALGGFAAL",
    "s",
    "enenwnwswses",
    "EEAEEAEEAEEA",
    "s",
    "enwsenwsenws",
    "EEEEEEEEEEEE",
  ],
  [
    "3-EI",
    "GGFAALGGFAAL",
    "s",
    "enenwnwswses",
    "EEAEEAEEAEEA",
    "s",
    "enwsenwsenws",
    "PPEPPEPPEPPE",
  ],
  [
    "3-IA",
    "IIECCKIIECCK",
    "s",
    "enenwnwswses",
    "PPAPPAPPAPPA",
    "s",
    "enwsenwsenws",
    "AAAAAAAAAAAA",
  ],
  [
    "3-IE",
    "GGFAALGGFAAL",
    "s",
    "enenwnwswses",
    "PPAPPAPPAPPA",
    "s",
    "enwsenwsenws",
    "EEEEEEEEEEEE",
  ],
  [
    "3-II",
    "GGFAALGGFAAL",
    "s",
    "enenwnwswses",
    "PPAPPAPPAPPA",
    "s",
    "enwsenwsenws",
    "PPEPPEPPEPPE",
  ],
  [
    "4-AA",
    "BBLHHFBBLHHF",
    "n",
    "eseswswnwnen",
    "AAEAAEAAEAAE",
    "s",
    "wneswneswnes",
    "AAAAAAAAAAAA",
  ],
  [
    "4-AE",
    "CCJIIDCCJIID",
    "n",
    "eseswswnwnen",
    "AAEAAEAAEAAE",
    "s",
    "wneswneswnes",
    "EEEEEEEEEEEE",
  ],
  [
    "4-AI",
    "CCJIIDCCJIID",
    "n",
    "eseswswnwnen",
    "AAEAAEAAEAAE",
    "s",
    "wneswneswnes",
    "PPEPPEPPEPPE",
  ],
  [
    "4-EA",
    "CCKIIECCKIIE",
    "n",
    "eseswswnwnen",
    "EEAEEAEEAEEA",
    "s",
    "wneswneswnes",
    "AAAAAAAAAAAA",
  ],
  [
    "4-EE",
    "AALGGFAALGGF",
    "n",
    "eseswswnwnen",
    "EEAEEAEEAEEA",
    "s",
    "wneswneswnes",
    "EEEEEEEEEEEE",
  ],
  [
    "4-EI",
    "AALGGFAALGGF",
    "n",
    "eseswswnwnen",
    "EEAEEAEEAEEA",
    "s",
    "wneswneswnes",
    "PPEPPEPPEPPE",
  ],
  [
    "4-IA",
    "CCKIIECCKIIE",
    "n",
    "eseswswnwnen",
    "PPAPPAPPAPPA",
    "s",
    "wneswneswnes",
    "AAAAAAAAAAAA",
  ],
  [
    "4-IE",
    "AALGGFAALGGF",
    "n",
    "eseswswnwnen",
    "PPAPPAPPAPPA",
    "s",
    "wneswneswnes",
    "EEEEEEEEEEEE",
  ],
  [
    "4-II",
    "AALGGFAALGGF",
    "n",
    "eseswswnwnen",
    "PPAPPAPPAPPA",
    "s",
    "wneswneswnes",
    "PPEPPEPPEPPE",
  ],
  [
    "5-AA",
    "TTRTTOTTRTTO",
    "w",
    "neneseswswnw",
    "AAEAAEAAEAAE",
    "s",
    "wneswneswnes",
    "AAAAAAAAAAAA",
  ],
  [
    "5-AE",
    "VVPUUMVVPUUM",
    "w",
    "neneseswswnw",
    "AAEAAEAAEAAE",
    "s",
    "wneswneswnes",
    "EEEEEEEEEEEE",
  ],
  [
    "5-AI",
    "VVPUUMVVPUUM",
    "w",
    "neneseswswnw",
    "AAEAAEAAEAAE",
    "s",
    "wneswneswnes",
    "PPEPPEPPEPPE",
  ],
  [
    "5-EA",
    "UUQVVNUUQVVN",
    "w",
    "neneseswswnw",
    "EEAEEAEEAEEA",
    "s",
    "wneswneswnes",
    "AAAAAAAAAAAA",
  ],
  [
    "5-EE",
    "SSRSSOSSRSSO",
    "w",
    "neneseswswnw",
    "EEAEEAEEAEEA",
    "s",
    "wneswneswnes",
    "EEEEEEEEEEEE",
  ],
  [
    "5-EI",
    "SSRSSOSSRSSO",
    "w",
    "neneseswswnw",
    "EEAEEAEEAEEA",
    "s",
    "wneswneswnes",
    "PPEPPEPPEPPE",
  ],
  [
    "5-IA",
    "UUQVVNUUQVVN",
    "w",
    "neneseswswnw",
    "PPAPPAPPAPPA",
    "s",
    "wneswneswnes",
    "AAAAAAAAAAAA",
  ],
  [
    "5-IE",
    "SSRSSOSSRSSO",
    "w",
    "neneseswswnw",
    "PPAPPAPPAPPA",
    "s",
    "wneswneswnes",
    "EEEEEEEEEEEE",
  ],
  [
    "5-II",
    "SSRSSOSSRSSO",
    "w",
    "neneseswswnw",
    "PPAPPAPPAPPA",
    "s",
    "wneswneswnes",
    "PPEPPEPPEPPE",
  ],
  [
    "6-AA",
    "TTOTTRTTOTTR",
    "e",
    "swswnwnenese",
    "AAEAAEAAEAAE",
    "s",
    "wneswneswnes",
    "AAAAAAAAAAAA",
  ],
  [
    "6-AE",
    "UUMVVPUUMVVP",
    "e",
    "swswnwnenese",
    "AAEAAEAAEAAE",
    "s",
    "wneswneswnes",
    "EEEEEEEEEEEE",
  ],
  [
    "6-AI",
    "UUMVVPUUMVVP",
    "e",
    "swswnwnenese",
    "AAEAAEAAEAAE",
    "s",
    "wneswneswnes",
    "PPEPPEPPEPPE",
  ],
  [
    "6-EA",
    "VVNUUQVVNUUQ",
    "e",
    "swswnwnenese",
    "EEAEEAEEAEEA",
    "s",
    "wneswneswnes",
    "AAAAAAAAAAAA",
  ],
  [
    "6-EE",
    "SSOSSRSSOSSR",
    "e",
    "swswnwnenese",
    "EEAEEAEEAEEA",
    "s",
    "wneswneswnes",
    "EEEEEEEEEEEE",
  ],
  [
    "6-EI",
    "SSOSSRSSOSSR",
    "e",
    "swswnwnenese",
    "EEAEEAEEAEEA",
    "s",
    "wneswneswnes",
    "PPEPPEPPEPPE",
  ],
  [
    "6-IA",
    "VVNUUQVVNUUQ",
    "e",
    "swswnwnenese",
    "PPAPPAPPAPPA",
    "s",
    "wneswneswnes",
    "AAAAAAAAAAAA",
  ],
  [
    "6-IE",
    "SSOSSRSSOSSR",
    "e",
    "swswnwnenese",
    "PPAPPAPPAPPA",
    "s",
    "wneswneswnes",
    "EEEEEEEEEEEE",
  ],
  [
    "6-II",
    "SSOSSRSSOSSR",
    "e",
    "swswnwnenese",
    "PPAPPAPPAPPA",
    "s",
    "wneswneswnes",
    "PPEPPEPPEPPE",
  ],
  [
    "7-AA",
    "QNUQNUQNUQNU",
    "w",
    "sesenenwnwsw",
    "AAEAAEAAEAAE",
    "s",
    "wneswneswnes",
    "AAAAAAAAAAAA",
  ],
  [
    "7-AE",
    "ROSROSROSROS",
    "w",
    "sesenenwnwsw",
    "AAEAAEAAEAAE",
    "s",
    "wneswneswnes",
    "EEEEEEEEEEEE",
  ],
  [
    "7-AI",
    "ROSROSROSROS",
    "w",
    "sesenenwnwsw",
    "AAEAAEAAEAAE",
    "s",
    "wneswneswnes",
    "PPEPPEPPEPPE",
  ],
  [
    "7-EA",
    "ROTROTROTROT",
    "w",
    "sesenenwnwsw",
    "EEAEEAEEAEEA",
    "s",
    "wneswneswnes",
    "AAAAAAAAAAAA",
  ],
  [
    "7-EE",
    "PMVPMVPMVPMV",
    "w",
    "sesenenwnwsw",
    "EEAEEAEEAEEA",
    "s",
    "wneswneswnes",
    "EEEEEEEEEEEE",
  ],
  [
    "7-EI",
    "PMVPMVPMVPMV",
    "w",
    "sesenenwnwsw",
    "EEAEEAEEAEEA",
    "s",
    "wneswneswnes",
    "PPEPPEPPEPPE",
  ],
  [
    "7-IA",
    "ROTROTROTROT",
    "w",
    "sesenenwnwsw",
    "PPAPPAPPAPPA",
    "s",
    "wneswneswnes",
    "AAAAAAAAAAAA",
  ],
  [
    "7-IE",
    "PMVPMVPMVPMV",
    "w",
    "sesenenwnwsw",
    "PPAPPAPPAPPA",
    "s",
    "wneswneswnes",
    "EEEEEEEEEEEE",
  ],
  [
    "7-II",
    "PMVPMVPMVPMV",
    "w",
    "sesenenwnwsw",
    "PPAPPAPPAPPA",
    "s",
    "wneswneswnes",
    "PPEPPEPPEPPE",
  ],
  [
    "8-AA",
    "NQVNQVNQVNQV",
    "e",
    "nwnwswsesene",
    "AAEAAEAAEAAE",
    "s",
    "wneswneswnes",
    "AAAAAAAAAAAA",
  ],
  [
    "8-AE",
    "ORSORSORSORS",
    "e",
    "nwnwswsesene",
    "AAEAAEAAEAAE",
    "s",
    "wneswneswnes",
    "EEEEEEEEEEEE",
  ],
  [
    "8-AI",
    "ORSORSORSORS",
    "e",
    "nwnwswsesene",
    "AAEAAEAAEAAE",
    "s",
    "wneswneswnes",
    "PPEPPEPPEPPE",
  ],
  [
    "8-EA",
    "ORTORTORTORT",
    "e",
    "nwnwswsesene",
    "EEAEEAEEAEEA",
    "s",
    "wneswneswnes",
    "AAAAAAAAAAAA",
  ],
  [
    "8-EE",
    "MPUMPUMPUMPU",
    "e",
    "nwnwswsesene",
    "EEAEEAEEAEEA",
    "s",
    "wneswneswnes",
    "EEEEEEEEEEEE",
  ],
  [
    "8-EI",
    "MPUMPUMPUMPU",
    "e",
    "nwnwswsesene",
    "EEAEEAEEAEEA",
    "s",
    "wneswneswnes",
    "PPEPPEPPEPPE",
  ],
  [
    "8-IA",
    "ORTORTORTORT",
    "e",
    "nwnwswsesene",
    "PPAPPAPPAPPA",
    "s",
    "wneswneswnes",
    "AAAAAAAAAAAA",
  ],
  [
    "8-IE",
    "MPUMPUMPUMPU",
    "e",
    "nwnwswsesene",
    "PPAPPAPPAPPA",
    "s",
    "wneswneswnes",
    "EEEEEEEEEEEE",
  ],
  [
    "8-II",
    "MPUMPUMPUMPU",
    "e",
    "nwnwswsesene",
    "PPAPPAPPAPPA",
    "s",
    "wneswneswnes",
    "PPEPPEPPEPPE",
  ],
];

const DEGREES: Record<string, number> = { n: 0, e: 90, s: 180, w: 270 };

/** Read from the start points: the same, opposite, or a quarter apart. */
function timingOf(left: CapHand, right: CapHand): CapTiming {
  const gap = (DEGREES[right.start]! - DEGREES[left.start]! + 360) % 360;
  return gap === 0 ? "together" : gap === 180 ? "split" : "quarter";
}

/** Read from each hand's first beat, clockwise or counterclockwise. */
function directionOf(left: CapHand, right: CapHand): CapDirection {
  const turn = (h: CapHand) =>
    (DEGREES[h.path[0]!]! - DEGREES[h.start]! + 360) % 360;
  return turn(left) === turn(right) ? "same" : "opposite";
}

function hand(start: string, path: string, spins: string): CapHand {
  return {
    start: start as GridLocation,
    path: [...path] as GridLocation[],
    spins: [...spins].map((code) => SPIN_BY_CODE[code]!),
  };
}

/** All 72, in chart order. */
export const CAPS: readonly Cap[] = CAP_ROWS.map(
  ([id, word, ls, lp, lsp, rs, rp, rsp]): Cap => {
    const left = hand(ls, lp, lsp);
    const right = hand(rs, rp, rsp);
    return {
      id,
      word,
      timing: timingOf(left, right),
      direction: directionOf(left, right),
      left,
      right,
    };
  }
);

/** A word and the CAPs that spell it, which differ only in their turns. */
export interface CapWord {
  word: string;
  timing: CapTiming;
  direction: CapDirection;
  caps: readonly Cap[];
}

/** The distinct words, in chart order. Several CAPs can share one. */
export const CAP_WORDS: readonly CapWord[] = (() => {
  const byWord = new Map<string, Cap[]>();
  for (const cap of CAPS) {
    const list = byWord.get(cap.word);
    if (list) list.push(cap);
    else byWord.set(cap.word, [cap]);
  }
  return [...byWord.entries()].map(([word, caps]) => ({
    word,
    timing: caps[0]!.timing,
    direction: caps[0]!.direction,
    caps,
  }));
})();

/**
 * The eight hand paths, one per chart column. The nine CAPs in a column
 * move the hands along the same two paths and differ only in how each hand
 * spins. The left hand caps in every one.
 */
export interface CapHandPath {
  column: number;
  timing: CapTiming;
  direction: CapDirection;
  caps: readonly Cap[];
}

export const CAP_HAND_PATHS: readonly CapHandPath[] = [
  1, 2, 3, 4, 5, 6, 7, 8,
].map((column) => {
  const caps = CAPS.filter((cap) => cap.id.startsWith(`${column}-`));
  return {
    column,
    timing: caps[0]!.timing,
    direction: caps[0]!.direction,
    caps,
  };
});

/**
 * The chart row for a CAP: the capping (left) hand's spin against the circling
 * (right) hand's, each read from its first beat.
 */
export function capPairing(cap: Cap): { capping: CapSpin; circling: CapSpin } {
  return { capping: cap.left.spins[0]!, circling: cap.right.spins[0]! };
}

/**
 * Whether a CAP spins on poi. A poi may point in partway through, but it
 * keeps its momentum only while it carries on the same way: the hand keeps
 * travelling and the poi keeps turning in the same direction until it
 * points out again. So every change of direction has to fall on a beat that
 * ends pointing out, and the loop has to end pointing out to repeat. A staff
 * can change direction pointing any way.
 */
export function capWorksOnPoi(cap: Cap): boolean {
  return [cap.left, cap.right].every((hand) => {
    const steps = capHandSteps(hand);
    return steps.every((step, i) => {
      if (step.endOrientation === Orientation.OUT) return true;
      const next = steps[(i + 1) % steps.length]!;
      return (
        i < steps.length - 1 &&
        next.rotationDirection === step.rotationDirection &&
        travel(next.startLocation, next.endLocation) ===
          travel(step.startLocation, step.endLocation)
      );
    });
  });
}

/** The shortest run of letters the word repeats, e.g. "KEC". */
export function capCell(word: string): string {
  for (let size = 1; size < word.length; size++) {
    if (word.length % size !== 0) continue;
    if ([...word].every((letter, i) => letter === word[i % size])) {
      return word.slice(0, size);
    }
  }
  return word;
}

const RING: readonly GridLocation[] = ["n", "e", "s", "w"] as GridLocation[];

/** Which way round a one-point move goes. */
function travel(from: GridLocation, to: GridLocation): RotationDirection {
  const step = (RING.indexOf(to) - RING.indexOf(from) + 4) % 4;
  return step === 1
    ? RotationDirection.CLOCKWISE
    : RotationDirection.COUNTER_CLOCKWISE;
}

function opposite(direction: RotationDirection): RotationDirection {
  return direction === RotationDirection.CLOCKWISE
    ? RotationDirection.COUNTER_CLOCKWISE
    : RotationDirection.CLOCKWISE;
}

/**
 * One hand's twelve beats. Pro spins the prop the way the hand travels and
 * anti spins it against the hand; every prop starts pointing out.
 */
export function capHandSteps(hand: CapHand): SoloPropStepData[] {
  const steps: SoloPropStepData[] = [];
  let at = hand.start;
  let orientation: Orientation = Orientation.OUT;
  hand.path.forEach((to, i) => {
    const { motionType, turns } = CAP_SPIN_MOTION[hand.spins[i]!];
    const way = travel(at, to);
    const rotationDirection =
      motionType === MotionType.PRO ? way : opposite(way);
    const endOrientation = calculateEndOrientation({
      motionType,
      turns,
      rotationDirection,
      startLocation: at,
      endLocation: to,
      startOrientation: orientation,
    });
    steps.push({
      duration: 1,
      startLocation: at,
      endLocation: to,
      startOrientation: orientation,
      endOrientation,
      motionType,
      rotationDirection,
      turns,
    });
    at = to;
    orientation = endOrientation;
  });
  return steps;
}

/** The spin a hand makes on a beat and its VTG ratio. */
export interface CapHandBeat {
  spin: CapSpin;
  ratio: string;
}

export interface CapBeat {
  beat: number;
  letter: string;
  /**
   * The hands' timing and direction on this beat, read from their actual
   * paths by the same owner as the pictograph's element glyph.
   */
  element: TnDElement | null;
  left: CapHandBeat;
  right: CapHandBeat;
}

function handBeat(spin: CapSpin): CapHandBeat {
  return { spin, ratio: ratioLabel(CAP_SPIN_MOTION[spin].turns as 0 | 1) };
}

/** The VTG reading of every beat: the hands' element and each hand's spin. */
export function capBeats(cap: Cap): CapBeat[] {
  const strip = capStrip(cap);
  return [...cap.word].map((letter, i) => {
    const { elementalType } = deriveTnDFromPictograph(strip[i + 1]);
    return {
      beat: i + 1,
      letter,
      element: TND_ELEMENTS.find((e) => e.element === elementalType) ?? null,
      left: handBeat(cap.left.spins[i]!),
      right: handBeat(cap.right.spins[i]!),
    };
  });
}

function motion(hand: HandSide, step: SoloPropStepData, propType: PropType) {
  return createMotionData({
    motionType: step.motionType,
    rotationDirection: step.rotationDirection,
    startLocation: step.startLocation,
    endLocation: step.endLocation,
    turns: step.turns,
    startOrientation: step.startOrientation,
    endOrientation: step.endOrientation,
    hand,
    propType,
    gridMode: GridMode.DIAMOND,
  });
}

function still(hand: HandSide, step: SoloPropStepData, propType: PropType) {
  return createMotionData({
    motionType: MotionType.STATIC,
    startLocation: step.startLocation,
    endLocation: step.startLocation,
    startOrientation: step.startOrientation,
    endOrientation: step.startOrientation,
    hand,
    propType,
    gridMode: GridMode.DIAMOND,
  });
}

/**
 * Two hands' steps as a Guide strip: the start pose (stepNumber 0) and every
 * beat, ready for stripToSequence and the inline player.
 */
export function pairStrip(
  id: string,
  word: string,
  left: readonly SoloPropStepData[],
  right: readonly SoloPropStepData[],
  propType: PropType = PropType.STAFF
): StepData[] {
  const first = { left: left[0]!, right: right[0]! };
  const startPlacement = getGridPlacementFromLocations(
    first.left.startLocation,
    first.right.startLocation
  );
  const start = createStepData({
    id: `${id}-start`,
    stepNumber: 0,
    letter: null,
    startPlacement,
    endPlacement: startPlacement,
    gridMode: GridMode.DIAMOND,
    motions: {
      left: still(HandSide.LEFT, first.left, propType),
      right: still(HandSide.RIGHT, first.right, propType),
    },
  });
  const beats = left.map((l, i) => {
    const r = right[i]!;
    return createStepData({
      id: `${id}-${i + 1}`,
      stepNumber: i + 1,
      letter: (word[i] ?? null) as Letter | null,
      startPlacement: getGridPlacementFromLocations(
        l.startLocation,
        r.startLocation
      ),
      endPlacement: getGridPlacementFromLocations(l.endLocation, r.endLocation),
      gridMode: GridMode.DIAMOND,
      motions: {
        left: motion(HandSide.LEFT, l, propType),
        right: motion(HandSide.RIGHT, r, propType),
      },
    });
  });
  return [start, ...beats];
}

export function capStrip(cap: Cap): StepData[] {
  return pairStrip(
    `cap-${cap.id}`,
    cap.word,
    capHandSteps(cap.left),
    capHandSteps(cap.right)
  );
}
