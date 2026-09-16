/**
 * Create Tutorial State
 *
 * Manages the 4-step create tutorial wizard.
 * The "add-step" step repeats until the user has picked REQUIRED_STEPS steps.
 */

import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

export const REQUIRED_STEPS = 4;

export type CreateTutorialStep =
  | "pick-start"
  | "add-step"
  | "play-sequence"
  | "ready";

const STEPS: CreateTutorialStep[] = [
  "pick-start",
  "add-step",
  "play-sequence",
  "ready",
];

interface CreateTutorialData {
  currentStepIndex: number;
  startPlacement: PictographData | null;
  gridMode: GridMode;
  steps: PictographData[];
}

function createCreateTutorialState() {
  const data = $state<CreateTutorialData>({
    currentStepIndex: 0,
    startPlacement: null,
    gridMode: GridMode.DIAMOND,
    steps: [],
  });

  return {
    get currentStepIndex() {
      return data.currentStepIndex;
    },
    get currentStep(): CreateTutorialStep {
      return STEPS[data.currentStepIndex] ?? "ready";
    },
    get totalSteps() {
      return STEPS.length;
    },
    get progress() {
      return ((data.currentStepIndex + 1) / STEPS.length) * 100;
    },
    get startPlacement() {
      return data.startPlacement;
    },
    get gridMode() {
      return data.gridMode;
    },
    get steps(): PictographData[] {
      return data.steps;
    },
    /** Full sequence: start placement + all steps */
    get sequence(): PictographData[] {
      const seq: PictographData[] = [];
      if (data.startPlacement) seq.push(data.startPlacement);
      seq.push(...data.steps);
      return seq;
    },
    get stepsRemaining() {
      return REQUIRED_STEPS - data.steps.length;
    },

    setStartPlacement(pos: PictographData, gridMode?: GridMode) {
      data.startPlacement = pos;
      // Clear steps - they were computed from the old start placement
      data.steps = [];
      if (gridMode) {
        data.gridMode = gridMode;
      }
    },

    addStep(step: PictographData) {
      data.steps.push(step);
    },

    /** Remove the last step (for undo/back within the add-step step) */
    removeLastStep() {
      data.steps.pop();
    },

    advance() {
      if (data.currentStepIndex < STEPS.length - 1) {
        data.currentStepIndex++;
      }
    },

    goBack() {
      if (data.currentStepIndex > 0) {
        data.currentStepIndex--;
      }
    },

    goToStep(index: number) {
      if (index >= 0 && index < STEPS.length) {
        data.currentStepIndex = index;
      }
    },

    reset() {
      data.currentStepIndex = 0;
      data.startPlacement = null;
      data.gridMode = GridMode.DIAMOND;
      data.steps = [];
    },
  };
}

export const createTutorialState = createCreateTutorialState();
