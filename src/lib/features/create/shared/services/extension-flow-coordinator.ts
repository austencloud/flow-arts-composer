import { t } from "#lib/shared/i18n/i18n.svelte.js";
import { loopTypeLabel } from "#lib/features/create/generate/components/loop-component-presentation.js";
/**
 * Extension Flow Coordinator
 *
 * Orchestrates the sequence extension workflow by coordinating
 * with SequenceExtender for the actual operations.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import type {
  ExtensionFlowStart,
  BridgeAppendResult,
  ExtensionApplyResult,
} from "./sequence-extender";
import type { SequenceExtender } from "./sequence-extender";
import type { LOOPType } from "#lib/shared/foundation/domain/models/generation/circular-models.js";
import { orientationCycleExtender } from "#lib/features/create/generate/circular/services/orientation-cycle-extender.js";

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
          errorMessage: t("create_audit_cannot_extend"),
        };
      }

      return {
        canExtend: true,
        analysis,
        circularizationOptions,
        directUnavailableReason: t("create_audit_placement_mismatch"),
        errorMessage: null,
      };
    } catch (error) {
      console.error("[ExtensionFlowCoordinator] startFlow failed:", error);
      return {
        canExtend: false,
        analysis: null,
        circularizationOptions: [],
        directUnavailableReason: null,
        errorMessage: t("create_audit_analyze_error"),
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
        message: t("create_audit_bridge_added", { letter: bridgeLetter }),
      };
    } catch (error) {
      console.error("[ExtensionFlowCoordinator] appendBridge failed:", error);
      return {
        success: false,
        sequence: null,
        analysis: null,
        message: t("create_audit_bridge_error"),
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
          message: t("create_audit_empty_extension"),
        };
      }

      const loopName = loopTypeLabel(loopType);
      return {
        success: true,
        sequence: extendedSequence,
        stepsAdded,
        message: t("create_audit_extended", {
          name: loopName,
          count: stepsAdded,
        }),
      };
    } catch (error) {
      console.error("[ExtensionFlowCoordinator] applyLoop failed:", error);
      return {
        success: false,
        sequence: null,
        stepsAdded: 0,
        message: t("create_audit_extend_error"),
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
      const extendedSequence =
        orientationCycleExtender.extendIfNeeded(sequence);
      const stepsAdded = (extendedSequence.steps?.length || 0) - originalLength;

      if (stepsAdded === 0) {
        return {
          success: false,
          sequence: null,
          stepsAdded: 0,
          message: t("create_audit_orientation_closed"),
        };
      }

      const count = extendedSequence.orientationCycleCount ?? 1;
      return {
        success: true,
        sequence: extendedSequence,
        stepsAdded,
        message: t("create_audit_repeated", {
          repeats: count,
          count: stepsAdded,
        }),
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
        message: t("create_audit_repeat_error"),
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
