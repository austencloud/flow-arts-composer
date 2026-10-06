/**
 * gj slice: the viewer's grid-join choice <-> URL payload.
 *
 * The join belongs to the sequence, so a link that carries the viewer's choice
 * puts it in the sequence itself where it can (the inline-encoded path has the
 * `J` suffix). A short-code link opens the sequence as saved, so the choice
 * rides here, in the state blob, as an override of the saved join.
 *
 * Capture emits nothing while the viewer shows the saved join, so unjoined
 * links stay byte-identical. `{ off: true }` is a deliberate "One grid" over a
 * sequence saved with a join.
 *
 * Back-compat: before the join was part of the sequence, the viewer's
 * Conjoined switch travelled as `an.visibility.gridLayout: "conjoined"`, which
 * always meant east, one point. Those links still open joined.
 */
import type { GridJoin } from "@tka/tka-types";
import { isGridJoin } from "@tka/render-core";
import { gridJoinsEqual } from "$lib/shared/grid-join/grid-join-controller";

export type GjSlicePayload = GridJoin | { off: true };

/**
 * The viewer's choice over the saved sequence: undefined follows the saved
 * join, null is one grid, a join is that join.
 */
export type GridJoinOverride = GridJoin | null | undefined;

/** An override equal to the saved join is no override at all. */
export function normalizeGridJoinOverride(
  override: GridJoinOverride,
  saved: GridJoin | null
): GridJoinOverride {
  if (override === undefined) return undefined;
  return gridJoinsEqual(override, saved) ? undefined : override;
}

export function captureGjSlice(
  override: GridJoinOverride,
  saved: GridJoin | null
): GjSlicePayload | null {
  const effective = normalizeGridJoinOverride(override, saved);
  if (effective === undefined) return null;
  return effective === null
    ? { off: true }
    : { toward: effective.toward, steps: effective.steps };
}

/** The override a gj payload (untrusted link data) asks for, if well formed. */
export function seedFromGjSlice(payload: unknown): GridJoinOverride {
  if (isGridJoin(payload)) {
    return { toward: payload.toward, steps: payload.steps };
  }
  if (
    payload &&
    typeof payload === "object" &&
    (payload as { off?: unknown }).off === true
  ) {
    return null;
  }
  return undefined;
}

/** East, one point: what the old Conjoined switch always drew. */
const LEGACY_CONJOINED_JOIN: GridJoin = { toward: "e", steps: 1 };

/**
 * An old link's `an` payload asking for the Conjoined view. It applies only
 * when the sequence has no join of its own.
 */
export function legacyConjoinedOverride(
  anPayload: { visibility?: unknown } | null | undefined,
  saved: GridJoin | null
): GridJoinOverride {
  const layout = (anPayload?.visibility as { gridLayout?: unknown } | undefined)
    ?.gridLayout;
  return layout === "conjoined" && saved === null
    ? { ...LEGACY_CONJOINED_JOIN }
    : undefined;
}
