import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  cloneBuilderSteps,
  cloneStartPoses,
  type AssembleDocumentState,
} from "./assemble-document-state.svelte";
import type { AssembleHistoryController } from "./assemble-history-controller";
import type { AssembleStateHydration } from "./assemble-state-types";

export interface AssembleHydrationController {
  hydrateFromExternalSequence(
    snapshot: AssembleStateHydration,
    previousDocument: unknown,
    label?: string
  ): void;
  hydrateFromSequence(snapshot: AssembleStateHydration): void;
}

export function createAssembleHydrationController(
  document: AssembleDocumentState,
  history: AssembleHistoryController,
  cancelPendingAction: () => void
): AssembleHydrationController {
  function applyHydration(snapshot: AssembleStateHydration): void {
    cancelPendingAction();
    document.leftSteps = cloneBuilderSteps(snapshot.leftSteps);
    document.rightSteps = cloneBuilderSteps(snapshot.rightSteps);
    document.startPoses = cloneStartPoses(snapshot.startPoses);
    document.gridMode = snapshot.gridMode;
    document.showCenter =
      [...document.leftSteps, ...document.rightSteps].some(
        (step) =>
          step.startLocation === GridLocation.CENTER ||
          step.endLocation === GridLocation.CENTER
      ) ||
      Object.values(document.startPoses).some(
        (pose) => pose?.location === GridLocation.CENTER
      );

    if (document.leftSteps.length > document.rightSteps.length) {
      document.activeHand = HandSide.RIGHT;
    } else if (document.rightSteps.length > document.leftSteps.length) {
      document.activeHand = HandSide.LEFT;
    } else if (
      document.leftSteps.length === 0 &&
      document.startPoses[HandSide.RIGHT] &&
      !document.startPoses[HandSide.LEFT]
    ) {
      document.activeHand = HandSide.RIGHT;
    } else {
      document.activeHand = HandSide.LEFT;
    }

    document.selectedStepIndex = null;
    document.stepEditMode = null;
    document.syncActiveCursor();
  }

  function matchesCurrentHydration(snapshot: AssembleStateHydration): boolean {
    return (
      document.gridMode === snapshot.gridMode &&
      JSON.stringify(document.startPoses) ===
        JSON.stringify(snapshot.startPoses) &&
      JSON.stringify(document.leftSteps) ===
        JSON.stringify(snapshot.leftSteps) &&
      JSON.stringify(document.rightSteps) === JSON.stringify(snapshot.rightSteps)
    );
  }

  function hydrateFromExternalSequence(
    snapshot: AssembleStateHydration,
    previousDocument: unknown,
    label = "Edit sequence"
  ): void {
    history.beginExternalHydration(previousDocument, label);
    if (!matchesCurrentHydration(snapshot)) {
      const previousHand = document.activeHand;
      const previousSelection = document.selectedStepIndex;
      applyHydration(snapshot);
      const previousHandHasContent =
        Boolean(document.startPoses[previousHand]) ||
        (previousHand === HandSide.LEFT
          ? document.leftSteps.length > 0
          : document.rightSteps.length > 0);
      if (previousHandHasContent) document.activeHand = previousHand;
      const total = Math.max(
        document.leftSteps.length,
        document.rightSteps.length
      );
      document.selectedStepIndex =
        previousSelection !== null && previousSelection < total
          ? previousSelection
          : null;
      document.syncActiveCursor();
    }
    history.scheduleExternalEditFinalization();
  }

  function hydrateFromSequence(snapshot: AssembleStateHydration): void {
    applyHydration(snapshot);
    history.clearHistory();
  }

  return { hydrateFromExternalSequence, hydrateFromSequence };
}
