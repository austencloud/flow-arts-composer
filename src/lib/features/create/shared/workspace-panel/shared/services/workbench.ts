/**
 * Simplified Workbench Service
 *
 * Focused service combining all essential workbench functionality.
 * Follows the same simplification pattern as OptionPickerService.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import { createPictographData } from "$lib/shared/pictograph/shared/domain/factories/create-pictograph-data";
import { updateSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import {
  saveSequence as persistSaveSequence,
} from "$lib/shared/persistence/services/dexie-persistence-service";
import type { SequenceRepository } from "$lib/shared/create/services/sequence-repository";
export class Workbench {
  constructor(
    private sequenceService: SequenceRepository,
  ) {}


  /**
   * Handle beat click interaction
   */
  handleStepClick(stepIndex: number, sequence: SequenceData | null): boolean {
    // Simple logic: always allow selection if sequence exists and index is valid
    if (!sequence || stepIndex < 0 || stepIndex >= sequence.steps.length) {
      return false;
    }
    return true;
  }

  /**
   * Edit a beat with default pictograph data
   */
  editBeat(stepIndex: number, sequence: SequenceData): StepData {
    if (stepIndex < 0 || stepIndex >= sequence.steps.length) {
      throw new Error(`Invalid beat index: ${stepIndex}`);
    }

    const originalStep = sequence.steps[stepIndex];
    const defaultPictographData = createPictographData({ letter: Letter.A });

    return createStepData({
      ...originalStep,
      ...defaultPictographData, // Spread PictographData properties since StepData extends PictographData
      isBlank: false,
    });
  }

  /**
   * Clear a beat (make it blank)
   */
  clearBeat(stepIndex: number, sequence: SequenceData): StepData {
    if (stepIndex < 0 || stepIndex >= sequence.steps.length) {
      throw new Error(`Invalid beat index: ${stepIndex}`);
    }

    const originalStep = sequence.steps[stepIndex];

    return createStepData({
      ...originalStep,
      isBlank: true,
      // Reset pictograph properties to blank state
      letter: null,
      startPlacement: null,
      endPlacement: null,
      motions: {},
    });
  }

  /**
   * Add a beat to a sequence
   */
  async addStep(
    sequenceId: string,
    stepData?: Partial<StepData>
  ): Promise<SequenceData> {
    try {
      const sequence = await this.sequenceService.getSequence(sequenceId);
      if (!sequence) {
        throw new Error(`Sequence ${sequenceId} not found`);
      }

      const newStep = createStepData({
        isBlank: true,
        ...stepData, // Spread any provided step data (which may include PictographData properties)
      });

      const updatedSequence = updateSequenceData(sequence, {
        steps: [...sequence.steps, newStep],
      });

      await persistSaveSequence(updatedSequence);
      return updatedSequence;
    } catch (error) {
      console.error("Failed to add beat:", error);
      throw new Error(
        `Failed to add beat: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Set construction start placement
   */
  async setConstructionStartPlacement(
    sequenceId: string,
    startPlacement: StartPlacementData
  ): Promise<SequenceData> {
    try {
      const sequence = await this.sequenceService.getSequence(sequenceId);
      if (!sequence) {
        throw new Error(`Sequence ${sequenceId} not found`);
      }

      const updatedSequence = updateSequenceData(sequence, {
        startPlacement: startPlacement,
        startingPlacement: startPlacement, // CRITICAL: Set both fields for compatibility
      });

      await persistSaveSequence(updatedSequence);
      return updatedSequence;
    } catch (error) {
      console.error("Failed to set construction start placement:", error);
      throw new Error(
        `Failed to set start placement: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  // ============================================================================
  // SEQUENCE OPERATIONS
  // ============================================================================

  /**
   * Validate beat operations
   */
  canEditBeat(stepIndex: number, sequence: SequenceData | null): boolean {
    if (!sequence || stepIndex < 0 || stepIndex >= sequence.steps.length) {
      return false;
    }
    return true;
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
import { sequenceRepository } from "$lib/shared/create/services/sequence-repository";

export const workbench = new Workbench(sequenceRepository);
