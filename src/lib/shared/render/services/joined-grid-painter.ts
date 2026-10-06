/**
 * Canvas painting for grid points, one grid's or two joined grids'. The
 * geometry lives in render-core (grid-points, grid-join-layout); this file
 * only turns it into canvas calls, so the full renderer and the layer
 * compositor draw identical dots.
 */
import {
  BOX_OUTER_RING_WIDTH,
  GRID_POINT_RADIUS,
  type GridJoinLayout,
  type GridPointKind,
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
 * Paint `points`, each at its kind's radius: in its entry of `colors` when
 * given (in point order), else in the current fill and stroke style. Box
 * grids draw their outer points as rings.
 */
export function paintGridPoints(
  ctx: RenderContext2D,
  points: readonly { kind: GridPointKind; x: number; y: number }[],
  size: number,
  box: boolean,
  colors?: readonly string[]
): void {
  const scale = size / VIEWBOX_SIZE;
  points.forEach((point, index) => {
    const color = colors?.[index];
    if (color) {
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
    }
    ctx.beginPath();
    ctx.arc(
      point.x * scale,
      point.y * scale,
      GRID_POINT_RADIUS[point.kind] * scale,
      0,
      Math.PI * 2
    );
    if (box && point.kind === "outer") {
      ctx.lineWidth = BOX_OUTER_RING_WIDTH * scale;
      ctx.stroke();
    } else {
      ctx.fill();
    }
  });
}

/**
 * Paint the layout's points that `include` accepts, each in its entry of
 * `colors` (in point order, from `joinedPointColors`). Box grids draw their
 * outer points as rings, as one box grid does.
 */
export function paintJoinedGridPoints(
  ctx: RenderContext2D,
  layout: GridJoinLayout,
  size: number,
  box: boolean,
  colors: readonly string[],
  include: (point: JoinedGridPoint) => boolean
): void {
  const shown = layout.points.flatMap((point, index) =>
    include(point) ? [{ point, color: colors[index]! }] : []
  );
  paintGridPoints(
    ctx,
    shown.map(({ point }) => point),
    size,
    box,
    shown.map(({ color }) => color)
  );
}
