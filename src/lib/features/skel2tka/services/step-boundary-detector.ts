/**
 * StepBoundaryDetector - Find beat transitions in a hand timeline
 *
 * Walks through DetectionFrame[] sequentially, grouping consecutive
 * frames that share the same blue + red grid locations into beats.
 * A new beat begins when either hand changes grid position.
 *
 * Short segments (below minFramesPerBeat) are merged into the
 * previous beat to filter out noise from brief detection glitches.
 */

import type { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { DetectionFrame } from "$lib/shared/train/domain/detection-frame";
import type { HandTimeline, DetectedBeat, StepPosition } from "../domain/models";
import type { StepDetectionOptions } from "./types";

const DEFAULT_MIN_FRAMES_PER_BEAT = 3;
const DEFAULT_MIN_CONFIDENCE = 0.5;

interface FrameGroup {
  frames: DetectionFrame[];
  leftLocation: GridLocation | null;
  rightLocation: GridLocation | null;
}

export function detectBeats(
  timeline: HandTimeline,
  options?: StepDetectionOptions
): DetectedBeat[] {
  const minFrames = options?.minFramesPerBeat ?? DEFAULT_MIN_FRAMES_PER_BEAT;
  const minConfidence = options?.minConfidence ?? DEFAULT_MIN_CONFIDENCE;

  // Step 1: Group consecutive frames with same positions
  const rawGroups = groupByPosition(timeline.frames, minConfidence);

  // Step 2: Merge short groups into their predecessors
  const mergedGroups = mergeShortGroups(rawGroups, minFrames);

  // Step 3: Convert groups to DetectedBeat[]
  return mergedGroups.map((group, index) =>
    groupToBeat(group, index, minConfidence)
  );
}

/** Group consecutive frames that share the same blue+red grid locations */
function groupByPosition(
  frames: DetectionFrame[],
  minConfidence: number
): FrameGroup[] {
  const groups: FrameGroup[] = [];
  let currentGroup: FrameGroup | null = null;

  for (const frame of frames) {
    const left = getValidLocation(frame, "left", minConfidence);
    const right = getValidLocation(frame, "right", minConfidence);

    const samePosition =
      currentGroup != null &&
      left === currentGroup?.leftLocation &&
      right === currentGroup?.rightLocation;

    if (!samePosition) {
      currentGroup = {
        frames: [frame],
        leftLocation: left,
        rightLocation: right,
      };
      groups.push(currentGroup);
    } else {
      currentGroup!.frames.push(frame);
    }
  }

  return groups;
}

/** Merge groups shorter than minFrames into the previous group */
function mergeShortGroups(
  groups: FrameGroup[],
  minFrames: number
): FrameGroup[] {
  if (groups.length <= 1) return groups;

  const result: FrameGroup[] = [];

  for (const group of groups) {
    if (group.frames.length < minFrames && result.length > 0) {
      // Merge into the previous group
      const prev = result[result.length - 1];
      if (prev) {
        prev.frames.push(...group.frames);
      }
    } else {
      result.push(group);
    }
  }

  return result;
}

/** Convert a frame group into a DetectedBeat */
function groupToBeat(
  group: FrameGroup,
  index: number,
  minConfidence: number
): DetectedBeat {
  const firstFrame = group.frames[0];
  const lastFrame = group.frames[group.frames.length - 1];
  const startTime = firstFrame?.timestamp ?? 0;
  const endTime = lastFrame?.timestamp ?? startTime;

  const positions: StepPosition[] = [];

  // Compute average confidence for blue hand
  if (group.leftLocation) {
    const leftConfidences = group.frames
      .filter((f) => f.left && f.left.confidence >= minConfidence)
      .map((f) => f.left!.confidence);

    if (leftConfidences.length > 0) {
      const sum = leftConfidences.reduce((a, b) => a + b, 0);
      positions.push({
        hand: "left",
        location: group.leftLocation,
        confidence: sum / leftConfidences.length,
      });
    }
  }

  // Compute average confidence for red hand
  if (group.rightLocation) {
    const rightConfidences = group.frames
      .filter((f) => f.right && f.right.confidence >= minConfidence)
      .map((f) => f.right!.confidence);

    if (rightConfidences.length > 0) {
      const sum = rightConfidences.reduce((a, b) => a + b, 0);
      positions.push({
        hand: "right",
        location: group.rightLocation,
        confidence: sum / rightConfidences.length,
      });
    }
  }

  return {
    index,
    startTime,
    endTime,
    frameCount: group.frames.length,
    positions,
    placementLabel: derivePlacementLabel(group.leftLocation, group.rightLocation),
  };
}

/** Get the valid grid location for a hand, or null if below confidence */
function getValidLocation(
  frame: DetectionFrame,
  hand: "left" | "right",
  minConfidence: number
): GridLocation | null {
  const detected = frame[hand];
  if (!detected || detected.confidence < minConfidence) return null;
  return detected.quadrant;
}

/**
 * Derive a TKA position label from blue+red grid locations.
 *
 * Alpha = opposite points, Beta = same point, Gamma = right angle.
 * Returns null if either hand is undetected.
 */
function derivePlacementLabel(
  left: GridLocation | null,
  right: GridLocation | null
): string | null {
  if (!left || !right) return null;

  if (left === right) return "beta";

  // Check if opposite (n/s, e/w, ne/sw, nw/se)
  if (isOpposite(left, right)) return "alpha";

  // Otherwise gamma (right angle on cardinal grid)
  return "gamma";
}

/** Check if two grid locations are opposite */
function isOpposite(a: GridLocation, b: GridLocation): boolean {
  const opposites: Record<string, string> = {
    n: "s",
    s: "n",
    e: "w",
    w: "e",
    ne: "sw",
    sw: "ne",
    nw: "se",
    se: "nw",
  };
  return opposites[a] === b;
}
