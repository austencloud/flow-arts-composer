/**
 * Skewed-frame lettering.
 *
 * A beat is in the skewed frame when one hand sits on a cardinal point
 * (n e s w) and the other on an intercardinal point (ne se sw nw). The hands
 * are then 45° apart (eta) or 135° apart (zeta). Beats that enter or exit the
 * frame are lettered by scripts/generate-skewed-dataframe.ts from their base
 * Diamond/Box row. Beats that start in the frame have no base row, so their
 * letter is computed here; the generator feeds every such beat through
 * classifySkewedFrameLetter and writes the result to
 * SkewedPictographDataframe.csv as category 3 rows.
 *
 * Rules: docs/superpowers/specs/2026-09-21-skewed-frame-lettering-design.md.
 * The letter is a pure function of the two hand motions. Blue = left, red =
 * right. Inputs are plain strings so the generator script can call this
 * without the app's enums.
 */
import { Letter } from "../../foundation/domain/models/letter";
import { isMixedPair } from "../../foundation/services/skewed-frame";

export type SkewFrameLocation = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
export type SkewFrameMotionType = "pro" | "anti" | "static" | "dash";
export type FrameSpacing = "eta" | "zeta";
export type CrossedPosition = "alpha" | "beta";
type Travel = 90 | -90;
type HandTurn = 0 | 90 | -90 | 180;

export interface SkewFrameHand {
  readonly motionType: SkewFrameMotionType;
  readonly startLocation: SkewFrameLocation;
  readonly endLocation: SkewFrameLocation;
}

export interface SkewFrameBeat {
  /** Blue hand. */
  readonly left: SkewFrameHand;
  /** Red hand. */
  readonly right: SkewFrameHand;
}

/** Perimeter points in clockwise order, 45° apart. */
export const SKEW_FRAME_LOCATIONS: readonly SkewFrameLocation[] = [
  "n", "ne", "e", "se", "s", "sw", "w", "nw",
];

const ANGLE: Record<SkewFrameLocation, number> = {
  n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315,
};

/** True when exactly one hand is on a cardinal point. Same rule as skewed-frame.ts. */
export function isSkewedFramePair(a: SkewFrameLocation, b: SkewFrameLocation): boolean {
  return isMixedPair(a, b);
}

/** 45° apart = eta, 135° apart = zeta, anything else = not a skewed pair. */
export function frameSpacing(a: SkewFrameLocation, b: SkewFrameLocation): FrameSpacing | null {
  const difference = Math.abs(ANGLE[a] - ANGLE[b]);
  const apart = difference > 180 ? 360 - difference : difference;
  if (apart === 45) return "eta";
  if (apart === 135) return "zeta";
  return null;
}

/** Red measured clockwise from blue, in degrees 0-315. */
function redClockwiseFromBlue(blue: SkewFrameLocation, red: SkewFrameLocation): number {
  return (ANGLE[red] - ANGLE[blue] + 360) % 360;
}

/**
 * Which hand is ahead when both travel the same way: the one its partner
 * trails by the smaller arc. Clockwise travel puts red ahead when red sits
 * fewer than 180° clockwise from blue; counter-clockwise travel flips it.
 */
export function leadingHand(
  blue: SkewFrameLocation,
  red: SkewFrameLocation,
  travel: Travel
): "left" | "right" {
  const ahead = redClockwiseFromBlue(blue, red);
  if (travel === 90) return ahead < 180 ? "right" : "left";
  return ahead > 180 ? "right" : "left";
}

/**
 * The pure position the hands pass through when they travel opposite ways.
 * Converging hands meet (beta); diverging hands pass through opposite (alpha).
 * `blueTravel` is blue's direction; red travels the other way.
 */
export function crossedPosition(
  blue: SkewFrameLocation,
  red: SkewFrameLocation,
  blueTravel: Travel
): CrossedPosition {
  const ahead = redClockwiseFromBlue(blue, red);
  const converging = blueTravel === 90 ? ahead < 180 : ahead > 180;
  return converging ? "beta" : "alpha";
}

/** Signed hand-path turn, clockwise positive: 0, ±90, 180. Null for 45°/135° arcs. */
function handTurn(hand: SkewFrameHand): HandTurn | null {
  const delta = (ANGLE[hand.endLocation] - ANGLE[hand.startLocation] + 360) % 360;
  if (delta === 0) return 0;
  if (delta === 90) return 90;
  if (delta === 270) return -90;
  if (delta === 180) return 180;
  return null;
}

/** pro/anti shift a quarter, static holds, dash crosses. */
function motionAgreesWithPath(hand: SkewFrameHand, turn: HandTurn): boolean {
  switch (hand.motionType) {
    case "pro":
    case "anti":
      return turn === 90 || turn === -90;
    case "static":
      return turn === 0;
    case "dash":
      return turn === 180;
  }
}

/** Narrows a hand turn to a travel direction. True only for the ±90 cases. */
function isTravel(turn: HandTurn): turn is Travel {
  return turn === 90 || turn === -90;
}

type SpinTriple = readonly [pro: Letter, anti: Letter, hybrid: Letter];
type SpinPair = readonly [pro: Letter, anti: Letter];
type ShiftMotionType = "pro" | "anti";

/** Opposite-direction families by start spacing and crossed position. */
const OPPOSITE_FAMILIES: Record<FrameSpacing, Record<CrossedPosition, SpinTriple>> = {
  eta: {
    alpha: [Letter.D, Letter.E, Letter.F],
    beta: [Letter.P, Letter.Q, Letter.R],
  },
  zeta: {
    beta: [Letter.J, Letter.K, Letter.L],
    alpha: [Letter.M, Letter.N, Letter.O],
  },
};

/** Shift + static by start->end spacing. */
const SHIFT_STATIC: Record<FrameSpacing, Record<FrameSpacing, SpinPair>> = {
  zeta: {
    zeta: [Letter.W, Letter.X],
    eta: [Letter.SIGMA, Letter.DELTA],
  },
  eta: {
    eta: [Letter.Y, Letter.Z],
    zeta: [Letter.THETA, Letter.OMEGA],
  },
};

/**
 * Shift + dash by start->end spacing. A Type 3 letter is the Type 2 pictograph
 * with a dash arrow on the formerly static hand, which in the standard alphabet
 * pairs W- with Y's pictograph and Σ- with Θ's; the same relation applied here.
 */
const SHIFT_DASH: Record<FrameSpacing, Record<FrameSpacing, SpinPair>> = {
  eta: {
    zeta: [Letter.W_DASH, Letter.X_DASH],
    eta: [Letter.SIGMA_DASH, Letter.DELTA_DASH],
  },
  zeta: {
    eta: [Letter.Y_DASH, Letter.Z_DASH],
    zeta: [Letter.THETA_DASH, Letter.OMEGA_DASH],
  },
};

function pickSpin(triple: SpinTriple, a: ShiftMotionType, b: ShiftMotionType): Letter {
  if (a === b) return a === "pro" ? triple[0] : triple[1];
  return triple[2];
}

/** The 38 letters that can describe a skewed-frame beat. */
export const SKEWED_FRAME_LETTERS: readonly Letter[] = [
  Letter.S, Letter.T, Letter.U, Letter.V,
  Letter.D, Letter.E, Letter.F, Letter.J, Letter.K, Letter.L,
  Letter.M, Letter.N, Letter.O, Letter.P, Letter.Q, Letter.R,
  Letter.W, Letter.X, Letter.Y, Letter.Z, Letter.SIGMA, Letter.DELTA, Letter.THETA, Letter.OMEGA,
  Letter.W_DASH, Letter.X_DASH, Letter.Y_DASH, Letter.Z_DASH,
  Letter.SIGMA_DASH, Letter.DELTA_DASH, Letter.THETA_DASH, Letter.OMEGA_DASH,
  Letter.PHI, Letter.PSI, Letter.PHI_DASH, Letter.PSI_DASH,
  Letter.ZETA, Letter.ETA,
];

/**
 * Letter for a beat that starts in the skewed frame. Null when the start pair
 * is not mixed, when a hand's arc is 45°/135° (a skew entry/exit, lettered by
 * the dataframe generator's skew columns instead), or when a motion type
 * disagrees with its path.
 */
export function classifySkewedFrameLetter(beat: SkewFrameBeat): Letter | null {
  const { left, right } = beat;
  if (!isSkewedFramePair(left.startLocation, right.startLocation)) return null;

  const leftTurn = handTurn(left);
  const rightTurn = handTurn(right);
  if (leftTurn === null || rightTurn === null) return null;
  if (!motionAgreesWithPath(left, leftTurn) || !motionAgreesWithPath(right, rightTurn)) return null;

  const start = frameSpacing(left.startLocation, right.startLocation);
  const end = frameSpacing(left.endLocation, right.endLocation);
  // Motions move by multiples of 90, so a mixed start pair stays mixed and
  // both spacings are always defined. The guard only narrows the type.
  if (!start || !end) return null;

  const leftShifts = left.motionType === "pro" || left.motionType === "anti";
  const rightShifts = right.motionType === "pro" || right.motionType === "anti";

  if (leftShifts && rightShifts) {
    // motionAgreesWithPath already forced the turn to +/-90 for a shifting
    // hand. The guard only narrows the type.
    if (!isTravel(leftTurn)) return null;
    const blueTravel = leftTurn;
    if (leftTurn === rightTurn) {
      if (left.motionType === right.motionType) {
        return left.motionType === "pro" ? Letter.S : Letter.T;
      }
      const leader = leadingHand(left.startLocation, right.startLocation, blueTravel);
      const leaderType = leader === "left" ? left.motionType : right.motionType;
      return leaderType === "pro" ? Letter.U : Letter.V;
    }
    const crossed = crossedPosition(left.startLocation, right.startLocation, blueTravel);
    return pickSpin(OPPOSITE_FAMILIES[start][crossed], left.motionType, right.motionType);
  }

  if (leftShifts || rightShifts) {
    const shifting = leftShifts ? left : right;
    const partner = leftShifts ? right : left;
    const pair = partner.motionType === "static" ? SHIFT_STATIC[start][end] : SHIFT_DASH[start][end];
    return shifting.motionType === "pro" ? pair[0] : pair[1];
  }

  const dashes = Number(left.motionType === "dash") + Number(right.motionType === "dash");
  if (dashes === 2) return start === "zeta" ? Letter.PHI_DASH : Letter.PSI_DASH;
  if (dashes === 1) return start === "eta" ? Letter.PHI : Letter.PSI;
  return start === "zeta" ? Letter.ZETA : Letter.ETA;
}
