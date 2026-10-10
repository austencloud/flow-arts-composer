/**
 * HandPathSaveOrchestrator
 *
 * Persists a hand path to the user's repository with "original" provenance
 * (meaning the user created it directly in the hand path builder, not extracted
 * from a full sequence). The provenance tag lets the UI distinguish between
 * hand-crafted paths and those automatically decomposed from sequences.
 */

import type { HandPathRepository } from "#lib/shared/foundation/services/hand-path-repository-store.js";
import type { HandPathData } from "#lib/shared/foundation/domain/models/hand-path-data.js";
import type { ArtifactProvenance } from "#lib/shared/foundation/domain/models/artifact-provenance.js";

export class HandPathSaveOrchestrator {
  constructor(
    private readonly handPathRepository: HandPathRepository
  ) {}

  async save(data: HandPathData, name?: string): Promise<void> {
    const handPath = name ? { ...data, name } : data;

    const provenance: ArtifactProvenance = {
      sourceSequenceIds: [],
      isOriginal: true,
      firstSeenAt: new Date(),
    };

    await this.handPathRepository.save(handPath, provenance);
  }
}
