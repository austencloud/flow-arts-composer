import type { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { DetectionFrame, DetectionSource } from "./detection-frame";

export interface StepResult {
  stepNumber: number;
  expected: { left: GridLocation; right: GridLocation };
  detected: { left: GridLocation | null; right: GridLocation | null };
  timing: TimingGrade;
  timingDeltaMs: number;
  positionCorrect: { left: boolean; right: boolean };
}

export type TimingGrade = "perfect" | "good" | "early" | "late" | "miss";

export interface PerformanceScore {
  percentage: number;
  grade: PerformanceGrade;
  perfectHits: number;
  goodHits: number;
  misses: number;
  maxCombo: number;
}

export type PerformanceGrade = "S" | "A" | "B" | "C" | "D" | "F";

export interface PerformanceData {
  id: string;
  sequenceId: string;
  sequenceName: string;
  performedAt: Date;
  detectionMethod: DetectionSource;
  bpm: number;
  frames: DetectionFrame[];
  stepResults: StepResult[];
  score: PerformanceScore;
  videoBlob?: Blob;
}
