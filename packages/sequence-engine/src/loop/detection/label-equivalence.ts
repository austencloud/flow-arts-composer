/**
 * When one step pair satisfies two LOOP labels at once.
 *
 * Some seeds are symmetric between the hands. Every diamond A and B puts the
 * right hand on the left hand's path turned 180° (DiamondPictographDataframe
 * rows: A n>e with s>w), every D, E, J and K mirrors it across the axis
 * through the point the hands share (D n>e with n>w), and every P and Q
 * mirrors it across a diagonal (P e>n with n>e). For those seeds, exchanging
 * the hands lands every hand on the same location path as rotating or
 * reflecting them, with the same motion type, so the pair-relation algebra
 * finds both hypotheses for each pair. Both labels are true of the sequence;
 * the detector just prefers the positional one (see the tie-break in
 * uniformRelationAtInterval).
 *
 * This module answers that question directly, on the same algebra, so callers
 * that asked for one label can accept a detector that reports an equivalent
 * one instead of rejecting a correct build.
 */

import type { ReflectionAxis } from "../placement-maps/strict-loop-placement-maps.js";
import {
  relationsForPair,
  type PairComponentId,
  type PairMotions,
  type PairRelation,
  type RotationAngle,
} from "./pair-relation.js";

/**
 * A LOOP label as the algebra reads it. Empty components means the halves
 * repeat. Mirrored and flipped are both reflections; give `reflectionAxis` to
 * pin which one, and `rotation` to pin the angle.
 */
export interface PairLabel {
  components: readonly PairComponentId[];
  reflectionAxis?: ReflectionAxis;
  rotation?: RotationAngle;
}

/** Mirrored and flipped differ only by axis, which the label pins separately. */
function canonicalComponents(components: readonly PairComponentId[]): string[] {
  const out = new Set<string>();
  for (const c of components) {
    if (c === "repeated") continue;
    out.add(c === "flipped" ? "mirrored" : c);
  }
  return [...out].sort();
}

function relationMatchesLabel(
  relation: PairRelation,
  label: PairLabel
): boolean {
  const have = canonicalComponents(relation.components);
  const want = canonicalComponents(label.components);
  if (have.length !== want.length || have.some((c, i) => c !== want[i])) {
    return false;
  }
  if (
    label.reflectionAxis &&
    relation.reflectionAxis !== label.reflectionAxis
  ) {
    return false;
  }
  if (label.rotation && relation.rotation !== label.rotation) return false;
  return true;
}

/** Does `label` exactly explain how pair member `a` maps onto `b`? */
export function labelExplainsPair(
  a: PairMotions,
  b: PairMotions,
  label: PairLabel
): boolean {
  return relationsForPair(a, b).some((r) => relationMatchesLabel(r, label));
}

/**
 * Are labels `x` and `y` equivalent for this pair: does each one, on its own,
 * exactly explain how `a` maps onto `b`?
 */
export function labelsEquivalentForPair(
  a: PairMotions,
  b: PairMotions,
  x: PairLabel,
  y: PairLabel
): boolean {
  const relations = relationsForPair(a, b);
  return (
    relations.some((r) => relationMatchesLabel(r, x)) &&
    relations.some((r) => relationMatchesLabel(r, y))
  );
}

/**
 * The same question across a whole halved LOOP: every pair (i, i + n/2)
 * satisfies both labels. Pass the steps the detector reads (start placement
 * excluded, repeated skeleton reduced; see loopSignalSteps in LOOPDetector).
 */
export function labelsEquivalentForHalves(
  steps: readonly PairMotions[],
  x: PairLabel,
  y: PairLabel
): boolean {
  const n = steps.length;
  if (n < 2 || n % 2 !== 0) return false;
  const half = n / 2;
  for (let i = 0; i < half; i++) {
    if (!labelsEquivalentForPair(steps[i]!, steps[i + half]!, x, y)) {
      return false;
    }
  }
  return true;
}
