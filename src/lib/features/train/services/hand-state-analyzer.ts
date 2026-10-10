/**
 * Hand open/closed detection
 *
 * Analyzes hand landmarks to determine if hand is open, closed (fist),
 * or partially open. Also provides reference point selection and palm
 * center calculation based on hand state.
 */

import type { HandLandmark } from "./hand-landmarker";
import type { HandState } from "#lib/shared/train/domain/detection-frame.js";

export interface HandStateAnalysisResult {
  state: HandState;
  extendedFingerCount: number;
}

// Finger landmark indices
const FINGER_LANDMARKS = [
  { tip: 8, base: 5 }, // Index finger
  { tip: 12, base: 9 }, // Middle finger
  { tip: 16, base: 13 }, // Ring finger
  { tip: 20, base: 17 }, // Pinky
];

// Landmark indices
const WRIST = 0;
const MIDDLE_FINGER_PIP = 10; // Middle knuckle
const MIDDLE_FINGER_TIP = 12;

/**
 * Analyze hand landmarks to determine hand state (open/closed/partial)
 */
export function analyzeHandState(landmarks: HandLandmark[]): HandStateAnalysisResult {
  if (landmarks.length < 21) {
    return { state: "partial", extendedFingerCount: 2 };
  }

  const wrist = landmarks[WRIST];
  if (!wrist) {
    return { state: "partial", extendedFingerCount: 2 };
  }

  let extendedCount = 0;

  for (const finger of FINGER_LANDMARKS) {
    const tip = landmarks[finger.tip];
    const base = landmarks[finger.base];

    if (!tip || !base) continue;

    // Calculate distances
    const tipToWristDist = Math.sqrt(
      Math.pow(tip.x - wrist.x, 2) + Math.pow(tip.y - wrist.y, 2)
    );

    const baseToWristDist = Math.sqrt(
      Math.pow(base.x - wrist.x, 2) + Math.pow(base.y - wrist.y, 2)
    );

    // If tip is significantly further from wrist than base, finger is extended
    // Use ratio > 1.2 as threshold (finger must be at least 20% more extended)
    if (tipToWristDist > baseToWristDist * 1.2) {
      extendedCount++;
    }
  }

  // Classify based on how many fingers are extended
  let state: HandState;
  if (extendedCount >= 3) {
    state = "open"; // 3-4 fingers extended
  } else if (extendedCount <= 1) {
    state = "closed"; // 0-1 fingers extended (fist)
  } else {
    state = "partial"; // 2 fingers extended (partial)
  }

  return { state, extendedFingerCount: extendedCount };
}

/**
 * Get the appropriate reference point based on hand state
 * - Closed hand: middle finger PIP (knuckle)
 * - Open hand: middle finger tip
 */
export function getReferencePoint(
  landmarks: HandLandmark[],
  handState: HandState
): HandLandmark | null {
  if (handState === "closed") {
    // For closed hand (fist), use the middle finger PIP joint
    // Landmark 10 = middle finger PIP (middle knuckle - furthest point when fist is closed)
    return landmarks.length >= 11
      ? (landmarks[MIDDLE_FINGER_PIP] ?? null)
      : null;
  } else {
    // For open/partial hand, use middle finger tip
    return landmarks.length >= 13
      ? (landmarks[MIDDLE_FINGER_TIP] ?? null)
      : null;
  }
}

/**
 * Calculate palm center position based on hand state
 * Uses weighted average between wrist and reference point
 */
export function calculatePalmCenter(
  landmarks: HandLandmark[],
  handState: HandState
): HandLandmark {
  const wrist = landmarks[WRIST];
  if (!wrist) {
    // Fallback to origin if no wrist
    return { x: 0.5, y: 0.5, z: 0 };
  }

  const referencePoint = getReferencePoint(landmarks, handState);

  if (!referencePoint) {
    return wrist;
  }

  // Adjust weighting based on hand state
  let wristWeight: number;
  let refWeight: number;

  if (handState === "closed") {
    // For closed hand (fist), weight moderately towards the knuckles
    wristWeight = 0.5; // 50% wrist
    refWeight = 0.5; // 50% knuckles
  } else {
    // For open/partial hand, weight more towards wrist
    wristWeight = 0.6; // 60% wrist
    refWeight = 0.4; // 40% fingertip
  }

  return {
    x: wrist.x * wristWeight + referencePoint.x * refWeight,
    y: wrist.y * wristWeight + referencePoint.y * refWeight,
    z: wrist.z * wristWeight + referencePoint.z * refWeight,
  };
}
