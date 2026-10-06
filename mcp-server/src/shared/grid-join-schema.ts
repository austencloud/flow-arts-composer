import type { GridJoinDirection } from "@tka/tka-types";
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
    "Draw each hand on its own grid, joined (Level 7 conjoined grids). Omit for the one shared grid."
  );
