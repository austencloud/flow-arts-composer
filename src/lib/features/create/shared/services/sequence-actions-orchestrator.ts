import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
import type { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";
import type { Letter } from "$lib/shared/foundation/domain/models/letter";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { TargetHand } from "../state/panel-coordination-state.svelte";
import type { ExtensionFlowCoordinator } from "./extension-flow-coordinator";
import {
  analyzeStartPick,
  getStartPickMessage,
  type StartPickAnalysis,
  type StartPickResult,
} from "./choose-start-analyzer";
import type {
  BridgeAppendResult,
  ExtensionApplyResult,
  ExtensionFlowStart,
} from "./sequence-extender";
import { UndoOperationType } from "./undo-manager";
import type {
  SequenceTransformCommandId,
  SequenceTransformCommandOptions,
  SequenceTransformCommandResult,
} from "$lib/shared/create/domain/sequence-action-types";
import type { SequenceTransformActionState } from "./sequence-transform-action-dispatcher";

export interface SequenceActionsSequenceState extends SequenceTransformActionState {
  setCurrentSequence(sequence: SequenceData): void;
}

export interface SequenceActionsBusyState {
  beginTransform(): boolean;
  finishTransform(): void;
  beginExtension(): boolean;
  finishExtension(): void;
}

export interface SequenceActionsOrchestratorDeps {
  getSequenceState: () => SequenceActionsSequenceState;
  getTargetHand: () => TargetHand;
  hapticService: HapticFeedback | null;
  pushUndoSnapshot: (type: UndoOperationType) => void;
  executeTransformAction: (
    action: SequenceTransformCommandId,
    options: SequenceTransformCommandOptions
  ) => Promise<SequenceTransformCommandResult>;
  busyState: SequenceActionsBusyState;
  extensionFlowCoordinator: ExtensionFlowCoordinator | null;
  finishShiftStart: () => void;
  copySequenceJson?: (sequence: SequenceData) => Promise<boolean>;
}

export type SequenceActionResult<T = never> =
  | ({ status: "completed" } & ([T] extends [never] ? object : { value: T }))
  | { status: "busy" }
  | { status: "unavailable"; message: string }
  | { status: "failed"; message: string };

function completed(): SequenceActionResult {
  return { status: "completed" };
}

function completedWith<T>(value: T): SequenceActionResult<T> {
  return { status: "completed", value } as SequenceActionResult<T>;
}

export function createSequenceActionsOrchestrator(
  deps: SequenceActionsOrchestratorDeps
) {
  async function executeTransform(
    action: SequenceTransformCommandId,
    stepNumber?: number
  ): Promise<SequenceActionResult> {
    const state = deps.getSequenceState();
    if (!state.currentSequence) {
      return { status: "unavailable", message: "No active sequence" };
    }
    if (!deps.busyState.beginTransform()) return { status: "busy" };

    try {
      return await deps.executeTransformAction(action, {
        source: "panel",
        targetHand: deps.getTargetHand(),
        ...(stepNumber === undefined ? {} : { stepNumber }),
      });
    } finally {
      deps.busyState.finishTransform();
    }
  }

  function applyPattern(
    undoType:
      | UndoOperationType.APPLY_TURN_PATTERN
      | UndoOperationType.APPLY_ROTATION_PATTERN
      | UndoOperationType.APPLY_DURATION_PATTERN,
    nextSequence: SequenceData,
    beforeApply?: () => void
  ): void {
    deps.pushUndoSnapshot(undoType);
    beforeApply?.();
    deps.getSequenceState().setCurrentSequence(nextSequence);
    deps.hapticService?.trigger("success");
  }

  async function startExtension(): Promise<
    SequenceActionResult<ExtensionFlowStart>
  > {
    const sequence = deps.getSequenceState().currentSequence;
    const coordinator = deps.extensionFlowCoordinator;
    if (!sequence || !coordinator) {
      return {
        status: "unavailable",
        message: "Cannot extend without an active sequence",
      };
    }
    if (!deps.busyState.beginExtension()) return { status: "busy" };

    deps.hapticService?.trigger("selection");
    try {
      const result = await coordinator.startFlow(sequence);
      if (!result.canExtend) {
        return {
          status: "failed",
          message: result.errorMessage || "Cannot extend this sequence",
        };
      }
      return completedWith(result);
    } finally {
      deps.busyState.finishExtension();
    }
  }

  async function appendBridge(
    bridgeLetter: Letter
  ): Promise<SequenceActionResult<BridgeAppendResult>> {
    const sequence = deps.getSequenceState().currentSequence;
    const coordinator = deps.extensionFlowCoordinator;
    if (!sequence || !coordinator) {
      return {
        status: "unavailable",
        message: "Cannot add a bridge without an active sequence",
      };
    }
    if (!deps.busyState.beginExtension()) return { status: "busy" };

    deps.hapticService?.trigger("selection");
    try {
      deps.pushUndoSnapshot(UndoOperationType.ADD_BEAT);
      const result = await coordinator.appendBridge(sequence, bridgeLetter);
      if (result.success && result.sequence) {
        deps.getSequenceState().setCurrentSequence(result.sequence);
        deps.hapticService?.trigger("success");
        return completedWith(result);
      }

      deps.hapticService?.trigger("error");
      return { status: "failed", message: result.message };
    } finally {
      deps.busyState.finishExtension();
    }
  }

  async function applyLoop(
    loopType: LOOPType
  ): Promise<SequenceActionResult<ExtensionApplyResult>> {
    const sequence = deps.getSequenceState().currentSequence;
    const coordinator = deps.extensionFlowCoordinator;
    if (!sequence || !coordinator) {
      return {
        status: "unavailable",
        message: "Cannot extend without an active sequence",
      };
    }
    if (!deps.busyState.beginExtension()) return { status: "busy" };

    deps.hapticService?.trigger("selection");
    try {
      deps.pushUndoSnapshot(UndoOperationType.EXTEND_SEQUENCE);
      const result = await coordinator.applyLoop(sequence, loopType);
      if (result.success && result.sequence) {
        deps.getSequenceState().setCurrentSequence(result.sequence);
        deps.hapticService?.trigger("success");
        return completedWith(result);
      }

      deps.hapticService?.trigger("error");
      return { status: "failed", message: result.message };
    } finally {
      deps.busyState.finishExtension();
    }
  }

  function applyOrientationRepeat(): SequenceActionResult<ExtensionApplyResult> {
    const sequence = deps.getSequenceState().currentSequence;
    const coordinator = deps.extensionFlowCoordinator;
    if (!sequence || !coordinator) {
      return {
        status: "unavailable",
        message: "Cannot extend without an active sequence",
      };
    }
    if (!deps.busyState.beginExtension()) return { status: "busy" };

    deps.hapticService?.trigger("selection");
    try {
      deps.pushUndoSnapshot(UndoOperationType.EXTEND_SEQUENCE);
      const result = coordinator.applyOrientationRepeat(sequence);
      if (result.success && result.sequence) {
        deps.getSequenceState().setCurrentSequence(result.sequence);
        deps.hapticService?.trigger("success");
        return completedWith(result);
      }

      deps.hapticService?.trigger("error");
      return { status: "failed", message: result.message };
    } finally {
      deps.busyState.finishExtension();
    }
  }

  /** `tileIndex` is the tapped pose: 0 for the start tile, 1..n for steps. */
  function analyzeShiftStart(tileIndex: number): StartPickAnalysis | null {
    const sequence = deps.getSequenceState().currentSequence;
    return sequence ? analyzeStartPick(sequence, tileIndex) : null;
  }

  /** `targetStepNumber` is the step that becomes step 1 (from the analysis). */
  async function shiftStart(
    targetStepNumber: number
  ): Promise<SequenceActionResult<StartPickResult>> {
    const state = deps.getSequenceState();
    const sequence = state.currentSequence;
    if (!sequence) {
      return { status: "unavailable", message: "No active sequence" };
    }
    try {
      const execution = await executeTransform("shift_start", targetStepNumber);
      if (execution.status !== "completed") return execution;
      const result = getStartPickMessage(sequence, targetStepNumber);
      deps.hapticService?.trigger("success");
      return completedWith(result);
    } finally {
      deps.finishShiftStart();
    }
  }

  async function copySequenceJson(): Promise<SequenceActionResult> {
    const sequence = deps.getSequenceState().currentSequence;
    if (!sequence || !deps.copySequenceJson) {
      return { status: "unavailable", message: "No active sequence" };
    }

    deps.hapticService?.trigger("selection");
    const success = await deps.copySequenceJson(sequence);
    return success
      ? completed()
      : { status: "failed", message: "Failed to copy to clipboard" };
  }

  return {
    mirror: () => executeTransform("mirror"),
    swap: () => executeTransform("swap"),
    rewind: () => executeTransform("rewind"),
    flip: () => executeTransform("flip"),
    invert: () => executeTransform("invert"),
    rotateClockwise: () => executeTransform("rotate_clockwise"),
    rotateCounterclockwise: () => executeTransform("rotate_counterclockwise"),
    applyPattern,
    startExtension,
    appendBridge,
    applyLoop,
    applyOrientationRepeat,
    analyzeShiftStart,
    shiftStart,
    copySequenceJson,
  };
}

export type SequenceActionsOrchestrator = ReturnType<
  typeof createSequenceActionsOrchestrator
>;
