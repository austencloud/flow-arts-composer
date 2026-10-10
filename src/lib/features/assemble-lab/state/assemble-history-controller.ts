import { CommandStack } from "#lib/shared/history/command-stack.svelte.js";
import {
  cloneBuilderSteps,
  cloneStartPoses,
  type AssembleDocumentState,
} from "./assemble-document-state.svelte";
import type { AssembleHistoryDirection } from "../services/assemble-history-transition-planner";
import type {
  AssembleDocumentChange,
  AssembleSnapshot,
  AssembleStateOptions,
  BuilderPhase,
} from "./assemble-state-types";

export interface AssembleHistoryController {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoLabel: string | undefined;
  readonly redoLabel: string | undefined;

  notifyDocumentChange(change?: AssembleDocumentChange): void;
  takeSnapshot(): AssembleSnapshot;
  recordSnapshot(label: string, before: AssembleSnapshot): void;
  beginExternalEdit(label: string): void;
  beginExternalHydration(previousDocument: unknown, label: string): void;
  scheduleExternalEditFinalization(): void;
  undoStep(): boolean;
  redoStep(): boolean;
  clearHistory(): void;
}

interface CreateAssembleHistoryOptions {
  readonly document: AssembleDocumentState;
  readonly stateOptions: AssembleStateOptions;
  readonly beforeRestore: () => void;
  readonly onRestore: (
    direction: AssembleHistoryDirection,
    label: string,
    from: AssembleSnapshot,
    to: AssembleSnapshot
  ) => void;
}

function cloneDocument(document: unknown): unknown {
  if (document === undefined) return undefined;
  return JSON.parse(JSON.stringify(document)) as unknown;
}

export function createAssembleHistoryController({
  document,
  stateOptions,
  beforeRestore,
  onRestore,
}: CreateAssembleHistoryOptions): AssembleHistoryController {
  const history = new CommandStack();
  let pendingExternalEdit: {
    readonly before: AssembleSnapshot;
    readonly label: string;
  } | null = null;
  let externalEditFinalizeScheduled = false;

  function notifyDocumentChange(change?: AssembleDocumentChange): void {
    stateOptions.onDocumentChange?.(change);
  }

  function stablePhase(): Exclude<BuilderPhase, "animating"> {
    return document.phase === "animating" ? "building" : document.phase;
  }

  function takeSnapshot(): AssembleSnapshot {
    return {
      phase: stablePhase(),
      activeHand: document.activeHand,
      gridMode: document.gridMode,
      showCenter: document.showCenter,
      startPoses: cloneStartPoses(document.startPoses),
      leftSteps: cloneBuilderSteps(document.leftSteps),
      rightSteps: cloneBuilderSteps(document.rightSteps),
      currentPosition: document.currentPosition,
      currentOrientation: document.currentOrientation,
      rotationDirection: document.rotationDirection,
      turnCount: document.turnCount,
      selectedStepIndex: document.selectedStepIndex,
      stepEditMode: document.stepEditMode,
      document: cloneDocument(stateOptions.captureDocument?.()),
    };
  }

  function restoreSnapshot(snapshot: AssembleSnapshot): void {
    beforeRestore();
    pendingExternalEdit = null;
    document.phase = snapshot.phase;
    document.activeHand = snapshot.activeHand;
    document.gridMode = snapshot.gridMode;
    document.showCenter = snapshot.showCenter;
    document.startPoses = cloneStartPoses(snapshot.startPoses);
    document.leftSteps = cloneBuilderSteps(snapshot.leftSteps);
    document.rightSteps = cloneBuilderSteps(snapshot.rightSteps);
    document.currentPosition = snapshot.currentPosition;
    document.currentOrientation = snapshot.currentOrientation;
    document.rotationDirection = snapshot.rotationDirection;
    document.turnCount = snapshot.turnCount;
    document.selectedStepIndex = snapshot.selectedStepIndex;
    document.stepEditMode = snapshot.stepEditMode;
    document.showOrientationArrow = false;
    if (stateOptions.restoreDocument && snapshot.document !== undefined) {
      stateOptions.restoreDocument(cloneDocument(snapshot.document));
    } else {
      notifyDocumentChange();
    }
  }

  function recordSnapshot(label: string, before: AssembleSnapshot): void {
    const after = takeSnapshot();
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    history.record({
      label,
      execute: () => {
        onRestore("redo", label, before, after);
        restoreSnapshot(after);
      },
      undo: () => {
        onRestore("undo", label, after, before);
        restoreSnapshot(before);
      },
    });
  }

  function finalizeExternalEdit(): void {
    externalEditFinalizeScheduled = false;
    const pending = pendingExternalEdit;
    pendingExternalEdit = null;
    if (pending) recordSnapshot(pending.label, pending.before);
  }

  function scheduleExternalEditFinalization(): void {
    if (externalEditFinalizeScheduled) return;
    externalEditFinalizeScheduled = true;
    queueMicrotask(finalizeExternalEdit);
  }

  function beginExternalEdit(label: string): void {
    if (pendingExternalEdit) return;
    pendingExternalEdit = { before: takeSnapshot(), label };
  }

  function beginExternalHydration(
    previousDocument: unknown,
    label: string
  ): void {
    if (pendingExternalEdit) return;
    pendingExternalEdit = {
      before: {
        ...takeSnapshot(),
        document: cloneDocument(previousDocument),
      },
      label,
    };
  }

  function undoStep(): boolean {
    if (document.phase === "animating") return false;
    finalizeExternalEdit();
    if (!history.canUndo) return false;
    return history.undo();
  }

  function redoStep(): boolean {
    if (document.phase === "animating") return false;
    finalizeExternalEdit();
    if (!history.canRedo) return false;
    return history.redo();
  }

  function clearHistory(): void {
    pendingExternalEdit = null;
    externalEditFinalizeScheduled = false;
    history.clear();
  }

  return {
    get canUndo() {
      return history.canUndo && document.phase !== "animating";
    },
    get canRedo() {
      return history.canRedo && document.phase !== "animating";
    },
    get undoLabel() {
      return history.undoLabel;
    },
    get redoLabel() {
      return history.redoLabel;
    },
    notifyDocumentChange,
    takeSnapshot,
    recordSnapshot,
    beginExternalEdit,
    beginExternalHydration,
    scheduleExternalEditFinalization,
    undoStep,
    redoStep,
    clearHistory,
  };
}
