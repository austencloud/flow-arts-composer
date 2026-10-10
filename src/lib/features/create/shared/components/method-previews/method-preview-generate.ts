/**
 * The Generate preview's rolls and wave (GenerateScene.svelte). Pure, so
 * tests check them without drawing.
 */
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import { DEFAULT_ANIMATION_TIMING } from "#lib/features/create/shared/workspace-panel/sequence-display/domain/models/step-grid-display-models.js";
import { DEMO_SEQUENCE, DEMO_STEP_START } from "./method-preview-demo";
import { slotWaveBand } from "./method-preview-layout";

/** How long the last roll fades before the next washes in. */
export const GENERATE_CLEAR_MS = 150;

/** How long a turn waits for the new roll's cells to draw. */
export const GENERATE_READY_WAIT_MS = 600;

/** What the cells show: a sequence, from one of its steps on. */
export interface GenerateRoll {
  sequence: SequenceData;
  offset: number;
}

/**
 * The resting picture before the first turn: the demo sequence from
 * Generate's own start, so no other card rests on the same steps.
 */
export const FIRST_ROLL: Readonly<GenerateRoll> = Object.freeze({
  sequence: DEMO_SEQUENCE,
  offset: DEMO_STEP_START.generate,
});

/** The step cell `index` shows, wrapping around a short roll. */
export function rollStep(roll: GenerateRoll, index: number): StepData | null {
  const steps = roll.sequence.steps;
  if (steps.length === 0) return null;
  return steps[(roll.offset + index) % steps.length] ?? null;
}

/**
 * The roll a turn shows. A fresh draw shows from its first step. Without
 * one, turns step through the demo sequence a window at a time, starting
 * over at the resting picture after a fresh roll.
 */
export function nextRoll(
  current: GenerateRoll,
  fresh: SequenceData | null,
  cellCount: number
): GenerateRoll {
  if (fresh && fresh.steps.length > 0) return { sequence: fresh, offset: 0 };
  const length = DEMO_SEQUENCE.steps.length;
  if (current.sequence !== DEMO_SEQUENCE || length === 0) return FIRST_ROLL;
  return {
    sequence: DEMO_SEQUENCE,
    offset: (current.offset + Math.max(1, cellCount)) % length,
  };
}

/**
 * When cell `index` starts entering: its wave band times the step grid's
 * stagger. The dice holds slot 0, so cell `index` sits in slot `index + 1`.
 */
export function generateCellDelayMs(index: number, columns: number): number {
  return (
    slotWaveBand(index + 1, columns) * DEFAULT_ANIMATION_TIMING.waveBandDelay
  );
}

/** From the start of the wash until its last cell has landed. */
export function generateRevealMs(cellCount: number, columns: number): number {
  if (cellCount <= 0) return 0;
  return (
    generateCellDelayMs(cellCount - 1, columns) +
    DEFAULT_ANIMATION_TIMING.entranceDuration
  );
}
