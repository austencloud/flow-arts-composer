/**
 * Canvas painting for pictographs drawn on two joined grids. The geometry
 * lives in grid-join-layout; this file only turns it into canvas calls, so
 * the full renderer and the layer compositor draw identical dots.
 */
import {
  BOX_OUTER_RING_WIDTH,
  JOINED_POINT_RADIUS,
  type GridJoinLayout,
  type JoinedGridPoint,
} from "@tka/render-core";
import type { RenderContext2D } from "./types";

const VIEWBOX_SIZE = 950;

/**
 * Shrink everything drawn after this about the cell center, so the joined
 * grids, props and arrows clear the glyphs at the cell edges. Call between
 * `ctx.save()` and `ctx.restore()`.
 */
export function applyJoinedGridFit(
  ctx: RenderContext2D,
  size: number,
  layout: GridJoinLayout
): void {
  const center = size / 2;
  ctx.translate(center, center);
  ctx.scale(layout.scale, layout.scale);
  ctx.translate(-center, -center);
}

/**
 * Paint the layout's points that `include` accepts, in the current fill and
 * stroke style. Box grids draw their outer points as rings, as one box grid
 * does.
 */
export function paintJoinedGridPoints(
  ctx: RenderContext2D,
  layout: GridJoinLayout,
  size: number,
  box: boolean,
  include: (point: JoinedGridPoint) => boolean
): void {
  const scale = size / VIEWBOX_SIZE;
  for (const point of layout.points) {
    if (!include(point)) continue;
    ctx.beginPath();
    ctx.arc(
      point.x * scale,
      point.y * scale,
      JOINED_POINT_RADIUS[point.kind] * scale,
      0,
      Math.PI * 2
    );
    if (box && point.kind === "outer") {
      ctx.lineWidth = BOX_OUTER_RING_WIDTH * scale;
      ctx.stroke();
    } else {
      ctx.fill();
    }
  }
}
