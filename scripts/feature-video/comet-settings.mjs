/**
 * Builds a clip's `cometTrails` setting from command-line numbers. Times on
 * the command line are seconds into the clip's footage from its first frame
 * (the clip clock); the setting keeps them as footage seconds, so a trim of
 * the clip's start leaves each change on the same moment of the take.
 *
 * Defaults match `src/lib/shared/media-composition/domain/comet-trails.ts`.
 */

const DEFAULT_LOOK = { length: 0.3, gain: 0.7 };
const DEFAULT_TAPER = 1.6;

const round = (value) => Math.round(value * 1e6) / 1e6;

/** "a,b,..." as numbers, or null for "none"/"off". */
function numbers(text, count, flag) {
  if (text === undefined) return undefined;
  if (/^(none|off)$/i.test(text.trim())) return null;
  const parts = text.split(",").map((part) => Number(part.trim()));
  if (parts.length !== count || parts.some((part) => !Number.isFinite(part)))
    throw new Error(`--${flag} takes ${count} numbers separated by commas.`);
  return parts;
}

/**
 * `current` is the clip's setting or null. `changes` may hold `map`,
 * `clipStart` (the clip's sourceIn) and the command-line values.
 */
export function cometSettings(current, changes) {
  const next = current
    ? structuredClone(current)
    : { map: changes.map, taper: DEFAULT_TAPER, first: { ...DEFAULT_LOOK } };
  if (changes.map) next.map = changes.map;
  const start = changes.clipStart ?? 0;
  const toFootage = (seconds) => round(start + seconds);
  if (changes.length !== undefined) next.first.length = changes.length;
  if (changes.gain !== undefined) next.first.gain = changes.gain;
  if (changes.taper !== undefined) next.taper = changes.taper;
  const second = numbers(changes.second, 4, "second");
  if (second === null) delete next.second;
  else if (second)
    next.second = {
      length: second[0],
      gain: second[1],
      at: toFootage(second[2]),
      seconds: second[3],
    };
  for (const [key, flag] of [
    ["growIn", "grow"],
    ["pullBack", "pull-back"],
  ]) {
    const change = numbers(changes[key === "growIn" ? "grow" : "pullBack"], 2, flag);
    if (change === null) delete next[key];
    else if (change) next[key] = { at: toFootage(change[0]), seconds: change[1] };
  }
  return next;
}
