import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { openSequenceOverlay } from "$lib/shared/sequence-viewer/state/sequence-viewer-overlay-state.svelte";
import { sequenceGridJoin } from "$lib/shared/grid-join/sequence-grid-join";
import { getLibraryRepository } from "$lib/shared/library/get-library-repository";

/** Shape shared by every collected art entry that can carry a lineage stamp
 *  (tunnel, 3D scene, mandala). See
 *  docs/superpowers/specs/2026-07-12-art-in-library-design.md Unit 3. */
export interface LineageSource {
  sourceWord?: string;
  sourceSequenceId?: string;
  steps?: StepData[];
  /** The join the steps were made under; absent means one grid. */
  conjoined?: unknown;
}

/** Whether the "From <word>" chip has anywhere to send the user. A word alone
 *  isn't enough — the entry also needs either a resolvable library id or its
 *  own saved steps to reconstruct the sequence from.
 *
 *  `steps` is typed as `readonly unknown[]` (only `.length` is read) rather
 *  than `StepData[]` so this also accepts MandalaModule's `StepLike[]` — a
 *  narrower rendering-only view over the same underlying step objects — with
 *  no cast at the call site. */
export function hasLineageSource(entry: {
  sourceWord?: string;
  sourceSequenceId?: string;
  steps?: readonly unknown[];
}): boolean {
  return !!entry.sourceWord && (!!entry.sourceSequenceId || (entry.steps?.length ?? 0) > 0);
}

/**
 * Open the RAW source sequence an art entry was made from — no settings
 * seeding, under whatever the viewer's current settings already are. This is
 * deliberate: it demonstrates the data-vs-expression split the lineage stamp
 * exists to teach (a sequence is raw data; a saved tunnel/scene/mandala is an
 * expression of that data under specific parameters).
 *
 * Resolution: by `sourceSequenceId` via the library repository when present
 * (works whenever the source is still in the user's library); falls back to
 * rebuilding a SequenceData from the entry's own saved steps otherwise — the
 * same `createSequenceData` pattern `open-tunnel-in-viewer.ts` /
 * `open-3d-scene.ts` use, just without any of their global-state seeding.
 */
export async function openLineageSource(entry: LineageSource): Promise<void> {
  if (entry.sourceSequenceId) {
    try {
      const librarySequence = await getLibraryRepository().getSequence(entry.sourceSequenceId);
      if (librarySequence) {
        openSequenceOverlay(librarySequence, { analyticsSource: "lineage" });
        return;
      }
    } catch (error) {
      // Not signed in, offline, or the sequence was deleted — fall through to
      // the steps-based reconstruction below rather than failing the tap.
      console.warn("[openLineageSource] Couldn't resolve source sequence by id:", error);
    }
  }

  const steps = entry.steps ?? [];
  if (steps.length === 0) return;

  const join = sequenceGridJoin(entry);
  const sequence = createSequenceData({
    id: entry.sourceSequenceId ?? crypto.randomUUID(),
    name: entry.sourceWord ?? "Sequence",
    word: entry.sourceWord ?? "",
    steps: [...steps],
    gridMode: steps.find((s) => s.gridMode)?.gridMode,
    ...(join ? { conjoined: join } : {}),
  });
  openSequenceOverlay(sequence, { analyticsSource: "lineage" });
}
