/**
 * SVG markup for two joined grids, for the live pictograph (the workspace
 * cells, the step editor, anything drawn through PictographRenderer).
 *
 * The geometry, the dot sizes and the tint all come from `@tka/render-core`
 * (getGridJoinLayout, gridPointsSvg, joinedPointColors), the same rule the
 * card renderer and both MCP renderers paint with, so a joined sequence looks
 * the same in the workspace as on its card. This file only picks which hand
 * points show and turns the layout into circles.
 */
import {
  gridPointsSvg,
  joinedPointColors,
  type GridJoinLayout,
  type JoinedGridPoint,
} from "@tka/render-core";

/** The one-grid dot colors the card and MCP renderers mix the tint into. */
const GRID_POINT_COLOR_DARK = "#ffffff";
const GRID_POINT_COLOR_LIGHT = "#000000";

export interface JoinedGridMarkupOptions {
  darkMode: boolean;
  /** Box grids draw their outer points as rings. */
  box: boolean;
  /** Each hand's color; the dots lean toward their own hand's. */
  handColors: Readonly<Record<"left" | "right", string>>;
  /**
   * "all" draws every hand point, "none" none, and "active" only the points
   * each hand starts or ends on in its own grid (`activeHandPoints`).
   */
  handPointVisibility?: "all" | "active" | "none";
  activeHandPoints?: Readonly<Record<"left" | "right", ReadonlySet<string>>>;
}

/** The joined layout's dots as SVG circles, in the 950-unit scene. */
export function joinedGridMarkup(
  layout: GridJoinLayout,
  options: JoinedGridMarkupOptions
): string {
  const colors = joinedPointColors(
    layout.points,
    options.darkMode ? GRID_POINT_COLOR_DARK : GRID_POINT_COLOR_LIGHT,
    options.handColors
  );
  const visibility = options.handPointVisibility ?? "all";
  const active = visibility === "active" ? options.activeHandPoints : null;
  const shown = (point: JoinedGridPoint): boolean =>
    point.kind !== "hand" ||
    (visibility !== "none" &&
      (!active ||
        point.members.some((member) =>
          active[member.hand].has(member.location)
        )));
  return layout.points
    .map((point, index) =>
      shown(point) ? gridPointsSvg([point], options.box, colors[index]!) : ""
    )
    .join("");
}

/**
 * The transform that shrinks the joined grids, props and arrows about the
 * scene center so they clear the glyphs at the cell edges, as the card
 * renderer's `applyJoinedGridFit` does.
 */
export function joinedGridFitTransform(
  layout: GridJoinLayout,
  sceneSize = 950
): string {
  const center = sceneSize / 2;
  return `translate(${center} ${center}) scale(${layout.scale}) translate(${-center} ${-center})`;
}
