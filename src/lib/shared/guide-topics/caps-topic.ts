/**
 * Eight-beat caps on the diamond grid, the record behind the /guide/three-levels
 * essay. A cap here is the simple kind: each hand travels steadily one way
 * round the grid, making two beats of extension (pro, no turns) and then two
 * beats of antispin (anti, one turn), twice. The hands may start that cycle
 * together or up to three beats apart, and may travel the same way or
 * opposite ways.
 *
 * CAPS lists every cap those rules allow, each read from the beat that gives
 * the earliest word alphabetically, so a cap read from a different beat is not
 * counted twice. The letters are checked in so the public page never fetches
 * the letter dataframe; caps-topic.test.ts re-derives the whole table from
 * static/data/pictographs/DiamondPictographDataframe.csv with enumerateCaps.
 *
 * The page also opens on two named patterns. Zan's Diamond has its own record
 * (zans-diamond-topic.ts); Opening and Closing the Book lives here: both hands
 * use extension and reverse on every beat, so the props open apart and close
 * together again.
 */
import { TYPE1_ROTATION } from "@tka/domain";
import { ratioLabel } from "#lib/shared/shape-matrix/domain/flower-signature.js";
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
import type { PairLetterLookup } from "#lib/shared/foundation/services/solo-prop-pair-variations.js";

export type Travel = "cw" | "ccw";
export type CapSpin = "extension" | "antispin";

/** One hand's cycle: two beats of extension, then two of antispin. */
export const CAP_CYCLE: readonly CapSpin[] = [
  "extension",
  "extension",
  "antispin",
  "antispin",
];

const RING: readonly GridLocation[] = ["n", "e", "s", "w"] as GridLocation[];

function nextPoint(at: GridLocation, travel: Travel): GridLocation {
  const i = RING.indexOf(at);
  return RING[(i + (travel === "cw" ? 1 : 3)) % 4]!;
}

/** Where one hand starts, which way it travels, and where it is in its cycle. */
export interface CapHand {
  start: GridLocation;
  travel: Travel;
  /** The cycle beat this hand is on at beat 1 (0 = first extension beat). */
  phase: number;
}

export interface Cap {
  word: string;
  left: CapHand;
  right: CapHand;
}

type Row = [
  word: string,
  leftStart: string,
  leftTravel: Travel,
  leftPhase: number,
  rightStart: string,
  rightTravel: Travel,
  rightPhase: number,
];

const CAP_ROWS: readonly Row[] = [
  ["GGHHGGHH", "n", "cw", 0, "n", "cw", 0],
  ["GIHIGIHI", "n", "cw", 0, "n", "cw", 1],
  ["IIIIIIII", "n", "cw", 0, "n", "cw", 2],
  ["DJEKDJEK", "n", "cw", 0, "n", "ccw", 0],
  ["DKEJDKEJ", "n", "cw", 1, "n", "ccw", 1],
  ["DLELDLEL", "n", "cw", 0, "n", "ccw", 1],
  ["FJFKFJFK", "n", "cw", 3, "n", "ccw", 0],
  ["FLFLFLFL", "n", "cw", 0, "n", "ccw", 2],
  ["SSTTSSTT", "n", "cw", 0, "e", "cw", 0],
  ["SVTUSVTU", "n", "cw", 0, "e", "cw", 1],
  ["UUVVUUVV", "n", "cw", 2, "e", "cw", 0],
  ["SUTVSUTV", "n", "cw", 1, "e", "cw", 0],
  ["MPNQMPNQ", "n", "ccw", 0, "e", "cw", 0],
  ["MQNPMQNP", "n", "ccw", 1, "e", "cw", 1],
  ["MRNRMRNR", "n", "ccw", 0, "e", "cw", 1],
  ["OPOQOPOQ", "n", "ccw", 3, "e", "cw", 0],
  ["OROROROR", "n", "ccw", 0, "e", "cw", 2],
  ["AABBAABB", "n", "cw", 0, "s", "cw", 0],
  ["ACBCACBC", "n", "cw", 0, "s", "cw", 1],
  ["CCCCCCCC", "n", "cw", 0, "s", "cw", 2],
];

/**
 * Every cap the rules allow, in the order the page offers them: hands in
 * step first, then one beat apart, then two, alphabetically within each.
 */
export const CAPS: readonly Cap[] = CAP_ROWS.map(
  ([word, ls, lt, lp, rs, rt, rp]): Cap => ({
    word,
    left: { start: ls as GridLocation, travel: lt, phase: lp },
    right: { start: rs as GridLocation, travel: rt, phase: rp },
  })
).sort((a, b) => capGap(a) - capGap(b) || a.word.localeCompare(b.word));

/** How many beats apart the two hands' cycles run: 0, 1 or 2. */
export function capGap(cap: Cap): number {
  const d = (cap.right.phase - cap.left.phase + 4) % 4;
  return Math.min(d, 4 - d);
}

/** The shortest run of letters the word repeats, e.g. "AABB". */
export function capCell(word: string): string {
  for (let size = 1; size < word.length; size++) {
    if (word.length % size !== 0) continue;
    if ([...word].every((letter, i) => letter === word[i % size])) {
      return word.slice(0, size);
    }
  }
  return word;
}

function soloStep(
  from: GridLocation,
  to: GridLocation,
  motion: MotionType,
  spin: RotationDirection,
  turns: number,
  orientation: Orientation
): SoloPropStepData {
  const endOrientation = calculateEndOrientation({
    motionType: motion,
    turns,
    rotationDirection: spin,
    startLocation: from,
    endLocation: to,
    startOrientation: orientation,
  });
  return {
    duration: 1,
    startLocation: from,
    endLocation: to,
    startOrientation: orientation,
    endOrientation,
    motionType: motion,
    rotationDirection: spin,
    turns,
  };
}

const opposite = (travel: Travel): Travel => (travel === "cw" ? "ccw" : "cw");

/**
 * One hand's eight beats. Extension spins the prop the way the hand travels
 * with no turns; antispin spins it against the hand with one turn.
 */
export function capHandSteps(hand: CapHand): SoloPropStepData[] {
  const steps: SoloPropStepData[] = [];
  let at = hand.start;
  let orientation: Orientation = Orientation.IN;
  for (let i = 0; i < 8; i++) {
    const spin = CAP_CYCLE[(i + hand.phase) % 4]!;
    const to = nextPoint(at, hand.travel);
    const step =
      spin === "extension"
        ? soloStep(
            at,
            to,
            MotionType.PRO,
            hand.travel as RotationDirection,
            0,
            orientation
          )
        : soloStep(
            at,
            to,
            MotionType.ANTI,
            opposite(hand.travel) as RotationDirection,
            1,
            orientation
          );
    steps.push(step);
    at = to;
    orientation = step.endOrientation;
  }
  return steps;
}

/** The spin a hand makes on a beat (1-based) and its VTG ratio. */
export interface CapHandBeat {
  spin: CapSpin;
  ratio: string;
}

export interface CapBeat {
  beat: number;
  letter: string;
  /** VTG timing and direction as the TnD family id, e.g. "split-same". */
  family: string;
  left: CapHandBeat;
  right: CapHandBeat;
}

const FAMILY_BY_GROUP: Record<string, string> = {
  ss: "split-same",
  so: "split-opp",
  ts: "tog-same",
  to: "tog-opp",
  qs: "quarter-same",
  qo: "quarter-opp",
};

function handBeat(hand: CapHand, i: number): CapHandBeat {
  const spin = CAP_CYCLE[(i + hand.phase) % 4]!;
  return { spin, ratio: ratioLabel(spin === "extension" ? 0 : 1) };
}

/** The VTG reading of every beat, from the letter canon and the hand cycles. */
export function capBeats(cap: Cap): CapBeat[] {
  return [...cap.word].map((letter, i) => {
    const canon = TYPE1_ROTATION[letter];
    if (!canon) throw new Error(`${letter} is not a Type 1 letter`);
    return {
      beat: i + 1,
      letter,
      family: FAMILY_BY_GROUP[canon.vtgGroup]!,
      left: handBeat(cap.left, i),
      right: handBeat(cap.right, i),
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
    `cap-${cap.word}`,
    cap.word,
    capHandSteps(cap.left),
    capHandSteps(cap.right)
  );
}

/**
 * Opening and Closing the Book: both hands start at the top, swing apart to
 * the sides with extension, and reverse back up on every beat.
 */
export const BOOK_WORD = "DJDJDJDJ";

function bookHand(side: GridLocation, open: Travel): SoloPropStepData[] {
  const top = "n" as GridLocation;
  const steps: SoloPropStepData[] = [];
  for (let i = 0; i < 8; i++) {
    const opening = i % 2 === 0;
    steps.push(
      soloStep(
        opening ? top : side,
        opening ? side : top,
        MotionType.PRO,
        (opening ? open : opposite(open)) as RotationDirection,
        0,
        Orientation.IN
      )
    );
  }
  return steps;
}

export const BOOK_LEFT_STEPS = bookHand("e" as GridLocation, "cw");
export const BOOK_RIGHT_STEPS = bookHand("w" as GridLocation, "ccw");

export function bookStrip(): StepData[] {
  return pairStrip("book", BOOK_WORD, BOOK_LEFT_STEPS, BOOK_RIGHT_STEPS);
}

/**
 * Spell two hands' steps with the dataframe, beat by beat. Null when a beat
 * has no letter.
 */
export function spellPair(
  left: readonly SoloPropStepData[],
  right: readonly SoloPropStepData[],
  lookup: PairLetterLookup
): string | null {
  let word = "";
  for (let i = 0; i < left.length; i++) {
    const l = left[i]!;
    const r = right[i]!;
    const letter = lookup({
      startPlacement: getGridPlacementFromLocations(
        l.startLocation,
        r.startLocation
      ),
      endPlacement: getGridPlacementFromLocations(l.endLocation, r.endLocation),
      left: l,
      right: r,
    });
    if (!letter) return null;
    word += letter;
  }
  return word;
}

/**
 * Every cap the rules allow, derived from scratch: both hands from the top or
 * any later point, either travel, any phase. A cap read from another beat or
 * from a rotated start spells a rotation of the same word, so only the
 * earliest rotation is kept. Used by the test to hold CAPS to the dataframe.
 */
export function enumerateCaps(lookup: PairLetterLookup): Cap[] {
  const found = new Map<string, Cap>();
  const rotations = (w: string) =>
    [...w].map((_, n) => w.slice(n) + w.slice(0, n));
  for (const ls of RING)
    for (const rs of RING)
      for (const lt of ["cw", "ccw"] as const)
        for (const rt of ["cw", "ccw"] as const)
          for (let lp = 0; lp < 4; lp++)
            for (let rp = 0; rp < 4; rp++) {
              const left: CapHand = { start: ls, travel: lt, phase: lp };
              const right: CapHand = { start: rs, travel: rt, phase: rp };
              const word = spellPair(
                capHandSteps(left),
                capHandSteps(right),
                lookup
              );
              if (!word) continue;
              if (word !== rotations(word).sort()[0]) continue;
              if (!found.has(word)) found.set(word, { word, left, right });
            }
  return [...found.values()];
}
