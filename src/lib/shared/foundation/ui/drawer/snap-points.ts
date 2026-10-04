/**
 * SnapPointsHandler - Manages snap point calculations for drawers
 *
 * Handles multiple height/width positions that a drawer can "snap" to.
 * Supports both absolute pixel values and percentage values.
 *
 * Example snap points: ["25%", "50%", "90%"] or [200, 400, 600]
 */

export type SnapPointValue = number | string;

export interface SnapPointsOptions {
  /** Direction the drawer slides from */
  placement: "bottom" | "top" | "right" | "left";
  /** Array of snap point values (pixels or percentages) */
  snapPoints: SnapPointValue[];
  /** Initial snap point index. Default: last (fully open) */
  defaultSnapPoint?: number;
  /** Velocity threshold for snapping to next point (px/ms). Default: 0.5 */
  velocityThreshold?: number;
  /** Distance threshold as fraction of snap distance. Default: 0.5 */
  distanceThreshold?: number;
  /** Called when snap point changes */
  onSnapPointChange?: (index: number, value: number) => void;
}

export class SnapPoints {
  private snapPointsPx: number[] = [];
  private currentIndex = 0;
  private containerSize = 0;

  constructor(private options: SnapPointsOptions) {
    this.options = {
      velocityThreshold: 0.5,
      distanceThreshold: 0.5,
      defaultSnapPoint: options.snapPoints.length - 1,
      ...options,
    };
    this.currentIndex = this.options.defaultSnapPoint!;
  }

  /**
   * Initialize with container dimensions
   */
  initialize(containerWidth: number, containerHeight: number) {
    const isHorizontal =
      this.options.placement === "left" || this.options.placement === "right";
    this.containerSize = isHorizontal ? containerWidth : containerHeight;
    this.calculateSnapPointsPx();
  }

  /**
   * Convert snap point values to pixels
   */
  private calculateSnapPointsPx() {
    this.snapPointsPx = this.options.snapPoints.map((point) => {
      if (typeof point === "number") {
        return point;
      }
      // Handle percentage strings
      if (typeof point === "string") {
        if (point.endsWith("%")) {
          const percent = parseFloat(point) / 100;
          return Math.round(this.containerSize * percent);
        }
        // Handle pixel strings
        if (point.endsWith("px")) {
          return parseFloat(point);
        }
        // Try to parse as number
        return parseFloat(point) || 0;
      }
      return 0;
    });

    // Sort snap points from smallest to largest
    this.snapPointsPx.sort((a, b) => a - b);
  }

  /**
   * Get current snap point index
   */
  getCurrentIndex(): number {
    return this.currentIndex;
  }

  /**
   * Get current snap point value in pixels
   */
  getCurrentValue(): number {
    return this.snapPointsPx[this.currentIndex] ?? this.containerSize;
  }

  /**
   * Get all snap point values in pixels
   */
  getSnapPointsPx(): number[] {
    return [...this.snapPointsPx];
  }

  /**
   * Get number of snap points
   */
  getCount(): number {
    return this.snapPointsPx.length;
  }

  /**
   * Calculate the transform offset for current snap point
   * Returns how much the drawer should be translated
   */
  getTransformOffset(): number {
    const currentValue = this.getCurrentValue();
    // The offset is how much to hide (container size minus visible size)
    return this.containerSize - currentValue;
  }

  /**
   * Determine which snap point to go to based on drag gesture
   *
   * @param dragOffset Current drag offset (positive = towards close)
   * @param velocity Drag velocity in px/ms (positive = towards close)
   * @param _duration Drag duration in ms (reserved for future use)
   */
  calculateTargetSnapPoint(
    dragOffset: number,
    velocity: number,
    _duration: number
  ): number {
    const currentValue = this.getCurrentValue();
    const { velocityThreshold, distanceThreshold } = this.options;

    // Bottom/right drawers close with positive travel; top/left with negative.
    const closingTravel =
      this.options.placement === "bottom" || this.options.placement === "right"
        ? dragOffset
        : -dragOffset;
    const isDraggingToClose = closingTravel > 0;
    const effectiveSize = currentValue - closingTravel;

    // Find the nearest snap point
    let nearestIndex = this.currentIndex;
    let nearestDistance = Infinity;

    for (let i = 0; i < this.snapPointsPx.length; i++) {
      const distance = Math.abs(this.snapPointsPx[i]! - effectiveSize);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }

    const nextIndex = this.currentIndex + (isDraggingToClose ? -1 : 1);
    if (nextIndex < 0 || nextIndex >= this.snapPointsPx.length) {
      return this.currentIndex;
    }
    if (Math.abs(velocity) > velocityThreshold! && Math.abs(dragOffset) > 5) {
      return nextIndex;
    }
    const distanceToNext = Math.abs(
      this.snapPointsPx[nextIndex]! - currentValue
    );
    if (Math.abs(dragOffset) < distanceToNext * distanceThreshold!) {
      return this.currentIndex;
    }
    return nearestIndex;
  }

  setSnapPoint(index: number) {
    const clampedIndex = Math.max(
      0,
      Math.min(index, this.snapPointsPx.length - 1)
    );
    if (clampedIndex !== this.currentIndex) {
      this.currentIndex = clampedIndex;
      this.options.onSnapPointChange?.(
        this.currentIndex,
        this.snapPointsPx[this.currentIndex]!
      );
    }
  }

  /**
   * Snap to closest point
   */
  snapToClosest(
    dragOffset: number,
    velocity: number,
    duration: number
  ): number {
    const targetIndex = this.calculateTargetSnapPoint(
      dragOffset,
      velocity,
      duration
    );
    this.setSnapPoint(targetIndex);
    return targetIndex;
  }

  /**
   * Check if current snap point is the minimum (most closed)
   */
  isAtMinimum(): boolean {
    return this.currentIndex === 0;
  }

  /**
   * Check if current snap point is the maximum (fully open)
   */
  isAtMaximum(): boolean {
    return this.currentIndex === this.snapPointsPx.length - 1;
  }

  /**
   * Expand to next snap point
   */
  expand(): boolean {
    if (this.currentIndex < this.snapPointsPx.length - 1) {
      this.setSnapPoint(this.currentIndex + 1);
      return true;
    }
    return false;
  }

  /**
   * Collapse to previous snap point
   */
  collapse(): boolean {
    if (this.currentIndex > 0) {
      this.setSnapPoint(this.currentIndex - 1);
      return true;
    }
    return false;
  }

  updateOptions(options: Partial<SnapPointsOptions>) {
    this.options = { ...this.options, ...options };
    if (options.snapPoints) {
      this.calculateSnapPointsPx();
      // Clamp current index to new range
      this.currentIndex = Math.min(
        this.currentIndex,
        this.snapPointsPx.length - 1
      );
    }
  }
}
