/**
 * How far the Shape Engine's loading drawing has got. Building the matrix gives
 * no progress numbers, so the drawing creeps: fast at first, slowing as it nears
 * CREEP_CEILING, which it never reaches on its own. Only the finished load
 * lets it close, over FINISH_MS, so the drawing never completes early and then
 * sits still waiting.
 */
export const CREEP_CEILING = 0.9;
/** The wait the creep is paced for; past it the drawing keeps inching on. */
export const CREEP_PACE_MS = 5000;
export const FINISH_MS = 650;

/* x / (x + 1) still climbs a minute in, where an exponential would have
   flattened against the ceiling and looked stopped. About a quarter at 1 s,
   three fifths at 5 s, seven tenths at 10 s. */
function creep(elapsedMs: number): number {
  const x = Math.max(0, elapsedMs) / (CREEP_PACE_MS / 2);
  return (CREEP_CEILING * x) / (x + 1);
}

/**
 * @param elapsedMs time since the drawing started
 * @param readyAtMs time since the drawing started at which the load finished,
 *   or null while it is still loading
 */
export function loaderProgress(elapsedMs: number, readyAtMs: number | null): number {
  if (readyAtMs === null || elapsedMs < readyAtMs) return creep(elapsedMs);
  const from = creep(readyAtMs);
  const t = Math.min(1, (elapsedMs - readyAtMs) / FINISH_MS);
  const eased = 1 - (1 - t) ** 3;
  return from + (1 - from) * eased;
}

/** True once the closing stroke has played out. */
export function loaderFinished(elapsedMs: number, readyAtMs: number | null): boolean {
  return readyAtMs !== null && elapsedMs - readyAtMs >= FINISH_MS;
}
