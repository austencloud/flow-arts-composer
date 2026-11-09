/**
 * The mandala's afterimage trail: a fixed ring of past frames.
 *
 * The ring only keeps bookkeeping (which slot holds which frame, at what spin
 * and time). The pixels live wherever the caller keeps one surface per slot,
 * so the slot index doubles as the surface index. Every slot is allocated up
 * front and reused, so capturing a frame allocates nothing once the ring is
 * built.
 */

export const MANDALA_TRAIL_MIN = 3;
export const MANDALA_TRAIL_MAX = 15;
export const MANDALA_TRAIL_DEFAULT = 8;

/** Time between captured frames. About 12 ghosts a second reads as a smear. */
export const MANDALA_GHOST_INTERVAL_MS = 80;
/** The freshest ghost: visible, clearly behind the live frame. */
export const MANDALA_GHOST_BASE_OPACITY = 0.45;
/** Each interval of age keeps this share of the brightness. */
export const MANDALA_GHOST_DECAY = 0.62;

export interface MandalaGhostSlot {
  /** Which capture this is. Increases by one per capture, never reused. */
  id: number;
  /** The mandala's spin when the frame was captured, in degrees. */
  rotationDeg: number;
  /** Clock time of the capture, in milliseconds. */
  capturedAt: number;
}

export function clampTrailLength(length: number): number {
  if (!Number.isFinite(length)) return MANDALA_TRAIL_DEFAULT;
  return Math.min(
    MANDALA_TRAIL_MAX,
    Math.max(MANDALA_TRAIL_MIN, Math.round(length))
  );
}

/**
 * Brightness of a ghost by its age. Fading by age rather than by place in
 * the ring keeps every ghost dimming smoothly between captures instead of
 * stepping down a notch each time a new one arrives.
 */
export function mandalaGhostOpacity(
  ageMs: number,
  intervalMs: number = MANDALA_GHOST_INTERVAL_MS
): number {
  const steps = Math.max(0, ageMs) / Math.max(1, intervalMs);
  return MANDALA_GHOST_BASE_OPACITY * Math.pow(MANDALA_GHOST_DECAY, steps);
}

export class MandalaGhostRing {
  readonly capacity: number;
  readonly #slots: MandalaGhostSlot[];
  #length: number;
  /** Slot index of the newest frame, or -1 when empty. */
  #head = -1;
  #count = 0;
  #nextId = 0;
  #lastCaptureAt = Number.NEGATIVE_INFINITY;

  constructor(
    length: number = MANDALA_TRAIL_DEFAULT,
    capacity: number = MANDALA_TRAIL_MAX
  ) {
    this.capacity = Math.max(1, Math.floor(capacity));
    this.#slots = Array.from({ length: this.capacity }, () => ({
      id: -1,
      rotationDeg: 0,
      capturedAt: 0,
    }));
    this.#length = Math.min(this.capacity, clampTrailLength(length));
  }

  /** How many ghosts the trail keeps. */
  get length(): number {
    return this.#length;
  }

  /** How many ghosts it holds right now (at most `length`). */
  get count(): number {
    return this.#count;
  }

  /**
   * A new length starts the trail over: the slots wrap on the length, so the
   * old order no longer holds.
   */
  setLength(length: number): void {
    const next = Math.min(this.capacity, clampTrailLength(length));
    if (next === this.#length) return;
    this.#length = next;
    this.clear();
  }

  clear(): void {
    this.#head = -1;
    this.#count = 0;
    this.#lastCaptureAt = Number.NEGATIVE_INFINITY;
  }

  /** Whether enough time has passed since the last capture to take another. */
  isDue(now: number, intervalMs: number = MANDALA_GHOST_INTERVAL_MS): boolean {
    // A clock that went backwards (a restarted timeline) counts as due.
    return now < this.#lastCaptureAt || now - this.#lastCaptureAt >= intervalMs;
  }

  /**
   * Records a frame in the next slot, overwriting the oldest once full, and
   * returns that slot's index so the caller can draw into its surface.
   */
  push(rotationDeg: number, now: number): number {
    const index = (this.#head + 1) % this.#length;
    const slot = this.#slots[index]!;
    slot.id = this.#nextId++;
    slot.rotationDeg = rotationDeg;
    slot.capturedAt = now;
    this.#head = index;
    this.#count = Math.min(this.#length, this.#count + 1);
    this.#lastCaptureAt = now;
    return index;
  }

  /** Slot index of the `age`-th newest ghost (0 = newest), or -1 past the end. */
  slotIndexAt(age: number): number {
    if (age < 0 || age >= this.#count) return -1;
    return (this.#head - age + this.#length) % this.#length;
  }

  /** The slot at an index, or undefined if that slot holds no live ghost. */
  slot(index: number): Readonly<MandalaGhostSlot> | undefined {
    if (index < 0 || index >= this.#length) return undefined;
    for (let age = 0; age < this.#count; age++) {
      if (this.slotIndexAt(age) === index) return this.#slots[index];
    }
    return undefined;
  }
}
