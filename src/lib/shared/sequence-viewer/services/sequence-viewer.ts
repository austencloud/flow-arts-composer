import type { SequenceData } from "../../foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import {
  loadSequence as persistLoadSequence,
  saveSequence as persistSaveSequence,
} from "../../persistence/services/dexie-persistence-service";
import {
  decodeSequenceWithCompression,
  encodeSequenceWithCompression,
  generateViewerURL,
} from "../../navigation/services/sequence-encoder";
import {
  updateSequenceData,
  removeStepFromSequence,
} from "../../foundation/domain/models/sequence-data";

export class SequenceViewer {

  async loadSequence(sequenceId: string): Promise<SequenceData | null> {
    try {
      return await persistLoadSequence(sequenceId);
    } catch (error) {
      console.error(
        `[SequenceViewer] Failed to load sequence ${sequenceId}:`,
        error
      );
      return null;
    }
  }

  decodeSequence(encodedSequence: string): SequenceData | null {
    try {
      return decodeSequenceWithCompression(encodedSequence);
    } catch (error) {
      console.error("[SequenceViewer] Failed to decode sequence:", error);
      return null;
    }
  }

  removeStep(sequence: SequenceData, stepIndex: number): SequenceData {
    return removeStepFromSequence(sequence, stepIndex);
  }

  async saveSequence(sequence: SequenceData): Promise<void> {
    try {
      await persistSaveSequence(sequence);
    } catch (error) {
      console.error("[SequenceViewer] Failed to save sequence:", error);
      throw error;
    }
  }

  getThumbnailUrl(sequence: SequenceData, variationIndex = 0): string {
    if (!sequence.thumbnails || sequence.thumbnails.length === 0) {
      return "";
    }

    const index = Math.min(variationIndex, sequence.thumbnails.length - 1);
    return sequence.thumbnails[index] ?? "";
  }

  encodeForUrl(sequence: SequenceData): string {
    const result = encodeSequenceWithCompression(sequence);
    return result.encoded;
  }

  generateShareUrl(sequence: SequenceData): string {
    const result = generateViewerURL(sequence, {
      compress: true,
    });
    return result.url;
  }

  getStepData(sequence: SequenceData, stepIndex: number): StepData | null {
    if (stepIndex === 0) {
      const startPos = this.getStartPlacement(sequence);
      if (!startPos) return null;

      return {
        ...startPos,
        stepNumber: 0,
        duration: 1,
        leftReversal: false,
        rightReversal: false,
        isBlank: false,
      } as StepData;
    }

    const arrayIndex = stepIndex - 1;
    if (arrayIndex < 0 || arrayIndex >= sequence.steps.length) {
      return null;
    }

    return sequence.steps[arrayIndex] as StepData;
  }

  private getStartPlacement(
    sequence: SequenceData
  ): StartPlacementData | StepData | null {
    return (
      (sequence.startPlacement as StartPlacementData | StepData) ||
      (sequence.startingPlacement as StartPlacementData | StepData) ||
      null
    );
  }

}
