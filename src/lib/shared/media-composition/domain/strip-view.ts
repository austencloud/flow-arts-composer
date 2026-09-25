import type { SequenceFrame } from "./sequence-frame";

/**
 * How a slow-section strip square draws a whole take. "Alternate" is what a
 * repeated LOOP actually wants: arrows on the first pass so the performer's
 * moves read as moves, then the traced mandala on the next pass so the shape
 * the moves make reads as a shape - without either view running so long it
 * gets boring.
 */
export type StripMode = "arrows" | "mandala" | "alternate";

/**
 * Which view a frame actually shows. A fixed mode always shows itself. Opening
 * always shows arrows even under "mandala"/"alternate": there is no pass yet
 * to pick a side of, and a traced path has nothing on it before the performer
 * moves.
 */
export function resolveStripView(
  mode: StripMode,
  frame: Pick<SequenceFrame, "phase" | "pass">
): "arrows" | "mandala" {
  if (mode !== "alternate") return mode;
  if (frame.phase === "opening") return "arrows";
  return frame.pass % 2 === 0 ? "arrows" : "mandala";
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * How much of a mandala pass's traced path should read as already walked, as
 * a fraction (0..1) of the path's total drawn length - what a caller feeds
 * `setLineDash` to cut the bright trail at the prop's current position.
 *
 * The path is one continuous curve sampled across every move in the pass, and
 * MandalaPathPreparer samples a high-turn move more densely than a plain one
 * (samples come from the motion, not a fixed count per beat). So a move's
 * share of the drawn path is its own sample count, not an even 1/N slice -
 * `sampleCounts[i]` is move `i + 1`'s share. The prefix is every earlier
 * move's share in full, plus however far the current move has sampled
 * through its own share.
 */
export function mandalaPrefixFraction(
  sampleCounts: readonly number[],
  frame: Pick<SequenceFrame, "phase" | "move" | "moveProgress">
): number {
  const total = sampleCounts.reduce((sum, count) => sum + count, 0);
  if (total <= 0) return 0;
  if (frame.phase === "opening") return 0;
  if (frame.phase === "holding") return 1;

  const index = frame.move - 1;
  if (index < 0 || index >= sampleCounts.length) return 0;

  let before = 0;
  for (let i = 0; i < index; i++) before += sampleCounts[i]!;
  const within = sampleCounts[index]! * clamp01(frame.moveProgress);
  return clamp01((before + within) / total);
}
