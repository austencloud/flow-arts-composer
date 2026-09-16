/**
 * Loop Explorer — Curated Seed Pool (fallback)
 *
 * `curated-seeds.json` is verification-harness output, not persisted app
 * data. Its compact wire shape predates canonical `SequenceData`: steps carry
 * `leftMotion` / `rightMotion`, positions are strings, and view-layer defaults
 * are omitted. Keep that distinction explicit at this boundary. Casting the
 * JSON straight to `SequenceData` lets those strings reach the animation
 * engine as if they were `StartPlacementData` objects.
 *
 * Seeds hydrate on demand and cache by pool position. Editorial routes import
 * the dedicated teaser fixture instead, so this complete fallback corpus is
 * only parsed when the Loop Explorer itself needs it.
 *
 * The corpus is FETCHED, not imported. At 1.3 MB it was the third-largest JSON
 * literal in the bundle, and it is a LAST-RESORT fallback — reached only after
 * live generation has exhausted its retries — so the common path paid for a
 * corpus it never touched. Accessors are async for that reason; both call sites
 * were already inside async functions.
 */

import { jsonCache } from "$lib/shared/pictograph/shared/services/simple-json-cache";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";
import {
  hydrateCuratedSequence,
  type CuratedSequenceWire,
} from "./curated-seed-hydrator";
import type { LoopSlice } from "./legality";

type CuratedSeedsWire = Record<
  string,
  Partial<Record<LoopSlice, readonly CuratedSequenceWire[]>>
>;

const CURATED_SEEDS_URL = "/data/loop-explorer/curated-seeds.json";

const cache = new Map<string, SequenceData | null>();

/** `jsonCache` dedups in-flight requests, so concurrent callers share one load. */
function loadRaw(): Promise<CuratedSeedsWire> {
  return jsonCache.get<CuratedSeedsWire>(CURATED_SEEDS_URL);
}

async function hydrateAt(
  loopType: LOOPType,
  slice: LoopSlice,
  index: number
): Promise<SequenceData | null> {
  const key = `${loopType}:${slice}:${index}`;
  if (cache.has(key)) return cache.get(key) ?? null;

  const raw = await loadRaw();
  const wire = raw[loopType]?.[slice]?.[index];
  if (!wire) {
    cache.set(key, null);
    return null;
  }

  try {
    const sequence = hydrateCuratedSequence(wire, loopType, slice, index);
    cache.set(key, sequence);
    return sequence;
  } catch (error) {
    console.error(`[curated-seeds] rejected ${key}`, error);
    cache.set(key, null);
    return null;
  }
}

/** Deterministic accessor for SSR/editorial surfaces. */
export function getCuratedSeed(
  loopType: LOOPType,
  slice: LoopSlice,
  index = 0
): Promise<SequenceData | null> {
  return hydrateAt(loopType, slice, index);
}

/**
 * Picks a verified fallback for the explorer. If one entry is malformed,
 * continue through the pool instead of turning a single bad fixture into a
 * page-level failure.
 */
export async function findCuratedSeed(
  loopType: LOOPType,
  slice: LoopSlice
): Promise<SequenceData | null> {
  const raw = await loadRaw();
  const pool = raw[loopType]?.[slice];
  if (!pool?.length) return null;

  const startIndex = Math.floor(Math.random() * pool.length);
  for (let offset = 0; offset < pool.length; offset += 1) {
    const sequence = await hydrateAt(
      loopType,
      slice,
      (startIndex + offset) % pool.length
    );
    if (sequence) return sequence;
  }

  return null;
}
