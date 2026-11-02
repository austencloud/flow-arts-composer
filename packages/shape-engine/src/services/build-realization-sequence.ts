import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { loadTndBaseWords } from "#lib/features/choreo-card/services/tnd-base-word-snapshot.js";
import { buildBaseIndex } from "./tnd-base-index";

/**
 * Static snapshot loader for the shape-matrix base-word index.
 *
 * The 22 canonical words are baked from the system catalog and versioned with
 * the public app, so the matrix does not wait on Firebase before it can draw.
 */
export { buildBaseIndex, resolveBase } from "./tnd-base-index";

let baseIndex: Map<string, SequenceData> | null = null;
export async function loadBaseIndex(): Promise<Map<string, SequenceData>> {
  if (!baseIndex) baseIndex = buildBaseIndex(await loadTndBaseWords());
  return baseIndex;
}
