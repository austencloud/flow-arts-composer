/**
 * Minimum Length Calculator
 *
 * Closed-form answer to: "What's the smallest sequence length that can
 * produce a LOOP of the given (loopType, period, level) configuration?"
 *
 * Used by the generator UI to disable infeasible length chips before the
 * user commits to a generate action. Prevents the "spinner forever, then
 * failure" pattern — infeasibility shows up as a greyed-out chip with an
 * explanation, which is cheaper than blowing beam search.
 *
 * ## Math
 *
 * Every LOOP at period N has a structural minimum equal to:
 *
 *   N · basePatternMinimum(loopType, level)
 *
 * where `basePatternMinimum` is the shortest base sequence that a single
 * pass of the LOOP can extend non-trivially.
 *
 * At level 1, `basePatternMinimum` is 2 for transformations that need
 * distinct steps to demonstrate the transformation (rotation, mirror, flip,
 * swap) and 1 for stateless transformations (inverted). At level ≥ 2, float
 * motions allow period-4 closure within a single step for some transforms.
 *
 * ## Level-specific capacity gates
 *
 * Level 1 has 0-turn motions only. Orientation cannot drift — so any LOOP
 * that requires orientation cycling (period > 1 via orientation domain)
 * is infeasible at level 1 → returns Infinity.
 *
 * Level 2+ enables half-turn (180°) motions. Level 5 adds the 8-grid which
 * expands location-domain period 8 possibilities. Level 7+ adds the 8-wheel
 * which expands orientation-domain period 8. Both level 5/7 still land
 * under the same min-length formula, just with period 8 added as valid.
 *
 * ## Domain
 *
 * When the caller knows the LOOP operates purely in orientation domain
 * (locations stay pinned), the minimum equals just `period` steps — one
 * step per pass, since locations can hold while orientations advance.
 */

import { LOOPType } from "../../loop/loop-types.js";
import {
  type LOOPSpec,
  allActiveComponents,
  loopSpecPeriod,
  LOOPComponent,
} from "../../loop/loop-spec.js";

/**
 * LOOP domain — matches the shared type in the app's generate-models.
 * Duplicated here so the engine package stays self-contained.
 */
export type LOOPDomain = "location" | "orientation" | "both";

export interface MinLengthArgs {
  loopType: LOOPType;
  /** Integer period: 2, 4, or 8. */
  period: number;
  /** Difficulty level: 1–7. */
  level: number;
  /** "diamond" or "box". Some LOOPs depend on grid mode for feasibility. */
  gridMode?: string;
  /**
   * Operating domain. When absent, the calculator assumes "location" for
   * location-domain LOOPs and infers orientation for orientation-only requests.
   */
  domain?: LOOPDomain;
}

/**
 * Compute the minimum sequence length for a (loopType, period, level) config.
 *
 * @returns Integer minimum length, or `Infinity` when infeasible at the
 *   given level.
 */
export function minLength(args: MinLengthArgs): number {
  const { loopType, period, level } = args;

  // Period 1 = not a LOOP. Any length ≥ 1 works trivially.
  if (period <= 1) return 1;

  // Level 1: no turns at all. Any non-rotation LOOP that needs orientation
  // cycling to close (period > 1 via orientation) is infeasible.
  if (level === 1) {
    // Rotation is a purely location-domain LOOP; level 1 can do period 2 rotation
    // (halved) in diamond or box, and period 4 rotation (quartered) if the
    // grid supports the full cycle.
    if (loopType === LOOPType.ROTATED) {
      return basePatternMinimum(loopType, level) * period;
    }
    // Rewound has no orientation requirement — reversal alone closes.
    if (loopType === LOOPType.REWOUND) {
      return basePatternMinimum(loopType, level) * period;
    }
    // For MIRRORED/FLIPPED/SWAPPED/INVERTED at period 2 in purely location
    // domain, orientation parity must be zero per pass — meaning turn
    // totals per hand per pass must be integer. At level 1 (all zero turns)
    // that's trivially satisfied, so these are feasible.
    if (period === 2) {
      return basePatternMinimum(loopType, level) * period;
    }
    // Period 4 or 8 for non-rotation types at L1 requires half-turn motions
    // that L1 doesn't have — infeasible.
    return Infinity;
  }

  // Level 2+: all standard LOOPs feasible. Minimum = base × period.
  return basePatternMinimum(loopType, level) * period;
}

/**
 * LOOPSpec-based minimum length. Compositional equivalent of `minLength`.
 */
export function minLengthForSpec(spec: LOOPSpec, level: number): number {
  const period = loopSpecPeriod(spec);
  if (period <= 1) return 1;

  const active = allActiveComponents(spec);

  if (level === 1) {
    for (const [comp] of active) {
      if (comp !== LOOPComponent.ROTATED && comp !== LOOPComponent.REWOUND) {
        if (period > 2) return Infinity;
      }
    }
  }

  let baseMin = 1;
  for (const [comp] of active) {
    if (
      comp === LOOPComponent.ROTATED ||
      comp === LOOPComponent.MIRRORED ||
      comp === LOOPComponent.FLIPPED
    ) {
      baseMin = Math.max(baseMin, 2);
    }
  }

  return baseMin * period;
}

/**
 * Minimum steps for a single pass of the given loop type at the given level.
 *
 * Rules of thumb:
 * - Rotation needs 2 distinct steps to exhibit rotation (can't rotate a
 *   single static step). So base = 2.
 * - Mirror/flip similarly need 2 to distinguish the sides.
 * - Swap needs 1 (single step can have swapped left/right).
 * - Inverted needs 1 (single step can have inverted motion).
 * - Rewound needs 1 (time reversal of 1 step is still 1 step).
 */
function basePatternMinimum(loopType: LOOPType, _level: number): number {
  switch (loopType) {
    case LOOPType.ROTATED:
    case LOOPType.MIRRORED:
    case LOOPType.FLIPPED:
      return 2;

    case LOOPType.SWAPPED:
    case LOOPType.INVERTED:
    case LOOPType.REWOUND:
      return 1;

    // Compound types take the max of their constituents.
    case LOOPType.ROTATED_INVERTED:
    case LOOPType.ROTATED_SWAPPED:
    case LOOPType.ROTATED_SWAPPED_INVERTED:
    case LOOPType.MIRRORED_ROTATED:
    case LOOPType.MIRRORED_INVERTED_ROTATED:
    case LOOPType.MIRRORED_ROTATED_INVERTED_SWAPPED:
      return 2;

    case LOOPType.MIRRORED_SWAPPED:
    case LOOPType.MIRRORED_INVERTED:
    case LOOPType.SWAPPED_INVERTED:
    case LOOPType.MIRRORED_SWAPPED_INVERTED:
      return 2;

    default:
      return 2;
  }
}
