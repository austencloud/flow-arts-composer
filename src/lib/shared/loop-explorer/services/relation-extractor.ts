/**
 * Loop Explorer — Relation Extraction
 *
 * Exposes the engine's canonical pair-relation algebra
 * (`@tka/sequence-engine/loop` → `relationsForPair`) as
 * `{ stepA, stepB, transform }[]` for a generated sequence, so the
 * explanation pane can cite concrete step pairs ("step 9 = step 1 rotated
 * 180°") without re-deriving the transform algebra app-side. Same detector
 * `LOOPDetector` (`shared/create/services/loop-detector.ts`) delegates to for
 * whole-sequence classification — this module surfaces its PER-PAIR
 * evidence instead of just the aggregate verdict.
 */

import type { StepLike } from "#lib/shared/foundation/domain/models/step-like.js";
import { isVisibleMotion } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { relationsForPair } from "@tka/sequence-engine/loop";
import type { PairComponentId, PairMotion, PairMotions, PairRelation, RotationAngle } from "@tka/sequence-engine/loop";
import type { LoopSlice } from "#lib/shared/loop-explorer/domain/legality.js";

export interface StepPairRelation {
  /** 1-based step index (first occurrence). */
  readonly stepA: number;
  /** 1-based step index (the step that restates stepA transformed). */
  readonly stepB: number;
  /** Sorted primitive ids; empty array means stepB literally repeats stepA. */
  readonly transform: readonly PairComponentId[];
  /** Present when the transform includes a rotation. */
  readonly rotation?: RotationAngle;
}

/** Interval (in steps) between a citation pair, given the sequence length + slice. */
export function defaultInterval(totalSteps: number, slice: LoopSlice): number {
  if (totalSteps < 2) return 0;
  return slice === "quartered" ? Math.floor(totalSteps / 4) : Math.floor(totalSteps / 2);
}

/**
 * Extract per-step-pair relation citations at the given interval.
 * Pairs (i, i+interval) for i in [0, interval) — the same window
 * `uniformRelationAtInterval` scans for the aggregate verdict, surfaced here
 * per-pair for citation text. Ambiguous pairs (multiple hypotheses tie) are
 * resolved with the same simplest-explanation priority the engine detector
 * uses: fewest components, then no-invert, then no-swap.
 */
export function extractPairRelations(
  steps: readonly StepLike[],
  interval: number
): StepPairRelation[] {
  if (interval <= 0 || interval >= steps.length) return [];

  const motions = steps.map(toPairMotions);
  const relations: StepPairRelation[] = [];

  for (let i = 0; i + interval < steps.length; i++) {
    const a = motions[i];
    const b = motions[i + interval];
    if (!a || !b) continue;

    const candidates = relationsForPair(a, b);
    const best = pickSimplest(candidates);
    relations.push({
      stepA: i + 1,
      stepB: i + interval + 1,
      transform: best?.components ?? [],
      rotation: best?.rotation,
    });
  }

  return relations;
}

/** Simplest-explanation tie-break: fewest components, then no-invert, then no-swap. */
function pickSimplest(candidates: readonly PairRelation[]): PairRelation | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((x, y) => {
    if (x.priority !== y.priority) return x.priority - y.priority;
    const xi = x.components.includes("inverted") ? 1 : 0;
    const yi = y.components.includes("inverted") ? 1 : 0;
    if (xi !== yi) return xi - yi;
    const xs = x.components.includes("swapped") ? 1 : 0;
    const ys = y.components.includes("swapped") ? 1 : 0;
    return xs - ys;
  });
  return sorted[0] ?? null;
}

function toPairMotion(motion: StepLike["motions"]["left"]): PairMotion {
  if (!motion || !isVisibleMotion(motion)) {
    return { startLocation: "", endLocation: "", motionType: "" };
  }
  return {
    startLocation: String(motion.startLocation ?? ""),
    endLocation: String(motion.endLocation ?? ""),
    motionType: String(motion.motionType ?? ""),
  };
}

function toPairMotions(step: StepLike): PairMotions {
  return {
    left: toPairMotion(step.motions?.left),
    right: toPairMotion(step.motions?.right),
  };
}
