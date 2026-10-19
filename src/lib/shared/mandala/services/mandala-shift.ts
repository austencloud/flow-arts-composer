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

/** The curve a change morph runs on: quick to leave, soft to land. */
export function bloomEase(t: number): number {
  return 1 - Math.pow(1 - t, 3.5);
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function wrap(value: number, period: number): number {
  return ((value % period) + period) % period;
}

/** Beats one sequence holds before the next lands. */
export function shiftHoldBeats(shift: MandalaShift, beatsPerBar: number): number {
  return shift.unit === "bars" ? shift.every * beatsPerBar : shift.every;
}

export interface MandalaShiftFrame {
  /** Index of the sequence holding, and the one it is turning into. */
  from: number;
  to: number;
  /** Eased progress of the morph from `from` to `to`; 0 while holding. */
  morphT: number;
  /** Which hold this is, counted from the anchor. */
  hold: number;
}

/**
 * Which sequences show at `beats` and how far the morph between them has
 * run. The morph fills the last `shift.morph` beats of each hold and ends on
 * the boundary, so the new mandala lands on the beat. The list wraps: the
 * last sequence turns back into the first.
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
  const morph = Math.min(shift.morph, holdBeats);
  const phase = Math.max(0, beats - hold * holdBeats);
  const linear = clamp01((phase - (holdBeats - morph)) / morph);
  return { from, to, morphT: bloomEase(linear), hold };
}

/**
 * How far the tips reach at `beats`: 1 (full breath) on the downbeat and at
 * every whole breath after it, 0 (at rest) half a breath later. A shift that
 * lands on a bar lands with the figure open.
 */
export function breathAt(beats: number, breathBeats: number): number {
  const phase = wrap(beats, breathBeats) / breathBeats;
  const triangle = phase < 0.5 ? 1 - phase * 2 : phase * 2 - 1;
  return breatheEase(triangle);
}

/** Degrees the figure has turned at `beats`. */
export function spinAt(beats: number, beatsPerBar: number, spinPerBar: number): number {
  return (beats / beatsPerBar) * spinPerBar;
}

/** Where the flow colours are at `beats`, 0 to 1 around the ramp. */
export function colorPhaseAt(beats: number, breathBeats: number): number {
  const cycle = breathBeats * COLOR_CYCLE_BREATHS;
  return wrap(beats, cycle) / cycle;
}
