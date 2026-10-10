//
// AssetBundle: a transferable snapshot of every decoded SVG the worker pool
// needs. Built on the MAIN THREAD after a prepare-pass populates the caches;
// seeded into each worker so it NEVER calls createImageBitmap(svgBlob) (which
// fails on the app's SVGs in worker scope).

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { seedFooterIcon } from "@tka/render-composition";
import { getSvgImageCache, type DrawableImage } from "./svg-image-cache";
import { getSvgAssetLoader } from "./svg-asset-loader";
import type { LoadedAssets } from "./svg-asset-loader";

export interface AssetBundle {
  keys: string[];
  bitmaps: ImageBitmap[];               // index-aligned with keys
  grids: LoadedAssets["grids"];         // four grid drawables (ImageBitmap | null)
  // Footer element icons (TnD element PNGs), pre-decoded so the worker — which
  // has no `new Image()` — can draw them. Seeded into render-composition's
  // path-keyed iconCache via seedFooterIcon.
  icons: { path: string; bitmap: ImageBitmap }[];
}

// Square fallback raster size for a dimensionless SVG (TKA pictograph assets +
// grids are authored on a square viewBox, so a square snapshot is correct).
const ASSET_SNAPSHOT_SIZE = 950;

/** Re-decode any DrawableImage (HTMLImageElement | ImageBitmap) to an ImageBitmap. */
async function toBitmap(img: DrawableImage | null): Promise<ImageBitmap | null> {
  if (!img) return null;
  try {
    return await createImageBitmap(img as ImageBitmapSource);
  } catch {
    // A viewBox-only SVG HTMLImageElement has no intrinsic size, so the bare
    // createImageBitmap above throws InvalidStateError. Retry with explicit
    // resize options (using natural dims when present, else a square canonical
    // size) so the bundle never silently starves the worker pool.
    try {
      const el = img as HTMLImageElement;
      const w = el.naturalWidth || el.width || ASSET_SNAPSHOT_SIZE;
      const h = el.naturalHeight || el.height || ASSET_SNAPSHOT_SIZE;
      return await createImageBitmap(img as ImageBitmapSource, {
        resizeWidth: w,
        resizeHeight: h,
        resizeQuality: "high",
      });
    } catch (e) {
      console.warn("[card-asset-bundle] skipping un-decodable cache entry:", e);
      return null;
    }
  }
}

/**
 * MAIN THREAD. Runs a prepare-pass over the deck to warm the singleton svgCache
 * + svgAssetLoader, then snapshots them as transferable ImageBitmaps.
 *
 * `prepareDeck` is injected (defaults to the real preparer wiring) so the heavy
 * pictograph-preparer import isn't pulled into worker/unit bundles.
 */
/** Fetch + decode a footer icon (PNG) to an ImageBitmap. Returns null on failure. */
async function decodeIcon(path: string): Promise<ImageBitmap | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await createImageBitmap(blob);
  } catch (e) {
    console.warn("[card-asset-bundle] footer icon decode failed:", path, e);
    return null;
  }
}

export async function buildAssetBundle(
  sequences: SequenceData[],
  opts: {
    leftPropType: PropType;
    rightPropType: PropType;
    theme: string;
    iconPaths?: string[];
  },
  prepareDeck: (seqs: SequenceData[], o: typeof opts) => Promise<void>,
): Promise<AssetBundle> {
  await prepareDeck(sequences, opts);

  const cache = getSvgImageCache();
  const loader = getSvgAssetLoader();

  const snapshot = cache.entries();
  const keys: string[] = [];
  const bitmaps: ImageBitmap[] = [];
  for (const [key, drawable] of snapshot) {
    const bmp = await toBitmap(drawable);
    if (bmp) { keys.push(key); bitmaps.push(bmp); }
  }

  const g = loader.snapshotGrids();
  const grids: LoadedAssets["grids"] = {
    diamond: await toBitmap(g.diamond),
    box: await toBitmap(g.box),
    diamondNonRadial: await toBitmap(g.diamondNonRadial),
    boxNonRadial: await toBitmap(g.boxNonRadial),
  };

  // Pre-decode each unique footer icon path so the worker can draw it.
  const icons: { path: string; bitmap: ImageBitmap }[] = [];
  const uniqueIconPaths = [...new Set((opts.iconPaths ?? []).filter(Boolean))];
  for (const path of uniqueIconPaths) {
    const bmp = await decodeIcon(path);
    if (bmp) icons.push({ path, bitmap: bmp });
  }

  return { keys, bitmaps, grids, icons };
}

/** Collect every transferable in a bundle (for postMessage transfer list). */
export function bundleTransferables(bundle: AssetBundle): Transferable[] {
  const t: Transferable[] = [...bundle.bitmaps];
  for (const v of Object.values(bundle.grids)) if (v) t.push(v);
  for (const icon of bundle.icons) t.push(icon.bitmap);
  return t;
}

/** WORKER (or any) THREAD. Populate a cache + loader from a received bundle. */
export function seedCachesFromBundle(
  bundle: AssetBundle,
  cache = getSvgImageCache(),
  loader = getSvgAssetLoader(),
): void {
  for (let i = 0; i < bundle.keys.length; i++) {
    cache.setImage(bundle.keys[i]!, bundle.bitmaps[i]!);
  }
  loader.seedGrids(bundle.grids);
  // Seed footer element icons into render-composition's path-keyed iconCache so
  // the worker's loadFooterIcon hits the cache instead of calling new Image().
  for (const icon of bundle.icons) {
    seedFooterIcon(icon.path, icon.bitmap);
  }
}
