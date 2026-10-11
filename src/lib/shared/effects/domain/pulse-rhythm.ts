/**
 * Beat and motion measurements shared by the 2D and 3D Pulse renderers.
 *
 * Pulse keeps musical time. A ring's lifetime is counted in beats, a tip's
 * energy is how far it travels in one beat, and the build-up before a beat
 * runs on the measured beat length. The tuner at 0.3 speed and full-speed
 * playback therefore draw the same picture, only slower.
 */

/** Stage units (2D viewbox at scale 1) per beat that count as full energy. */
export const PULSE_FULL_ENERGY_TRAVEL = 640;
/** 3D metres to 2D stage units, matching resolvePulse3D's radius mapping. */
export const PULSE_STAGE_UNITS_PER_METRE = 120;
/** Beat length assumed until playback has shown one (1.0 speed = 60 BPM). */
const DEFAULT_BEAT_SECONDS = 1;
/** Velocity smoothing time constant, seconds. */
const MOTION_SMOOTHING = 0.07;
/** Smallest rise from the last trough that still counts as a swing. */
const SWING_PROMINENCE = 0.08;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function smoothstep(edge0: number, edge1: number, v: number): number {
  const t = clamp((v - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Follows the playhead and reports when a ring beat starts.
 *
 * Hosts pass either whole steps (the 2D canvases) or a fractional step (3D).
 * With whole steps the beat length comes from the time between step changes;
 * with fractional steps it comes from how fast the step advances.
 */
export class PulseBeatClock {
  private secondsPerStep = DEFAULT_BEAT_SECONDS;
  private measured = false;
  private clock = 0;
  private step = Number.NaN;
  private stepAt = 0;
  private lastRaw = Number.NaN;
  private fractionalAt = Number.NEGATIVE_INFINITY;
  private ringBeat = Number.NaN;
  private ringAt = 0;
  private ringSpan = 1;
  private exactPhase = Number.NaN;

  /** Advance by one frame. Returns true when a ring beat starts this frame. */
  advance(currentStep: number, dt: number, beatInterval: number): boolean {
    this.clock += dt;
    const raw = Number.isFinite(currentStep) ? currentStep : 0;
    const span = Math.max(1, Math.round(beatInterval) || 1);
    const whole = Math.floor(raw);
    if (raw !== whole) this.fractionalAt = this.clock;
    const fractional = this.clock - this.fractionalAt < 0.5;

    if (fractional && dt > 0 && Number.isFinite(this.lastRaw)) {
      const advanced = raw - this.lastRaw;
      if (advanced > 0 && advanced < 0.5) {
        this.measure(dt / advanced, 1 - Math.exp(-dt / 0.4));
      }
    }
    if (whole !== this.step) {
      if (!fractional && Number.isFinite(this.step)) {
        const gap = this.clock - this.stepAt;
        // One step forward, or the loop wrapping back to its start.
        const stepped = whole === this.step + 1 || whole < this.step;
        if (stepped && gap >= 0.08 && gap <= 8) this.measure(gap, 0.5);
      }
      this.step = whole;
      this.stepAt = this.clock;
    }
    this.lastRaw = raw;

    const beat = Math.floor(raw / span);
    this.exactPhase = fractional ? raw / span - beat : Number.NaN;
    if (beat === this.ringBeat) return false;
    this.ringBeat = beat;
    this.ringAt = this.clock;
    this.ringSpan = span;
    return true;
  }

  /** Measured seconds per step (one beat of the sequence). */
  get beatSeconds(): number {
    return clamp(this.secondsPerStep, 0.15, 6);
  }

  /**
   * Progress toward the next ring beat: 0 just after one, 1 when the next is
   * due. Keeps growing past 1 while the next beat is late, as when paused.
   */
  get phase(): number {
    if (Number.isFinite(this.exactPhase)) return this.exactPhase;
    return (this.clock - this.ringAt) / (this.beatSeconds * this.ringSpan);
  }

  private measure(sample: number, weight: number): void {
    this.secondsPerStep = this.measured
      ? this.secondsPerStep + (sample - this.secondsPerStep) * weight
      : sample;
    this.measured = true;
  }
}

/**
 * One tip's smoothed motion plus the state its velocity and continuous
 * triggers need. Velocities are in stage units per second.
 */
export class PulseTipMotion {
  vx = 0;
  vy = 0;
  vz = 0;
  /** 0-1 travel per beat against PULSE_FULL_ENERGY_TRAVEL. */
  energy = 0;
  /** Energy at the most recent accent. */
  peak = 0;
  private previous = 0;
  private rising = false;
  private trough = 0;
  private lastAccent = Number.NEGATIVE_INFINITY;
  private aboveSince = Number.NaN;
  private spawnDebt = 0;

  feed(vx: number, vy: number, vz: number, dt: number, beatSeconds: number): void {
    if (dt <= 0) return;
    const a = 1 - Math.exp(-dt / MOTION_SMOOTHING);
    this.vx += (vx - this.vx) * a;
    this.vy += (vy - this.vy) * a;
    this.vz += (vz - this.vz) * a;
    this.previous = this.energy;
    const speed = Math.hypot(this.vx, this.vy, this.vz);
    this.energy = clamp((speed * beatSeconds) / PULSE_FULL_ENERGY_TRAVEL, 0, 1);
  }

  /**
   * True once per swing: at the fastest point of a swing whose speed clears
   * the threshold, and once per beat while a steady spin holds above it.
   */
  accent(threshold: number, clock: number, beatSeconds: number): boolean {
    const e = this.energy;
    const prev = this.previous;
    let hit = false;
    if (e > prev + 1e-5) {
      this.rising = true;
    } else if (this.rising && e < prev - 1e-5) {
      this.rising = false;
      if (
        prev >= threshold &&
        prev - this.trough >= SWING_PROMINENCE &&
        clock - this.lastAccent >= Math.max(0.1, 0.3 * beatSeconds)
      ) {
        hit = true;
        this.peak = prev;
      }
      this.trough = prev;
    }
    if (!this.rising) this.trough = Math.min(this.trough, e);

    if (e >= threshold) {
      if (!Number.isFinite(this.aboveSince)) this.aboveSince = clock;
      const quiet = clock - Math.max(this.aboveSince, this.lastAccent);
      if (!hit && quiet >= 0.75 * beatSeconds) {
        hit = true;
        this.peak = e;
      }
    } else {
      this.aboveSince = Number.NaN;
    }
    if (hit) this.lastAccent = clock;
    return hit;
  }

  /** Rings owed this frame by the continuous trigger: 1-4 per beat. */
  continuous(dt: number, beatSeconds: number): number {
    this.spawnDebt += (dt * (1 + 3 * this.energy)) / beatSeconds;
    const owed = Math.floor(this.spawnDebt);
    this.spawnDebt -= owed;
    return Math.min(owed, 3);
  }
}

/** Velocity threshold control (0-1) to the energy an accent must reach. */
export function pulseAccentThreshold(velocityThreshold: number): number {
  return 0.2 + 0.65 * clamp(velocityThreshold, 0, 1);
}

/**
 * Ring lifetime in seconds: the lifetime control counts beats. Quieter rings
 * (amplitude below 1: overtones and the continuous stream) die sooner, so a
 * stream does not pile up into a tangle.
 */
export function pulseRingLife(
  lifetimeBeats: number,
  beatSeconds: number,
  amplitude = 1
): number {
  return clamp(lifetimeBeats * beatSeconds * (0.55 + 0.45 * amplitude), 0.2, 6);
}

/** Delay between a ring and each overtone that follows it, seconds. */
export function pulseOvertoneGap(beatSeconds: number): number {
  return clamp(0.13 * beatSeconds, 0.06, 0.45);
}

/**
 * Build-up before a beat, from PulseBeatClock.phase. `shape` (0-1) drives
 * the geometry and only rises; `strength` (0-1) also fades out once the beat
 * is overdue, so a paused animation does not hold a charge forever.
 */
export function pulseCharge(phase: number): { shape: number; strength: number } {
  const shape = smoothstep(0.45, 1, phase);
  const strength = shape * (1 - smoothstep(1.06, 1.3, phase));
  return { shape, strength };
}
