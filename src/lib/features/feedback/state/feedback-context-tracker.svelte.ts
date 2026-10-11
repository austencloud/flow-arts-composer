/**
 * Feedback Context Tracker
 *
 * Provides access to the user's location when submitting feedback.
 * Handles two scenarios:
 * 1. Quick feedback (overlay) - user is still on their current module
 * 2. Feedback module - user navigated away, use previous module
 */

import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";

/**
 * Update the tracked context.
 * @deprecated No longer needed - navigation state tracks previous module/tab automatically
 */
export function updateFeedbackContext() {
  // No-op: navigation state now tracks this globally
}

/**
 * Get the captured context (module:tab where user is/was)
 */
export function getCapturedContext() {
  return {
    get module() {
      return getCapturedModule();
    },
    get tab() {
      return getCapturedTab();
    },
  };
}

/**
 * Get the captured module (where user is/was when submitting feedback)
 * - If on feedback module: use previous (where they came from)
 * - If on any other module (quick feedback): use current (where they are)
 */
export function getCapturedModule(): string {
  const current = navigationState.currentModule;

  // Quick feedback: user is still on their module (not on feedback module)
  if (current !== "feedback") {
    return current;
  }

  // Feedback module: user navigated here, use where they came from
  return navigationState.previousModule || current;
}

/**
 * Get the captured tab (tab user is/was on when submitting feedback)
 */
export function getCapturedTab(): string {
  const current = navigationState.currentModule;

  // Quick feedback: user is still on their module
  if (current !== "feedback") {
    return navigationState.activeTab;
  }

  // Feedback module: use where they came from
  return navigationState.previousTab || navigationState.activeTab;
}
