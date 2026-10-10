/**
 * Variation Constraint Builder Implementation
 *
 * Converts user preferences into exploration constraints for efficient
 * variation generation. Enables "constrain → generate-only-matching" flow
 * instead of "generate-all → filter" for 10x-100x performance improvement.
 */


import type { LetterTypeClassifier } from "./letter-type-classifier";
import type { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import type {
  SpellPreferences,
  VariationConstraints,
} from "../domain/models/spell-models";

export class VariationConstraintBuilder {
  constructor(private readonly letterTypeClassifier: LetterTypeClassifier) {}

  buildConstraints(
    preferences: SpellPreferences,
    _expandedLetters: Letter[]
  ): VariationConstraints {
    return {
      // Target step count - use expanded letters length if specified
      targetStepCount: preferences.targetStepCount,

      // Motion type filter - pass through directly
      motionTypeFilter: preferences.motionTypeFilter,

      // Maximum reversals
      maxReversals: preferences.maxReversals,

      // Minimum continuity score - convert boolean preference to score
      // High continuity = require at least 0.7 continuity (70% same direction)
      minContinuityScore: preferences.highContinuity ? 0.7 : null,

      // Allowed letter types - for now, allow all types
      // This can be enhanced later to filter by motion characteristics
      allowedLetterTypes: null,

      // Circular requirement
      requiresCircular: preferences.makeCircular,

      // LOOP type for circular sequences (defaults to REWOUND if not specified)
      loopType: preferences.selectedLOOPType,
    };
  }
}

import * as letterTypeClassifier from "./letter-type-classifier";

export const variationConstraintBuilder = new VariationConstraintBuilder(
  letterTypeClassifier
);
