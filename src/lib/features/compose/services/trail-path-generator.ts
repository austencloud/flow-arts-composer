/**
 * TrailPathGenerator
 *
 * Mathematically calculates trail points from prop states.
 * No screen capture, no coordinate transformations - pure math.
 *
 * How it works:
 * 1. The orchestrator tells us prop CENTER position and ROTATION at any beat
 * 2. We calculate prop END positions using simple trigonometry:
 *    - end.x = center.x + halfLength * cos(rotation)
 *    - end.y = center.y + halfLength * sin(rotation)
 * 3. We sample at high frequency (e.g., 120 points per beat) for smooth trails
 * 4. Connect all sampled points = smooth trail path
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { SequenceAnimationOrchestrator } from "#lib/shared/animation-engine/services/sequence-animation-orchestrator.js";
import {
  calculatePropEndpoints,
  type PropEndpointConfig,
} from "#lib/shared/animation-engine/services/prop-position-calculator.js";

/**
 * A single point in a trail
 */
export interface TrailPoint {
  x: number;
  y: number;
  beat: number; // Which beat this point was captured at
  timestamp: number; // Normalized time (0 to 1 within the sequence)
}

/**
 * Complete trail data for a sequence
 */
export interface GeneratedTrailData {
  /** Trail points for the left prop's left end */
  leftLeft: TrailPoint[];
  /** Trail points for the left prop's right end */
  leftRight: TrailPoint[];
  /** Trail points for the right prop's left end */
  rightLeft: TrailPoint[];
  /** Trail points for the right prop's right end */
  rightRight: TrailPoint[];
  /** Total number of steps in the sequence */
  totalSteps: number;
  /** Samples per beat used for generation */
  samplesPerStep: number;
  /** Canvas size the points are calculated for */
  canvasSize: number;
}

/**
 * Configuration for trail generation
 */
export interface TrailGenerationConfig {
  /** Canvas size in pixels (points will be in this coordinate space) */
  canvasSize: number;
  /** Number of samples per beat (higher = smoother trails, default: 120) */
  samplesPerStep?: number;
  /** Blue prop dimensions */
  leftPropDimensions: { width: number; height: number };
  /** Red prop dimensions */
  rightPropDimensions: { width: number; height: number };
}

/**
 * Generate complete trail data for a sequence
 *
 * This calculates ALL trail points mathematically, without any rendering.
 * The result can be used for video generation or cached for playback.
 *
 * @param orchestrator - Initialized orchestrator with sequence data
 * @param sequence - The sequence to generate trails for
 * @param config - Generation configuration
 * @returns Complete trail data for the entire sequence
 */
export function generateTrailsForSequence(
  orchestrator: SequenceAnimationOrchestrator,
  sequence: SequenceData,
  config: TrailGenerationConfig
): GeneratedTrailData {
  const { canvasSize, leftPropDimensions, rightPropDimensions } = config;
  const samplesPerStep = config.samplesPerStep ?? 120;

  const totalSteps = sequence.steps.length ?? 0;
  if (totalSteps === 0) {
    return {
      leftLeft: [],
      leftRight: [],
      rightLeft: [],
      rightRight: [],
      totalSteps: 0,
      samplesPerStep,
      canvasSize,
    };
  }

  // Initialize orchestrator with sequence
  const initialized = orchestrator.initializeWithDomainData(sequence);
  if (!initialized) {
    console.error("Failed to initialize orchestrator for trail generation");
    return {
      leftLeft: [],
      leftRight: [],
      rightLeft: [],
      rightRight: [],
      totalSteps,
      samplesPerStep,
      canvasSize,
    };
  }

  // Configure endpoint calculators for each prop
  const leftEndpointConfig: PropEndpointConfig = {
    canvasSize,
    propDimensions: leftPropDimensions,
  };
  const rightEndpointConfig: PropEndpointConfig = {
    canvasSize,
    propDimensions: rightPropDimensions,
  };

  // Initialize trail arrays
  const leftLeft: TrailPoint[] = [];
  const leftRight: TrailPoint[] = [];
  const rightLeft: TrailPoint[] = [];
  const rightRight: TrailPoint[] = [];

  // Sample through the entire sequence
  const totalSamples = totalSteps * samplesPerStep;

  for (let i = 0; i <= totalSamples; i++) {
    const playbackPosition = i / samplesPerStep;
    const timestamp = playbackPosition / totalSteps; // Normalized 0-1

    // Get prop states at this playback position
    orchestrator.calculateState(playbackPosition);
    const leftState = orchestrator.getLeftPropState();
    const rightState = orchestrator.getRightPropState();

    // Calculate endpoints using shared calculator
    const leftEnds = calculatePropEndpoints(leftState, leftEndpointConfig);
    const rightEnds = calculatePropEndpoints(rightState, rightEndpointConfig);

    // Add points to trails
    leftLeft.push({
      x: leftEnds.left.x,
      y: leftEnds.left.y,
      beat: playbackPosition,
      timestamp,
    });
    leftRight.push({
      x: leftEnds.right.x,
      y: leftEnds.right.y,
      beat: playbackPosition,
      timestamp,
    });
    rightLeft.push({
      x: rightEnds.left.x,
      y: rightEnds.left.y,
      beat: playbackPosition,
      timestamp,
    });
    rightRight.push({
      x: rightEnds.right.x,
      y: rightEnds.right.y,
      beat: playbackPosition,
      timestamp,
    });
  }

  return {
    leftLeft,
    leftRight,
    rightLeft,
    rightRight,
    totalSteps,
    samplesPerStep,
    canvasSize,
  };
}

/**
 * Get trail points up to a specific beat (for rendering partial trails)
 *
 * @param trailData - Pre-generated trail data
 * @param currentStep - Current beat position (can be fractional)
 * @param maxTrailLength - Maximum number of points to return (for trail fade effect)
 */
export function getTrailPointsAtBeat(
  trailData: GeneratedTrailData,
  currentStep: number,
  maxTrailLength?: number
): {
  leftLeft: TrailPoint[];
  leftRight: TrailPoint[];
  rightLeft: TrailPoint[];
  rightRight: TrailPoint[];
} {
  // Calculate the sample index for the current beat
  const sampleIndex = Math.floor(currentStep * trailData.samplesPerStep);

  // Get all points up to current beat
  const endIndex = Math.min(sampleIndex + 1, trailData.leftLeft.length);
  const startIndex = maxTrailLength
    ? Math.max(0, endIndex - maxTrailLength)
    : 0;

  return {
    leftLeft: trailData.leftLeft.slice(startIndex, endIndex),
    leftRight: trailData.leftRight.slice(startIndex, endIndex),
    rightLeft: trailData.rightLeft.slice(startIndex, endIndex),
    rightRight: trailData.rightRight.slice(startIndex, endIndex),
  };
}
