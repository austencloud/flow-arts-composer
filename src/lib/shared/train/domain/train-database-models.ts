/**
 * Database models for Train module persistence
 * These interfaces define the shape of data stored in IndexedDB
 */

import type { DetectionSource } from "#lib/shared/train/domain/detection-frame.js";
import type {
  PerformanceGrade,
  TimingGrade,
} from "#lib/shared/train/domain/performance-data.js";
import type { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

/**
 * Stored performance record in database
 */
export interface StoredPerformance {
  id: string;
  sequenceId: string;
  sequenceName: string;
  performedAt: Date;
  detectionMethod: DetectionSource;
  bpm: number;

  // Stored as JSON for simplicity
  beatResultsJson: string;

  // Score data (denormalized for queries)
  score: {
    percentage: number;
    grade: PerformanceGrade;
    perfectHits: number;
    goodHits: number;
    misses: number;
    maxCombo: number;
  };

  // Optional metadata
  metadata?: {
    sessionDuration?: number; // Duration in milliseconds
  };

  // Optional video reference (stored in separate blob storage)
  videoStorageKey?: string;
}

/**
 * Stored beat result for detailed analysis
 */
export interface StoredBeatResult {
  stepNumber: number;
  expected: { left: GridLocation; right: GridLocation };
  detected: { left: GridLocation | null; right: GridLocation | null };
  timing: TimingGrade;
  timingDeltaMs: number;
  positionCorrect: { left: boolean; right: boolean };
}

/** Restores per-hand detail inside the JSON field used by old Train records. */
export function normalizeStoredBeatResultsJson(value: string): string {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return value;
    const normalized = parsed.map((beat) => {
      if (!beat || typeof beat !== "object" || Array.isArray(beat)) return beat;
      const source = beat as Record<string, unknown>;
      const normalizePair = (pair: unknown) => {
        if (!pair || typeof pair !== "object" || Array.isArray(pair)) {
          return pair;
        }
        const record = pair as Record<string, unknown>;
        const out: Record<string, unknown> = {
          ...record,
          left: record.left ?? record.blue,
          right: record.right ?? record.red,
        };
        delete out.blue;
        delete out.red;
        return out;
      };
      return {
        ...source,
        expected: normalizePair(source.expected),
        detected: normalizePair(source.detected),
        positionCorrect: normalizePair(source.positionCorrect),
      };
    });
    return JSON.stringify(normalized);
  } catch {
    return value;
  }
}

/**
 * Color calibration profile for color marker detection
 */
export interface StoredCalibrationProfile {
  id: string;
  name: string;
  createdAt: Date;
  isDefault: boolean;

  // HSV ranges for each marker color
  colorRanges: {
    endA: HSVRange;
    endB: HSVRange;
  };

  // Calibration metadata
  lightingConditions?: "bright" | "dim" | "mixed";
  cameraMirrored: boolean;
}

/**
 * HSV color range for color detection
 */
export interface HSVRange {
  hMin: number;
  hMax: number;
  sMin: number;
  sMax: number;
  vMin: number;
  vMax: number;
}
