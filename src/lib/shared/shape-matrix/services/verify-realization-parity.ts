import { calculate as calculateMandalaGeometry } from "$lib/shared/mandala/services/mandala-geometry-calculator";
import { applyVariationDescriptor } from "$lib/features/choreo-card/services/deck-variation";
import { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { CsvEdge } from "$lib/features/choreo-card/services/pictograph-letter-lookup";
import type { SVGPathData } from "$lib/shared/mandala/domain/mandala-types";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { ShapeMatrixTipPair } from "../domain/prop-pair";
import {
  flowerStartOrientation,
  flowerTurnPattern,
  type Flower,
} from "../domain/flower-signature";
import { closeSequenceOrientationCycle } from "$lib/shared/create/services/sequence-orientation-cycle";

/**
 * Geometric parity check between a cell's overlay mandala and a mode's
 * realization. The overlay is a canonical blue-hand locus (south-anchored) for
 * each flower; a real two-hand realization starts its hands at the base word's
 * own grid positions, so a hand can trace the RIGHT flower at the WRONG rotation
 * (Austen: "rotated variations of the red pathway due to the orientation we
 * started"). The fix is per-hand start orientation. This module measures the
 * mismatch and SEARCHES the orientation space for the pair that reproduces the
 * overlay — pure geometry (calculateMandalaGeometry has no DOM/auth dep), so it
 * runs headlessly and self-corrects each card instead of hand-marking.
 */

interface Pt {
  x: number;
  y: number;
}

const CARDINAL_ORIENTATIONS: readonly Orientation[] = [
  Orientation.IN,
  Orientation.CLOCK,
  Orientation.OUT,
  Orientation.COUNTER,
];

const LEVEL_FOUR_ORIENTATIONS: readonly Orientation[] = [
  Orientation.IN,
  Orientation.CLOCK_IN,
  Orientation.CLOCK,
  Orientation.CLOCK_OUT,
  Orientation.OUT,
  Orientation.COUNTER_OUT,
  Orientation.COUNTER,
  Orientation.COUNTER_IN,
];

/** Serialized control-point tolerance used by the live phase solver. */
export const MATCH_EPS = 8.0;

/**
 * On-curve tip points of a mandala path set. `pointsToSVGPath` emits
 * `M x0 y0 C _ _ _ _ x1 y1 C …` — the sampled points are the M point plus each
 * cubic's endpoint (the last pair of every 6-number C group).
 */
export function pathPoints(paths: SVGPathData[]): Pt[] {
  const pts: Pt[] = [];
  for (const p of paths) {
    // tolerate exponent form (e.g. 6.12e-15) so a non-toFixed producer can't
    // split one coordinate into two tokens and shift the whole parse.
    const nums = (p.d.match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g) ?? []).map(
      Number
    );
    if (nums.length < 2) continue;
    pts.push({ x: nums[0]!, y: nums[1]! });
    for (let i = 2; i + 6 <= nums.length; i += 6) {
      pts.push({ x: nums[i + 4]!, y: nums[i + 5]! });
    }
  }
  return pts;
}

/**
 * Distance between two CLOSED loops: min over cyclic phase shift and traversal
 * reversal of the worst per-point gap. Invariant to where sampling starts and to
 * traversal direction (both trace the same locus) but NOT to spatial rotation —
 * a rotated copy scores far above MATCH_EPS, which is exactly the defect we want
 * to catch. Returns Infinity for empty or open loops, and for sample counts
 * that are not whole laps of each other.
 */
/** Drop a sample that repeats its predecessor; lap joints serialize one. */
function dedupeConsecutive(points: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const point of points) {
    const prev = out.at(-1);
    if (prev && Math.hypot(prev.x - point.x, prev.y - point.y) < 1e-6) continue;
    out.push(point);
  }
  return out;
}

export function loopDistance(a: Pt[], b: Pt[]): number {
  if (!a.length || !b.length) return Infinity;
  const aClosed =
    Math.hypot(a[0]!.x - a.at(-1)!.x, a[0]!.y - a.at(-1)!.y) <= MATCH_EPS;
  const bClosed =
    Math.hypot(b[0]!.x - b.at(-1)!.x, b[0]!.y - b.at(-1)!.y) <= MATCH_EPS;
  if (!aClosed || !bClosed) return Infinity;

  // The path serializer repeats the first point at the end. Removing that
  // duplicate restores a true cyclic sample set, so a different starting
  // phase or traversal direction can still compare point-for-point.
  const aLoop = dedupeConsecutive(a.slice(0, -1));
  const bLoop = dedupeConsecutive(b.slice(0, -1));
  if (aLoop.length !== bLoop.length) {
    // A hand whose orientation cycle is longer than its position cycle
    // traces its locus more than once before the sequence closes: a whole
    // or half-turn hand paired with a quarter-turn hand closes on the
    // eight-step wheel and draws its four-step flower twice. The picture is
    // the same locus, so compare it lap by lap instead of refusing it.
    const [short, long] =
      aLoop.length < bLoop.length ? [aLoop, bLoop] : [bLoop, aLoop];
    if (long.length % short.length !== 0) return Infinity;
    const laps = long.length / short.length;
    let worst = 0;
    for (let lap = 0; lap < laps; lap += 1) {
      const chunk = long.slice(lap * short.length, (lap + 1) * short.length);
      const distance = loopDistance(
        [...short, short[0]!],
        [...chunk, chunk[0]!]
      );
      if (distance > worst) worst = distance;
      if (worst > MATCH_EPS) return worst;
    }
    return worst;
  }
  const n = aLoop.length;
  let best = Infinity;
  for (const bv of [bLoop, [...bLoop].reverse()]) {
    for (let s = 0; s < n; s++) {
      let mx = 0;
      for (let i = 0; i < n && mx < best; i++) {
        const p = aLoop[i]!;
        const q = bv[(i + s) % n]!;
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d > mx) mx = d;
      }
      if (mx < best) best = mx;
    }
  }
  return best;
}

function gridModeOf(pair: { left: Flower; right: Flower }): "diamond" | "box" {
  // One pictograph = one grid mode; a mixed-grid off-diagonal cell has no single
  // realizable pictograph, so render it in diamond (matches build-realization-cards).
  return pair.left.grid === pair.right.grid ? pair.left.grid : "diamond";
}

function usesQuarterTurns(flower: Flower): boolean {
  if (flower.turns === "fl") return false;
  const quarterSteps = Math.round(flower.turns * 4);
  return quarterSteps % 2 !== 0;
}

/** Quarter-turn flowers can begin anywhere on the Level 4 orientation wheel.
 *  Earlier bands stay on cardinal starts, matching the orientations those
 *  levels actually teach and preventing an exact-looking result from quietly
 *  introducing Level 4 state. */
export function flowerPhaseOrientations(pair: {
  left: Flower;
  right: Flower;
}): readonly Orientation[] {
  return usesQuarterTurns(pair.left) || usesQuarterTurns(pair.right)
    ? LEVEL_FOUR_ORIENTATIONS
    : CARDINAL_ORIENTATIONS;
}

/** Build a realization at a candidate orientation pair and compute its loci. */
function realize(
  base: SequenceData,
  pair: { left: Flower; right: Flower },
  leftOri: Orientation,
  rightOri: Orientation,
  edges: CsvEdge[],
  tips: ShapeMatrixTipPair
): { sequence: SequenceData; left: SVGPathData[]; right: SVGPathData[] } {
  const leftTurn = flowerTurnPattern(pair.left).split("|")[0];
  const rightTurn = flowerTurnPattern(pair.right).split("|")[0];
  const { sequence } = applyVariationDescriptor(
    base,
    {
      turnPattern: `${leftTurn}|${rightTurn}`,
      turnLabel: "verify",
      gridMode: gridModeOf(pair),
      startOriPair: { left: leftOri, right: rightOri },
    },
    edges
  );
  const closedSequence = closeSequenceOrientationCycle(sequence);
  // Each hand follows its own prop's tracked source, so a staff beside a fan
  // is compared against the loci those two props actually trace.
  const paths = calculateMandalaGeometry(
    closedSequence.steps,
    undefined,
    undefined,
    { tipEnds: 1, pathShape: "arc" },
    { left: [tips.left], right: [tips.right] }
  );
  return { sequence: closedSequence, left: paths.left, right: paths.right };
}

export interface ParityResult {
  /** Orientation chosen for each hand to best reproduce the overlay. */
  leftOri: Orientation;
  rightOri: Orientation;
  /** Loop distance of each corrected hand to the overlay (≤ MATCH_EPS = exact). */
  leftDist: number;
  rightDist: number;
  /** Both hands reproduce the overlay within tolerance. */
  matched: boolean;
  /** The corrected realization sequence (use this for the card + animation). */
  sequence: SequenceData;
}

export interface ExactParityResult extends ParityResult {
  matched: true;
  /** Distance around the Level 4 wheel from the cell's displayed phase. */
  phaseDistance: number;
}

function orientationDistance(from: Orientation, to: Orientation): number {
  const fromIndex = LEVEL_FOUR_ORIENTATIONS.indexOf(from);
  const toIndex = LEVEL_FOUR_ORIENTATIONS.indexOf(to);
  if (fromIndex < 0 || toIndex < 0) return LEVEL_FOUR_ORIENTATIONS.length;
  const raw = Math.abs(fromIndex - toIndex);
  return Math.min(raw, LEVEL_FOUR_ORIENTATIONS.length - raw);
}

/**
 * Return every start-orientation pair that reproduces both clicked flowers.
 * Each hand's locus is independent, so the expensive geometry search is eight
 * blue builds plus eight red builds rather than all 64 pairs. Only the small
 * exact cross-product is rebuilt into complete two-hand sequences.
 */
export function findExactParityCandidates(
  base: SequenceData,
  pair: { left: Flower; right: Flower },
  overlayLeft: SVGPathData[],
  overlayRight: SVGPathData[],
  edges: CsvEdge[],
  tips: ShapeMatrixTipPair
): ExactParityResult[] {
  const ob = pathPoints(overlayLeft);
  const or = pathPoints(overlayRight);
  const defaultLeft = flowerStartOrientation(pair.left);
  const defaultRight = flowerStartOrientation(pair.right);
  const orientations = flowerPhaseOrientations(pair);
  const leftMatches: Array<{ orientation: Orientation; distance: number }> = [];
  const rightMatches: Array<{ orientation: Orientation; distance: number }> =
    [];

  for (const orientation of orientations) {
    const distance = loopDistance(
      ob,
      pathPoints(
        realize(base, pair, orientation, defaultRight, edges, tips).left
      )
    );
    if (distance <= MATCH_EPS) {
      leftMatches.push({ orientation, distance });
    }
  }

  for (const orientation of orientations) {
    const distance = loopDistance(
      or,
      pathPoints(
        realize(base, pair, defaultLeft, orientation, edges, tips).right
      )
    );
    if (distance <= MATCH_EPS) {
      rightMatches.push({ orientation, distance });
    }
  }

  const exact: ExactParityResult[] = [];
  for (const left of leftMatches) {
    for (const right of rightMatches) {
      exact.push({
        leftOri: left.orientation,
        rightOri: right.orientation,
        leftDist: left.distance,
        rightDist: right.distance,
        matched: true,
        phaseDistance:
          orientationDistance(defaultLeft, left.orientation) +
          orientationDistance(defaultRight, right.orientation),
        sequence: realize(
          base,
          pair,
          left.orientation,
          right.orientation,
          edges,
          tips
        ).sequence,
      });
    }
  }

  return exact.sort(
    (left, right) =>
      left.phaseDistance - right.phaseDistance ||
      left.leftDist + left.rightDist - (right.leftDist + right.rightDist)
  );
}

/**
 * Find the per-hand start orientation that makes a mode's realization reproduce
 * the cell overlay, and return the corrected sequence + a parity verdict. A
 * hand's locus depends only on its own start orientation, so the two hands are
 * searched independently (4 + 4 builds, not 16). When no orientation reaches
 * MATCH_EPS the closest is returned with `matched = false` so the UI can flag it
 * rather than silently show a wrong card.
 */
export function verifyAndCorrect(
  base: SequenceData,
  pair: { left: Flower; right: Flower },
  overlayLeft: SVGPathData[],
  overlayRight: SVGPathData[],
  edges: CsvEdge[],
  tips: ShapeMatrixTipPair
): ParityResult {
  const ob = pathPoints(overlayLeft);
  const or = pathPoints(overlayRight);
  const defLeft = flowerStartOrientation(pair.left);
  const defRight = flowerStartOrientation(pair.right);

  let bestLeft = defLeft;
  let leftDist = Infinity;
  for (const o of flowerPhaseOrientations(pair)) {
    const d = loopDistance(
      ob,
      pathPoints(realize(base, pair, o, defRight, edges, tips).left)
    );
    if (d < leftDist) {
      leftDist = d;
      bestLeft = o;
    }
  }

  let bestRight = defRight;
  let rightDist = Infinity;
  for (const o of flowerPhaseOrientations(pair)) {
    const d = loopDistance(
      or,
      pathPoints(realize(base, pair, bestLeft, o, edges, tips).right)
    );
    if (d < rightDist) {
      rightDist = d;
      bestRight = o;
    }
  }

  const final = realize(base, pair, bestLeft, bestRight, edges, tips);
  return {
    leftOri: bestLeft,
    rightOri: bestRight,
    leftDist,
    rightDist,
    matched: leftDist <= MATCH_EPS && rightDist <= MATCH_EPS,
    sequence: final.sequence,
  };
}
