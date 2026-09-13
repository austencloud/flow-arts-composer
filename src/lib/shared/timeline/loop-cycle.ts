/**
 * Looping playback cycle math for beat-strip surfaces.
 *
 * A continuously looping preview drives a free-running clock (elapsed beats
 * since it started) and has to land that clock on a float step the rest of the
 * timeline stack already understands:
 *
 *   step < 1        → the start position (notation cell 0, `isStart`)
 *   1 <= step < N+1 → motion beat `floor(step)` (notation cells 1..N)
 *
 * The repeat is measured in PERFORMED SLOTS, and canonical loop semantics
 * decide whether the start pose is one of them — see `performsStartSlot`. That
 * count is playback time, so it is never padded to match the rail: a rail that
 * carries a Start cell a loopable sequence does not perform simply travels
 * through that cell at the boundary (StepStrip's loop offset keeps the motion
 * forward), rather than the clock holding still to wait for it.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { isSeamlesslyLoopable } from "$lib/shared/foundation/services/sequence-loopability-checker";

/**
 * Does one repeat of this sequence perform the start pose?
 *
 * Canonical loop semantics, from the playback controller's own boundary
 * (`onAnimationUpdate`): a seamlessly loopable sequence resumes at
 * `startPositionDuration` — it skips the repeated start hold, because its last
 * beat already ends on the start pose — while a freeform sequence restarts at 0
 * and shows the hold again, which is what makes its pose jump legible.
 *
 * Holding the start pose for a loopable sequence would inject a beat of
 * stillness into a cadence that is meant to spin continuously.
 */
export function performsStartSlot(sequence: SequenceData): boolean {
  return !isSeamlesslyLoopable(sequence);
}

/** Performed slots in one repeat: the motion beats, plus the start hold when
 *  the sequence performs it. */
export function cycleSlotCount(
  stepCount: number,
  includesStartSlot: boolean
): number {
  const beats = Math.max(1, Math.floor(stepCount));
  return beats + (includesStartSlot ? 1 : 0);
}

/**
 * Map free-running elapsed beats onto one repeat of the sequence.
 *
 * @param elapsedBeats Beats since playback started. Grows without bound.
 * @param stepCount Motion beats in the sequence.
 * @param includesStartSlot Whether the start pose is performed in the repeat.
 * @returns Float step: `[0,1)` is the start hold (only when it is performed),
 *          `[1, N+1)` are the motion beats with progress in the fraction.
 */
export function resolveCycleStep(
  elapsedBeats: number,
  stepCount: number,
  includesStartSlot: boolean
): number {
  const slots = cycleSlotCount(stepCount, includesStartSlot);
  const elapsed = Number.isFinite(elapsedBeats) ? elapsedBeats : 0;
  // Modulo twice: a negative clock (a host that seeks behind its own start)
  // must still land inside the cycle rather than before it.
  const phase = ((elapsed % slots) + slots) % slots;
  return includesStartSlot ? phase : phase + 1;
}

/**
 * Cycle step for a preview that opens in motion.
 *
 * A reader who just tapped play should see movement, not a held pose, so the
 * clock enters the cycle at beat 1; a performed start hold arrives at the first
 * wrap and on every repeat after it. For a sequence that does not perform the
 * hold this is exactly the plain `(elapsed % stepCount) + 1` cadence — no beat
 * is added anywhere.
 */
export function resolvePreviewCycleStep(
  elapsedBeats: number,
  stepCount: number,
  includesStartSlot: boolean
): number {
  return resolveCycleStep(
    elapsedBeats + (includesStartSlot ? 1 : 0),
    stepCount,
    includesStartSlot
  );
}

/**
 * Motion-beat index for a cycle step, or `null` while the start pose is held.
 * Clamped so the final fraction of the last beat still resolves to that beat.
 */
export function resolveCycleBeatIndex(
  step: number,
  stepCount: number
): number | null {
  if (step < 1) return null;
  const beats = Math.max(1, Math.floor(stepCount));
  return Math.min(Math.max(0, Math.floor(step) - 1), beats - 1);
}
