/**
 * Motion Analyzer
 *
 * Handles analysis of motion data for reversal counting based on rotation direction comparison.
 * Extracted from OptionPickerService for better separation of concerns.
 */

import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import { getEffectiveRotationDirection } from "#lib/shared/pictograph/shared/domain/utils/effective-rotation-direction.js";
import type { Motion } from "@tka/tka-types";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

/**
 * Coordinate point in a motion path
 */
interface PathPoint {
  x: number;
  y: number;
}

/**
 * Type guard to check if a value is a PathPoint
 */
function isPathPoint(value: unknown): value is PathPoint {
  if (!value || typeof value !== "object") {
    return false;
  }
  const point = value as Partial<PathPoint>;
  return typeof point.x === "number" && typeof point.y === "number";
}

/**
 * Calculate the number of reversals found in a pictograph. We look at both the
 * intrinsic motion data (paths, motion types, turns) and, when available, the
 * surrounding sequence context to determine direction changes.
 */
export function getReversalCount(
  option: PictographData,
  sequence: PictographData[] = []
): number {
  let maxReversals = 0;

  // Inspect each motion on the pictograph for intrinsic reversal cues
  Object.values(option.motions).forEach((motion) => {
    if (!motion) return;
    const reversals = analyzeMotionForReversals(motion);
    maxReversals = Math.max(maxReversals, reversals);
  });

  // Incorporate sequence-based comparison of rotationDirection metadata
  if (sequence.length > 0) {
    const sequenceReversals = analyzeSequenceContext(option, sequence);
    maxReversals = Math.max(maxReversals, sequenceReversals);
  }

  return Math.min(maxReversals, 2); // Keep within the available filter buckets
}

export function hasReversals(option: PictographData): boolean {
  return getReversalCount(option) > 0;
}

/**
 * Count reversals based ONLY on rotation-direction continuity versus the previous
 * sequence step — ignoring the intrinsic turn-magnitude heuristic in
 * getReversalCount (turns>1), which is not a direction reversal. Used to filter
 * the turn-picker's fanned CW/CCW variants: a dash/static variant "reverses" only
 * if its spin direction opposes the established direction. Returns 0 when there is
 * no prior rotation context to compare against.
 */
export function countDirectionReversals(
  option: PictographData,
  sequence: PictographData[] = []
): number {
  if (sequence.length === 0) return 0;
  return analyzeSequenceContext(option, sequence);
}

export interface DirectionContinuityFilterResult {
  options: PictographData[];
  totalCount: number;
  hiddenCount: number;
}

/**
 * Keep the options that preserve the established spin direction and report
 * exactly how many this one filter removed. The picker needs the count from
 * this boundary so it does not blame the CW/CCW controls for options that
 * Continuous mode had already excluded upstream.
 */
export function filterDirectionContinuousOptions(
  options: PictographData[],
  sequence: PictographData[] = []
): DirectionContinuityFilterResult {
  const continuousOptions = options.filter(
    (option) => countDirectionReversals(option, sequence) === 0
  );

  return {
    options: continuousOptions,
    totalCount: options.length,
    hiddenCount: options.length - continuousOptions.length,
  };
}

/**
 * Analyze a single motion for reversal patterns using the heuristics from the
 * previous monolithic service implementation.
 */
function analyzeMotionForReversals(motion: Motion): number {
  let reversalCount = 0;

  // Check motion type for reversal indicators
  const motionTypeStr = motion.motionType.toString().toLowerCase();

  if (motionTypeStr.includes("pro") && motionTypeStr.includes("anti")) {
    reversalCount = Math.max(reversalCount, 1);
  } else if (motionTypeStr.includes("bi") || motionTypeStr.includes("switch")) {
    reversalCount = Math.max(reversalCount, 2);
  }

  // Analyze path for reversals if it exists and is an array
  // Note: path is not part of the standard MotionData interface,
  // but may exist on extended motion objects
  const motionWithPath = motion as unknown as { path?: unknown[] };
  if (Array.isArray(motionWithPath.path)) {
    reversalCount = Math.max(
      reversalCount,
      analyzePathForReversals(motionWithPath.path)
    );
  }

  // Check turns for reversals
  if (typeof motion.turns === "number" && motion.turns > 1) {
    reversalCount = Math.max(reversalCount, Math.floor(motion.turns / 2));
  }

  return reversalCount;
}

/**
 * Inspects a motion path for direction changes using a simplified
 * clockwise/counter-clockwise heuristic.
 */
function analyzePathForReversals(path: unknown[]): number {
  if (path.length < 3) return 0;

  let reversals = 0;
  let lastDirection: "cw" | "ccw" | null = null;

  for (let i = 0; i < path.length - 1; i++) {
    const current = path[i];
    const next = path[i + 1];

    // Only process if both are valid PathPoints
    if (!isPathPoint(current) || !isPathPoint(next)) {
      continue;
    }

    const direction = determinePathDirection(current, next);

    if (lastDirection && direction && lastDirection !== direction) {
      reversals++;
    }

    if (direction) {
      lastDirection = direction;
    }
  }

  return reversals;
}

/**
 * Determine direction between two path points using a simple cross-product
 * style heuristic. Returns `cw`, `ccw`, or `null` if not enough movement.
 */
function determinePathDirection(
  from: PathPoint,
  to: PathPoint
): "cw" | "ccw" | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const magnitude = Math.sqrt(dx * dx + dy * dy);

  if (magnitude < 0.01) {
    return null;
  }

  return dx > 0 ? "cw" : "ccw";
}

/**
 * Compare the current pictograph's rotation metadata against the prior
 * sequence to detect direction switches.
 */
function analyzeSequenceContext(
  option: PictographData,
  sequence: PictographData[]
): number {
  let reversalCount = 0;

  ([HandSide.LEFT, HandSide.RIGHT] as const).forEach((color) => {
    const currentMotion = option.motions[color];
    const currentRotation = getEffectiveRotationDirection(currentMotion);

    // Skip if no rotation or is NO_ROTATION enum value
    if (!currentRotation) {
      return;
    }

    // Import RotationDirection to properly compare enum values
    // Check string value to avoid unsafe enum comparison
    if (String(currentRotation) === "noRotation") {
      return;
    }

    for (let i = sequence.length - 1; i >= 0; i--) {
      const previousPictograph = sequence[i];
      if (!previousPictograph) continue;

      const previousMotion = previousPictograph.motions[color];
      const previousRotation = getEffectiveRotationDirection(previousMotion);

      // Skip if no rotation or is NO_ROTATION enum value
      if (!previousRotation) {
        continue;
      }

      if (String(previousRotation) === "noRotation") {
        continue;
      }

      // Compare string representations to avoid enum comparison warning
      if (String(previousRotation) !== String(currentRotation)) {
        reversalCount++;
      }

      break;
    }
  });

  return reversalCount;
}
