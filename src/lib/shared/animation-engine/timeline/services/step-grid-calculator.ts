/**
 * StepGridCalculator
 *
 * Pure functions for calculating beat and measure positions from BPM and time signature.
 * Used to render beat grid markers in the timeline and for snap-to-beat functionality.
 */

import {
  TIME_SIGNATURES,
  type TimeSignatureKey,
  isCompoundMeter,
} from "#lib/shared/foundation/domain/models/time-signature.js";
import type { TimeSeconds } from "#lib/shared/animation-engine/domain/timeline-types.js";

// Types

/**
 * A marker representing a beat position on the timeline
 */
export interface StepMarker {
  /** Time position in seconds */
  time: TimeSeconds;

  /** Measure number (1-based) */
  measure: number;

  /** Beat number within the measure (1-based) */
  beat: number;

  /** Whether this beat starts a new measure */
  isMeasureStart: boolean;

  /** Whether this is a strong beat (beat 1, or beat 4 in 6/8) */
  isStrongBeat: boolean;
}

/**
 * A marker representing a measure start position
 */
export interface MeasureMarker {
  /** Time position in seconds */
  time: TimeSeconds;

  /** Measure number (1-based) */
  measure: number;
}

/**
 * Subdivision marker for high-zoom display
 */
export interface SubdivisionMarker {
  /** Time position in seconds */
  time: TimeSeconds;

  /** Subdivision index within the beat (0-based) */
  subdivision: number;
}

/**
 * Position expressed in musical terms
 */
export interface MusicalPosition {
  /** Measure number (1-based) */
  measure: number;

  /** Beat within the measure (1-based) */
  beat: number;

  /** Subdivision within the beat (0-based, 0 = on the beat) */
  subdivision: number;
}

// Core Calculations

/**
 * Calculate the duration of one beat in seconds
 */
export function getStepDuration(bpm: number): number {
  if (bpm <= 0) return 0;
  return 60 / bpm;
}

/**
 * Calculate the duration of one measure in seconds
 */
export function getMeasureDuration(
  bpm: number,
  timeSignature: TimeSignatureKey
): number {
  const ts = TIME_SIGNATURES[timeSignature];
  const beatDuration = getStepDuration(bpm);

  // For compound meters like 6/8, each eighth note is a beat
  // So 6/8 has 6 eighth notes per measure
  if (isCompoundMeter(ts)) {
    // In 6/8, we have 6 eighth notes per measure
    // BPM usually refers to dotted quarter notes (groups of 3 eighth notes)
    // So we need to adjust: 2 "big beats" per measure in 6/8
    return beatDuration * 2;
  }

  // Simple meters: just multiply beats by beat duration
  return beatDuration * ts.numerator;
}

/**
 * Get the number of beats per measure for display purposes
 */
export function getStepsPerMeasure(timeSignature: TimeSignatureKey): number {
  const ts = TIME_SIGNATURES[timeSignature];

  // For compound meters, show the grouped beats (2 for 6/8)
  if (isCompoundMeter(ts)) {
    return ts.numerator / 3;
  }

  return ts.numerator;
}

// Marker Calculations

/**
 * Calculate all beat markers for a given duration
 *
 * @param bpm - Beats per minute
 * @param duration - Total duration in seconds
 * @param timeSignature - Time signature key
 * @returns Array of beat markers sorted by time
 */
export function calculateStepMarkers(
  bpm: number,
  duration: TimeSeconds,
  timeSignature: TimeSignatureKey
): StepMarker[] {
  if (bpm <= 0 || duration <= 0) return [];

  const ts = TIME_SIGNATURES[timeSignature];
  const beatDuration = getStepDuration(bpm);
  const beatsPerMeasure = getStepsPerMeasure(timeSignature);
  const markers: StepMarker[] = [];

  // For compound meters, we need to handle the grouping differently
  const isCompound = isCompoundMeter(ts);

  let currentTime = 0;
  let currentMeasure = 1;
  let currentStep = 1;

  while (currentTime <= duration) {
    const isMeasureStart = currentStep === 1;

    // Strong beats: beat 1 always, beat 4 in 6/8 (second dotted quarter)
    const isStrongBeat = isCompound
      ? currentStep === 1 || currentStep === 2
      : currentStep === 1;

    markers.push({
      time: currentTime,
      measure: currentMeasure,
      beat: currentStep,
      isMeasureStart,
      isStrongBeat,
    });

    currentTime += isCompound ? beatDuration : beatDuration;
    currentStep++;

    if (currentStep > beatsPerMeasure) {
      currentStep = 1;
      currentMeasure++;
    }
  }

  return markers;
}

/**
 * Calculate measure start markers only (for ruler labels)
 *
 * @param bpm - Beats per minute
 * @param duration - Total duration in seconds
 * @param timeSignature - Time signature key
 * @returns Array of measure markers sorted by time
 */
export function calculateMeasureMarkers(
  bpm: number,
  duration: TimeSeconds,
  timeSignature: TimeSignatureKey
): MeasureMarker[] {
  if (bpm <= 0 || duration <= 0) return [];

  const measureDuration = getMeasureDuration(bpm, timeSignature);
  const markers: MeasureMarker[] = [];

  let currentTime = 0;
  let currentMeasure = 1;

  while (currentTime <= duration) {
    markers.push({
      time: currentTime,
      measure: currentMeasure,
    });

    currentTime += measureDuration;
    currentMeasure++;
  }

  return markers;
}

/**
 * Calculate subdivision markers between beats (for high zoom levels)
 *
 * @param bpm - Beats per minute
 * @param duration - Total duration in seconds
 * @param timeSignature - Time signature key
 * @param subdivisionsPerBeat - Number of subdivisions per beat (typically 4 for 16th notes)
 * @returns Array of subdivision markers (excluding beat positions)
 */
export function calculateSubdivisionMarkers(
  bpm: number,
  duration: TimeSeconds,
  timeSignature: TimeSignatureKey,
  subdivisionsPerBeat: number = 4
): SubdivisionMarker[] {
  if (bpm <= 0 || duration <= 0 || subdivisionsPerBeat <= 1) return [];

  const beatDuration = getStepDuration(bpm);
  const subdivisionDuration = beatDuration / subdivisionsPerBeat;
  const markers: SubdivisionMarker[] = [];

  let currentTime = 0;

  while (currentTime <= duration) {
    // Add subdivisions between beats (skip subdivision 0, which is the beat itself)
    for (let sub = 1; sub < subdivisionsPerBeat; sub++) {
      const subTime = currentTime + sub * subdivisionDuration;
      if (subTime <= duration) {
        markers.push({
          time: subTime,
          subdivision: sub,
        });
      }
    }
    currentTime += beatDuration;
  }

  return markers;
}

// Time-to-Position Conversions

/**
 * Convert a time position to musical position (measure, beat, subdivision)
 *
 * @param time - Time in seconds
 * @param bpm - Beats per minute
 * @param timeSignature - Time signature key
 * @param subdivisionsPerBeat - Number of subdivisions per beat
 * @returns Musical position
 */
export function timeToStepPosition(
  time: TimeSeconds,
  bpm: number,
  timeSignature: TimeSignatureKey,
  subdivisionsPerBeat: number = 4
): MusicalPosition {
  if (bpm <= 0 || time < 0) {
    return { measure: 1, beat: 1, subdivision: 0 };
  }

  const beatDuration = getStepDuration(bpm);
  const beatsPerMeasure = getStepsPerMeasure(timeSignature);

  // Total beats elapsed
  const totalSteps = time / beatDuration;

  // Calculate measure (1-based)
  const measure = Math.floor(totalSteps / beatsPerMeasure) + 1;

  // Calculate beat within measure (1-based)
  const beatInMeasure = Math.floor(totalSteps % beatsPerMeasure) + 1;

  // Calculate subdivision within beat (0-based)
  const beatFraction = totalSteps - Math.floor(totalSteps);
  const subdivision = Math.floor(beatFraction * subdivisionsPerBeat);

  return {
    measure,
    beat: beatInMeasure,
    subdivision,
  };
}

/**
 * Convert a musical position to time in seconds
 *
 * @param position - Musical position
 * @param bpm - Beats per minute
 * @param timeSignature - Time signature key
 * @param subdivisionsPerBeat - Number of subdivisions per beat
 * @returns Time in seconds
 */
export function beatPositionToTime(
  position: MusicalPosition,
  bpm: number,
  timeSignature: TimeSignatureKey,
  subdivisionsPerBeat: number = 4
): TimeSeconds {
  if (bpm <= 0) return 0;

  const beatDuration = getStepDuration(bpm);
  const beatsPerMeasure = getStepsPerMeasure(timeSignature);

  // Calculate total beats (converting from 1-based to 0-based)
  const totalSteps =
    (position.measure - 1) * beatsPerMeasure +
    (position.beat - 1) +
    position.subdivision / subdivisionsPerBeat;

  return totalSteps * beatDuration;
}

// Snap Helpers

/**
 * Get all beat times for snap functionality
 *
 * @param bpm - Beats per minute
 * @param duration - Total duration in seconds
 * @param timeSignature - Time signature key
 * @returns Array of times in seconds where beats occur
 */
export function getStepTimes(
  bpm: number,
  duration: TimeSeconds,
  timeSignature: TimeSignatureKey
): TimeSeconds[] {
  const markers = calculateStepMarkers(bpm, duration, timeSignature);
  return markers.map((m) => m.time);
}

/**
 * Find the nearest beat to a given time
 *
 * @param time - Time to snap
 * @param bpm - Beats per minute
 * @param timeSignature - Time signature key
 * @returns Nearest beat time
 */
export function snapToBeat(
  time: TimeSeconds,
  bpm: number,
  _timeSignature: TimeSignatureKey
): TimeSeconds {
  if (bpm <= 0) return time;

  const beatDuration = getStepDuration(bpm);
  return Math.round(time / beatDuration) * beatDuration;
}

/**
 * Format a musical position as a string (e.g., "3.2" for measure 3, beat 2)
 */
export function formatMusicalPosition(position: MusicalPosition): string {
  if (position.subdivision === 0) {
    return `${position.measure}.${position.beat}`;
  }
  return `${position.measure}.${position.beat}.${position.subdivision}`;
}
