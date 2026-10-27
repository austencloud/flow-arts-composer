/**
 * What the Overture may spend on this device: its tier, its frame rate and
 * backing size, and when it fetches the pool and the font.
 *
 * The boot must be ready no later than without the Overture, on a slow phone
 * too. So a weak device (few cores, little memory, or slow first frames)
 * draws the low tier: 30 fps, a backing of at most about 480 px across the
 * mandala, no glow pass and half the sparks. The worker's slow-frame
 * degradation still runs on top. Both fetches go out at low priority, the
 * pool only when there is no snapshot and the font only when the first
 * letter is about to light, so neither competes with the app's own requests
 * at the start of the boot.
 *
 * Pure: the worker passes in what it reads from navigator and its clock.
 *
 * Design: docs/superpowers/specs/2026-10-26-boot-overture-design.md
 */

export type OvertureTier = "full" | "low";
/** The lab can force a tier; the boot always asks for auto. */
export type OvertureTierSetting = "auto" | OvertureTier;

/** Cores or GB of memory at or under this put a device on the low tier. */
const LOW_CORES = 4;
const LOW_MEMORY_GB = 4;
/** First frames whose drawing averages over this put a device on the low tier. */
export const SLOW_FRAME_MS = 12;
/** How many first frames are averaged. */
export const TIER_FRAMES = 5;
/** The low tier's frame interval, less a little slack so a 60 Hz display draws every other frame. */
export const LOW_FRAME_MS = 1000 / 30 - 4;
/** The low tier's backing, at most this many px across the mandala's square. */
export const LOW_BACKING_PX = 480;
/** The full tier's backing never passes this pixel ratio. */
const FULL_MAX_DPR = 2;

/** The tier from the setting and what the device says about itself. */
export function deviceTier(
  setting: OvertureTierSetting | undefined,
  device: { cores?: number; memoryGb?: number }
): OvertureTier {
  if (setting === "full" || setting === "low") return setting;
  const { cores, memoryGb } = device;
  if (typeof cores === "number" && cores > 0 && cores <= LOW_CORES)
    return "low";
  if (typeof memoryGb === "number" && memoryGb > 0 && memoryGb <= LOW_MEMORY_GB)
    return "low";
  return "full";
}

/**
 * Watches the first frames' drawing time on auto and says when they were too
 * slow: `frame(ms)` returns true once, when the tier should drop to low.
 */
export function createTierWatch(setting: OvertureTierSetting | undefined): {
  frame(ms: number): boolean;
} {
  let count = 0;
  let total = 0;
  let decided = setting === "full" || setting === "low";
  return {
    frame(ms) {
      if (decided) return false;
      count++;
      total += ms;
      if (count < TIER_FRAMES) return false;
      decided = true;
      return total / count > SLOW_FRAME_MS;
    },
  };
}

/** The pixel ratio to draw at: up to 2 on full; on low 1, less when the mandala's square would pass LOW_BACKING_PX. */
export function backingRatio(
  tier: OvertureTier,
  dpr: number,
  mandalaPx: number
): number {
  const ratio = dpr > 0 ? dpr : 1;
  if (tier === "full") return Math.min(FULL_MAX_DPR, ratio);
  return Math.min(1, ratio, LOW_BACKING_PX / Math.max(1, mandalaPx));
}

/** Whether a frame at `now` should draw, given the last drawn frame. */
export function frameDue(
  tier: OvertureTier,
  now: number,
  lastDrawn: number | null
): boolean {
  return tier === "full" || lastDrawn === null || now - lastDrawn >= LOW_FRAME_MS;
}

/** The low tier's frame state: half the sparks, no glow pass. */
export function lowTierState<T extends { maxSparks: number; glow: boolean }>(
  state: T
): T {
  state.maxSparks = Math.floor(state.maxSparks / 2);
  state.glow = false;
  return state;
}

/**
 * Whether to fetch the font now: once the trace is halfway through the first
 * beat (its letter lights when that beat finishes), or at once when the
 * letters are drawn still.
 */
export function fontDue(traced: number, beats: number, still: boolean): boolean {
  return still || traced >= 0.5 / Math.max(1, beats);
}

/** Low-priority fetch options; `priority` is ignored where unsupported. */
export function lowPriority(signal?: AbortSignal): RequestInit {
  const init = { priority: "low" } as RequestInit & { priority: "low" };
  if (signal) init.signal = signal;
  return init;
}

/**
 * The scene to draw: the snapshot when it parses and passes `valid`, else
 * the pool's rotation for today, fetched at low priority. The pool is never
 * fetched when the snapshot is good.
 */
export async function chooseScene<S>(options: {
  snapshot: string | null;
  pool: string;
  rotation: number;
  valid: (value: unknown) => value is S;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
}): Promise<S | null> {
  if (options.snapshot) {
    try {
      const parsed: unknown = JSON.parse(options.snapshot);
      if (options.valid(parsed)) return parsed;
    } catch {
      /* Malformed: treated as absent; the app overwrites it after ready. */
    }
  }
  try {
    const response = await options.fetch(options.pool, lowPriority());
    if (!response.ok) return null;
    const pool = (await response.json()) as { v?: number; scenes?: unknown[] };
    const scenes = (
      pool.v === 1 && Array.isArray(pool.scenes) ? pool.scenes : []
    ).filter(options.valid);
    if (scenes.length === 0) return null;
    return scenes[Math.max(0, options.rotation) % scenes.length]!;
  } catch {
    return null;
  }
}
