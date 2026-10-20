import type { MandalaShift } from "../domain/mandala-shift-types";

/**
 * The beat math of a shifting mandala. Everything here is a pure function of
 * `beats`, fractional beats counted from an anchor, so a preview frame and an
 * exported frame at the same beat draw the same picture.
 */

/** Flow colours run one full cycle every this many breaths (the viewer's rate). */
export const COLOR_CYCLE_BREATHS = 3;

/** The breathing curve the viewer and the export worker share. */
export function breatheEase(t: number): number {
  return Math.pow(Math.sin((t * Math.PI) / 2), 1.6);
}

/** The curve a landing morph runs on: quick to leave, soft to land. */
export function bloomEase(t: number): number {
  return 1 - Math.pow(1 - t, 3.5);
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function wrap(value: number, period: number): number {
  return ((value % period) + period) % period;
}

/** Beats from one shift to the next. */
export function shiftHoldBeats(shift: MandalaShift, beatsPerBar: number): number {
  return shift.unit === "bars" ? shift.every * beatsPerBar : shift.every;
}

/** Whether the morph runs the whole way between shifts (the default) or lands. */
export function shiftPace(shift: MandalaShift): "steady" | "land" {
  return shift.pace ?? "steady";
}

export interface MandalaShiftFrame {
  /** Index of the sequence holding, and the one it is turning into. */
  from: number;
  to: number;
  /** Progress of the morph from `from` to `to`, 0 to 1; 0 while a landing shift holds. */
  morphT: number;
  /** Which hold this is, counted from the anchor. */
  hold: number;
}

/**
 * Which sequences show at `beats` and how far the morph between them has
 * run. A steady shift morphs at one rate across the whole interval, so it
 * is always moving and each sequence is whole exactly on its beat. A
 * landing shift holds, then morphs over the last `shift.morph` beats and
 * ends on the boundary. The list wraps: the last sequence turns back into
 * the first.
 */
export function shiftFrameAt(
  shift: MandalaShift,
  count: number,
  beats: number,
  beatsPerBar: number
): MandalaShiftFrame {
  if (count <= 0) return { from: 0, to: 0, morphT: 0, hold: 0 };
  const holdBeats = shiftHoldBeats(shift, beatsPerBar);
  const hold = Math.max(0, Math.floor(beats / holdBeats));
  const from = hold % count;
  const to = (hold + 1) % count;
  if (count === 1 || from === to) return { from, to: from, morphT: 0, hold };
  const phase = Math.max(0, beats - hold * holdBeats);
  if (shiftPace(shift) === "steady") {
    return { from, to, morphT: clamp01(phase / holdBeats), hold };
  }
  const morph = Math.min(shift.morph, holdBeats);
  const linear = clamp01((phase - (holdBeats - morph)) / morph);
  return { from, to, morphT: bloomEase(linear), hold };
}

/**
 * How far the tips reach at `beats`: 1 (full breath) on the downbeat and at
 * every whole breath after it, 0 (at rest) half a breath later. With no
 * breath (0 beats) the tips stay at full reach, so the figure holds its
 * shape and only the shift moves it.
 */
export function breathAt(beats: number, breathBeats: number): number {
  if (breathBeats <= 0) return 1;
  const phase = wrap(beats, breathBeats) / breathBeats;
  const triangle = phase < 0.5 ? 1 - phase * 2 : phase * 2 - 1;
  return breatheEase(triangle);
}

/** Degrees the figure has turned at `beats`. */
export function spinAt(beats: number, beatsPerBar: number, spinPerBar: number): number {
  return (beats / beatsPerBar) * spinPerBar;
}

/** The breath length the flow colours pace themselves by when there is no breath. */
const STILL_COLOR_BREATH_BEATS = 4;

/** Where the flow colours are at `beats`, 0 to 1 around the ramp. */
export function colorPhaseAt(beats: number, breathBeats: number): number {
  const cycle = (breathBeats > 0 ? breathBeats : STILL_COLOR_BREATH_BEATS) * COLOR_CYCLE_BREATHS;
  return wrap(beats, cycle) / cycle;
}
