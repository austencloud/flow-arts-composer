/**
 * Animation State Service
 *
 * Focused service for managing prop states and coordinate calculations.
 * Single responsibility: Prop state management and coordinate transformations.
 */

import type {
  PropState,
  PropStates,
} from "#lib/shared/foundation/domain/types/prop-state.js";

export interface InterpolationResult {
  leftAngles: {
    centerPathAngle: number;
    staffRotationAngle: number;
    x?: number; // Optional Cartesian x coordinate (for dash motions)
    y?: number; // Optional Cartesian y coordinate (for dash motions)
  } | null; // null = hand not present in sequence
  rightAngles: {
    centerPathAngle: number;
    staffRotationAngle: number;
    x?: number; // Optional Cartesian x coordinate (for dash motions)
    y?: number; // Optional Cartesian y coordinate (for dash motions)
  } | null; // null = hand not present in sequence
  isValid: boolean;
}
export class AnimationStateManager {

  private leftPropState: PropState = {
    centerPathAngle: 0,
    staffRotationAngle: 0,
  };

  private rightPropState: PropState = {
    centerPathAngle: 0,
    staffRotationAngle: 0,
  };

  /**
   * Get current blue prop state
   */
  getLeftPropState(): PropState {
    return { ...this.leftPropState };
  }

  /**
   * Get current red prop state
   */
  getRightPropState(): PropState {
    return { ...this.rightPropState };
  }

  /**
   * Get both prop states
   */
  getPropStates(): PropStates {
    return {
      left: this.getLeftPropState(),
      right: this.getRightPropState(),
    };
  }

  /**
   * Update prop states from interpolation result
   */
  updatePropStates(interpolationResult: InterpolationResult): PropStates {
    // Only update blue prop state if hand is present (null = hand not in sequence)
    if (interpolationResult.leftAngles) {
      const leftUpdate: Partial<PropState> = {
        centerPathAngle: interpolationResult.leftAngles.centerPathAngle,
        staffRotationAngle: interpolationResult.leftAngles.staffRotationAngle,
      };
      if (
        "x" in interpolationResult.leftAngles &&
        "y" in interpolationResult.leftAngles
      ) {
        leftUpdate.x = interpolationResult.leftAngles.x;
        leftUpdate.y = interpolationResult.leftAngles.y;
      }
      this.updateLeftPropState(leftUpdate);
    }

    // Only update red prop state if hand is present (null = hand not in sequence)
    if (interpolationResult.rightAngles) {
      const rightUpdate: Partial<PropState> = {
        centerPathAngle: interpolationResult.rightAngles.centerPathAngle,
        staffRotationAngle: interpolationResult.rightAngles.staffRotationAngle,
      };
      if (
        "x" in interpolationResult.rightAngles &&
        "y" in interpolationResult.rightAngles
      ) {
        rightUpdate.x = interpolationResult.rightAngles.x;
        rightUpdate.y = interpolationResult.rightAngles.y;
      }
      this.updateRightPropState(rightUpdate);
    }

    return this.getPropStates();
  }

  /**
   * Update blue prop state
   * Dash motions provide their own x,y coordinates, other motions only provide angles
   * CRITICAL: Must clear x,y when not provided to avoid stale DASH coordinates persisting
   */
  updateLeftPropState(updates: Partial<PropState>): void {
    const newState: PropState = {
      centerPathAngle:
        updates.centerPathAngle ?? this.leftPropState.centerPathAngle,
      staffRotationAngle:
        updates.staffRotationAngle ?? this.leftPropState.staffRotationAngle,
    };

    // Only include x,y if explicitly provided in updates (DASH motions)
    // This ensures stale x,y from previous DASH motion doesn't persist into non-DASH motions
    if (updates.x !== undefined) newState.x = updates.x;
    if (updates.y !== undefined) newState.y = updates.y;

    this.leftPropState = newState;
  }

  /**
   * Update red prop state
   * Dash motions provide their own x,y coordinates, other motions only provide angles
   * CRITICAL: Must clear x,y when not provided to avoid stale DASH coordinates persisting
   */
  updateRightPropState(updates: Partial<PropState>): void {
    const newState: PropState = {
      centerPathAngle:
        updates.centerPathAngle ?? this.rightPropState.centerPathAngle,
      staffRotationAngle:
        updates.staffRotationAngle ?? this.rightPropState.staffRotationAngle,
    };

    // Only include x,y if explicitly provided in updates (DASH motions)
    // This ensures stale x,y from previous DASH motion doesn't persist into non-DASH motions
    if (updates.x !== undefined) newState.x = updates.x;
    if (updates.y !== undefined) newState.y = updates.y;

    this.rightPropState = newState;
  }

  /**
   * Set prop states directly (for initialization)
   */
  setPropStates(left: PropState, right: PropState): void {
    this.leftPropState = { ...left };
    this.rightPropState = { ...right };
  }

  /**
   * Reset prop states to default
   */
  resetPropStates(): void {
    this.leftPropState = {
      centerPathAngle: 0,
      staffRotationAngle: Math.PI,
    };
    this.rightPropState = {
      centerPathAngle: Math.PI,
      staffRotationAngle: 0,
    };
  }
}
