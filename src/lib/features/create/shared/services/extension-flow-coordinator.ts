/**
 * Extension Flow Coordinator
 *
 * Orchestrates the sequence extension workflow by coordinating
 * with SequenceExtender for the actual operations.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { Letter } from "$lib/shared/foundation/domain/models/letter";
import type { ExtensionFlowStart, BridgeAppendResult, ExtensionApplyResult } from "./sequence-extender";
import type { SequenceExtender } from "./sequence-extender";
import type { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";
import { orientationCycleExtender } from "$lib/features/create/generate/circular/services/orientation-cycle-extender";

export class ExtensionFlowCoordinator {
  constructor(private readonly sequenceExtender: SequenceExtender) {}

  canExtend(sequence: SequenceData): boolean {
    try {
      const analysis = this.sequenceExtender.analyzeSequence(sequence);
      return analysis.canExtend;
    } catch {
      return false;
    }
  }

  async startFlow(sequence: SequenceData): Promise<ExtensionFlowStart> {
    try {
      // Analyze the sequence
      const analysis = this.sequenceExtender.analyzeSequence(sequence);

      // Direct path when there is anything to click: a transform-based LOOP,
      // or the orientation repeat (which needs no bridge — the sequence is
      // already back at its start placement).
      if (
        analysis.canExtend &&
        (analysis.availableLOOPOptions.length > 0 || analysis.orientationRepeat)
      ) {
        return {
          canExtend: true,
          analysis,
          circularizationOptions: [],
          directUnavailableReason: null,
          errorMessage: null,
        };
      }

      // No direct LOOPs - try to get bridge options
      const circularizationOptions =
        await this.sequenceExtender.getCircularizationOptions(sequence);

      if (circularizationOptions.length === 0) {
        return {
          canExtend: false,
          analysis,
          circularizationOptions: [],
          directUnavailableReason: null,
          errorMessage: "Cannot extend this sequence",
        };
      }

      return {
        canExtend: true,
        analysis,
        circularizationOptions,
        directUnavailableReason:
          "Placement groups don't match for direct extension",
        errorMessage: null,
      };
    } catch (error) {
      console.error("[ExtensionFlowCoordinator] startFlow failed:", error);
      return {
        canExtend: false,
        analysis: null,
        circularizationOptions: [],
        directUnavailableReason: null,
        errorMessage: "Failed to analyze sequence for extension",
      };
    }
  }

  async appendBridge(
    sequence: SequenceData,
    bridgeLetter: Letter
  ): Promise<BridgeAppendResult> {
    try {
      // Append the bridge beat
      const sequenceWithBridge = await this.sequenceExtender.appendBridgeBeat(
        sequence,
        bridgeLetter
      );

      // Re-analyze to get LOOP options
      const analysis =
        this.sequenceExtender.analyzeSequence(sequenceWithBridge);

      return {
        success: true,
        sequence: sequenceWithBridge,
        analysis,
        message: `Added "${bridgeLetter}" - now choose LOOP pattern`,
      };
    } catch (error) {
      console.error("[ExtensionFlowCoordinator] appendBridge failed:", error);
      return {
        success: false,
        sequence: null,
        analysis: null,
        message: "Could not add bridge letter",
      };
    }
  }

  async applyLoop(
    sequence: SequenceData,
    loopType: LOOPType
  ): Promise<ExtensionApplyResult> {
    try {
      const originalLength = sequence.steps?.length || 0;

      const extendedSequence = await this.sequenceExtender.extendSequence(
        sequence,
        { loopType }
      );

      const newLength = extendedSequence.steps?.length || 0;
      const stepsAdded = newLength - originalLength;

      if (stepsAdded === 0) {
        return {
          success: false,
          sequence: null,
          stepsAdded: 0,
          message: "No extension steps generated",
        };
      }

      const loopName = loopType.replace(/_/g, " ");
      return {
        success: true,
        sequence: extendedSequence,
        stepsAdded,
        message: `Extended with ${loopName}! Added ${stepsAdded} steps`,
      };
    } catch (error) {
      console.error("[ExtensionFlowCoordinator] applyLoop failed:", error);
      return {
        success: false,
        sequence: null,
        stepsAdded: 0,
        message: "Could not extend sequence",
      };
    }
  }

  /**
   * Repeat the sequence verbatim until the props return to their start
   * orientation. No transform is applied — the placement already closed, and
   * only orientation is still open.
   */
  applyOrientationRepeat(sequence: SequenceData): ExtensionApplyResult {
    try {
      const originalLength = sequence.steps?.length || 0;
      const extendedSequence = orientationCycleExtender.extendIfNeeded(sequence);
      const stepsAdded = (extendedSequence.steps?.length || 0) - originalLength;

      if (stepsAdded === 0) {
        return {
          success: false,
          sequence: null,
          stepsAdded: 0,
          message: "Orientation already returns at the end of this sequence",
        };
      }

      const count = extendedSequence.orientationCycleCount ?? 1;
      return {
        success: true,
        sequence: extendedSequence,
        stepsAdded,
        message: `Repeated ×${count} — orientation now returns. Added ${stepsAdded} steps`,
      };
    } catch (error) {
      console.error(
        "[ExtensionFlowCoordinator] applyOrientationRepeat failed:",
        error
      );
      return {
        success: false,
        sequence: null,
        stepsAdded: 0,
        message: "Could not repeat sequence",
      };
    }
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
import { sequenceExtender } from "./sequence-extender";

export const extensionFlowCoordinator = new ExtensionFlowCoordinator(
  sequenceExtender
);
