/**
 * Canonical cloud-cell key.
 *
 * The per-device IndexedDB cell key (see cell-cache-key-deriver) bakes in the
 * display SIZE, which varies by viewport. For a globally-shared cloud image we
 * need a key that is identical across devices: same pictograph + prop + mode =>
 * same key, regardless of screen size. We achieve that by deriving the existing
 * cell key with size pinned to CANONICAL_CELL_SIZE and step numbers off, then
 * hashing it to a short, filename-safe digest for the storage path.
 */

import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { PreviewCellRenderOptions } from "$lib/shared/sequence-viewer/services/preview-cell-renderer";
import { deriveCacheKey } from "$lib/shared/sequence-viewer/services/cell-cache-key-deriver";

/** Canonical render size for cloud-stored cells. High enough for any card cell. */
export const CANONICAL_CELL_SIZE = 480;

/**
 * Fixed visibility config that defines the canonical scan-card look. Both the
 * cloud hash (here) and render-at-publish use it, so every device computes the
 * SAME hash for a given card regardless of the viewer's personal visibility
 * prefs. Prop types + catDogMode are intentionally NOT here — they come from the
 * sequence's intendedProp (already canonical across scanners).
 */
export const CANONICAL_CARD_VISIBILITY = {
  showTKA: true,
  showGrid: true,
  showNonRadialPoints: true,
  handPointVisibility: "all" as const,
  showReversals: true,
  showTnD: false,
  showElemental: false,
  showPropTnD: false,
  showPlacements: false,
  showHandColorKey: true,
  showLeftMotion: true,
  showRightMotion: true,
  handPathMode: false,
  browseViewMode: undefined,
} satisfies Partial<PreviewCellRenderOptions>;

/** The size-normalized, visibility-canonicalized, number-free cell key string. */
export function canonicalCellKeyString(
  pictographData: PictographData,
  isDark: boolean,
  options: PreviewCellRenderOptions
): string {
  return deriveCacheKey(pictographData, undefined, isDark, {
    ...options,
    ...CANONICAL_CARD_VISIBILITY,
    // Solo cards have their own canonical visibility. Preserve only the
    // participating-hand decision while pinning every other display option.
    showLeftMotion: options.showLeftMotion ?? true,
    showRightMotion: options.showRightMotion ?? true,
    size: CANONICAL_CELL_SIZE,
    showStepNumbers: false,
  });
}

/**
 * SHA-256 hex digest of the canonical key — a short, filename-safe, collision-
 * free, cross-device-stable storage hash. Async because it uses SubtleCrypto.
 */
export async function deriveCloudCellHash(
  pictographData: PictographData,
  isDark: boolean,
  options: PreviewCellRenderOptions
): Promise<string> {
  const keyString = canonicalCellKeyString(pictographData, isDark, options);
  const bytes = new TextEncoder().encode(keyString);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
