/**
 * Poi Sequence Validator
 *
 * Validates entire sequences for poi legality.
 */

import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { validateMotion, validateTransition } from "./poi-constraint-validator";
import type {
  PoiValidationResult,
  PoiConstraintViolation,
} from "../domain/poi-models";

export class PoiSequenceValidator {
  constructor() {}

  validateSequence(sequence: readonly PictographData[]): PoiValidationResult {
    const violations: PoiConstraintViolation[] = [];

    for (let i = 0; i < sequence.length; i++) {
      const pictograph = sequence[i];
      if (!pictograph) continue;

      const leftMotion = pictograph.motions?.left;
      const rightMotion = pictograph.motions?.right;

      // Validate left motion if it's poi
      if (leftMotion?.propType === PropType.POI) {
        const leftResult = validateMotion(leftMotion);
        violations.push(...leftResult.violations);

        // Check transition from previous beat
        if (i > 0) {
          const prevPictograph = sequence[i - 1];
          const prevLeft = prevPictograph?.motions?.left;
          if (prevLeft?.propType === PropType.POI) {
            const transitionResult = validateTransition(prevLeft, leftMotion);
            violations.push(...transitionResult.violations);
          }
        }
      }

      // Validate right motion if it's poi
      if (rightMotion?.propType === PropType.POI) {
        const rightResult = validateMotion(rightMotion);
        violations.push(...rightResult.violations);

        // Check transition from previous beat
        if (i > 0) {
          const prevPictograph = sequence[i - 1];
          const prevRight = prevPictograph?.motions?.right;
          if (prevRight?.propType === PropType.POI) {
            const transitionResult = validateTransition(prevRight, rightMotion);
            violations.push(...transitionResult.violations);
          }
        }
      }
    }

    return {
      isValid: violations.length === 0,
      violations,
    };
  }

  validatePictograph(pictograph: PictographData): PoiValidationResult {
    return this.validateSequence([pictograph]);
  }
}
