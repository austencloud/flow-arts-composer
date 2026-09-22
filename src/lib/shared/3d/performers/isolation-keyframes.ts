import { MathUtils } from "three";
import { wrapStaffIsolationPhase } from "./staff-isolation";

/** The same saved pose is reached when scrubbing backward, forward, or across South. */
export function sampleIsolationChannel<T extends { phase: number }>(
  phase: number,
  keys: readonly T[],
  value: (key: T) => number,
): number {
  const sorted = [...keys].sort((a, b) => a.phase - b.phase);
  if (!sorted.length) return 0;
  if (sorted.length === 1) return value(sorted[0]!);
  const t = wrapStaffIsolationPhase(phase);
  const nextIndex = sorted.findIndex((key) => key.phase > t);
  const after = sorted[nextIndex < 0 ? 0 : nextIndex]!;
  const before = sorted[nextIndex <= 0 ? sorted.length - 1 : nextIndex - 1]!;
  const start = before.phase > t ? before.phase - 4 : before.phase;
  const end = after.phase <= t ? after.phase + 4 : after.phase;
  return MathUtils.lerp(value(before), value(after), MathUtils.smoothstep(t, start, end));
}
