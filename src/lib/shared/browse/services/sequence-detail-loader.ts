/**
 * SequenceDetailLoader - Load full sequence data for detail views
 *
 * Handles lazy-loading of complete sequence data (including steps)
 * when viewing sequence details. Prevents duplicate loads and
 * provides efficient caching.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { PublicSequencesLoader } from "#lib/shared/browse/services/public-sequences-loader.js";

export class SequenceDetailLoader {
  // In-flight loads to prevent duplicates
  private loadPromises = new Map<string, Promise<SequenceData | null>>();

  constructor(private readonly browseLoader: PublicSequencesLoader) {}

  async loadFullSequence(sequence: SequenceData): Promise<SequenceData | null> {
    // If sequence already has steps, use it directly
    if (!this.needsFullLoad(sequence)) {
      return sequence;
    }

    const sequenceName = sequence.word || sequence.id;

    // Dedup by the unique id, not the word — two variations can share a word
    // but must resolve to their own load.
    const existing = this.loadPromises.get(sequence.id);
    if (existing) {
      return existing;
    }

    // Start new load. Pass the id so the loader can disambiguate same-word variations.
    const loadPromise = this.browseLoader
      .loadFullSequenceData(sequenceName, sequence.id)
      .finally(() => {
        // Clean up after load completes
        this.loadPromises.delete(sequence.id);
      });

    this.loadPromises.set(sequence.id, loadPromise);
    return loadPromise;
  }

  needsFullLoad(sequence: SequenceData): boolean {
    return !sequence.steps || sequence.steps.length === 0;
  }
}
