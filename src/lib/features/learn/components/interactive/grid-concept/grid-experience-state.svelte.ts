/**
 * Grid Experience State Machine
 * Manages screen progression, persistence, and accessibility announcements
 */

import { getExperiencePersistence } from "../../../state/experience-persistence.svelte";
import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";

export type GridPhase = "split" | "diamond-labels" | "box-labels" | "merged";
export type PointTypePhase = "center" | "hand" | "outer";
export type EffectivePhase =
  | "intro"
  | "split"
  | "diamond-labels"
  | "box-labels"
  | "merged"
  | "diamond";
export type HighlightPhase = "none" | "center" | "hand" | "outer";

export const GRID_LAST_STEP = 2;

export function normalizeGridStep(step: number): number {
  if (!Number.isFinite(step)) return 0;
  return Math.max(0, Math.min(GRID_LAST_STEP, Math.trunc(step)));
}

export interface GridScreen {
  step: number;
  gridPhase: GridPhase;
  pointTypePhase: PointTypePhase;
  announcementKey: string;
}

/** The lesson, screen by screen. Everything the lesson shows reads from here. */
export const GRID_SCREENS: readonly GridScreen[] = [
  {
    step: 0,
    gridPhase: "split",
    pointTypePhase: "center",
    announcementKey: "learn_grid_announcement_intro",
  },
  {
    step: 1,
    gridPhase: "split",
    pointTypePhase: "center",
    announcementKey: "learn_grid_announcement_split",
  },
  {
    step: 1,
    gridPhase: "diamond-labels",
    pointTypePhase: "center",
    announcementKey: "learn_grid_announcement_diamond",
  },
  {
    step: 1,
    gridPhase: "box-labels",
    pointTypePhase: "center",
    announcementKey: "learn_grid_announcement_box",
  },
  {
    step: 1,
    gridPhase: "merged",
    pointTypePhase: "center",
    announcementKey: "learn_grid_announcement_merged",
  },
  {
    step: 2,
    gridPhase: "split",
    pointTypePhase: "center",
    announcementKey: "learn_grid_announcement_center",
  },
  {
    step: 2,
    gridPhase: "split",
    pointTypePhase: "hand",
    announcementKey: "learn_grid_announcement_hand",
  },
  {
    step: 2,
    gridPhase: "split",
    pointTypePhase: "outer",
    announcementKey: "learn_grid_announcement_outer",
  },
];

/**
 * The screen a saved place points at. Saved places keep the step and phase
 * fields they always had, and a phase this lesson no longer has lands on the
 * first screen of its step.
 */
export function gridScreenIndexFromSaved(saved: {
  step: number;
  phaseData?: Record<string, unknown>;
}): number {
  const step = normalizeGridStep(saved.step);
  const firstOfStep = GRID_SCREENS.findIndex((screen) => screen.step === step);
  if (step === 0) return firstOfStep;
  const field = step === 1 ? "gridPhase" : "pointTypePhase";
  const exact = GRID_SCREENS.findIndex(
    (screen) => screen.step === step && screen[field] === saved.phaseData?.[field]
  );
  return exact >= 0 ? exact : firstOfStep;
}

export function createGridExperienceState(isScrollMode: boolean = false) {
  const persistence = getExperiencePersistence("grid");
  const initialState = !isScrollMode
    ? persistence.load()
    : { step: 0, phaseData: {} };

  // One number holds the place, and it changes in the press that moved it, so
  // presses inside one frame each move one screen and can't run past either end.
  let screenIndex = $state(gridScreenIndexFromSaved(initialState));
  let announcement = $state("");

  const screen = $derived(GRID_SCREENS[screenIndex]!);

  // Derived phases for GridMergeAnimation
  const effectivePhase = $derived<EffectivePhase>(
    // Point types are taught on the four-point diamond the copy describes,
    // which is also the grid Hand Placements continues on.
    screen.step === 0
      ? "intro"
      : screen.step === 1
        ? screen.gridPhase
        : "diamond"
  );

  const effectiveHighlightPhase = $derived<HighlightPhase>(
    screen.step === 2 ? screen.pointTypePhase : "none"
  );

  // Store the key so the live text follows a locale change.
  function announce() {
    announcement = "";
    requestAnimationFrame(() => {
      announcement = screen.announcementKey;
    });
  }

  function startAnimations() {
    requestAnimationFrame(announce);
  }

  function moveTo(index: number): boolean {
    if (index < 0 || index >= GRID_SCREENS.length) return false;
    screenIndex = index;
    const { step, gridPhase, pointTypePhase } = GRID_SCREENS[index]!;
    persistence.saveStep(step);
    persistence.savePhaseData("gridPhase", gridPhase);
    persistence.savePhaseData("pointTypePhase", pointTypePhase);
    announce();
    return true;
  }

  /** Moves one screen on. False on the last screen, where nothing changes. */
  function next(): boolean {
    return moveTo(screenIndex + 1);
  }

  /** Moves one screen back. False on the first screen, where nothing changes. */
  function previous(): boolean {
    return moveTo(screenIndex - 1);
  }

  function reset() {
    persistence.reset();
  }

  return {
    // State (reactive getters)
    get step() {
      return screen.step;
    },
    get gridPhase() {
      return screen.gridPhase;
    },
    get pointTypePhase() {
      return screen.pointTypePhase;
    },
    get screenIndex() {
      return screenIndex;
    },
    get isLastScreen() {
      return screenIndex === GRID_SCREENS.length - 1;
    },
    get announcement() {
      return announcement ? tDynamic(announcement) : "";
    },
    get effectivePhase() {
      return effectivePhase;
    },
    get effectiveHighlightPhase() {
      return effectiveHighlightPhase;
    },
    screenTotal: GRID_SCREENS.length,

    // Actions
    startAnimations,
    next,
    previous,
    reset,
  };
}

export type GridExperienceStateManager = ReturnType<
  typeof createGridExperienceState
>;
