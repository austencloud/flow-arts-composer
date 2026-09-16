/**
 * Prop Type Handler
 * Handles prop type updates for individual steps and bulk operations.
 */

import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { createStartPlacementData } from "$lib/shared/create/factories/create-start-placement-data";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { ICreateModuleState } from "../../types/create-module-types";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { createComponentLogger } from "$lib/shared/utils/debug-logger";
import {
  getStepDataFromState,
  START_PLACEMENT_BEAT_NUMBER,
} from "./step-data-helpers";

const logger = createComponentLogger("PropTypeHandler");

/**
 * Update prop type for a specific color in a single beat
 */
export function updateStepPropType(
  stepNumber: number,
  color: string,
  propType: PropType,
  createModuleState: ICreateModuleState
): void {
  const stepData = getStepDataFromState(stepNumber, createModuleState);

  if (!stepData?.motions) {
    logger.warn("Cannot update prop type - no step data available");
    return;
  }

  const currentMotion: MotionData | undefined =
    stepData.motions[color as HandSide];
  if (!currentMotion) {
    logger.warn(`No motion data for ${color}`);
    return;
  }

  const updatedMotion = {
    ...currentMotion,
    propType: propType,
  };

  const updatedStepData = {
    ...stepData,
    motions: {
      ...stepData.motions,
      [color]: updatedMotion,
    },
  };

  if (stepNumber === START_PLACEMENT_BEAT_NUMBER) {
    // Convert to proper StartPlacementData when updating start placement
    const updatedStartPlacement = createStartPlacementData({
      ...stepData,
      motions: {
        ...stepData.motions,
        [color]: updatedMotion,
      },
    });
    createModuleState.sequenceState.setStartPlacement(updatedStartPlacement);
    logger.log(`Updated start placement ${color} prop type to ${propType}`);
  } else {
    const arrayIndex = stepNumber - 1;
    createModuleState.sequenceState.updateStep(arrayIndex, updatedStepData);
    logger.log(`Updated beat ${stepNumber} ${color} prop type to ${propType}`);
  }
}

/**
 * Bulk update prop type for all motions of a specific color in the sequence
 * Updates both the start placement and all steps
 */
export function bulkUpdatePropType(
  color: string,
  propType: PropType,
  createModuleState: ICreateModuleState
): void {
  // Update start placement
  const startPlacement = createModuleState.sequenceState.selectedStartPlacement;
  if (startPlacement?.motions) {
    const currentMotion = startPlacement.motions[color as HandSide];
    if (currentMotion) {
      const updatedMotion = {
        ...currentMotion,
        propType: propType,
      };
      const updatedStartPlacement = createStartPlacementData({
        ...startPlacement,
        motions: {
          ...startPlacement.motions,
          [color]: updatedMotion,
        },
      });
      createModuleState.sequenceState.setStartPlacement(updatedStartPlacement);
      logger.log(`Updated start placement ${color} prop type to ${propType}`);
    }
  }

  // Update all steps in the sequence
  const sequence = createModuleState.sequenceState.currentSequence;
  if (sequence?.steps) {
    const updatedSteps = sequence.steps.map((beat: StepData) => {
      if (!beat.motions) return beat;

      const currentMotion = beat.motions[color as HandSide];
      if (!currentMotion) return beat;

      const updatedMotion = {
        ...currentMotion,
        propType: propType,
      };

      return {
        ...beat,
        motions: {
          ...beat.motions,
          [color]: updatedMotion,
        },
      };
    });

    const updatedSequence = {
      ...sequence,
      steps: updatedSteps,
    };

    // D4 skip: propType is prop-identity data, not motion structure
    // (motionType/rotationDirection/locations/orientations/turns) — no
    // certificate invalidation needed.
    createModuleState.sequenceState.setCurrentSequence(updatedSequence);
    logger.log(
      `Updated ${updatedSteps.length} steps: ${color} prop type to ${propType}`
    );
  }
}
