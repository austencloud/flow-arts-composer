/**
 * Quick Feedback State
 *
 * Manages the visibility of the quick feedback panel (desktop hotkey overlay).
 * Shares state with the submit tab for draft persistence.
 * Persists open state to localStorage so panel restores on refresh.
 */

import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";

const STORAGE_KEY = "tka-quick-feedback-open";

function getInitialOpenState(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function persistOpenState(open: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (open) {
      localStorage.setItem(STORAGE_KEY, "true");
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage unavailable
  }
}

let isOpen = $state(getInitialOpenState());

/**
 * Check if we're currently on the feedback submit tab.
 * If so, the quick panel should not open (redundant).
 */
function isInFeedbackSubmitTab(): boolean {
  return (
    navigationState.currentModule === "feedback" &&
    navigationState.activeTab === "submit"
  );
}

export const quickFeedbackState = {
  get isOpen() {
    return isOpen;
  },

  open() {
    // Don't open if already on the submit tab - it's redundant
    if (isInFeedbackSubmitTab()) {
      return;
    }
    isOpen = true;
    persistOpenState(true);
  },

  close() {
    isOpen = false;
    persistOpenState(false);
  },

  toggle() {
    // Don't toggle on if already on the submit tab
    if (!isOpen && isInFeedbackSubmitTab()) {
      return;
    }
    isOpen = !isOpen;
    persistOpenState(isOpen);
  },
};
