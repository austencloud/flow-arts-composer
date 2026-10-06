/**
 * Reading and replacing the join a sequence carries (`SequenceData.conjoined`).
 */
import type { GridJoin } from "@tka/tka-types";
import { isGridJoin } from "@tka/render-core";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { gridJoinsEqual } from "./grid-join-controller";

/** The sequence's join, or null for one grid (or a malformed stored value). */
export function sequenceGridJoin(
  sequence: { readonly conjoined?: unknown } | null | undefined
): GridJoin | null {
  const join = sequence?.conjoined;
  return isGridJoin(join) ? join : null;
}

/**
 * The sequence carrying `join` (null removes it). Returns the same object when
 * it already carries that join, so derived state keeps its identity.
 */
export function withSequenceGridJoin<T extends SequenceData>(
  sequence: T,
  join: GridJoin | null
): T {
  if (gridJoinsEqual(join, sequenceGridJoin(sequence))) return sequence;
  const { conjoined: _removed, ...rest } = sequence;
  return (join ? { ...rest, conjoined: join } : rest) as T;
}
