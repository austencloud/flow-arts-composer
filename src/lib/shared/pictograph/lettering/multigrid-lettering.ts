/**
 * Type 1 to Type 3 lettering for any grid of evenly spaced points.
 *
 * One rule letters the diamond, the trigrid, the pentagrid and both skewed
 * frames. It reads how the angle between the two hands changes over the beat
 * and watches two landmarks on that angle: beta (hands together) and alpha
 * (hands exactly opposite). A triangle or a pentagon has no point opposite
 * another, but hands moving opposite ways still pass through 180 degrees
 * mid-beat, so alpha is a landmark on every grid.
 *
 * Approved 2026-09-22; the rule, the catalogs and the decisions are in
 * docs/superpowers/specs/2026-09-22-multigrid-lettering-design.md.
 * Imports stay relative so the dataframe generators can run this under tsx.
 */
import { Letter } from "../../foundation/domain/models/letter";

export type GridMotionType = "pro" | "anti" | "static" | "dash";

export interface LetterGrid {
  /** Points on the circle, evenly spaced, numbered clockwise from the top. */
  readonly points: number;
  /** Points a pro or anti motion moves. */
  readonly shift: number;
  /**
   * The points form two interleaved families and a beat starts with one hand
   * on each, as in the skewed frames. On these grids a beat whose hands start
   * in the same family belongs to the plain grid, not to this one.
   */
  readonly mixed: boolean;
}

export const LETTER_GRIDS = {
  trigrid: { points: 3, shift: 1, mixed: false },
  diamond: { points: 4, shift: 1, mixed: false },
  pentagrid: { points: 5, shift: 1, mixed: false },
  /** The shipped skewed frame: one hand on n e s w, the other on ne se sw nw. */
  skewedDiamond: { points: 8, shift: 2, mixed: true },
  /** One hand on each pentagon. Filled and open pentagons are interchangeable. */
  skewedPentagrid: { points: 10, shift: 2, mixed: true },
} as const satisfies Record<string, LetterGrid>;

export interface GridHand {
  readonly motionType: GridMotionType;
  /** Point index: 0 at the top, counting clockwise. */
  readonly start: number;
  readonly end: number;
}

export interface GridBeat {
  readonly blue: GridHand;
  readonly red: GridHand;
}

type Landmark = "alpha" | "beta";
type Triple = readonly [proPro: Letter, antiAnti: Letter, hybrid: Letter];
type Pair = readonly [pro: Letter, anti: Letter];

const A_B_C: Triple = [Letter.A, Letter.B, Letter.C];
const D_E_F: Triple = [Letter.D, Letter.E, Letter.F];
const G_H_I: Triple = [Letter.G, Letter.H, Letter.I];
const J_K_L: Triple = [Letter.J, Letter.K, Letter.L];
const M_N_O: Triple = [Letter.M, Letter.N, Letter.O];
const P_Q_R: Triple = [Letter.P, Letter.Q, Letter.R];

/** Type 2 pairs (partner static) and their Type 3 forms (partner dashing). */
interface ShiftFamily {
  readonly static: Pair;
  readonly dash: Pair;
}
const REACHES_ALPHA: ShiftFamily = {
  static: [Letter.W, Letter.X],
  dash: [Letter.W_DASH, Letter.X_DASH],
};
const REACHES_BETA: ShiftFamily = {
  static: [Letter.Y, Letter.Z],
  dash: [Letter.Y_DASH, Letter.Z_DASH],
};
const NARROWS: ShiftFamily = {
  static: [Letter.SIGMA, Letter.DELTA],
  dash: [Letter.SIGMA_DASH, Letter.DELTA_DASH],
};
const WIDENS: ShiftFamily = {
  static: [Letter.THETA, Letter.OMEGA],
  dash: [Letter.THETA_DASH, Letter.OMEGA_DASH],
};

function mod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

/** Steps taken the shorter way round, clockwise positive: (-points/2, points/2]. */
function signedSteps(points: number, steps: number): number {
  const forward = mod(steps, points);
  return forward * 2 > points ? forward - points : forward;
}

/** The smaller arc between the hands, in degrees. `rel` is red minus blue in steps. */
function spacingDegrees(points: number, rel: number): number {
  const forward = mod(rel, points);
  return (Math.min(forward, points - forward) * 360) / points;
}

// Landmarks sit at every half turn of the relative angle. On an odd grid a
// half turn falls between two points, so both helpers below count in half
// steps to stay in whole numbers.

function landmarkAt(points: number, rel: number): Landmark | null {
  const halfSteps = mod(rel * 2, points * 2);
  if (halfSteps === 0) return "beta";
  if (halfSteps === points) return "alpha";
  return null;
}

/** Landmarks the relative angle passes strictly between its start and its end. */
function landmarksCrossed(points: number, from: number, to: number): Set<Landmark> {
  const low = Math.min(from, to) * 2;
  const high = Math.max(from, to) * 2;
  const crossed = new Set<Landmark>();
  for (let mark = (Math.floor(low / points) + 1) * points; mark < high; mark += points) {
    crossed.add(mod(mark, points * 2) === 0 ? "beta" : "alpha");
  }
  return crossed;
}

function isShift(motionType: GridMotionType): boolean {
  return motionType === "pro" || motionType === "anti";
}

function isPoint(grid: LetterGrid, point: number): boolean {
  return Number.isInteger(point) && point >= 0 && point < grid.points;
}

/** Signed steps the hand travels, or null when its motion type cannot make that move. */
function handSteps(grid: LetterGrid, hand: GridHand): number | null {
  if (!isPoint(grid, hand.start) || !isPoint(grid, hand.end)) return null;
  const steps = signedSteps(grid.points, hand.end - hand.start);
  switch (hand.motionType) {
    case "pro":
    case "anti":
      return Math.abs(steps) === grid.shift ? steps : null;
    case "static":
      return steps === 0 ? 0 : null;
    case "dash":
      return grid.points % 2 === 0 && steps * 2 === grid.points ? steps : null;
    default:
      // Anything else, such as the app's float, gets no letter.
      return null;
  }
}

function pick(triple: Triple, blue: GridMotionType, red: GridMotionType): Letter {
  if (blue !== red) return triple[2];
  return blue === "pro" ? triple[0] : triple[1];
}

/**
 * Both hands travel the same way, so the spacing never changes. A B C and
 * G H I need the hands exactly opposite or exactly together; any other
 * spacing is S T, or U V split by the motion of the hand in front.
 */
function sameDirectionLetter(points: number, beat: GridBeat, rel: number, travel: number): Letter {
  const { blue, red } = beat;
  const place = landmarkAt(points, rel);
  if (place === "alpha") return pick(A_B_C, blue.motionType, red.motionType);
  if (place === "beta") return pick(G_H_I, blue.motionType, red.motionType);
  if (blue.motionType === red.motionType) return blue.motionType === "pro" ? Letter.S : Letter.T;
  // The leader is ahead in the direction of travel by the smaller arc.
  const redAhead = mod(rel, points);
  const redLeads = travel > 0 ? redAhead * 2 < points : redAhead * 2 > points;
  const leaderMotion = redLeads ? red.motionType : blue.motionType;
  return leaderMotion === "pro" ? Letter.U : Letter.V;
}

/**
 * The hands travel opposite ways (the landmark rule). D E F and J K L need a
 * landmark at an endpoint; otherwise the landmark passed mid-beat picks
 * M N O (alpha) or P Q R (beta). Reversing a beat in time therefore swaps D
 * with J and leaves M and P alone, on every grid.
 */
function oppositeDirectionLetter(points: number, beat: GridBeat, from: number, to: number): Letter | null {
  const { blue, red } = beat;
  const start = landmarkAt(points, from);
  const end = landmarkAt(points, to);
  if (start === "beta" || end === "alpha") return pick(D_E_F, blue.motionType, red.motionType);
  if (end === "beta" || start === "alpha") return pick(J_K_L, blue.motionType, red.motionType);
  // On the five LETTER_GRIDS a beat with no landmark at either end passes
  // exactly one. Another grid could pass none or two; those beats get no letter.
  const crossed = landmarksCrossed(points, from, to);
  if (crossed.size !== 1) return null;
  return pick(crossed.has("alpha") ? M_N_O : P_Q_R, blue.motionType, red.motionType);
}

/** One hand shifts while its partner holds still (Type 2) or dashes (Type 3). */
function shiftFamily(points: number, from: number, to: number): ShiftFamily {
  const reached = landmarksCrossed(points, from, to);
  const end = landmarkAt(points, to);
  if (end) reached.add(end);
  if (reached.has("alpha")) return REACHES_ALPHA;
  if (reached.has("beta")) return REACHES_BETA;
  const start = landmarkAt(points, from);
  if (start === "alpha") return NARROWS;
  if (start === "beta") return WIDENS;
  return spacingDegrees(points, to) < spacingDegrees(points, from) ? NARROWS : WIDENS;
}

interface Reading {
  readonly letter: Letter;
  /**
   * Relative angle, in steps, where the path that picks the letter starts. A
   * dashing partner counts where its dash ends. Numbering sorts variants by
   * the spacing of this angle.
   */
  readonly startRel: number;
}

function read(grid: LetterGrid, beat: GridBeat): Reading | null {
  const { points } = grid;
  const { blue, red } = beat;
  const blueSteps = handSteps(grid, blue);
  const redSteps = handSteps(grid, red);
  if (blueSteps === null || redSteps === null) return null;
  if (grid.mixed && mod(red.start - blue.start, 2) === 0) return null;

  const blueShifts = isShift(blue.motionType);
  const redShifts = isShift(red.motionType);

  if (blueShifts && redShifts) {
    const startRel = signedSteps(points, red.start - blue.start);
    if (blueSteps === redSteps) {
      return { letter: sameDirectionLetter(points, beat, startRel, blueSteps), startRel };
    }
    const letter = oppositeDirectionLetter(points, beat, startRel, startRel + redSteps - blueSteps);
    return letter === null ? null : { letter, startRel };
  }

  if (blueShifts || redShifts) {
    const [mover, moverSteps, partner] = blueShifts
      ? [blue, blueSteps, red]
      : [red, redSteps, blue];
    // A dashing partner is read as standing still where its dash ends.
    const startRel = signedSteps(points, partner.end - mover.start);
    const family = shiftFamily(points, startRel, startRel - moverSteps);
    const pair = partner.motionType === "dash" ? family.dash : family.static;
    return { letter: mover.motionType === "pro" ? pair[0] : pair[1], startRel };
  }

  return null;
}

/**
 * The Type 1 to 3 letter of a beat on this grid. Null for Types 4 to 6, for a
 * motion type the rule does not know (such as float) or that cannot make its
 * hand's move, and on a skewed frame for hands that start in the same family.
 */
export function letterOnGrid(grid: LetterGrid, beat: GridBeat): Letter | null {
  return read(grid, beat)?.letter ?? null;
}

/** Everything one hand can do from a point: hold, shift either way as pro or anti, and dash where a dash exists. */
function handMoves(grid: LetterGrid, start: number): GridHand[] {
  const to = (steps: number) => mod(start + steps, grid.points);
  const moves: GridHand[] = [{ motionType: "static", start, end: start }];
  for (const steps of [grid.shift, -grid.shift]) {
    moves.push({ motionType: "pro", start, end: to(steps) });
    moves.push({ motionType: "anti", start, end: to(steps) });
  }
  if (grid.points % 2 === 0) moves.push({ motionType: "dash", start, end: to(grid.points / 2) });
  return moves;
}

/** Every beat on the grid, Types 1 to 6, blue start first. */
export function* gridBeats(grid: LetterGrid): Generator<GridBeat> {
  for (let blueStart = 0; blueStart < grid.points; blueStart++) {
    for (let redStart = 0; redStart < grid.points; redStart++) {
      if (grid.mixed && mod(redStart - blueStart, 2) === 0) continue;
      for (const blue of handMoves(grid, blueStart)) {
        for (const red of handMoves(grid, redStart)) yield { blue, red };
      }
    }
  }
}

const spacingsByGrid = new WeakMap<LetterGrid, ReadonlyMap<Letter, readonly number[]>>();

/**
 * Every start spacing (degrees, narrowest first) at which each Type 1 to 3
 * letter occurs on the grid. A letter with more than one is numbered. A Type 3
 * spacing is read the way the letter is, with the dashing hand where its dash
 * ends, so it can differ from where the hands start: Θ1- on the skewed
 * pentagrid reads 0 degrees, the start of the plain pentagrid's Θ1, although
 * its hands start 180 apart.
 */
export function letterStartSpacings(grid: LetterGrid): ReadonlyMap<Letter, readonly number[]> {
  const known = spacingsByGrid.get(grid);
  if (known) return known;
  const found = new Map<Letter, Set<number>>();
  for (const beat of gridBeats(grid)) {
    const reading = read(grid, beat);
    if (!reading) continue;
    const spacings = found.get(reading.letter) ?? new Set<number>();
    spacings.add(spacingDegrees(grid.points, reading.startRel));
    found.set(reading.letter, spacings);
  }
  const sorted = new Map(
    [...found].map(([letter, spacings]) => [letter, [...spacings].sort((a, b) => a - b)] as const)
  );
  spacingsByGrid.set(grid, sorted);
  return sorted;
}

/**
 * The letter with its variant number, where the grid has that letter at more
 * than one start spacing: S1 at 72 degrees and S2 at 144 on the pentagrid,
 * narrowest first. A dash letter takes the number before the dash (Θ1-), with
 * its spacing read as letterStartSpacings reads it. Letters that occur at a
 * single spacing come back plain. Null where letterOnGrid is null.
 */
export function letterLabelOnGrid(grid: LetterGrid, beat: GridBeat): string | null {
  const reading = read(grid, beat);
  if (!reading) return null;
  const spacings = letterStartSpacings(grid).get(reading.letter) ?? [];
  if (spacings.length < 2) return reading.letter;
  const number = spacings.indexOf(spacingDegrees(grid.points, reading.startRel)) + 1;
  return reading.letter.endsWith("-")
    ? `${reading.letter.slice(0, -1)}${number}-`
    : `${reading.letter}${number}`;
}
