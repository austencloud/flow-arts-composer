/**
 * Type1ConceptState - Centralized state management for Type 1 concept lesson
 * Manages page navigation and letter cycling for each motion type category
 * Includes persistence for HMR/refresh survival
 */

import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
import {
  PROSPIN_LETTERS,
  ANTISPIN_LETTERS,
  HYBRID_LETTERS,
} from "../domain/type1-letter-data";
import { getExperiencePersistence } from "../../../../../state/experience-persistence.svelte";

export interface Type1ConceptStateOptions {
  hapticService: HapticFeedback | null;
  getOnComplete?: () => (() => void) | undefined;
}

export interface Type1ConceptState {
  // Page navigation
  currentPage: number;
  readonly totalPages: number;
  readonly canGoNext: boolean;
  readonly canGoPrevious: boolean;
  readonly isQuizPage: boolean;

  // Letter cycling indices
  prospinIndex: number;
  antispinIndex: number;
  hybridIndex: number;

  // Current displayed letters (derived)
  readonly currentProspin: (typeof PROSPIN_LETTERS)[number] | undefined;
  readonly currentAntispin: (typeof ANTISPIN_LETTERS)[number] | undefined;
  readonly currentHybrid: (typeof HYBRID_LETTERS)[number] | undefined;

  // Navigation methods
  nextPage: () => void;
  previousPage: () => void;
  goToPage: (page: number) => void;
  complete: () => void;

  // Letter cycling methods
  cycleProspin: (direction: 1 | -1) => void;
  cycleAntispin: (direction: 1 | -1) => void;
  cycleHybrid: (direction: 1 | -1) => void;
  selectProspinLetter: (index: number) => void;
  selectAntispinLetter: (index: number) => void;
  selectHybridLetter: (index: number) => void;
}

export function createType1ConceptState(
  options: Type1ConceptStateOptions
): Type1ConceptState {
  const { hapticService, getOnComplete } = options;
  const totalPages = 5;

  // Persistence for HMR/refresh survival
  const persistence = getExperiencePersistence("type1");
  const initialState = persistence.load();

  // Core state (initialized from persistence)
  let currentPage = $state(initialState.step || 1);
  let prospinIndex = $state(
    (initialState.phaseData?.prospinIndex as number) ?? 0
  );
  let antispinIndex = $state(
    (initialState.phaseData?.antispinIndex as number) ?? 0
  );
  let hybridIndex = $state(
    (initialState.phaseData?.hybridIndex as number) ?? 0
  );

  // Derived state
  const canGoNext = $derived(currentPage < totalPages);
  const canGoPrevious = $derived(currentPage > 1);
  const isQuizPage = $derived(currentPage === 5);

  const currentProspin = $derived(PROSPIN_LETTERS[prospinIndex]);
  const currentAntispin = $derived(ANTISPIN_LETTERS[antispinIndex]);
  const currentHybrid = $derived(HYBRID_LETTERS[hybridIndex]);

  // Navigation methods
  function nextPage() {
    hapticService?.trigger("selection");
    if (currentPage < totalPages) {
      currentPage++;
      persistence.saveStep(currentPage);
    } else {
      getOnComplete?.()?.();
    }
  }

  function previousPage() {
    hapticService?.trigger("selection");
    if (currentPage > 1) {
      currentPage--;
      persistence.saveStep(currentPage);
    }
  }

  function goToPage(page: number) {
    if (page >= 1 && page <= totalPages) {
      hapticService?.trigger("selection");
      currentPage = page;
      persistence.saveStep(currentPage);
    }
  }

  function complete() {
    hapticService?.trigger("success");
    persistence.reset();
    getOnComplete?.()?.();
  }

  // Letter cycling methods
  function cycleProspin(direction: 1 | -1) {
    const newIndex = prospinIndex + direction;
    if (newIndex >= 0 && newIndex < PROSPIN_LETTERS.length) {
      prospinIndex = newIndex;
      persistence.savePhaseData("prospinIndex", prospinIndex);
      hapticService?.trigger("selection");
    }
  }

  function cycleAntispin(direction: 1 | -1) {
    const newIndex = antispinIndex + direction;
    if (newIndex >= 0 && newIndex < ANTISPIN_LETTERS.length) {
      antispinIndex = newIndex;
      persistence.savePhaseData("antispinIndex", antispinIndex);
      hapticService?.trigger("selection");
    }
  }

  function cycleHybrid(direction: 1 | -1) {
    const newIndex = hybridIndex + direction;
    if (newIndex >= 0 && newIndex < HYBRID_LETTERS.length) {
      hybridIndex = newIndex;
      persistence.savePhaseData("hybridIndex", hybridIndex);
      hapticService?.trigger("selection");
    }
  }

  function selectProspinLetter(index: number) {
    if (index >= 0 && index < PROSPIN_LETTERS.length) {
      prospinIndex = index;
      persistence.savePhaseData("prospinIndex", prospinIndex);
      hapticService?.trigger("selection");
    }
  }

  function selectAntispinLetter(index: number) {
    if (index >= 0 && index < ANTISPIN_LETTERS.length) {
      antispinIndex = index;
      persistence.savePhaseData("antispinIndex", antispinIndex);
      hapticService?.trigger("selection");
    }
  }

  function selectHybridLetter(index: number) {
    if (index >= 0 && index < HYBRID_LETTERS.length) {
      hybridIndex = index;
      persistence.savePhaseData("hybridIndex", hybridIndex);
      hapticService?.trigger("selection");
    }
  }

  return {
    get currentPage() {
      return currentPage;
    },
    set currentPage(value: number) {
      currentPage = value;
    },
    get totalPages() {
      return totalPages;
    },
    get canGoNext() {
      return canGoNext;
    },
    get canGoPrevious() {
      return canGoPrevious;
    },
    get isQuizPage() {
      return isQuizPage;
    },
    get prospinIndex() {
      return prospinIndex;
    },
    set prospinIndex(value: number) {
      prospinIndex = value;
    },
    get antispinIndex() {
      return antispinIndex;
    },
    set antispinIndex(value: number) {
      antispinIndex = value;
    },
    get hybridIndex() {
      return hybridIndex;
    },
    set hybridIndex(value: number) {
      hybridIndex = value;
    },
    get currentProspin() {
      return currentProspin;
    },
    get currentAntispin() {
      return currentAntispin;
    },
    get currentHybrid() {
      return currentHybrid;
    },
    nextPage,
    previousPage,
    goToPage,
    complete,
    cycleProspin,
    cycleAntispin,
    cycleHybrid,
    selectProspinLetter,
    selectAntispinLetter,
    selectHybridLetter,
  };
}
