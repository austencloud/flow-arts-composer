/**
 * SanityChecker - Automated pre-verification for Phase 1
 *
 * Runs a battery of checks on Phase 1 output before the user
 * spends time manually verifying. Catches garbage early:
 *
 * - Missing hand detections
 * - Low confidence
 * - Teleportation (hand jumps impossibly fast)
 * - Too few or too short beats
 * - Stuck detection (beats too long)
 */

import type { Phase1Result } from "../domain/models";
import type {
  SanityCheckReport,
  SanityCheckResult,
  SanityCheckSeverity,
} from "../domain/verification-models";
import {
  HandSide,
  type HandSide as HandSideValue,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

const THRESHOLDS = {
  MIN_HAND_DETECTION_RATE: 0.8,
  MIN_AVG_CONFIDENCE: 0.6,
  MAX_TELEPORTATION_DISTANCE: 0.4,
  MIN_BEAT_COUNT: 2,
  MIN_BEAT_DURATION_SEC: 0.2,
  MAX_BEAT_DURATION_SEC: 10.0,
};

export function checkPhase1(result: Phase1Result): SanityCheckReport {
  const checks: SanityCheckResult[] = [
    checkHandDetectionRate(result, HandSide.LEFT),
    checkHandDetectionRate(result, HandSide.RIGHT),
    checkAverageConfidence(result),
    checkTeleportation(result),
    checkBeatCount(result),
    checkBeatDurations(result),
  ];

  const overallSeverity = computeOverallSeverity(checks);

  return {
    phase: 1,
    checks,
    overallSeverity,
    timestamp: Date.now(),
  };
}

/** Check that a hand was detected in enough frames */
function checkHandDetectionRate(
  result: Phase1Result,
  hand: HandSideValue
): SanityCheckResult {
  const totalFrames = result.timeline.frames.length;
  if (totalFrames === 0) {
    return {
      name: `${hand} hand detection rate`,
      description: `Percentage of frames where ${hand} hand was detected`,
      severity: "fail",
      actualValue: 0,
      threshold: THRESHOLDS.MIN_HAND_DETECTION_RATE,
      message: "No frames to analyze",
    };
  }

  const detectedFrames = result.timeline.frames.filter(
    (f) => f[hand] !== null
  ).length;
  const rate = detectedFrames / totalFrames;

  let severity: SanityCheckSeverity = "pass";
  if (rate < THRESHOLDS.MIN_HAND_DETECTION_RATE * 0.5) {
    severity = "fail";
  } else if (rate < THRESHOLDS.MIN_HAND_DETECTION_RATE) {
    severity = "warning";
  }

  return {
    name: `${hand} hand detection rate`,
    description: `Percentage of frames where ${hand} hand was detected`,
    severity,
    actualValue: Math.round(rate * 100),
    threshold: Math.round(THRESHOLDS.MIN_HAND_DETECTION_RATE * 100),
    message:
      severity === "pass"
        ? `${hand} hand detected in ${Math.round(rate * 100)}% of frames`
        : `${hand} hand only detected in ${Math.round(rate * 100)}% of frames (need ${Math.round(THRESHOLDS.MIN_HAND_DETECTION_RATE * 100)}%)`,
  };
}

/** Check average confidence across all detections */
function checkAverageConfidence(result: Phase1Result): SanityCheckResult {
  const confidences: number[] = [];

  for (const frame of result.timeline.frames) {
    if (frame.left) confidences.push(frame.left.confidence);
    if (frame.right) confidences.push(frame.right.confidence);
  }

  if (confidences.length === 0) {
    return {
      name: "Average confidence",
      description: "Mean detection confidence across all hand detections",
      severity: "fail",
      actualValue: 0,
      threshold: THRESHOLDS.MIN_AVG_CONFIDENCE,
      message: "No detections to measure confidence",
    };
  }

  const avg =
    confidences.reduce((sum, c) => sum + c, 0) / confidences.length;

  let severity: SanityCheckSeverity = "pass";
  if (avg < THRESHOLDS.MIN_AVG_CONFIDENCE * 0.7) {
    severity = "fail";
  } else if (avg < THRESHOLDS.MIN_AVG_CONFIDENCE) {
    severity = "warning";
  }

  return {
    name: "Average confidence",
    description: "Mean detection confidence across all hand detections",
    severity,
    actualValue: Math.round(avg * 100),
    threshold: Math.round(THRESHOLDS.MIN_AVG_CONFIDENCE * 100),
    message:
      severity === "pass"
        ? `Average confidence: ${Math.round(avg * 100)}%`
        : `Average confidence ${Math.round(avg * 100)}% is below ${Math.round(THRESHOLDS.MIN_AVG_CONFIDENCE * 100)}% threshold`,
  };
}

/** Check for impossible hand jumps between consecutive frames */
function checkTeleportation(result: Phase1Result): SanityCheckResult {
  const frames = result.timeline.frames;
  let teleportCount = 0;
  let maxJump = 0;

  for (let i = 1; i < frames.length; i++) {
    const prevFrame = frames[i - 1];
    const currFrame = frames[i];
    if (!prevFrame || !currFrame) continue;

    for (const hand of [HandSide.LEFT, HandSide.RIGHT] as const) {
      const prevPos = prevFrame[hand]?.rawPosition;
      const currPos = currFrame[hand]?.rawPosition;

      if (prevPos && currPos) {
        const dx = currPos.x - prevPos.x;
        const dy = currPos.y - prevPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > maxJump) maxJump = distance;
        if (distance > THRESHOLDS.MAX_TELEPORTATION_DISTANCE) {
          teleportCount++;
        }
      }
    }
  }

  let severity: SanityCheckSeverity = "pass";
  if (teleportCount > frames.length * 0.1) {
    severity = "fail";
  } else if (teleportCount > 0) {
    severity = "warning";
  }

  return {
    name: "Position stability",
    description: "Check for impossible hand position jumps between frames",
    severity,
    actualValue: teleportCount,
    threshold: `${THRESHOLDS.MAX_TELEPORTATION_DISTANCE} normalized distance`,
    message:
      severity === "pass"
        ? `No teleportation detected (max jump: ${maxJump.toFixed(3)})`
        : `${teleportCount} teleportation events detected (max jump: ${maxJump.toFixed(3)})`,
  };
}

/** Check that enough beats were detected */
function checkBeatCount(result: Phase1Result): SanityCheckResult {
  const count = result.beats.length;

  let severity: SanityCheckSeverity = "pass";
  if (count === 0) {
    severity = "fail";
  } else if (count < THRESHOLDS.MIN_BEAT_COUNT) {
    severity = "warning";
  }

  return {
    name: "Beat count",
    description: "Number of detected beat boundaries",
    severity,
    actualValue: count,
    threshold: THRESHOLDS.MIN_BEAT_COUNT,
    message:
      severity === "pass"
        ? `${count} beats detected`
        : `Only ${count} beat(s) detected (need at least ${THRESHOLDS.MIN_BEAT_COUNT})`,
  };
}

/** Check that beat durations are within reasonable ranges */
function checkBeatDurations(result: Phase1Result): SanityCheckResult {
  if (result.beats.length === 0) {
    return {
      name: "Beat durations",
      description: "Check that beats are within reasonable time ranges",
      severity: "fail",
      actualValue: "no beats",
      threshold: `${THRESHOLDS.MIN_BEAT_DURATION_SEC}s - ${THRESHOLDS.MAX_BEAT_DURATION_SEC}s`,
      message: "No beats to check",
    };
  }

  let tooShort = 0;
  let tooLong = 0;

  for (const step of result.beats) {
    const duration = step.endTime - step.startTime;
    if (duration < THRESHOLDS.MIN_BEAT_DURATION_SEC) tooShort++;
    if (duration > THRESHOLDS.MAX_BEAT_DURATION_SEC) tooLong++;
  }

  const problems = tooShort + tooLong;
  let severity: SanityCheckSeverity = "pass";
  if (problems > result.beats.length * 0.5) {
    severity = "fail";
  } else if (problems > 0) {
    severity = "warning";
  }

  const parts: string[] = [];
  if (tooShort > 0) parts.push(`${tooShort} too short (<${THRESHOLDS.MIN_BEAT_DURATION_SEC}s)`);
  if (tooLong > 0) parts.push(`${tooLong} too long (>${THRESHOLDS.MAX_BEAT_DURATION_SEC}s)`);

  return {
    name: "Beat durations",
    description: "Check that beats are within reasonable time ranges",
    severity,
    actualValue: `${result.beats.length} beats`,
    threshold: `${THRESHOLDS.MIN_BEAT_DURATION_SEC}s - ${THRESHOLDS.MAX_BEAT_DURATION_SEC}s`,
    message:
      severity === "pass"
        ? `All ${result.beats.length} beats within valid duration range`
        : `Duration issues: ${parts.join(", ")}`,
  };
}

/** Compute overall severity from individual checks */
function computeOverallSeverity(
  checks: SanityCheckResult[]
): SanityCheckSeverity {
  if (checks.some((c) => c.severity === "fail")) return "fail";
  if (checks.some((c) => c.severity === "warning")) return "warning";
  return "pass";
}
