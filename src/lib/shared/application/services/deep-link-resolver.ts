/**
 * DeepLinkResolver - Resolves sequence IDs from URLs to full sequence data
 *
 * Resolution chain:
 * 1. SessionStorage cache (handles HMR and same-tab refresh)
 * 2. Local SequenceRepository (session sequences in IndexedDB)
 * 3. Firebase public sequences (for cross-user/cross-tab links)
 */

import type {
  DeepLinkResult,
} from "./types";
import type { SequenceRepository } from "#lib/shared/create/services/sequence-repository.js";
import type { PublicSequencesLoader } from "#lib/shared/browse/services/public-sequences-loader.js";
import { getCachedSequence } from "../state/ui/modal-url-state.svelte";

export class DeepLinkResolver {
  constructor(
    private sequenceRepository: SequenceRepository,
    private publicSequencesLoader: PublicSequencesLoader
  ) {}

  async resolve(sequenceId: string): Promise<DeepLinkResult> {
    // 1. Try session cache first (for HMR and same-tab refresh)
    const cached = getCachedSequence(sequenceId);
    if (cached) {
      return { sequence: cached, source: "cache", error: null };
    }

    // 2. Try local repository (IndexedDB - session sequences)
    try {
      const local = await this.sequenceRepository.getSequence(sequenceId);
      if (local) {
        return { sequence: local, source: "local", error: null };
      }
    } catch (err) {
      console.warn(`[DeepLinkResolver] Local repository error:`, err);
      // Continue to next source
    }

    // 3. Try Firebase public sequences
    try {
      const publicSequence =
        await this.publicSequencesLoader.loadFullSequenceData(sequenceId);
      if (publicSequence) {
        return { sequence: publicSequence, source: "public", error: null };
      }
    } catch (err) {
      console.error(`[DeepLinkResolver] Public sequences error:`, err);
      // Network error
      return { sequence: null, source: null, error: "network" };
    }

    // Not found in any source
    console.warn(`[DeepLinkResolver] Sequence not found: ${sequenceId}`);
    return { sequence: null, source: null, error: "not_found" };
  }
}
