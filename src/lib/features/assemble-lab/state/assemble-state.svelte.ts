/**
 * Public assemble-state facade.
 *
 * The reactive document, history, hydration, path editing, and setup controls
 * live in focused owners. Consumers keep one stable state API.
 */

import { createAssembleDocumentState } from "./assemble-document-state.svelte";
import { createAssembleHistoryController } from "./assemble-history-controller";
import { createAssembleHydrationController } from "./assemble-hydration-controller";
import {
  createAssemblePathController,
  type AssemblePathController,
} from "./assemble-path-controller";
import { createAssembleSettingsController } from "./assemble-settings-controller";
import { createAssembleHistoryMotionState } from "./assemble-history-motion-state.svelte";
import type {
  AssembleState,
  AssembleStateOptions,
} from "./assemble-state-types";

export type {
  AssembleDocumentChange,
  AssembleState,
  AssembleStateHydration,
  AssembleStateOptions,
  BuilderPhase,
  BuilderStartPose,
  BuilderStep,
  BuilderStepEditMode,
} from "./assemble-state-types";

export function createAssembleState(
  options: AssembleStateOptions = {}
): AssembleState {
  const document = createAssembleDocumentState();
  const historyMotion = createAssembleHistoryMotionState(
    options.onHistoryTransition
  );
  const pathRef: { current?: AssemblePathController } = {};
  const history = createAssembleHistoryController({
    document,
    stateOptions: options,
    beforeRestore: () => pathRef.current?.cancelPendingAction(),
    onRestore: historyMotion.start,
  });
  const path = createAssemblePathController(document, history);
  pathRef.current = path;
  const hydration = createAssembleHydrationController(
    document,
    history,
    path.cancelPendingAction
  );
  const settings = createAssembleSettingsController(
    document,
    history,
    path.cancelPendingAction
  );

  return {
    get phase() {
      return document.phase;
    },
    get activeHand() {
      return document.activeHand;
    },
    get gridMode() {
      return document.gridMode;
    },
    get leftSteps() {
      return document.leftSteps;
    },
    get rightSteps() {
      return document.rightSteps;
    },
    get startPoses() {
      return document.startPoses;
    },
    get currentPosition() {
      return document.currentPosition;
    },
    get currentOrientation() {
      return document.currentOrientation;
    },
    get rotationDirection() {
      return document.rotationDirection;
    },
    get turnCount() {
      return document.turnCount;
    },
    get showOrientationArrow() {
      return document.showOrientationArrow;
    },
    get arrowOrientation() {
      return document.arrowOrientation;
    },
    get activeSteps() {
      return document.activeSteps;
    },
    get stepCount() {
      return document.stepCount;
    },
    get canUndo() {
      return history.canUndo;
    },
    get canRedo() {
      return history.canRedo;
    },
    get undoLabel() {
      return history.undoLabel;
    },
    get redoLabel() {
      return history.redoLabel;
    },
    get historyTransition() {
      return historyMotion.transition;
    },
    get historyTransitionEpoch() {
      return historyMotion.epoch;
    },
    get canFinishHand() {
      return document.canFinishHand;
    },
    get showCenter() {
      return document.showCenter;
    },
    get canChangeGridMode() {
      return document.canChangeGridMode;
    },
    get keyboardMode() {
      return document.keyboardMode;
    },
    get selectedStepIndex() {
      return document.selectedStepIndex;
    },
    get stepEditMode() {
      return document.stepEditMode;
    },
    get canReorderSteps() {
      return document.canReorderSteps;
    },
    get canReplaceSelectedStep() {
      return document.canReplaceSelectedStep;
    },
    get candidateStartLocation() {
      return document.candidateStartLocation;
    },
    get candidateStartOrientation() {
      return document.candidateStartOrientation;
    },
    get candidateRotationDirection() {
      return document.candidateRotationDirection;
    },
    get candidateTurnCount() {
      return document.candidateTurnCount;
    },
    handlePointClick: path.handlePointClick,
    finishHand: path.finishHand,
    undoStep: history.undoStep,
    redoStep: history.redoStep,
    clearHistory: () => {
      history.clearHistory();
      historyMotion.clear();
    },
    selectStep: path.selectStep,
    deleteStepAt: path.deleteStepAt,
    deleteSelectedStep: path.deleteSelectedStep,
    moveStep: path.moveStep,
    moveSelectedStep: path.moveSelectedStep,
    beginReplaceSelectedStep: path.beginReplaceSelectedStep,
    cancelStepEdit: path.cancelStepEdit,
    beginExternalEdit: history.beginExternalEdit,
    hydrateFromExternalSequence: hydration.hydrateFromExternalSequence,
    hydrateFromSequence: hydration.hydrateFromSequence,
    reset: settings.reset,
    setStartPoses: settings.setStartPoses,
    setRotationDirection: settings.setRotationDirection,
    setTurnCount: settings.setTurnCount,
    setOrientation: settings.setOrientation,
    setGridMode: settings.setGridMode,
    setShowCenter: settings.setShowCenter,
    switchToHand: path.switchToHand,
    toggleKeyboardMode: settings.toggleKeyboardMode,
    setAnimationCallback: path.setAnimationCallback,
  };
}
