/**
 * Preview Cell Renderer
 *
 * Renders individual pictograph cells with two-layer caching:
 * 1. IndexedDB (PictographBlobCache) - persists across sessions
 * 2. WorkerRenderPool / LayerCompositor - off-thread rendering
 */

import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { resolvePreviewCellRender } from "./preview-cell-render-contract";
import type { BrowseViewMode } from "$lib/shared/browse/domain/browse-view-mode";

/**
 * Options for rendering a preview cell.
 * All visibility and prop settings that affect the rendered output.
 */
export interface PreviewCellRenderOptions {
  primaryPropColors?: { left: string; right: string } | null;
  /** Render size in pixels (e.g., 480 for high-res) - this is the height; width = size * widthMultiplier */
  size: number;

  /** Width multiplier for duration-expanded cells (1 = square, 2 = double-wide). Default: 1 */
  widthMultiplier?: number;

  /** Blue hand prop type override */
  leftPropType?: PropType;

  /** Red hand prop type override (used when catDogModeEnabled) */
  rightPropType?: PropType;

  /** When true, the right hand uses rightPropType; otherwise both use leftPropType. */
  catDogModeEnabled?: boolean;

  /** Buugeng chirality for the blue prop (buugeng-family props only). Mirrors
   *  the prop and collapses the beta separation offset when the two props end
   *  up with opposite handedness, exactly as the live SVG pictograph and the
   *  2D animation canvas do. */
  leftBuugengFlipped?: boolean;

  /** Buugeng chirality for the right prop. See leftBuugengFlipped. */
  rightBuugengFlipped?: boolean;

  /** Whether to render step numbers on the pictograph */
  showStepNumbers?: boolean;

  // Visibility settings (from user preferences)

  /** Show non-radial (corner) grid points */
  showNonRadialPoints?: boolean;

  /** Master grid visibility. When false, base grid + hand/non-radial points
   *  are all hidden. Default: true. */
  showGrid?: boolean;

  /** Hand point visibility mode */
  handPointVisibility?: "all" | "active" | "none";

  /** Show TKA letter glyph */
  showTKA?: boolean;

  /** Show reversal indicators */
  showReversals?: boolean;

  /** Show TnD glyph (bottom-right category badge) */
  showTnD?: boolean;

  /** Show elemental glyph (paired with TnD, same corner) */
  showElemental?: boolean;

  /** Show start/end position letters (alpha/beta/gamma labels) */
  showPositions?: boolean;

  /** When true, renders hand path visualization: HAND props, float arrows for shifts,
   *  no TKA overlay, no reversals. Shows pure spatial trajectory. */
  handPathMode?: boolean;

  /** Browse view mode (props/hands x combined/solo x left/right).
   *  Affects cache keys so the same sequence renders differently per mode. */
  browseViewMode?: BrowseViewMode;

  /** Show blue motion (prop + arrow). When false, renderer skips blue entirely. Default: true. */
  showLeftMotion?: boolean;

  /** Show red motion (prop + arrow). When false, renderer skips red entirely. Default: true. */
  showRightMotion?: boolean;

  /** When true, consult the shared cross-device cloud image store before/after
   *  local render (download-instead-of-rasterize + crowd-source upload). Only
   *  the scan-card path sets this; gallery/compose/crossfade leave it false so
   *  they go straight to local render with no added network latency. */
  probeCloud?: boolean;

  /** Require a cloud/IndexedDB hit and never rasterize on this device. QR scan
   *  cards set this because QR creation verifies every canonical asset first. */
  cloudOnly?: boolean;

  /** When true, after a local render upload the WebP to the shared cloud store
   *  under the canonical hash. ONLY render-at-publish sets this (it renders with
   *  the canonical visibility set). The scan card sets probeCloud but NOT this,
   *  so it never uploads a personal-preference render. */
  uploadCanonical?: boolean;
}
import { pictographPreparer } from "$lib/shared/pictograph/shared/services/pictograph-preparer";
import { pictographBlobCache } from "$lib/shared/render/services/pictograph-blob-cache";
import { getWorkerRenderPool } from "$lib/shared/render/services/worker-render-pool";
import { deriveCacheKey } from "./cell-cache-key-deriver";
import { compositeStepNumberOnBlob } from "./step-number-compositor";
import * as pictographCloudCache from "$lib/shared/render/services/pictograph-cloud-cache";
import { deriveCloudCellHash } from "$lib/shared/render/services/cloud-cell-key";
import { pngBlobToWebp } from "$lib/shared/render/services/png-blob-to-webp";

/**
 * Render a single pictograph and return a blob URL.
 * IMPORTANT: Callers must call URL.revokeObjectURL() on returned URLs when done.
 */
export async function renderCell(
  pictographData: PictographData,
  stepNumber: number | undefined,
  isDark: boolean,
  options: PreviewCellRenderOptions
): Promise<string> {
  // The base pictograph is cached NUMBER-FREE (step number forced off) so blobs
  // are shared across steps and the persistent cache never bloats per-number.
  // The step number is composited on top afterwards (see compositeStepNumberOnBlob)
  // so it lands in the displayed image — dissolving in lockstep with the cell
  // during crossfades — without ever entering the base cache key.
  const baseOptions: PreviewCellRenderOptions = options.showStepNumbers
    ? { ...options, showStepNumbers: false }
    : options;
  const cacheKey = deriveCacheKey(
    pictographData,
    undefined,
    isDark,
    baseOptions
  );

  // Solo / motion-solo views keep their repositioned location label as a live
  // overlay (CellRenderer), so don't bake a number into those.
  const isMotionSoloCell =
    (options.showLeftMotion === true && options.showRightMotion === false) ||
    (options.showRightMotion === true && options.showLeftMotion === false);
  const wantNumber =
    !!options.showStepNumbers &&
    stepNumber != null &&
    stepNumber !== -1 &&
    options.browseViewMode?.granularity !== "solo" &&
    !isMotionSoloCell;

  // Single source of truth for turning a base (number-free) blob into the
  // displayed object URL — composites the step number iff this cell wants one.
  const toDisplayUrl = async (b: Blob): Promise<string> =>
    wantNumber
      ? URL.createObjectURL(
          await compositeStepNumberOnBlob(
            b,
            stepNumber!,
            options.size,
            isDark,
            options.widthMultiplier ?? 1
          )
        )
      : URL.createObjectURL(b);

  // Cloud tier (scan-card / publish only). Derive the canonical, device-
  // independent hash when either flag is active — BEFORE the IndexedDB check,
  // because a locally-cached cell may still owe the cloud store its upload
  // (see backfill below). probeCloud => try to download a pre-rendered image
  // (cold scanner downloads instead of rasterizing).
  let cloudHash: string | null = null;
  if (options.probeCloud || options.uploadCanonical) {
    try {
      cloudHash = await deriveCloudCellHash(
        pictographData,
        isDark,
        baseOptions
      );
    } catch {
      cloudHash = null;
    }
  }

  try {
    const cachedBlob = await pictographBlobCache.get(cacheKey);
    if (cachedBlob) {
      // Upload backfill (warm passes): a canonical cell can sit in IndexedDB
      // while the cloud store lacks it — e.g. its original upload failed
      // silently. A plain IDB-hit return would skip the upload forever, so
      // when uploadCanonical is set, probe the store and upload the cached
      // blob on a miss.
      if (options.uploadCanonical && cloudHash) {
        const hashForUpload = cloudHash;
        try {
          const cloudBlob = await pictographCloudCache.download(hashForUpload, {
            probeUnknown: false,
          });
          if (!cloudBlob) {
            const webp = await pngBlobToWebp(cachedBlob);
            await pictographCloudCache.upload(hashForUpload, webp);
          }
        } catch {
          // Best-effort — never block display on the backfill.
        }
      }
      return toDisplayUrl(cachedBlob);
    }
  } catch {
    // Cache miss or error, proceed to render
  }
  if (options.probeCloud && cloudHash) {
    try {
      const cloudBlob = options.uploadCanonical
        ? await pictographCloudCache.download(cloudHash, {
            probeUnknown: false,
          })
        : await pictographCloudCache.download(cloudHash);
      if (cloudBlob) {
        // Seed IndexedDB under the display key so a re-render is a local hit.
        pictographBlobCache.set(cacheKey, cloudBlob).catch(() => {});
        return toDisplayUrl(cloudBlob);
      }
    } catch {
      // Cloud unavailable — fall through to local render.
    }
  }

  if (options.cloudOnly) {
    throw new Error(
      cloudHash
        ? `Canonical pictograph ${cloudHash} is unavailable`
        : "Canonical pictograph hash is unavailable"
    );
  }

  const { data, prepareOptions, renderOptions, visibility } =
    resolvePreviewCellRender(pictographData, isDark, options);
  const prepared = await pictographPreparer.prepareSingle(data, prepareOptions);

  const pool = getWorkerRenderPool();
  // Render the base number-free (the worker never bakes the number), then
  // composite the number on top below.
  const blob = await pool.render(
    prepared,
    renderOptions,
    visibility,
    undefined
  );

  pictographBlobCache.set(cacheKey, blob).catch(() => {});

  // Crowd-source upload — ONLY when uploadCanonical (render-at-publish), so a
  // scan card's personal-preference render never pollutes the canonical store.
  // Awaited so warm passes report done only after the blob actually landed;
  // the save path already wraps the whole warm in fire-and-forget.
  if (options.uploadCanonical && cloudHash) {
    try {
      const webp = await pngBlobToWebp(blob);
      await pictographCloudCache.upload(cloudHash, webp);
    } catch {
      // Best-effort — display never blocks on a failed upload.
    }
  }

  return toDisplayUrl(blob);
}

/**
 * Delete a specific cell's cached blob from IndexedDB.
 */
export async function deleteCellCache(
  pictographData: PictographData,
  _stepNumber: number | undefined,
  isDark: boolean,
  options: PreviewCellRenderOptions
): Promise<boolean> {
  // Blobs are STORED under the NUMBER-FREE key (see renderCell): the base
  // pictograph is cached with step numbers forced off and the number is
  // composited on top afterwards. Derive the identical number-free key here so
  // the delete actually matches the stored entry. Passing the real stepNumber
  // (or showStepNumbers: true) produced a "none"/"6" cell part that never
  // matched the stored "nonum" key, so "Force re-render" deleted nothing.
  const baseOptions: PreviewCellRenderOptions = options.showStepNumbers
    ? { ...options, showStepNumbers: false }
    : options;
  const cacheKey = deriveCacheKey(
    pictographData,
    undefined,
    isDark,
    baseOptions
  );
  return pictographBlobCache.delete(cacheKey);
}
