/**
 * Arrow adjustment pipeline
 *
 * Reads the app's arrow placement JSON under assets/data/arrow_placement through the art cache and
 * runs the shared render-core lookup, so arrows land where the app puts them.
 */

import { MISSING, type ArtCache } from "./art-source.js";
import {
  calculateArrowAdjustment as calculateSharedArrowAdjustment,
  resolveArrowRotation as resolveSharedArrowRotation,
  type ArrowAdjustmentMotion,
  type ArrowAdjustmentPictograph,
} from "@tka/render-core";

export type {
  ArrowAdjustmentMotion,
  ArrowAdjustmentPictograph,
} from "@tka/render-core";

const parsed = new WeakMap<ArtCache, Map<string, unknown>>();

/** The placement table at this path under assets/data/arrow_placement, parsed once per cache. */
function placementLoader(art: ArtCache): (relativePath: string) => unknown {
  let tables = parsed.get(art);
  if (!tables) {
    tables = new Map();
    parsed.set(art, tables);
  }
  const cache = tables;
  return (relativePath) => {
    if (cache.has(relativePath)) return cache.get(relativePath);
    const text = art.get(`data/arrow_placement/${relativePath}`);
    // Not fetched yet: answer null for this pass and parse it on a later one.
    if (text === MISSING) return null;
    let data: unknown = null;
    if (text !== null) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }
    cache.set(relativePath, data);
    return data;
  };
}

/** The arrow's canonical-frame nudge, as the app computes it. */
export function calculateArrowAdjustment(
  art: ArtCache,
  pictograph: ArrowAdjustmentPictograph,
  motion: ArrowAdjustmentMotion,
  arrowLocation: string,
  options: { solo?: boolean } = {}
): [number, number] {
  return calculateSharedArrowAdjustment(
    pictograph,
    motion,
    arrowLocation,
    placementLoader(art),
    options
  );
}

/** The arrow's canonical-frame glyph angle, rotation overrides included. */
export function resolveArrowRotation(
  art: ArtCache,
  pictograph: ArrowAdjustmentPictograph,
  motion: ArrowAdjustmentMotion,
  arrowLocation: string,
  options: { solo?: boolean } = {}
): number {
  return resolveSharedArrowRotation(
    pictograph,
    motion,
    arrowLocation,
    placementLoader(art),
    options
  );
}
