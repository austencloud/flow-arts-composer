import type { GridJoinDirection } from "@tka/tka-types";
import {
  alignGridJoin,
  isGridJoin,
  type GridJoinSpec,
} from "@tka/render-core";
import { z } from "zod";

const GRID_JOIN_DIRECTIONS = [
  "n",
  "e",
  "s",
  "w",
  "ne",
  "se",
  "sw",
  "nw",
] as const satisfies readonly GridJoinDirection[];

/** Tool input that draws each hand on its own grid, the two grids joined. */
export const gridJoinSchema = z
  .object({
    toward: z
      .enum(GRID_JOIN_DIRECTIONS)
      .describe(
        "Where the red (right-hand) grid sits from the blue (left-hand) grid"
      ),
    steps: z
      .union([z.literal(1), z.literal(2)])
      .describe(
        "Distance between the grid centers in hand points: 1 interlocks the grids, 2 meets them hand to hand"
      ),
  })
  .describe(
    "Draw each hand on its own grid, joined (Level 7 conjoined grids). Omitting conjoined means one shared grid. The result echoes the join that was drawn."
  );

const JOIN_DIRECTION_WORDS: Record<GridJoinDirection, string> = {
  n: "north",
  ne: "northeast",
  e: "east",
  se: "southeast",
  s: "south",
  sw: "southwest",
  w: "west",
  nw: "northwest",
};

/**
 * The join as it is drawn on `gridMode`'s grid, or null for one grid. A
 * direction off that grid's hand-point lines turns 45 degrees clockwise onto
 * them (the same rule the renderers apply), so this is what the picture shows.
 */
export function effectiveGridJoin(
  join: unknown,
  gridMode?: string | null
): GridJoinSpec | null {
  return isGridJoin(join) ? alignGridJoin(join, gridMode) : null;
}

/**
 * One plain-English line for the join, worded like the app's Copy for Claude
 * header. Empty for one grid, so callers can append it unconditionally.
 */
export function describeGridJoin(
  join: unknown,
  gridMode?: string | null
): string {
  const effective = effectiveGridJoin(join, gridMode);
  if (!effective) return "";
  const asked = (join as GridJoinSpec).toward;
  const points = `${effective.steps} point${effective.steps === 1 ? "" : "s"}`;
  const turned =
    asked !== effective.toward
      ? `; asked for ${asked}, turned onto the ${gridMode ?? "diamond"} grid's hand points`
      : "";
  return (
    `join: red's grid ${points} ${JOIN_DIRECTION_WORDS[effective.toward as GridJoinDirection]} of blue's ` +
    `(toward ${effective.toward}, steps ${effective.steps}${turned})`
  );
}

/** `describeGridJoin` as a trailing line (newline-prefixed), or "". */
export function gridJoinLine(join: unknown, gridMode?: string | null): string {
  const line = describeGridJoin(join, gridMode);
  return line ? `\n${line}` : "";
}

/** `{ conjoined }` for a JSON result when joined, `{}` for one grid. */
export function gridJoinField(
  join: unknown,
  gridMode?: string | null
): { conjoined?: GridJoinSpec } {
  const effective = effectiveGridJoin(join, gridMode);
  return effective ? { conjoined: effective } : {};
}
