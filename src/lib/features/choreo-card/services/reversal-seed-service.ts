/**
 * Client-side reversal seed service (Firestore writes).
 *
 * Seeds one reversal pattern live, in the browser: for each base catalog it
 * loads the catalog's sequences, transforms each via `transformSequence` (flip
 * motionType/rotationDirection on reversed hands, re-derive letters, recompute
 * the orientation chain — now in `reversal-transform-apply.ts`), then writes a
 * materialized variant catalog (+ its sequences) to Firestore.
 *
 * The pure transform half (`transformSequence`, `applyReversalMatrix`,
 * `solveHandFlips`) lives in `reversal-transform-apply.ts` (no Firebase) and is
 * re-exported here so existing consumers keep importing it from this module.
 *
 * Mirrors the proven Node reference `scripts/seed-reversal-decks.cjs`.
 */

import type { Firestore } from "firebase/firestore";
import {
  getSystemCatalogPath,
  getSystemCatalogSequencePath,
} from "$lib/shared/library/data/firestore-paths";
import { loadCatalogSequences } from "./catalog-loader";
import { loadDiamondEdges } from "./pictograph-letter-lookup";
import type { ResolvedReversalPattern } from "../domain/reversal-transform";
import { transformSequence } from "./reversal-transform-apply";
import type { Catalog } from "../domain/models/Catalog";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

// Firebase-free transform half — re-exported for backward compatibility so
// consumers keep importing these from reversal-seed-service.
export {
  transformSequence,
  applyReversalMatrix,
  solveHandFlips,
  type MutableMotion,
} from "./reversal-transform-apply";

/** Firestore batch limit is 500 writes; mirror the reference's 450 headroom. */
const BATCH_SIZE = 450;

export interface SeedProgress {
  /** Number of base catalogs whose variant has been written so far. */
  written: number;
  /** Total number of base catalogs being seeded. */
  total: number;
  /** Id of the variant catalog just written (present on each progress tick). */
  catalogId?: string;
}

/**
 * Seed a single reversal pattern across the given base catalogs.
 *
 * Writes one variant catalog per base catalog (`<baseId>-<patternId>`), each
 * containing the transformed sequences. Returns the ids of the variant catalogs
 * written.
 *
 * Refuses non-clean-loop patterns (the prop would not return to its starting
 * rotation at the loop boundary) and the no-op "continuous" pattern.
 */
export async function seedReversalPattern(
  baseCatalogs: Catalog[],
  pattern: ResolvedReversalPattern,
  onProgress?: (progress: SeedProgress) => void,
): Promise<string[]> {
  if (!pattern.isCleanLoop) {
    throw new Error(
      `Refusing to seed non-clean-loop reversal pattern "${pattern.id}" (${pattern.sequence}). ` +
        `Each hand must reverse an even number of times so the prop returns to its starting rotation.`,
    );
  }
  if (pattern.id === "continuous") return [];

  // The atlas reaches this module through the transform re-exports above, and
  // only an admin ever seeds. Loading Firebase here keeps it off the atlas's
  // first download.
  const { getFirestoreInstance } = await import("$lib/shared/auth/firebase");
  const db = await getFirestoreInstance();
  const edges = await loadDiamondEdges();
  const writtenIds: string[] = [];
  const total = baseCatalogs.length;

  for (let c = 0; c < baseCatalogs.length; c++) {
    const base = baseCatalogs[c];
    if (!base) continue;
    const newId = `${base.id}-${pattern.id}`;

    const baseSeqs = await loadCatalogSequences(base.id);
    const transformed = baseSeqs.map((s) => transformSequence(s, pattern, edges));

    // Variant catalog metadata. Reversal preserves the hand-path / TnD family
    // grouping AND the seq ids, so `families` carries over verbatim.
    const variantCatalog: Catalog & { reversalPattern: string } = {
      ...base,
      id: newId,
      name: `${base.name} (${pattern.sequence})`,
      reversalPattern: pattern.id,
      asymmetric: false,
      totalSequences: transformed.length,
    } as Catalog & { reversalPattern: string };

    await writeCatalogWithSequences(db, newId, variantCatalog, transformed);

    writtenIds.push(newId);
    onProgress?.({ written: c + 1, total, catalogId: newId });
  }

  return writtenIds;
}

/**
 * Write a variant catalog document plus all its sequences. Sequences are
 * committed in batches (Firestore caps a batch at 500 writes).
 */
async function writeCatalogWithSequences(
  db: Firestore,
  catalogId: string,
  catalog: Catalog & { reversalPattern: string },
  sequences: SequenceData[],
): Promise<void> {
  const { doc, writeBatch } = await import("firebase/firestore");
  // Catalog document write (its own batch — keeps it isolated from the larger
  // sequence batches and mirrors the reference's separate deck set()).
  const catalogBatch = writeBatch(db);
  catalogBatch.set(
    doc(db, getSystemCatalogPath(catalogId)),
    stripUndefined(catalog),
  );
  await catalogBatch.commit();

  for (let i = 0; i < sequences.length; i += BATCH_SIZE) {
    const chunk = sequences.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const seq of chunk) {
      batch.set(
        doc(db, getSystemCatalogSequencePath(catalogId, seq.id)),
        stripUndefined(seq),
      );
    }
    await batch.commit();
  }
}

/**
 * Firestore rejects `undefined` field values. The base catalog object may carry
 * undefined optional fields (e.g. `asymmetric`, `sourceCatalog`); strip them.
 * Sequences are already deep-cloned via JSON so they have no undefined fields,
 * but this is cheap insurance and keeps both write paths uniform.
 */
function stripUndefined<T extends object>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}
