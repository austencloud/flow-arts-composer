/**
 * Differential comparison between the app-side LOOP executors and the
 * canonical `@tka/sequence-engine` spec executor.
 *
 * Both sides are driven with byte-identical seeds (see `canonical-fixtures`)
 * and both mutate their input in place, so every run clones first.
 *
 * The comparison deliberately separates two classes of difference:
 *
 *   SEMANTIC — what the props actually do. Grid positions, hand locations,
 *   motion types, rotation directions, turns and orientations. A difference
 *   here is a real behavioral divergence: the two paths would put the
 *   performer's hands in different places.
 *
 *   REPRESENTATION — bookkeeping that the surrounding pipeline overwrites or
 *   derives. Step `id`, the pre-derivation `letter` (both `SequenceBuilder`
 *   and `SequenceExtender` re-derive every derived step's letter from its own
 *   motions immediately after execution), and the stored reversal flags
 *   (derived on read via `deriveReversals`). These differences are expected
 *   and are reported, not asserted on.
 */

import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

export type StepSide = "left" | "right";

const SEMANTIC_MOTION_FIELDS = [
  "motionType",
  "startLocation",
  "endLocation",
  "rotationDirection",
  "turns",
  "startOrientation",
  "endOrientation",
  "prefloatMotionType",
  "prefloatRotationDirection",
] as const;

export interface FieldDifference {
  readonly stepIndex: number;
  readonly field: string;
  readonly app: unknown;
  readonly engine: unknown;
}

export interface ParityComparison {
  /** Output length in steps, including the start-position step. */
  readonly appLength: number;
  readonly engineLength: number;
  readonly lengthMatches: boolean;
  /** Behavioral differences over the overlapping prefix. */
  readonly semantic: FieldDifference[];
  /** Bookkeeping differences over the overlapping prefix. */
  readonly representation: FieldDifference[];
}

/** Normalize a value for comparison: `undefined` and `null` are one absence. */
function norm(value: unknown): unknown {
  return value === undefined ? null : value;
}

export function compareOutputs(
  app: StepData[],
  engine: StepData[]
): ParityComparison {
  const semantic: FieldDifference[] = [];
  const representation: FieldDifference[] = [];
  const overlap = Math.min(app.length, engine.length);

  for (let i = 0; i < overlap; i++) {
    const a = app[i]!;
    const e = engine[i]!;

    for (const field of ["startPosition", "endPosition", "stepNumber"] as const) {
      if (norm(a[field]) !== norm(e[field])) {
        semantic.push({
          stepIndex: i,
          field,
          app: norm(a[field]),
          engine: norm(e[field]),
        });
      }
    }

    for (const side of ["left", "right"] as const) {
      const am = a.motions[side];
      const em = e.motions[side];
      for (const field of SEMANTIC_MOTION_FIELDS) {
        const av = norm((am as Record<string, unknown>)[field]);
        const ev = norm((em as Record<string, unknown>)[field]);
        if (av !== ev) {
          semantic.push({
            stepIndex: i,
            field: `motions.${side}.${field}`,
            app: av,
            engine: ev,
          });
        }
      }
    }

    for (const field of ["id", "letter", "leftReversal", "rightReversal"] as const) {
      if (norm((a as Record<string, unknown>)[field]) !== norm((e as Record<string, unknown>)[field])) {
        representation.push({
          stepIndex: i,
          field,
          app: norm((a as Record<string, unknown>)[field]),
          engine: norm((e as Record<string, unknown>)[field]),
        });
      }
    }
  }

  return {
    appLength: app.length,
    engineLength: engine.length,
    lengthMatches: app.length === engine.length,
    semantic,
    representation,
  };
}

/** One-line summary of the FIRST semantic difference, for failure messages. */
export function firstSemanticDifference(
  comparison: ParityComparison
): string | null {
  if (!comparison.lengthMatches) {
    return `length app=${comparison.appLength} engine=${comparison.engineLength}`;
  }
  const first = comparison.semantic[0];
  if (!first) return null;
  return `step ${first.stepIndex} ${first.field}: app=${String(
    first.app
  )} engine=${String(first.engine)}`;
}

/**
 * Position-and-orientation closure of a completed LOOP.
 *
 * A LOOP closes when the last step returns the hands to the start-position
 * step's grid position AND to its start orientations. Both pipelines claim
 * this property (the app via each executor's `_validateSequence` plus the
 * quarter guard; the engine via `closeOrientationCycle` downstream), so it is
 * the single strongest semantic invariant available at this layer.
 */
export interface ClosureReport {
  readonly positionCloses: boolean;
  readonly orientationCloses: boolean;
}

export function describeClosure(steps: StepData[]): ClosureReport {
  const first = steps[0]!;
  const last = steps[steps.length - 1]!;
  return {
    positionCloses: last.endPosition === first.startPosition,
    orientationCloses:
      last.motions.left.endOrientation === first.motions.left.startOrientation &&
      last.motions.right.endOrientation === first.motions.right.startOrientation,
  };
}
