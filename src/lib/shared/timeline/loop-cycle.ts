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
 * The repeat is expressed in SLOTS, one per notation cell, so a rail that shows
 * the Start cell performs it: `N + 1` slots when the start pose is part of the
 * cycle, `N` when the surface omits it (the endless spinner's lane drops the
 * Start cell because its pose equals the sequence's end).
 *
 * Keeping the modulo here — instead of `(elapsed % stepCount) + 1` inline —
 * is what keeps a rail's wrap continuous: the slot count the clock repeats on
 * and the cell count the rail wraps on are the same number, so the carousel
 * advances exactly one stride across the boundary instead of snapping back.
 */

/** Notation cells in one repeat: the motion beats, plus Start when performed. */
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
 * @param includesStartSlot Whether the start pose gets its own slot.
 * @returns Float step: `[0,1)` is the start hold (only when it has a slot),
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
