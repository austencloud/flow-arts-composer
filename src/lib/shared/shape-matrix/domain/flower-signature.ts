import { TURN_VALUES } from "#lib/features/choreo-card/domain/turn-pattern-parser.js";
import type { TurnValue } from "#lib/shared/create/services/level-turn-values.js";
import { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

export type FlowerStyle = "pro" | "anti";
export type ShapePathStyle = FlowerStyle | "float";
export type RotatingFlowerOri = "in" | "out";
export type FloatFlowerOri = RotatingFlowerOri | "clock" | "counter";
export type FlowerOri = FloatFlowerOri;
/** Anchor of the downbeat: diamond = cardinal, box = 45°-rotated interradial. */
export type FlowerGrid = "diamond" | "box";

export interface RotatingFlower {
  readonly style: FlowerStyle;
  readonly turns: number;
  readonly ori: RotatingFlowerOri;
  readonly grid: FlowerGrid;
  readonly petals: number;
}

export interface FloatFlower {
  readonly style: "float";
  readonly turns: "fl";
  readonly ori: FloatFlowerOri;
  readonly grid: "diamond";
  readonly petals: 0;
}

export type Flower = RotatingFlower | FloatFlower;

const ROTATING_ORIS: RotatingFlowerOri[] = ["in", "out"];
const FLOAT_ORIS: FloatFlowerOri[] = ["in", "out", "clock", "counter"];
const STYLES: FlowerStyle[] = ["pro", "anti"];
const GRIDS: FlowerGrid[] = ["diamond", "box"];

/**
 * Box mode rotates the whole flower 45°. That rotation lands back on the
 * diamond placement only when the petal star is 45°-symmetric, i.e. petals
 * divisible by 8 (the 0-petal static point and the 8-petal antispin). For
 * those, box ≡ diamond — a duplicate worth collapsing.
 */
export function gridIsRedundant(f: Pick<Flower, "petals" | "grid">): boolean {
  return f.grid === "box" && f.petals % 8 === 0;
}

function reducedSpinRatio(turns: number): {
  numerator: number;
  denominator: 1 | 2;
} {
  const doubledNumerator = Math.round((2 * turns + 1) * 2);
  return doubledNumerator % 2 === 0
    ? { numerator: doubledNumerator / 2, denominator: 1 }
    : { numerator: doubledNumerator, denominator: 2 };
}

/** Closed flower petals are the reduced ratio's numerator ∓ denominator. */
export function flowerPetals(
  f: Pick<RotatingFlower, "style" | "turns">
): number {
  const ratio = reducedSpinRatio(f.turns);
  return f.style === "pro"
    ? Math.abs(ratio.numerator - ratio.denominator)
    : ratio.numerator + ratio.denominator;
}

/**
 * Resolve the public in/out phase selector to the prop's actual start
 * orientation. A denominator-two flower needs two hand-path cycles to close;
 * IN and OUT therefore start on opposite halves of the same completed locus.
 * CLOCK supplies the complementary 90° phase for the second visible variant.
 */
export function flowerStartOrientation(
  f: Pick<Flower, "turns" | "ori">
): Orientation {
  if (f.turns === "fl") {
    const orientationByName: Record<FloatFlowerOri, Orientation> = {
      in: Orientation.IN,
      out: Orientation.OUT,
      clock: Orientation.CLOCK,
      counter: Orientation.COUNTER,
    };
    return orientationByName[f.ori];
  }
  if (reducedSpinRatio(f.turns).denominator === 2) {
    return f.ori === "in" ? Orientation.IN : Orientation.CLOCK;
  }
  return f.ori === "in" ? Orientation.IN : Orientation.OUT;
}

/** Deck-compatible turn token: integers bare, halves as X.5 (matches formatTurn). */
function fmtTurn(v: TurnValue): string {
  if (v === "fl") return v;
  return Number.isInteger(v) ? String(v) : String(v);
}

/** Uniform per-hand turn pattern string, e.g. "0.5|0.5". */
export function flowerTurnPattern(f: Pick<Flower, "turns">): string {
  const t = fmtTurn(f.turns);
  return `${t}|${t}`;
}

export function flowerKey(
  f: Pick<Flower, "style" | "turns" | "ori" | "grid">
): string {
  return `${f.style}-${fmtTurn(f.turns)}-${f.ori}-${f.grid}`;
}

/**
 * VTG spin ratio for a TKA turn value, displayed in SpiroAnim's order:
 * hand cycles first, prop rotations second. The style sets the petal count,
 * so the left/right style is still read from the axis itself.
 */
export function ratioLabel(turns: TurnValue): string {
  if (turns === "fl") return "1:0";
  const ratio = reducedSpinRatio(turns);
  return `${ratio.denominator}:${ratio.numerator}`;
}

/**
 * Verified VTG display for a two-axis hybrid. VTG primary sources establish
 * each ratio, but not a community-standard double-colon contraction. Keeping
 * both ratios explicit makes the axes unambiguous.
 */
export function hybridRatioLabel(
  leftTurns: TurnValue,
  rightTurns: TurnValue
): string {
  return leftTurns === rightTurns
    ? ratioLabel(leftTurns)
    : `Left ${ratioLabel(leftTurns)} × Right ${ratioLabel(rightTurns)}`;
}

export function flowerLabel(f: Flower): string {
  if (f.style === "float")
    return `${ratioLabel(f.turns)} ${f.ori} diamond · 0p`;
  return `${ratioLabel(f.turns)} ${f.ori} ${f.grid} · ${f.petals}p`;
}

/**
 * The 56-flower axis (2 styles × 7 turns × 2 orientations × 2 grid anchors),
 * ordered by TURNS ascending with pro/anti alternating inside each turn step:
 * pro(in,out) then anti(in,out) at 0 turns, then the same at 0.5, 1, … This
 * makes complexity climb in one direction along the axis instead of restarting
 * simple→complex per style, which left a discontinuity seam mid-grid.
 * Tie-break: pro before anti, in before out, diamond before its 45° box twin.
 */
export function buildFlowerAxis(
  turnValues: readonly number[] = TURN_VALUES
): RotatingFlower[] {
  const out: RotatingFlower[] = [];
  for (const turns of turnValues)
    for (const style of STYLES)
      for (const ori of ROTATING_ORIS)
        for (const grid of GRIDS)
          out.push({
            style,
            turns,
            ori,
            grid,
            petals: flowerPetals({ style, turns }),
          });
  const styleRank = (s: FlowerStyle) => (s === "pro" ? 0 : 1);
  const oriRank = (o: RotatingFlowerOri) => (o === "in" ? 0 : 1);
  const gridRank = (g: FlowerGrid) => (g === "diamond" ? 0 : 1);
  return out.sort(
    (a, b) =>
      a.turns - b.turns ||
      styleRank(a.style) - styleRank(b.style) ||
      oriRank(a.ori) - oriRank(b.ori) ||
      gridRank(a.grid) - gridRank(b.grid)
  );
}

/** Float has no pro/anti direction, but all four absolute starts are distinct. */
export function buildFloatAxis(): FloatFlower[] {
  return FLOAT_ORIS.map((ori) => ({
    style: "float",
    turns: "fl",
    ori,
    grid: "diamond",
    petals: 0,
  }));
}

export function buildShapeMatrixAxis(): Flower[] {
  return [
    ...buildFlowerAxis([
      -0.25, 0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3,
    ]),
    ...buildFloatAxis(),
  ];
}
