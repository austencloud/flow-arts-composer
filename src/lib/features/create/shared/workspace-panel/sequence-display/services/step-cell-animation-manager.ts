/**
 * StepCellAnimationManager
 *
 * Manages animation state for a single StepCell. Each cell instance should
 * have its own manager instance to track its individual animation state.
 *
 * This class consolidates the animation state management that was previously
 * spread across multiple $effect blocks and state variables in StepCell.svelte.
 */

import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StepCellAnimationState } from "./types";

/**
 * Creates a pictograph signature representing the fundamental structure
 * independent of transformations (which only change arrow locations/rotations).
 */
function getPictographSignature(stepData: StepData): string {
  if (stepData.isBlank) return "blank";

  // Invisible placeholder = hand not really there (both-required Step shape):
  // encode only visible hands so absence-to-presence transitions still
  // retrigger the cell bloom animation.
  const hasLeft = isVisibleMotion(stepData.motions?.left);
  const hasRight = isVisibleMotion(stepData.motions?.right);
  const motionStructure = `${hasLeft ? "B" : ""}${hasRight ? "R" : ""}`;

  return `${stepData.letter || "null"}-${motionStructure}`;
}

export class StepCellAnimationManager {
  // Animation state
  private hasAnimated = false;
  private enableTransitions = false;

  // Tracking for change detection
  private previousStepId = "";
  private previousEpoch = 0;
  private previousSignature = "";
  private previousIdForTransitions = "";

  // Timer for disabling transitions after animation completes
  private transitionTimer: ReturnType<typeof setTimeout> | null = null;

  getState(): StepCellAnimationState {
    return {
      hasAnimated: this.hasAnimated,
      enableTransitions: this.enableTransitions,
    };
  }

  shouldAnimateIn(shouldAnimate: boolean, isBlank: boolean): boolean {
    // Animate when:
    // 1. shouldAnimate prop is true (parent says this step should animate)
    // 2. hasAnimated is false (haven't animated yet)
    // 3. step is not blank
    return shouldAnimate && !this.hasAnimated && !isBlank;
  }

  isVisible(shouldAnimate: boolean, index: number, isBlank: boolean): boolean {
    // If it should animate but hasn't yet, hide it (will become visible via animation)
    // Only hide when shouldAnimate is ACTIVELY true - once the parent clears
    // animation state (shouldAnimate becomes false), the cell must be visible
    // regardless of hasAnimated, to prevent cells getting stuck invisible
    // when cleanupAnimation() runs before the CSS animationend event fires.
    if (shouldAnimate && !this.hasAnimated) return false;

    // Special case: Start placement tile (index -1) should be visible even when blank
    if (index === -1) return true;

    // If it's a blank step, never show it
    if (isBlank) return false;

    // Otherwise, show it
    return true;
  }

  onStepChanged(stepId: string): void {
    if (stepId !== this.previousStepId) {
      this.hasAnimated = false;
      this.previousStepId = stepId;
    }
  }

  onEpochChanged(epoch: number): void {
    if (epoch !== this.previousEpoch) {
      this.hasAnimated = false;
      this.previousEpoch = epoch;
    }
  }

  onDataChanged(step: StepData): void {
    const currentSignature = getPictographSignature(step);
    const signatureChanged = currentSignature !== this.previousSignature;
    const idChanged = step.id !== this.previousIdForTransitions;

    // Only enable fade transitions when loading genuinely different content
    // (id changed AND signature changed). Transforms keep same id.
    if (idChanged && signatureChanged && !step.isBlank) {
      this.enableTransitions = true;

      // Clear any existing timer
      if (this.transitionTimer) {
        clearTimeout(this.transitionTimer);
      }

      // Disable transitions after animation completes
      this.transitionTimer = setTimeout(() => {
        this.enableTransitions = false;
        this.transitionTimer = null;
      }, 350); // Match pictograph fade-in duration
    }

    this.previousSignature = currentSignature;
    this.previousIdForTransitions = step.id;
  }

  onAnimationEnd(shouldAnimateIn: boolean): void {
    // Only mark as animated if we're currently supposed to be animating.
    // This prevents stale animationend events from old animations
    // from incorrectly setting hasAnimated=true before the new animation starts.
    if (shouldAnimateIn) {
      this.hasAnimated = true;
    }
  }

  reset(): void {
    this.hasAnimated = false;
    this.enableTransitions = false;
    this.previousStepId = "";
    this.previousEpoch = 0;
    this.previousSignature = "";
    this.previousIdForTransitions = "";

    if (this.transitionTimer) {
      clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
    }
  }
}

/**
 * Factory function for creating StepCellAnimationManager instances.
 * Each StepCell component should create its own instance.
 */
export function createStepCellAnimationManager(): StepCellAnimationManager {
  return new StepCellAnimationManager();
}
