/**
 * Step Editor Tour State
 *
 * Tracks whether the user has seen the step editor coach marks tour.
 * Triggers the first time the step editor opens with a beat selected.
 */

import { AUTO_TOURS_ENABLED } from "../domain/onboarding-flags";
import {
  safeLocalStorageSetItem,
  removeLocalStorageItem,
} from "#lib/shared/foundation/services/storage-manager.js";

const TOUR_COMPLETED_KEY = "tka-step-editor-tour-completed";

export type StepEditorTourStop =
  | "welcome"
  | "preview"
  | "turns"
  | "duration";

const STOPS: StepEditorTourStop[] = [
  "welcome",
  "preview",
  "turns",
  "duration",
];

interface StepEditorTourData {
  hasCompleted: boolean;
  isActive: boolean;
  currentStopIndex: number;
}

function createStepEditorTourState() {
  const isBrowser = typeof window !== "undefined";

  const completed = isBrowser
    ? localStorage.getItem(TOUR_COMPLETED_KEY) === "true"
    : false;

  const data = $state<StepEditorTourData>({
    hasCompleted: completed,
    isActive: false,
    currentStopIndex: 0,
  });

  return {
    get hasCompleted() {
      return data.hasCompleted;
    },
    get isActive() {
      return data.isActive;
    },
    get currentStopIndex() {
      return data.currentStopIndex;
    },
    get currentStop(): StepEditorTourStop {
      return STOPS[data.currentStopIndex] ?? "duration";
    },
    get totalStops() {
      return STOPS.length;
    },
    get isLastStop() {
      return data.currentStopIndex >= STOPS.length - 1;
    },

    /** Start tour if user hasn't seen it yet. Returns true if tour started. */
    triggerIfFirstTime(): boolean {
      if (!AUTO_TOURS_ENABLED) return false;
      if (data.hasCompleted) return false;
      data.isActive = true;
      data.currentStopIndex = 0;
      return true;
    },

    advance() {
      if (data.currentStopIndex < STOPS.length - 1) {
        data.currentStopIndex++;
      } else {
        this.complete();
      }
    },

    complete() {
      if (!isBrowser) return;
      data.isActive = false;
      data.hasCompleted = true;
      safeLocalStorageSetItem(TOUR_COMPLETED_KEY, "true");
    },

    skip() {
      if (!isBrowser) return;
      data.isActive = false;
      data.hasCompleted = true;
      safeLocalStorageSetItem(TOUR_COMPLETED_KEY, "true");
    },

    /** Reset for testing/development */
    reset() {
      if (!isBrowser) return;
      data.hasCompleted = false;
      data.isActive = false;
      data.currentStopIndex = 0;
      removeLocalStorageItem(TOUR_COMPLETED_KEY);
    },
  };
}

export const stepEditorTourState = createStepEditorTourState();
