/**
 * The scale each guide screen landed at, per window size, kept in the
 * browser so a reload or a later visit seeds GuideFitBox's search and lands
 * in one probe (2026-11-10: a cold load of a run page spent ~0.9 s in ten
 * probes with its body blank).
 *
 * Keys are "<page>|<screen>|<area>"; the newest entries are kept. Storage
 * that is missing, refused or holds something else reads as empty.
 */

const SEEDS_KEY = "guide-fit-seeds";
export const FIT_SEEDS_KEPT = 80;

export function fitSeedKey(
  page: string,
  screen: unknown,
  width: number,
  height: number
): string {
  return `${page}|${String(screen ?? "")}|${width}x${height}`;
}

function readSeeds(storage: Storage): Record<string, number> {
  const raw = storage.getItem(SEEDS_KEY);
  const seeds: unknown = raw ? JSON.parse(raw) : null;
  return seeds && typeof seeds === "object" && !Array.isArray(seeds)
    ? (seeds as Record<string, number>)
    : {};
}

function local(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function keptFitSeed(
  key: string,
  storage: Storage | null = local()
): number | null {
  if (!storage) return null;
  try {
    const seed = readSeeds(storage)[key];
    return typeof seed === "number" && Number.isFinite(seed) && seed > 0
      ? seed
      : null;
  } catch {
    return null;
  }
}

export function keepFitSeed(
  key: string,
  scale: number,
  storage: Storage | null = local()
): void {
  if (!storage) return;
  try {
    let seeds: Record<string, number>;
    try {
      seeds = readSeeds(storage);
    } catch {
      seeds = {};
    }
    if (seeds[key] === scale) return;
    // Newest last; the oldest go first once the list is full.
    delete seeds[key];
    seeds[key] = scale;
    const keys = Object.keys(seeds);
    for (const old of keys.slice(0, Math.max(0, keys.length - FIT_SEEDS_KEPT)))
      delete seeds[old];
    storage.setItem(SEEDS_KEY, JSON.stringify(seeds));
  } catch {
    // Storage refused (private window, quota): the next visit searches.
  }
}
