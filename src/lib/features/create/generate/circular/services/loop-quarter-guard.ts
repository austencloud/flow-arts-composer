/**
 * Guarded quarter builder shared by the strict period-2/4 LOOP executors
 * (mirrored / flipped / swapped / inverted).
 *
 * These transforms are all order-2 on the classification axis: applying them
 * twice is the identity. So a "quartered" (period-4) pass only differs from the
 * period-2 close when ORIENTATION drifts across the first close — i.e. the
 * seed's per-hand turn total is ≡ 1 or 3 (mod 4). For a whole-turn seed (every
 * L1/L2 zero-turn seed qualifies) the loop already returns to its start
 * orientation after the period-2 mirror, so quarters 3–4 come out byte-for-byte
 * identical to 1–2 — a redundant literal repeat (the YΦΔ×4 defect, 2026-07-10).
 *
 * This builder appends the period-2 pass, then extends to period 4 ONLY when
 * orientation has not yet closed. `minimal-loop-reducer.ts` is the post-hoc
 * safety net that also repairs already-stored sequences.
 */

import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

/** True when both hands' end orientation equals their start orientation. */
export function orientationCloses(firstBeat: StepData, lastBeat: StepData): boolean {
  for (const color of [HandSide.LEFT, HandSide.RIGHT] as const) {
    const start = firstBeat.motions[color]?.startOrientation;
    const end = lastBeat.motions[color]?.endOrientation;
    if (start == null || end == null || start !== end) return false;
  }
  return true;
}

type EntryFactory = (
  sourceStep: StepData,
  previousStep: StepData,
  stepNumber: number,
) => StepData;

/**
 * Extend a partial (already in `sequence`, start-placement step removed) into a
 * strict LOOP, stopping at period 2 when orientation already closes.
 *
 * Odd quarters apply `createTransformed` (the mirror/flip/swap/invert); even
 * quarters apply `createCopied`. Mutates `sequence` in place.
 *
 * @param requestedPeriod 2 (halved) or 4 (quartered).
 */
export function buildStrictQuarters(
  sequence: StepData[],
  partialLength: number,
  requestedPeriod: number,
  createTransformed: EntryFactory,
  createCopied: EntryFactory,
): void {
  const firstBeat = sequence[0]!;
  let lastStep = sequence[sequence.length - 1]!;
  const firstGeneratedStepNumber = lastStep.stepNumber + 1;

  for (let quarterIdx = 1; quarterIdx < requestedPeriod; quarterIdx++) {
    const applyTransform = quarterIdx % 2 === 1;
    for (let i = 0; i < partialLength; i++) {
      const stepNumber =
        firstGeneratedStepNumber + (quarterIdx - 1) * partialLength + i;
      const sourceStep = sequence[i]!;
      const newStep = applyTransform
        ? createTransformed(sourceStep, lastStep, stepNumber)
        : createCopied(sourceStep, lastStep, stepNumber);
      sequence.push(newStep);
      lastStep = newStep;
    }

    // After the period-2 close, bail out of further passes if the loop already
    // returns to its start orientation (placement closure is guaranteed by each
    // executor's _validateSequence).
    if (quarterIdx === 1 && orientationCloses(firstBeat, lastStep)) break;
  }
}
