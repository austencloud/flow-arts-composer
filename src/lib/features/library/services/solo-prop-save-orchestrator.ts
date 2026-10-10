/**
 * SoloPropSaveOrchestrator
 *
 * Persists a solo prop to the user's repository with "original" provenance
 * (meaning the user created it directly, not extracted from a full sequence).
 * Also saves the solo prop's embedded hand path as a separate artifact
 * so it appears in the hand path library too.
 */

import type { SoloPropRepository } from "#lib/shared/foundation/services/solo-prop-repository-store.js";
import type { HandPathRepository } from "#lib/shared/foundation/services/hand-path-repository-store.js";
import type { SoloPropData } from "#lib/shared/foundation/domain/models/solo-prop-data.js";
import type { ArtifactProvenance } from "#lib/shared/foundation/domain/models/artifact-provenance.js";

export class SoloPropSaveOrchestrator {
  constructor(
    private readonly soloPropRepository: SoloPropRepository,
    private readonly handPathRepository: HandPathRepository
  ) {}

  async save(
    data: SoloPropData,
    metadata?: {
      name?: string;
      notes?: string;
      authoredHand?: SoloPropData["authoredHand"];
      ownerId?: string;
      ownerDisplayName?: string;
    }
  ): Promise<{ soloPropId: string; reusedExisting: boolean }> {
    const [existingSoloProp, existingHandPath] = await Promise.all([
      this.soloPropRepository.getByHash(data.contentHash),
      this.handPathRepository.getByHash(data.handPath.contentHash),
    ]);
    const name = existingSoloProp?.name ?? metadata?.name ?? data.name;
    const notes = existingSoloProp?.notes ?? metadata?.notes ?? data.notes;
    const authoredHand =
      existingSoloProp?.authoredHand ??
      metadata?.authoredHand ??
      data.authoredHand;
    const ownerId =
      existingSoloProp?.ownerId ?? metadata?.ownerId ?? data.ownerId;
    const ownerDisplayName =
      existingSoloProp?.ownerDisplayName ??
      metadata?.ownerDisplayName ??
      data.ownerDisplayName;
    const handPathName =
      existingHandPath?.name ?? existingSoloProp?.name ?? metadata?.name;
    const handPathNotes =
      existingHandPath?.notes ?? existingSoloProp?.notes ?? metadata?.notes;
    const soloProp: SoloPropData = {
      ...(existingSoloProp ?? data),
      ...data,
      id: existingSoloProp?.id ?? data.id,
      handPath: {
        ...(existingHandPath ?? data.handPath),
        ...data.handPath,
        id: existingHandPath?.id ?? data.handPath.id,
        ...(handPathName !== undefined && { name: handPathName }),
        ...(handPathNotes !== undefined && { notes: handPathNotes }),
        ...(ownerId !== undefined && { ownerId }),
        ...(ownerDisplayName !== undefined && {
          ownerDisplayName,
        }),
      },
      ...(name !== undefined && { name }),
      ...(notes !== undefined && { notes }),
      ...(authoredHand !== undefined && { authoredHand }),
      ...(ownerId !== undefined && { ownerId }),
      ...(ownerDisplayName !== undefined && { ownerDisplayName }),
      dateCreated:
        existingSoloProp?.dateCreated ?? data.dateCreated ?? new Date(),
    };

    const provenance: ArtifactProvenance = {
      sourceSequenceIds: [],
      isOriginal: true,
      firstSeenAt: new Date(),
    };

    // Save both the solo prop and its hand path in parallel.
    // allSettled so one failure doesn't block the other.
    const results = await Promise.allSettled([
      this.soloPropRepository.save(soloProp, provenance),
      this.handPathRepository.save(soloProp.handPath, provenance),
    ]);

    // If the primary save (solo prop) failed, throw so the caller can show an error.
    // Hand path save failure is logged but doesn't block.
    const soloPropResult = results[0]!;
    const handPathResult = results[1]!;

    if (soloPropResult.status === "rejected") {
      throw soloPropResult.reason;
    }

    if (handPathResult.status === "rejected") {
      console.warn(
        "[SoloPropSaveOrchestrator] Hand path extraction save failed:",
        handPathResult.reason
      );
    }

    return {
      soloPropId: soloProp.id,
      reusedExisting: existingSoloProp !== null,
    };
  }
}
