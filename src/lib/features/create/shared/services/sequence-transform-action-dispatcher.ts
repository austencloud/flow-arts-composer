import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
import {
  logSequenceActionInvoked,
  logSequenceActionResult,
  type SequenceActionEventProperties,
} from "$lib/shared/create/analytics/sequence-action-events";
import type {
  SequenceActionTargetHand,
  SequenceTransformCommandId,
  SequenceTransformCommandOptions,
  SequenceTransformCommandResult,
} from "$lib/shared/create/domain/sequence-action-types";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { UndoOperationType } from "./undo-manager";

export interface SequenceTransformActionState {
  currentSequence: SequenceData | null;
  mirrorSequence(targetHand?: SequenceActionTargetHand): Promise<void>;
  flipSequence(targetHand?: SequenceActionTargetHand): Promise<void>;
  swapHands(): Promise<void>;
  invertSequence(targetHand?: SequenceActionTargetHand): Promise<void>;
  rewindSequence(targetHand?: SequenceActionTargetHand): Promise<void>;
  rotateSequence(
    direction: "clockwise" | "counterclockwise",
    targetHand?: SequenceActionTargetHand
  ): Promise<void>;
  shiftStartPosition(stepNumber: number): Promise<void>;
}

interface SequenceTransformActionDispatcherDependencies {
  getSequenceState: () => SequenceTransformActionState | null;
  getCreateMode: () => string;
  pushUndoSnapshot: (type: UndoOperationType) => void;
  hapticService: HapticFeedback | null;
  setGridRotationDirection: (direction: 1 | -1) => void;
}

const UNDO_OPERATION: Record<SequenceTransformCommandId, UndoOperationType> = {
  mirror: UndoOperationType.MIRROR_SEQUENCE,
  flip: UndoOperationType.FLIP_SEQUENCE,
  swap: UndoOperationType.SWAP_HANDS,
  invert: UndoOperationType.INVERT_SEQUENCE,
  rewind: UndoOperationType.REWIND_SEQUENCE,
  rotate_counterclockwise: UndoOperationType.ROTATE_SEQUENCE,
  rotate_clockwise: UndoOperationType.ROTATE_SEQUENCE,
  shift_start: UndoOperationType.SHIFT_START,
};

function now(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Sequence action failed";
}

export function createSequenceTransformActionDispatcher(
  deps: SequenceTransformActionDispatcherDependencies
) {
  let transformInFlight = false;

  async function executeTransform(
    state: SequenceTransformActionState,
    action: SequenceTransformCommandId,
    targetHand: SequenceActionTargetHand,
    stepNumber?: number
  ): Promise<void> {
    switch (action) {
      case "mirror":
        await state.mirrorSequence(targetHand);
        return;
      case "flip":
        await state.flipSequence(targetHand);
        return;
      case "swap":
        await state.swapHands();
        return;
      case "invert":
        await state.invertSequence(targetHand);
        return;
      case "rewind":
        await state.rewindSequence(targetHand);
        return;
      case "rotate_counterclockwise":
        deps.setGridRotationDirection(-1);
        await state.rotateSequence("counterclockwise", targetHand);
        return;
      case "rotate_clockwise":
        deps.setGridRotationDirection(1);
        await state.rotateSequence("clockwise", targetHand);
        return;
      case "shift_start":
        await state.shiftStartPosition(stepNumber ?? 2);
    }
  }

  async function execute(
    action: SequenceTransformCommandId,
    options: SequenceTransformCommandOptions
  ): Promise<SequenceTransformCommandResult> {
    const startedAt = now();
    const state = deps.getSequenceState();
    const sequence = state?.currentSequence ?? null;
    const targetHand = options.targetHand ?? "both";
    const analytics: SequenceActionEventProperties = {
      action,
      source: options.source,
      targetHand: action === "swap" ? "both" : targetHand,
      createMode: deps.getCreateMode(),
      stepCount: sequence?.steps.length ?? 0,
      hasStartPosition: !!(
        sequence?.startPosition || sequence?.startingPosition
      ),
    };

    logSequenceActionInvoked(analytics);

    if (!state || !sequence) {
      logSequenceActionResult({
        ...analytics,
        outcome: "unavailable",
        durationMs: now() - startedAt,
      });
      return { status: "unavailable", message: "No active sequence" };
    }

    if (
      action === "shift_start" &&
      (sequence.steps.length <= 1 || (options.stepNumber ?? 2) < 2)
    ) {
      logSequenceActionResult({
        ...analytics,
        outcome: "unavailable",
        durationMs: now() - startedAt,
      });
      return {
        status: "unavailable",
        message: "Choose Start needs at least two steps",
      };
    }

    if (transformInFlight) {
      logSequenceActionResult({
        ...analytics,
        outcome: "busy",
        durationMs: now() - startedAt,
      });
      return { status: "busy" };
    }

    transformInFlight = true;
    deps.hapticService?.trigger("selection");

    try {
      deps.pushUndoSnapshot(UNDO_OPERATION[action]);
      await executeTransform(
        state,
        action,
        analytics.targetHand,
        options.stepNumber
      );
      logSequenceActionResult({
        ...analytics,
        outcome: "completed",
        durationMs: now() - startedAt,
      });
      return { status: "completed" };
    } catch (error) {
      deps.hapticService?.trigger("error");
      logSequenceActionResult({
        ...analytics,
        outcome: "failed",
        durationMs: now() - startedAt,
        errorName: errorName(error),
      });
      return { status: "failed", message: errorMessage(error) };
    } finally {
      transformInFlight = false;
    }
  }

  return {
    execute,
    get isBusy() {
      return transformInFlight;
    },
  };
}

export type SequenceTransformActionDispatcher = ReturnType<
  typeof createSequenceTransformActionDispatcher
>;
