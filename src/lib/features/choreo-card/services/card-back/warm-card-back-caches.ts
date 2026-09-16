/**
 * warm-card-back-caches
 *
 * Pre-warm the card-back theme-constant rasterizer caches off the visible-render
 * critical path. `buildBackJob`'s first call mounts + screenshots the constant
 * Svelte components (brand, url, difficulty badge, loop icons) and loads fonts —
 * ~340 ms on the main thread. Cached per theme/level/icon in
 * card-back-bitmaps-constant.ts, so cards 2..N are ~3 ms. Running one throwaway
 * buildBackJob during the pre-warm window (deck-open → review) relocates that
 * freeze off the first visible card render, mirroring the front pool seed.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { buildBackJob as realBuildBackJob } from "./card-back-job-builder";
import type { BackBitmapKind } from "./back-job";

// Standard scale-2 back render dims (matches PrintCardRenderer.renderBack). The
// constant caches key on CARD_RENDER_WIDTH (1644 const) + theme, so these warm
// the correct entries regardless of the user's selected card size.
const WARM_WIDTH = 1644;
const WARM_HEIGHT = 2244;
const WARM_BLEED = 72;

// Bitmap kinds freshly rasterized on every buildBackJob call (NOT held by the
// theme-constant caches), so the throwaway warm's copies are safe to close.
// The cache-shared kinds — brand, url-ornament, difficulty-badge — are EXCLUDED:
// their ImageBitmaps are the same objects the constant caches hold, so closing
// them would corrupt the cache this warm just populated.
const PER_CARD_KINDS: ReadonlySet<BackBitmapKind> = new Set<BackBitmapKind>([
  "turn-glyph",
  "reversal-glyph",
  "step-count",
  "start-placement-pictograph",
  "loop-icon",
  "loop-label",
]);

/**
 * Awaitable core (for tests). Runs one buildBackJob to warm the constant caches,
 * then frees the throwaway per-card bitmaps. Never throws — a warm failure just
 * means the first card pays the ~340 ms as it does today.
 */
export async function warmCardBackCachesAsync(
  sequence: SequenceData,
  theme: string,
  buildBackJob: typeof realBuildBackJob = realBuildBackJob,
): Promise<void> {
  try {
    const job = await buildBackJob(sequence, {
      width: WARM_WIDTH,
      height: WARM_HEIGHT,
      bleedPx: WARM_BLEED,
      theme,
    });
    // Free the throwaway per-card bitmaps; leave the constant-cache bitmaps live.
    job.mandala?.bitmap.close?.();
    for (const placed of job.bitmaps) {
      if (PER_CARD_KINDS.has(placed.kind)) placed.bitmap.close?.();
    }
  } catch (err) {
    console.warn("[warmCardBackCaches] back-cache warm failed (first card pays the warm):", err);
  }
}

/**
 * Fire-and-forget pre-warm of the card-back constant caches. Call at the seam
 * where a deck's sequences resolve, beside prewarmCardPool, so both faces warm
 * during the step→review transition.
 */
export function warmCardBackCaches(sequence: SequenceData, theme: string): void {
  void warmCardBackCachesAsync(sequence, theme);
}
