/**
 * HandAssigner - Hand slot assignment logic
 *
 * Responsibility: Assign detected hands to blue (left) and red (right) slots
 * using spatial position for two-hand detection and proximity matching for
 * single-hand detection. Also handles hand persistence.
 */

import type { HandTrackingStabilizer } from "./hand-tracking-stabilizer";
import type { DetectedPosition } from "#lib/shared/train/domain/detection-frame.js";

export interface DetectedHandData {
  position: DetectedPosition;
  wristX: number;
  isUserLeftHand: boolean;
  confidence: number;
}

export interface HandAssignmentResult {
  left: DetectedPosition | null;
  right: DetectedPosition | null;
}
import { mapToQuadrant } from "./quadrant-mapper";

// How many frames to persist a hand after it disappears
const HAND_PERSISTENCE_FRAMES = 5;

export class HandAssigner {
  // Track last known positions for persistence
  private _lastLeftPosition: DetectedPosition | null = null;
  private _lastRightPosition: DetectedPosition | null = null;
  private _leftFramesMissing = 0;
  private _rightFramesMissing = 0;

  constructor(private _stabilizer: HandTrackingStabilizer) {}

  /**
   * Assign detected hands to blue/red slots
   */
  assignHands(
    detectedHands: DetectedHandData[],
    isMirrored: boolean,
    timestamp: number
  ): HandAssignmentResult {
    let leftPosition: DetectedPosition | null = null;
    let rightPosition: DetectedPosition | null = null;

    if (detectedHands.length === 2) {
      // Two hands detected - use position to disambiguate (most reliable)
      const result = this._assignTwoHands(detectedHands, isMirrored, timestamp);
      leftPosition = result.left;
      rightPosition = result.right;
    } else if (detectedHands.length === 1) {
      // Single hand - use proximity matching
      const result = this._assignSingleHand(
        detectedHands[0]!,
        isMirrored,
        timestamp
      );
      leftPosition = result.left;
      rightPosition = result.right;
    }

    // Clear history for hands that aren't detected
    if (!leftPosition) {
      this._stabilizer.clearHistory("left");
    }
    if (!rightPosition) {
      this._stabilizer.clearHistory("right");
    }

    return { left: leftPosition, right: rightPosition };
  }

  /**
   * Handle two-hand assignment using spatial position
   */
  private _assignTwoHands(
    detectedHands: DetectedHandData[],
    isMirrored: boolean,
    timestamp: number
  ): HandAssignmentResult {
    // Sort by wrist X position (in raw camera space, not mirrored)
    const sorted = [...detectedHands].sort((a, b) => a.wristX - b.wristX);

    const hand0 = sorted[0];
    const hand1 = sorted[1];

    if (!hand0 || !hand1) {
      return { left: null, right: null };
    }

    let leftPosition: DetectedPosition;
    let rightPosition: DetectedPosition;

    // In camera space: lower X = left side of image
    // When mirrored: left side of image = right side of screen = user's right hand
    // When mirrored: right side of image = left side of screen = user's left hand
    if (isMirrored) {
      rightPosition = hand0.position; // Lower X = right side of screen = user's right hand
      leftPosition = hand1.position; // Higher X = left side of screen = user's left hand
    } else {
      leftPosition = hand0.position;
      rightPosition = hand1.position;
    }

    leftPosition = this._applySmoothingToPosition(
      leftPosition,
      "left",
      timestamp
    );
    rightPosition = this._applySmoothingToPosition(
      rightPosition,
      "right",
      timestamp
    );

    return { left: leftPosition, right: rightPosition };
  }

  /**
   * Handle single-hand assignment using proximity matching
   */
  private _assignSingleHand(
    hand: DetectedHandData,
    _isMirrored: boolean,
    timestamp: number
  ): HandAssignmentResult {
    const handX = hand.position.rawPosition.x;
    const handY = hand.position.rawPosition.y;

    let assignToBlue = false;

    // Match to existing hand based on SPATIAL PROXIMITY
    const hasLeftHistory = this._stabilizer.hasHistory("left");
    const hasRightHistory = this._stabilizer.hasHistory("right");

    if (hasLeftHistory && hasRightHistory) {
      // Both hands have history - match to closest
      const lastLeft = this._stabilizer.getLastPosition("left");
      const lastRight = this._stabilizer.getLastPosition("right");

      if (lastLeft && lastRight) {
        const distToLeft = this._calculateDistance(
          handX,
          handY,
          lastLeft.x,
          lastLeft.y
        );
        const distToRight = this._calculateDistance(
          handX,
          handY,
          lastRight.x,
          lastRight.y
        );
        assignToBlue = distToLeft < distToRight;
      }
    } else if (hasLeftHistory) {
      // Only blue history - check if close enough
      const lastLeft = this._stabilizer.getLastPosition("left");
      if (lastLeft) {
        const distToLeft = this._calculateDistance(
          handX,
          handY,
          lastLeft.x,
          lastLeft.y
        );
        assignToBlue = distToLeft < 0.3; // Within 30% of screen
      }
    } else if (hasRightHistory) {
      // Only red history - check if close enough
      const lastRight = this._stabilizer.getLastPosition("right");
      if (lastRight) {
        const distToRight = this._calculateDistance(
          handX,
          handY,
          lastRight.x,
          lastRight.y
        );
        assignToBlue = distToRight >= 0.3; // Too far from red, must be blue
      }
    } else {
      // No history - use screen position to guess
      // Hand on right side of screen (in mirrored view) = left hand = blue
      assignToBlue = handX > 0.5;
    }

    if (assignToBlue) {
      const smoothedPosition = this._applySmoothingToPosition(
        hand.position,
        "left",
        timestamp
      );
      this._stabilizer.setAssignedHand("left", "left");
      return { left: smoothedPosition, right: null };
    } else {
      const smoothedPosition = this._applySmoothingToPosition(
        hand.position,
        "right",
        timestamp
      );
      this._stabilizer.setAssignedHand("right", "right");
      return { left: null, right: smoothedPosition };
    }
  }

  /**
   * Apply temporal smoothing to a position
   */
  private _applySmoothingToPosition(
    position: DetectedPosition,
    handId: "left" | "right",
    timestamp: number
  ): DetectedPosition {
    const smoothed = this._stabilizer.addPosition(
      handId,
      position.rawPosition.x,
      position.rawPosition.y,
      timestamp
    );

    return {
      ...position,
      rawPosition: smoothed,
      quadrant: mapToQuadrant(smoothed.x, smoothed.y),
    };
  }

  /**
   * Handle hand persistence (showing hands briefly after they disappear)
   */
  applyPersistence(
    currentLeft: DetectedPosition | null,
    currentRight: DetectedPosition | null
  ): HandAssignmentResult {
    let left = currentLeft;
    let right = currentRight;

    // Left-hand persistence
    if (left) {
      this._lastLeftPosition = left;
      this._leftFramesMissing = 0;
    } else if (
      this._lastLeftPosition &&
      this._leftFramesMissing < HAND_PERSISTENCE_FRAMES
    ) {
      left = this._lastLeftPosition;
      this._leftFramesMissing++;
    } else {
      this._lastLeftPosition = null;
    }

    // Right-hand persistence
    if (right) {
      this._lastRightPosition = right;
      this._rightFramesMissing = 0;
    } else if (
      this._lastRightPosition &&
      this._rightFramesMissing < HAND_PERSISTENCE_FRAMES
    ) {
      right = this._lastRightPosition;
      this._rightFramesMissing++;
    } else {
      this._lastRightPosition = null;
    }

    return { left, right };
  }

  /**
   * Reset all tracking state
   */
  reset(): void {
    this._stabilizer.resetAll();
    this._lastLeftPosition = null;
    this._lastRightPosition = null;
    this._leftFramesMissing = 0;
    this._rightFramesMissing = 0;
  }

  /**
   * Calculate distance between two points
   */
  private _calculateDistance(
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): number {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  }
}
