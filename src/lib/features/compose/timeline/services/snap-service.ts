/**
 * SnapService - Centralized snapping logic for timeline
 *
 * Provides snap calculations for:
 * - Beat markers (from audio BPM)
 * - Clip edges (start/end of other clips)
 * - Grid intervals
 * - Playhead position
 */

import type {
  TimeSeconds,
  SnapSettings,
  TimelineClip,
} from "#lib/shared/animation-engine/domain/timeline-types.js";
import { getClipEndTime } from "#lib/shared/animation-engine/domain/timeline-types.js";
import { generateStepTimestamps } from "#lib/shared/audio/bpm-analyzer.js";

// Types

export interface SnapResult {
  /** The snapped time value */
  time: TimeSeconds;
  /** Whether a snap occurred */
  didSnap: boolean;
  /** The type of snap point that was hit */
  snapType: SnapType | null;
  /** Distance from the original position (for visual feedback) */
  distance: number;
}

export type SnapType = "beat" | "clip-start" | "clip-end" | "grid" | "playhead";

export interface SnapPoint {
  time: TimeSeconds;
  type: SnapType;
  label?: string;
}

export interface SnapContext {
  /** All clips in the timeline */
  clips: TimelineClip[];
  /** Clip IDs to exclude from snap points (e.g., the clip being dragged) */
  excludeClipIds: string[];
  /** Audio BPM for beat markers */
  audioBpm: number | null;
  /** Audio duration for beat marker generation */
  audioDuration: number;
  /** Current playhead position */
  playheadPosition: TimeSeconds;
  /** Snap settings */
  settings: SnapSettings;
}

// Constants

/** Default snap threshold in seconds */
export const DEFAULT_SNAP_THRESHOLD = 0.15;

/** Snap threshold in seconds (smaller = more precise) */
export const SNAP_THRESHOLD_PRECISE = 0.08;

/** Priority order for snap types (lower = higher priority) */
const SNAP_PRIORITY: Record<SnapType, number> = {
  playhead: 0,
  "clip-start": 1,
  "clip-end": 1,
  beat: 2,
  grid: 3,
};

// Snap Functions

export function calculateSnapPoints(context: SnapContext): SnapPoint[] {
  const {
    clips,
    excludeClipIds,
    audioBpm,
    audioDuration,
    playheadPosition,
    settings,
  } = context;
  const points: SnapPoint[] = [];

  // Beat markers
  if (settings.snapToSteps && audioBpm && audioDuration > 0) {
    const beatTimes = generateStepTimestamps(audioBpm, audioDuration);
    beatTimes.forEach((time, index) => {
      const isDownbeat = index % 4 === 0;
      points.push({
        time,
        type: "beat",
        label: isDownbeat ? `M${Math.floor(index / 4) + 1}` : undefined,
      });
    });
  }

  // Clip edges
  if (settings.snapToClips) {
    for (const clip of clips) {
      if (excludeClipIds.includes(clip.id)) continue;

      points.push({
        time: clip.startTime,
        type: "clip-start",
        label: clip.label ?? clip.sequence.name,
      });

      points.push({
        time: getClipEndTime(clip),
        type: "clip-end",
        label: clip.label ?? clip.sequence.name,
      });
    }
  }

  // Grid intervals
  if (settings.snapToGrid && settings.gridInterval > 0) {
    const maxTime = Math.max(
      audioDuration,
      ...clips.map((c) => getClipEndTime(c)),
      60
    );
    for (let t = 0; t <= maxTime + 10; t += settings.gridInterval) {
      points.push({
        time: t,
        type: "grid",
        label: `${t.toFixed(1)}s`,
      });
    }
  }

  // Playhead
  if (settings.snapToPlayhead) {
    points.push({
      time: playheadPosition,
      type: "playhead",
      label: "Playhead",
    });
  }

  return points;
}

/**
 * Find the nearest snap point to a given time
 */
export function findNearestSnapPoint(
  time: TimeSeconds,
  snapPoints: SnapPoint[],
  threshold: number = DEFAULT_SNAP_THRESHOLD
): SnapResult {
  let nearestPoint: SnapPoint | null = null;
  let nearestDistance = Infinity;

  for (const point of snapPoints) {
    const distance = Math.abs(time - point.time);

    if (distance < nearestDistance && distance <= threshold) {
      // Check priority if distances are very close
      if (nearestPoint) {
        const currentPriority = SNAP_PRIORITY[point.type];
        const nearestPriority = SNAP_PRIORITY[nearestPoint.type];

        // Only replace if this point is closer OR same distance but higher priority
        if (
          distance < nearestDistance ||
          (distance === nearestDistance && currentPriority < nearestPriority)
        ) {
          nearestPoint = point;
          nearestDistance = distance;
        }
      } else {
        nearestPoint = point;
        nearestDistance = distance;
      }
    }
  }

  if (nearestPoint) {
    return {
      time: nearestPoint.time,
      didSnap: true,
      snapType: nearestPoint.type,
      distance: nearestDistance,
    };
  }

  return {
    time,
    didSnap: false,
    snapType: null,
    distance: 0,
  };
}

/**
 * Snap a time value using the given context
 * Convenience function that combines calculateSnapPoints and findNearestSnapPoint
 */
export function snapTimeValue(
  time: TimeSeconds,
  context: SnapContext,
  threshold: number = DEFAULT_SNAP_THRESHOLD
): SnapResult {
  if (!context.settings.enabled) {
    return { time, didSnap: false, snapType: null, distance: 0 };
  }

  const snapPoints = calculateSnapPoints(context);
  return findNearestSnapPoint(time, snapPoints, threshold);
}

/**
 * Get all snap points visible in a time range (for rendering guides)
 */
export function getSnapPointsInRange(
  context: SnapContext,
  startTime: TimeSeconds,
  endTime: TimeSeconds
): SnapPoint[] {
  const allPoints = calculateSnapPoints(context);
  return allPoints.filter((p) => p.time >= startTime && p.time <= endTime);
}

/**
 * Calculate snap threshold in pixels based on zoom level
 * Higher zoom = larger pixel threshold, but same time threshold
 */
export function getSnapThresholdPixels(
  pixelsPerSecond: number,
  timeThreshold: number = DEFAULT_SNAP_THRESHOLD
): number {
  return timeThreshold * pixelsPerSecond;
}

// ============================================================================
// Snap Preview
// ============================================================================

/**
 * Preview snap result without committing
 * Useful for showing visual feedback during drag
 */
export function previewSnap(
  proposedTime: TimeSeconds,
  context: SnapContext,
  pixelsPerSecond: number
): SnapResult & { previewX: number } {
  const result = snapTimeValue(proposedTime, context);
  return {
    ...result,
    previewX: result.time * pixelsPerSecond,
  };
}
