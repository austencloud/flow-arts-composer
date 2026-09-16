/**
 * Shared-grid preflight — can two fingertips actually trace this round on ONE grid?
 *
 * The trace game defaults to a split grid (one grid per hand) for a physical
 * reason: TKA routes are written for two hands moving through the same space,
 * and a lot of perfectly legal sequences put both hands on the same point at
 * the same moment. Two fingertips cannot occupy one spot. Beta placements do
 * exactly that by definition, so this check fires often — that is the correct
 * outcome, not a bug to tune away.
 *
 * The one thing this function must never do is move a target off its canonical
 * grid location to make an impossible round look possible. A round that cannot
 * be traced on a shared grid gets reported as such and rendered on split grids.
 * Lying about where a point lives would teach the wrong grid.
 *
 * Timing matters: two routes that cross at DIFFERENT beats are fine, because
 * the fingers are never on the crossing at the same time. Only routes that
 * overlap WITHIN one synchronized beat are rejected, so comparisons are always
 * scoped to a single beat.
 */

import type {
  NormalizedPoint,
  TraceHand,
  TraceSegment,
} from "../domain/trace-types";
import { arcLengthResample, sampleSegmentPath } from "./trace-path-sampler";
import type { TraceRoundGeometry } from "./trace-evaluator";

export interface SharedGridConfig {
  /**
   * Radius of a fingertip's contact patch, as a fraction of the stage's
   * shorter side. Two fingers need twice this before they even touch.
   */
  readonly touchContactRadius: number;
  /** Breathing room on top of bare contact, so near-misses still feel playable. */
  readonly separationMargin: number;
  /** How finely each corridor is sampled before the comparison. */
  readonly corridorSamples: number;
}

export const DEFAULT_SHARED_GRID_CONFIG: SharedGridConfig = {
  // A fingertip contact patch is roughly 8-10mm across (the same physical fact
  // behind TRACE_MIN_TOUCH_TOLERANCE_MM in trace-config), which is about 3.5%
  // of a stage that fills a phone screen. Normalized rather than physical
  // because a round either works on a shared grid or it does not — that answer
  // should not flip between a phone and a monitor.
  touchContactRadius: 0.035,
  separationMargin: 0.02,
  corridorSamples: 17,
};

export interface SharedGridPreflightResult {
  readonly passes: boolean;
  /** Present only on failure; a plain statement of which beat and by how much. */
  readonly reason?: string;
  /** Closest the two corridors ever come, within any single beat. */
  readonly worstSeparation: number;
}

/** Nothing on a unit stage can be farther apart than its diagonal. */
const STAGE_DIAGONAL = Math.SQRT2;

function corridorFor(
  segment: TraceSegment,
  samples: number
): NormalizedPoint[] {
  // A hold is a corridor of one point — the place the finger has to occupy for
  // the whole beat, which is exactly what the other hand has to stay clear of.
  if (segment.kind === "hold") {
    return arcLengthResample(
      [sampleSegmentPath(segment.location, segment.location, 1)[0]!],
      samples
    );
  }
  // Resample by arc length so both hands are compared at evenly spaced points
  // regardless of how long their individual routes are.
  const path =
    segment.expectedPath.length >= 2
      ? segment.expectedPath
      : sampleSegmentPath(segment.start, segment.end);
  return arcLengthResample(path, samples);
}

function closestApproach(
  a: readonly NormalizedPoint[],
  b: readonly NormalizedPoint[]
): number {
  let best = Number.POSITIVE_INFINITY;
  // All-pairs rather than parameter-aligned: two fingers tangling anywhere
  // inside a beat is a problem even if they would not have collided at the
  // exact same instant. Corridors are ~17 points, so this stays trivial.
  for (const p of a) {
    for (const q of b) {
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < best) best = d;
    }
  }
  return best;
}

export function sharedGridPreflight(
  round: TraceRoundGeometry,
  config: SharedGridConfig = DEFAULT_SHARED_GRID_CONFIG
): SharedGridPreflightResult {
  const required = 2 * config.touchContactRadius + config.separationMargin;

  let worstSeparation = STAGE_DIAGONAL;
  let worstBeat = -1;

  for (let beatIndex = 0; beatIndex < round.beats.length; beatIndex++) {
    const segments = round.beats[beatIndex]!.segments;
    const hands = (Object.keys(segments) as TraceHand[]).filter(
      (hand) => segments[hand]
    );
    if (hands.length < 2) continue;

    const corridors = hands.map((hand) =>
      corridorFor(segments[hand]!, config.corridorSamples)
    );

    for (let i = 0; i < corridors.length; i++) {
      for (let j = i + 1; j < corridors.length; j++) {
        const separation = closestApproach(corridors[i]!, corridors[j]!);
        if (separation < worstSeparation) {
          worstSeparation = separation;
          worstBeat = beatIndex;
        }
      }
    }
  }

  if (worstSeparation >= required) {
    return { passes: true, worstSeparation };
  }

  const reason =
    worstSeparation === 0
      ? `Beat ${worstBeat + 1}: both hands are on the same point at the same time. Two fingertips cannot share it, so this round needs split grids.`
      : `Beat ${worstBeat + 1}: the two routes come within ${worstSeparation.toFixed(3)} of the stage, and fingertips need ${required.toFixed(3)}. This round needs split grids.`;

  return { passes: false, reason, worstSeparation };
}
