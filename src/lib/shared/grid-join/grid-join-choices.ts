/**
 * The join choices every grid-join control offers: one grid, or red's grid
 * one or two hand points across from blue's, in one of the four directions
 * along the sequence's own grid lines (straight on a diamond grid, diagonal on
 * a box grid). A join along any other line never lands one grid's points on
 * the other's.
 *
 * The right-click submenu and the viewer's Grid join section both read these,
 * so the two always offer the same choices with the same names.
 */
import { t } from "#lib/shared/i18n/i18n.svelte.js";
import type { GridJoin } from "@tka/tka-types";
import {
  GRID_JOIN_DIRECTIONS,
  alignGridJoin,
  isBoxGrid,
} from "@tka/render-core";

export type JoinDirection = GridJoin["toward"];
export type JoinSteps = GridJoin["steps"];

export interface GridJoinDirectionChoice {
  toward: JoinDirection;
  /** Clockwise degrees from a right-pointing arrow. */
  rotate: number;
  label: () => string;
}

/** Where red's grid sits from blue's, in the order controls list them. */
const DIRECTIONS: readonly GridJoinDirectionChoice[] = [
  { toward: "e", rotate: 0, label: () => t("animation_menu_grid_join_red_e") },
  {
    toward: "w",
    rotate: 180,
    label: () => t("animation_menu_grid_join_red_w"),
  },
  {
    toward: "n",
    rotate: 270,
    label: () => t("animation_menu_grid_join_red_n"),
  },
  { toward: "s", rotate: 90, label: () => t("animation_menu_grid_join_red_s") },
  {
    toward: "ne",
    rotate: 315,
    label: () => t("animation_menu_grid_join_red_ne"),
  },
  {
    toward: "se",
    rotate: 45,
    label: () => t("animation_menu_grid_join_red_se"),
  },
  {
    toward: "sw",
    rotate: 135,
    label: () => t("animation_menu_grid_join_red_sw"),
  },
  {
    toward: "nw",
    rotate: 225,
    label: () => t("animation_menu_grid_join_red_nw"),
  },
];

/**
 * Direction and distance a first choice starts from (the direction turned onto
 * the grid's lines), and that a later choice keeps when only the other changes.
 */
const DEFAULT_DIRECTION: JoinDirection = "e";
const DEFAULT_STEPS: JoinSteps = 1;

/** The four directions offered on this grid mode, in display order. */
export function offeredGridJoinDirections(
  gridMode: string | null | undefined
): readonly GridJoinDirectionChoice[] {
  const offered = GRID_JOIN_DIRECTIONS[
    isBoxGrid(gridMode ?? undefined) ? "box" : "diamond"
  ] as readonly JoinDirection[];
  return DIRECTIONS.filter((direction) => offered.includes(direction.toward));
}

export interface GridJoinSelection {
  /** The join as drawn (turned onto the grid's lines), or null for one grid. */
  current: GridJoin | null;
  /** The direction a distance-only change keeps. */
  toward: JoinDirection;
  /** The distance a direction-only change keeps. */
  steps: JoinSteps;
}

/**
 * What a control shows as chosen. A join stored off this grid's lines draws
 * aligned, so it reads aligned; with no join, a later direction or distance
 * pick starts from the default.
 */
export function gridJoinSelection(
  stored: GridJoin | null,
  gridMode: string | null | undefined
): GridJoinSelection {
  const current = stored ? alignGridJoin(stored, gridMode) : null;
  const { toward, steps } =
    current ??
    alignGridJoin(
      { toward: DEFAULT_DIRECTION, steps: DEFAULT_STEPS },
      gridMode
    );
  return { current, toward, steps };
}
