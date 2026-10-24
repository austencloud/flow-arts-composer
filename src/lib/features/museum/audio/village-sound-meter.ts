/**
 * A level meter for the village's sound (used by /test/village-sound).
 *
 * Every window (250 ms by default) it reads the newest samples off an
 * AnalyserNode and keeps one reading: RMS and peak, linear and in dBFS. The
 * last ten seconds stay on hand so a headless check can read the bed level
 * and how far a cue rises above it without anyone listening.
 */

export interface VillageSoundReading {
  /** Seconds on the audio clock at the end of the window. */
  time: number;
  rms: number;
  peak: number;
  rmsDb: number;
  peakDb: number;
  /** Listener distance from the fire when the window closed. */
  distance: number;
  /** The cue sounding in this window, from its start to the end of its release. */
  cue: string | null;
}

export const METER_WINDOW_SECONDS = 0.25;
export const METER_HISTORY_SECONDS = 10;

/** Silence reads as -120 dBFS rather than -Infinity, so JSON keeps it. */
export function toDbfs(linear: number): number {
  return linear > 1e-6 ? 20 * Math.log10(linear) : -120;
}

export function measureWindow(samples: ArrayLike<number>): {
  rms: number;
  peak: number;
} {
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i] ?? 0;
    sum += s * s;
    peak = Math.max(peak, Math.abs(s));
  }
  return { rms: samples.length ? Math.sqrt(sum / samples.length) : 0, peak };
}

/** Bed RMS over the readings that carry no cue, and the loudest peak. */
export function summarize(readings: readonly VillageSoundReading[]): {
  bedRms: number;
  bedRmsDb: number;
  peak: number;
  peakDb: number;
} {
  const quiet = readings.filter((r) => r.cue === null);
  const bedRms = quiet.length
    ? Math.sqrt(quiet.reduce((sum, r) => sum + r.rms * r.rms, 0) / quiet.length)
    : 0;
  const peak = readings.reduce((max, r) => Math.max(max, r.peak), 0);
  return { bedRms, bedRmsDb: toDbfs(bedRms), peak, peakDb: toDbfs(peak) };
}

export class VillageSoundMeter {
  readonly readings: VillageSoundReading[] = [];
  private readonly buffer: Float32Array<ArrayBuffer>;
  private readonly windowLength: number;
  private cue: { label: string; until: number } | null = null;

  constructor(
    private readonly analyser: AnalyserNode,
    windowSeconds = METER_WINDOW_SECONDS
  ) {
    const sampleRate = analyser.context.sampleRate;
    this.windowLength = Math.round(sampleRate * windowSeconds);
    // The analyser must hold a whole window; 32768 covers 250 ms at 96 kHz.
    analyser.fftSize = 32768;
    this.buffer = new Float32Array(analyser.fftSize);
  }

  /** Tag the readings of the next `seconds` with a cue, so the bed leaves them out. */
  markCue(label: string, seconds: number): void {
    this.cue = { label, until: this.analyser.context.currentTime + seconds };
  }

  /** Take one reading; call once per window. */
  read(distance: number): VillageSoundReading {
    this.analyser.getFloatTimeDomainData(this.buffer);
    const { rms, peak } = measureWindow(
      this.buffer.subarray(this.buffer.length - this.windowLength)
    );
    const reading: VillageSoundReading = {
      time: this.analyser.context.currentTime,
      rms,
      peak,
      rmsDb: toDbfs(rms),
      peakDb: toDbfs(peak),
      distance,
      cue: this.cue?.label ?? null,
    };
    // One window past the release stays tagged, so the cue's tail stays out of the bed.
    if (this.cue && reading.time > this.cue.until + METER_WINDOW_SECONDS)
      this.cue = null;
    this.readings.push(reading);
    const keep = Math.round(METER_HISTORY_SECONDS / METER_WINDOW_SECONDS);
    if (this.readings.length > keep)
      this.readings.splice(0, this.readings.length - keep);
    return reading;
  }
}
