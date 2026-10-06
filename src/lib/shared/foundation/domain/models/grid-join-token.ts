/**
 * Text form of a grid join, for the link codec, the content hashers and the
 * public wire schema.
 *
 * `@tka/render-core` owns what a join means (`isGridJoin`, `gridJoinKey`).
 * This module spells the same key ("e1", "ne2") with no runtime imports, for
 * code that maintenance scripts load under tsx: there render-core resolves to
 * its built output, and a build older than the join helpers fails the whole
 * script on the missing export. `tests/unit/grid-join/grid-join-token.test.ts`
 * pins both to the same answers.
 *
 * A sequence has one join for every cell, so there is no per-cell token.
 */
import type { GridJoin, GridJoinDirection } from "@tka/tka-types";

/** Every direction a join can lead toward: all grid points but the center. */
export const GRID_JOIN_DIRECTIONS = [
  "n",
  "e",
  "s",
  "w",
  "ne",
  "se",
  "sw",
  "nw",
] as const satisfies readonly GridJoinDirection[];

/** True for a well-formed join (anything read from storage or a link). */
export function isWellFormedGridJoin(value: unknown): value is GridJoin {
  if (!value || typeof value !== "object") return false;
  const { toward, steps } = value as { toward?: unknown; steps?: unknown };
  return (
    typeof toward === "string" &&
    (GRID_JOIN_DIRECTIONS as readonly string[]).includes(toward) &&
    (steps === 1 || steps === 2)
  );
}

/**
 * "e1" for a sequence's join. Empty for a sequence on one grid (undefined or
 * null) and for anything malformed.
 */
export function gridJoinToken(join: unknown): string {
  return isWellFormedGridJoin(join) ? `${join.toward}${join.steps}` : "";
}

/** The join a token spells, or undefined for any other text. */
export function parseGridJoinToken(token: string): GridJoin | undefined {
  const join = { toward: token.slice(0, -1), steps: Number(token.slice(-1)) };
  return isWellFormedGridJoin(join) ? join : undefined;
}
