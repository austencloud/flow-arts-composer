/**
 * The first step of a saved sequence, for museum thumbnails and plaques.
 * Drawn on the grids the sequence is joined on (display-only; the stored step
 * is untouched), so a joined sequence hangs joined.
 */
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import { withSequenceJoinApplied } from "#lib/shared/grid-join/sequence-grid-join.js";

export function sequenceFirstStep<S extends object>(
  sequence: { readonly steps?: readonly S[]; readonly conjoined?: unknown } | null | undefined
): (S & PictographData) | null {
  const step = sequence?.steps?.[0];
  if (!step) return null;
  return withSequenceJoinApplied(sequence, step as S & PictographData);
}
