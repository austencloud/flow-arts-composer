import type { HandPathData } from "#lib/shared/foundation/domain/models/hand-path-data.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { handPathToName } from '#lib/shared/foundation/services/hand-path-namer.js';
import { ensureComposition } from "#lib/shared/foundation/services/sequence-hydrator.js";
import type { SequenceRepository } from "#lib/shared/create/services/sequence-repository.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

export interface PathGroup {
  /** Content hash that uniquely identifies this hand path shape. */
  readonly hash: string;
  /** The hand path data (locations, grid mode, etc.). */
  readonly handPath: HandPathData;
  /** Compact human-readable name derived from the path's location sequence. */
  readonly name: string;
  /** Sequences where this path appears. */
  readonly sequences: SequenceData[];
  /** Which sides of the performer pair this path appears on. */
  readonly sides: Set<HandSide>;
}

export interface ExplorerState {
  readonly isLoading: boolean;
  readonly loadError: string | null;
  readonly pathGroups: PathGroup[];
  readonly selectedHash: string | null;
  readonly selectedGroup: PathGroup | null;
  selectPath(hash: string | null): void;
}

export function createExplorerState(
  sequenceRepository: SequenceRepository,
): ExplorerState {
  let isLoading = $state(true);
  let loadError = $state<string | null>(null);
  let pathGroups = $state<PathGroup[]>([]);
  let selectedHash = $state<string | null>(null);

  const selectedGroup = $derived(
    selectedHash !== null
      ? (pathGroups.find((g) => g.hash === selectedHash) ?? null)
      : null
  );

  // Load all sequences and group by path hash on first mount.
  async function load(): Promise<void> {
    try {
      isLoading = true;
      loadError = null;

      const rawSequences = await sequenceRepository.getAllSequences();

      // Legacy sequences carry `steps` but no compositional fields
      // (leftSoloProp/rightSoloProp) — they predate the field or were saved by a
      // path that skips ensureComposition(). handPath lives on those fields, so
      // the Explorer is empty for the whole legacy corpus without this. Derive
      // them read-time (no persistence — the same one-way decomposition
      // ensureComposition() does at save time, run here at read time, mirroring
      // how hydrate() derives the opposite direction). This keeps the read-only
      // Explorer self-sufficient instead of depending on a data backfill.
      const sequences = rawSequences.map((seq) => {
        if (seq.leftSoloProp || seq.steps.length === 0) return seq;
        try {
          return ensureComposition(seq);
        } catch {
          return seq;
        }
      });

      // Build a map from contentHash → PathGroup.
      // A sequence contributes to a group when it has a SoloPropData on either side.
      const groupMap = new Map<string, PathGroup>();

      for (const seq of sequences) {
        const sides: Array<{ handPath: HandPathData; side: HandSide }> = [];

        if (seq.leftSoloProp?.handPath) {
          sides.push({ handPath: seq.leftSoloProp.handPath, side: HandSide.LEFT });
        }
        if (seq.rightSoloProp?.handPath) {
          sides.push({ handPath: seq.rightSoloProp.handPath, side: HandSide.RIGHT });
        }

        for (const { handPath, side } of sides) {
          const hash = handPath.contentHash;
          const existing = groupMap.get(hash);

          if (existing) {
            // The Set and array are mutable during construction; we mutate in place.
            existing.sides.add(side);
            // Only add each sequence once per group even if both sides share the same path.
            if (!existing.sequences.find((s) => s.id === seq.id)) {
              existing.sequences.push(seq);
            }
          } else {
            groupMap.set(hash, {
              hash,
              handPath,
              name: handPathToName(handPath.locations),
              sequences: [seq],
              sides: new Set<HandSide>([side]),
            });
          }
        }
      }

      // Sort by frequency descending, then name ascending for stability.
      const sorted = Array.from(groupMap.values()).sort((a, b) => {
        const diff = b.sequences.length - a.sequences.length;
        return diff !== 0 ? diff : a.name.localeCompare(b.name);
      });

      pathGroups = sorted;
    } catch (err) {
      loadError =
        err instanceof Error ? err.message : "Failed to load sequences";
      pathGroups = [];
    } finally {
      isLoading = false;
    }
  }

  // Fire the load immediately.
  load();

  function selectPath(hash: string | null): void {
    selectedHash = hash;
  }

  return {
    get isLoading() { return isLoading; },
    get loadError() { return loadError; },
    get pathGroups() { return pathGroups; },
    get selectedHash() { return selectedHash; },
    get selectedGroup() { return selectedGroup; },
    selectPath,
  };
}
