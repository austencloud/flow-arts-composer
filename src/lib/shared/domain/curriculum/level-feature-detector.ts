/**
 * Level Feature Detector
 *
 * Scans a sequence for features that place it above Level 3 - the highest
 * level the runtime `SequenceDifficultyCalculator` currently classifies.
 *
 * This is an *escape hatch*, not a classifier. When `beyondLevel3` is true,
 * the caller should treat level as unknown rather than guessing L1.
 *
 * Features checked:
 *   L4 - interradial orientations (clockIn, clockOut, counterIn, counterOut)
 *        and quarter turns (any turns value not a multiple of 0.5)
 *   L5 - zeta/eta positions, skewed or 8point grid mode, skew modifier on shift
 *   L6 - center grid location ("c"), tau/terra positions, centric grid mode,
 *        hash motions, skew modifier on dash
 *   L7 - trigrid grid mode (conjoined)
 *   L8 - any motion/step carrying a `plane` field
 *
 * Levels 4 and 6 traded places in Aug 2026: interradials moved down to 4 and
 * the center point up to 6. See the `level-system` domain topic for why.
 *
 * Feature lists come from:
 *   - src/lib/shared/pictograph/grid/domain/enums/grid-enums.ts
 *   - src/lib/shared/pictograph/shared/domain/enums/pictograph-enums.ts
 *   - packages/domain/src/curriculum/knowledge-graph.ts
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

const CENTER_ORIENTATIONS = new Set([
  "centerN", "centerNE", "centerE", "centerSE",
  "centerS", "centerSW", "centerW", "centerNW",
]);

const INTERRADIAL_ORIENTATIONS = new Set([
  "clockIn", "clockOut", "counterIn", "counterOut",
]);

const HIGH_LEVEL_GRID_MODES = new Set([
  "centric", "skewed", "8point", "trigrid",
]);

const HASH_MOTION_TYPES = new Set(["hashIn", "hashOut"]);

export interface LevelFeatureReport {
  readonly beyondLevel3: boolean;
  readonly minLevel: number;
  readonly features: readonly string[];
}

interface MotionLike {
  startLocation?: string;
  endLocation?: string;
  startOrientation?: string;
  endOrientation?: string;
  motionType?: string;
  turns?: number;
  skewDirection?: string;
  skew?: string;
  plane?: string;
  isVisible?: boolean;
}

interface StepLike {
  startPlacement?: string;
  endPlacement?: string;
  motions?: Record<string, MotionLike | undefined>;
  plane?: string;
}

export function detectLevelFeatures(sequence: SequenceData): LevelFeatureReport {
  const features: string[] = [];
  let minLevel = 1;

  const note = (level: number, feature: string) => {
    features.push(feature);
    if (level > minLevel) minLevel = level;
  };

  if (sequence.gridMode && HIGH_LEVEL_GRID_MODES.has(sequence.gridMode)) {
    const mode = sequence.gridMode;
    if (mode === "centric") note(6, `gridMode:${mode}`);
    else if (mode === "skewed" || mode === "8point") note(5, `gridMode:${mode}`);
    else if (mode === "trigrid") note(7, `gridMode:${mode}`);
  }

  for (const step of sequence.steps as readonly StepData[]) {
    scanStep(step as unknown as StepLike, note);
  }

  return {
    beyondLevel3: minLevel >= 4,
    minLevel,
    features,
  };
}

function scanStep(step: StepLike, note: (level: number, feature: string) => void): void {
  if (step.plane) note(8, `step.plane:${step.plane}`);

  if (step.startPlacement) scanPosition(step.startPlacement, note);
  if (step.endPlacement) scanPosition(step.endPlacement, note);

  const motions = step.motions ?? {};
  for (const color of Object.keys(motions)) {
    const motion = motions[color];
    // invisible placeholder = hand not really there (both-required Step shape)
    if (motion && motion.isVisible !== false) scanMotion(motion, color, note);
  }
}

function scanPosition(position: string, note: (level: number, feature: string) => void): void {
  if (position.startsWith("zeta")) note(5, `position:${position}`);
  else if (position.startsWith("eta")) note(5, `position:${position}`);
  else if (position.startsWith("tau")) note(6, `position:${position}`);
  else if (position.startsWith("terra")) note(6, `position:${position}`);
}

function scanMotion(
  motion: MotionLike,
  color: string,
  note: (level: number, feature: string) => void,
): void {
  if (motion.startLocation === "c") note(6, `${color}.startLocation:center`);
  if (motion.endLocation === "c") note(6, `${color}.endLocation:center`);

  if (motion.motionType && HASH_MOTION_TYPES.has(motion.motionType)) {
    note(6, `${color}.motionType:${motion.motionType}`);
  }

  for (const ori of [motion.startOrientation, motion.endOrientation]) {
    if (!ori) continue;
    if (INTERRADIAL_ORIENTATIONS.has(ori)) note(4, `${color}.orientation:${ori}`);
    else if (CENTER_ORIENTATIONS.has(ori)) note(6, `${color}.orientation:${ori}`);
  }

  // Quarter turns are the defining L4 feature. Orientation alone almost always
  // catches them (a quarter turn lands interradial), but turns is the direct
  // signal and stays correct if a motion carries turns without orientations.
  // A quarter turn is one whose doubled value is not a whole number: 0.25 and
  // 0.75 qualify, 0.5 and 1 do not, and a negative float sentinel does not.
  if (typeof motion.turns === "number" && !Number.isInteger(motion.turns * 2)) {
    note(4, `${color}.turns:${motion.turns}`);
  }

  const skew = motion.skewDirection ?? motion.skew;
  if (skew === "+" || skew === "-") {
    const type = motion.motionType ?? "";
    if (type === "dash") note(6, `${color}.dash${skew}`);
    else note(5, `${color}.skew${skew}`);
  }

  if (motion.plane) note(8, `${color}.plane:${motion.plane}`);
}
