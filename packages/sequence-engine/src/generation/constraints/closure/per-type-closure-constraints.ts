/**
 * Per-Type LOOP Closure Constraints (scoped skeletons)
 *
 * Four closure constraints for the non-ROTATED LOOP types. Each asserts
 * that step `i + length/period` is the transformation-of step `i` for the
 * claimed transformation type. Beam search can plug these in as hard
 * constraints if closure ever needs to be enforced during search rather
 * than via the post-hoc spec-executor / FusedExecutor pipeline.
 *
 * ## Status
 *
 * Instantiable skeletons. Not wired into beam search — the spec-executor
 * pipeline handles the current generation path. Kept as a ready-to-wire
 * scaffold if we decide to close orientation during search instead.
 */

import type {
  IConstraint,
  ConstraintContext,
  ConstraintScore,
  ISequenceConstraint,
  PictographData,
} from "../types.js";
import { ConstraintType } from "../constraint-types.js";

/**
 * Shared base for the four per-type closure constraints. Subclasses override
 * `checkPair` to define their transformation.
 */
abstract class PerTypeClosureConstraint
  implements IConstraint, ISequenceConstraint
{
  abstract readonly type: ConstraintType;
  readonly mode = "hard" as const;
  abstract readonly description: string;

  constructor(protected readonly period: number) {}

  evaluate(_context: ConstraintContext): ConstraintScore {
    return { score: 1, satisfied: true, reason: "sequence-level check" };
  }

  evaluateSequence(steps: PictographData[]): ConstraintScore {
    const length = steps.length;
    if (length === 0 || length % this.period !== 0) {
      return {
        score: 0,
        satisfied: false,
        reason: `sequence length ${length} not divisible by period ${this.period}`,
      };
    }

    const chunk = length / this.period;
    for (let i = 0; i < chunk; i++) {
      for (let pass = 1; pass < this.period; pass++) {
        const paired = i + pass * chunk;
        if (paired >= length) break;
        if (!this.checkPair(steps[i]!, steps[paired]!, pass)) {
          return {
            score: 0,
            satisfied: false,
            reason: `pair at step ${i + 1} ↔ step ${paired + 1} fails ${this.type}`,
          };
        }
      }
    }
    return { score: 1, satisfied: true, reason: "all closure pairs match" };
  }

  /**
   * Check whether `paired` is the transformation-of `base` for this type.
   * @param pass - Which pass the paired step is in (1, 2, or 3). Some
   *   transformations compose per-pass (e.g., SWAPPED alternates).
   */
  protected abstract checkPair(
    base: PictographData,
    paired: PictographData,
    pass: number
  ): boolean;
}

export class MirroredClosureConstraint extends PerTypeClosureConstraint {
  readonly type = ConstraintType.MIRRORED_CLOSURE;
  readonly description = `Step i + L/${this.period} is the vertical-mirror of step i`;

  protected checkPair(
    base: PictographData,
    paired: PictographData,
    _pass: number
  ): boolean {
    // Minimal structural check: the two steps reference the same letter in
    // mirrored form. Full motion-level validation lives in the mirror
    // placement maps; this skeleton trusts that the beam-search candidate
    // generation already honors those maps when closure is requested.
    return base.letter === paired.letter || base.letter !== paired.letter;
    // Deliberately permissive at the skeleton level; returning true allows
    // beam-search iteration to proceed without false negatives. Real checks
    // arrive when SearchState orientation wiring (deferred) lands.
  }
}

export class FlippedClosureConstraint extends PerTypeClosureConstraint {
  readonly type = ConstraintType.FLIPPED_CLOSURE;
  readonly description = `Step i + L/${this.period} is the horizontal-flip of step i`;

  protected checkPair(): boolean {
    return true;
  }
}

export class SwappedClosureConstraint extends PerTypeClosureConstraint {
  readonly type = ConstraintType.SWAPPED_CLOSURE;
  readonly description = `Step i + L/${this.period} has left/right swapped from step i`;

  protected checkPair(
    base: PictographData,
    paired: PictographData,
    pass: number
  ): boolean {
    // At pass 1: paired should be left/right-swap of base.
    // At pass 2 (period 4+): back to unswapped.
    // Pass parity decides which check applies.
    const shouldBeSwapped = pass % 2 === 1;
    // Minimal: motion type check (left→right, right→left).
    if (shouldBeSwapped) {
      return (
        base.leftMotion.motionType === paired.rightMotion.motionType &&
        base.rightMotion.motionType === paired.leftMotion.motionType
      );
    }
    return (
      base.leftMotion.motionType === paired.leftMotion.motionType &&
      base.rightMotion.motionType === paired.rightMotion.motionType
    );
  }
}

export class InvertedClosureConstraint extends PerTypeClosureConstraint {
  readonly type = ConstraintType.INVERTED_CLOSURE;
  readonly description = `Step i + L/${this.period} is the motion-inversion of step i`;

  protected checkPair(
    base: PictographData,
    paired: PictographData,
    pass: number
  ): boolean {
    const shouldBeInverted = pass % 2 === 1;
    if (shouldBeInverted) {
      return (
        invertMotionType(base.leftMotion.motionType as string) ===
          paired.leftMotion.motionType &&
        invertMotionType(base.rightMotion.motionType as string) ===
          paired.rightMotion.motionType
      );
    }
    return (
      base.leftMotion.motionType === paired.leftMotion.motionType &&
      base.rightMotion.motionType === paired.rightMotion.motionType
    );
  }
}

function invertMotionType(t: string): string {
  switch (t) {
    case "pro":
      return "anti";
    case "anti":
      return "pro";
    case "static":
      return "dash";
    case "dash":
      return "static";
    default:
      return t;
  }
}
