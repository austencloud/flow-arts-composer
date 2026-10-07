/**
 * Mandalas on joined grids. When a sequence is joined, blue's hand works on
 * one grid and red's on another, so each hand's mandala figure is drawn
 * around its own grid's center: the picture shows the real shape the two
 * hands trace, two figures overlapping in the middle.
 *
 * Where each grid sits comes from `@tka/render-core`'s `gridJoinOffsets`,
 * the rule the props, trails and cards follow; this module only states it in
 * mandala units (the hand circle has radius `MANDALA_GRID_RADIUS`). The
 * mandala's matching data (gallery, fingerprints, index) stays tied to the
 * motion and never reads a join.
 */
import {
  alignGridJoin,
  gridJoinOffsets,
  isGridJoin,
  type JoinVec,
} from "@tka/render-core";
import { MANDALA_GRID_RADIUS } from "../domain/mandala-constants";

/** Each hand's figure offset from the mandala's center, in mandala units. */
export interface MandalaHandOffsets {
  readonly left: JoinVec;
  readonly right: JoinVec;
}

/**
 * Each hand's figure offset for a sequence's join, lined up with the grid
 * drawn (`gridMode`) as the cards and the animation line it up. Null for one
 * grid, so one-grid mandalas draw exactly as before.
 */
export function mandalaGridJoinOffsets(
  join: unknown,
  gridMode: string | null | undefined
): MandalaHandOffsets | null {
  if (!isGridJoin(join)) return null;
  return gridJoinOffsets(alignGridJoin(join, gridMode), MANDALA_GRID_RADIUS);
}

/**
 * The animation's displayed hand offsets (in hand-point radii, between two
 * joins while a layout slides) in mandala units. Null when both hands sit at
 * the center.
 */
export function mandalaOffsetsFromHandUnits(
  offsets: MandalaHandOffsets | null | undefined
): MandalaHandOffsets | null {
  if (!offsets) return null;
  const { left, right } = offsets;
  if (left.x === 0 && left.y === 0 && right.x === 0 && right.y === 0) {
    return null;
  }
  return {
    left: { x: left.x * MANDALA_GRID_RADIUS, y: left.y * MANDALA_GRID_RADIUS },
    right: {
      x: right.x * MANDALA_GRID_RADIUS,
      y: right.y * MANDALA_GRID_RADIUS,
    },
  };
}

/**
 * How far the joined pair reaches past one figure's square bound: a figure
 * that fits within `extent` of its own center fits within `extent + reach`
 * of the mandala's center.
 */
export function mandalaJoinReach(offsets: MandalaHandOffsets | null): number {
  if (!offsets) return 0;
  return Math.max(
    Math.abs(offsets.left.x),
    Math.abs(offsets.left.y),
    Math.abs(offsets.right.x),
    Math.abs(offsets.right.y)
  );
}

/** Short stable key for repaint checks; "" for one grid. */
export function mandalaHandOffsetsKey(
  offsets: MandalaHandOffsets | null | undefined
): string {
  if (!offsets) return "";
  const { left, right } = offsets;
  return `${left.x},${left.y},${right.x},${right.y}`;
}

/**
 * Each hand's figure offset for a whole sequence: the join it carries, lined
 * up with the grid it is drawn on. Null for an unjoined sequence. Surfaces
 * that draw a sequence's mandala pass this as `handOffsets` so a joined
 * sequence shows joined everywhere.
 */
export function sequenceMandalaHandOffsets(
  sequence:
    | {
        readonly conjoined?: unknown;
        readonly gridMode?: unknown;
        readonly startPlacement?: { readonly gridMode?: unknown } | null;
        readonly steps?: readonly { readonly gridMode?: unknown }[];
      }
    | null
    | undefined
): MandalaHandOffsets | null {
  if (!sequence) return null;
  // Older sequences leave gridMode to their cells, like WorkspaceGrid reads it.
  const gridMode = [
    sequence.gridMode,
    sequence.startPlacement?.gridMode,
    sequence.steps?.[0]?.gridMode,
  ].find((mode): mode is string => typeof mode === "string");
  return mandalaGridJoinOffsets(sequence.conjoined, gridMode ?? null);
}
