/**
 * Times effects by how far the sequence moved, not by the render clock.
 *
 * The playback loop and the Three.js render loop are separate animation
 * frames. When playback runs second, the props a frame draws are the ones
 * playback posed a frame earlier, so a long frame reports a long delta while
 * the props moved one short frame's worth, and the next frame the reverse.
 * Effects that read tip velocity from displacement / delta (ink, silk) then see
 * the tip halve and double its speed on every dropped frame.
 *
 * The step a frame shows advances in proportion to the time the props
 * actually moved. Learning seconds-per-step from both clocks turns each
 * frame's step advance back into that time. The rate learns only from frames
 * as long as the one before, where it cannot matter which frame's time the
 * step reflects. Whenever the step does not move forward (paused, scrubbed
 * back, looped, just started) the render delta stands.
 */
export class EffectMotionClock {
  private lastStep: number | null = null;
  private seconds = 0;
  private steps = 0;
  private frames = 0;
  private lastDelta = 0;

  /** Frames of steady playback before the learned rate is trusted. */
  static readonly WARMUP = 8;
  /** Per-frame decay of the averages: about a third of a second of memory. */
  static readonly DECAY = 0.95;
  /** How far two frames' deltas may differ and still count as steady. */
  static readonly STEADY = 0.15;

  advance(delta: number, step: number, playing: boolean): number {
    const previous = this.lastStep;
    this.lastStep = step;
    if (!playing || previous === null || !Number.isFinite(step)) {
      this.reset(step);
      return delta;
    }
    const moved = step - previous;
    const lastDelta = this.lastDelta;
    this.lastDelta = delta;
    // A loop or scrub moves the step without moving time; the rate it has
    // learned still holds for the frames after.
    if (!(moved > 0) || !(delta > 0)) return delta;
    if (Math.abs(delta - lastDelta) <= EffectMotionClock.STEADY * Math.max(delta, lastDelta)) {
      this.seconds = this.seconds * EffectMotionClock.DECAY + delta;
      this.steps = this.steps * EffectMotionClock.DECAY + moved;
      this.frames++;
    }
    if (this.frames < EffectMotionClock.WARMUP) return delta;
    return moved * (this.seconds / this.steps);
  }

  reset(step: number | null = null): void {
    this.lastStep = step;
    this.lastDelta = 0;
    this.seconds = 0;
    this.steps = 0;
    this.frames = 0;
  }
}
