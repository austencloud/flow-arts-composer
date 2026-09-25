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
 * Types 1 to 3 follow the multigrid rule (../lettering/multigrid-lettering.ts,
 * approved in docs/superpowers/specs/2026-09-22-multigrid-lettering-design.md),
 * the same rule that letters the diamond, trigrid and pentagrids. Types 4 to 6
 * follow docs/superpowers/specs/2026-09-21-skewed-frame-lettering-design.md.
 * The letter is a pure function of the two hand motions. Blue = left, red =
 * right. Inputs are plain strings so the generator script can call this
 * without the app's enums.
 */
import { Letter } from "../../foundation/domain/models/letter";
import { isMixedPair } from "../../foundation/services/skewed-frame";
import {
  LETTER_GRIDS,
  letterLabelOnGrid,
  letterOnGrid,
  type GridBeat,
  type GridHand,
} from "../lettering/multigrid-lettering";

export type SkewFrameLocation = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
export type SkewFrameMotionType = "pro" | "anti" | "static" | "dash";
export type FrameSpacing = "eta" | "zeta";
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

function isShift(hand: SkewFrameHand): boolean {
  return hand.motionType === "pro" || hand.motionType === "anti";
}

/** The frame as the multigrid rule sees it: eight points, n = 0, counting clockwise. */
function toGridBeat({ left, right }: SkewFrameBeat): GridBeat {
  const toGridHand = (hand: SkewFrameHand): GridHand => ({
    motionType: hand.motionType,
    start: SKEW_FRAME_LOCATIONS.indexOf(hand.startLocation),
    end: SKEW_FRAME_LOCATIONS.indexOf(hand.endLocation),
  });
  return { blue: toGridHand(left), red: toGridHand(right) };
}

/**
 * The 32 letters that can describe a skewed-frame beat. The hands are never
 * together or opposite at either end of a beat here, so the frame has no
 * A B C, G H I, D E F or J K L: every opposite-direction shift passes one of
 * those placements mid-beat and is M N O (opposite) or P Q R (together).
 */
export const SKEWED_FRAME_LETTERS: readonly Letter[] = [
  Letter.S, Letter.T, Letter.U, Letter.V,
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

  if (isShift(left) || isShift(right)) {
    return letterOnGrid(LETTER_GRIDS.skewedDiamond, toGridBeat(beat));
  }

  // Motions move by multiples of 90, so a mixed start pair stays mixed and
  // both spacings are always defined. The guard only narrows the type.
  const start = frameSpacing(left.startLocation, right.startLocation);
  const end = frameSpacing(left.endLocation, right.endLocation);
  if (!start || !end) return null;

  const dashes = Number(left.motionType === "dash") + Number(right.motionType === "dash");
  if (dashes === 2) return start === "zeta" ? Letter.PHI_DASH : Letter.PSI_DASH;
  if (dashes === 1) return start === "eta" ? Letter.PHI : Letter.PSI;
  return start === "zeta" ? Letter.ZETA : Letter.ETA;
}

/**
 * The letter as it is written, with its variant number. S T U V, M N O and
 * P Q R occur from both spacings in this frame, so they are numbered 1 from
 * eta (45°) and 2 from zeta (135°): S1, S2, M1, M2. Every other letter
 * occurs from one spacing only and comes back plain. Null where
 * classifySkewedFrameLetter is null.
 */
export function skewedFrameLetterLabel(beat: SkewFrameBeat): string | null {
  const letter = classifySkewedFrameLetter(beat);
  if (letter === null) return null;
  return letterLabelOnGrid(LETTER_GRIDS.skewedDiamond, toGridBeat(beat)) ?? letter;
}
