import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { jsonCache } from "#lib/shared/pictograph/shared/services/simple-json-cache.js";
import { hydrateSequence } from "./sequence-render-hydrator";

const TND_BASE_WORDS_URL = "/data/hero/tnd-base-words.json";

let wordsPromise: Promise<SequenceData[]> | null = null;

/**
 * Load the checked-in snapshot of the 22 canonical Level 1 TnD base words.
 * Public instruments use this source instead of waiting on Firebase for data
 * that is versioned with the application and rebuilt by the deck tooling.
 */
export function loadTndBaseWords(): Promise<SequenceData[]> {
  if (!wordsPromise) {
    wordsPromise = jsonCache
      .get<Array<Record<string, unknown>>>(TND_BASE_WORDS_URL)
      .then((records) => records.map((record) => hydrateSequence(record)))
      .catch((error) => {
        wordsPromise = null;
        throw error;
      });
  }
  return wordsPromise;
}
