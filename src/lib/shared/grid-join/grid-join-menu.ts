/**
 * The one "Grid join" right-click submenu.
 *
 * The animation canvas menu and the pictograph menu both offer it, built here
 * so the two show identical items in the same order and change the same
 * sequence value. Hosts opt in by passing a controller; with none, there is no
 * submenu.
 *
 * Only the four directions along the sequence's own grid lines are offered
 * (straight on a diamond grid, diagonal on a box grid): a join along any other
 * line never lands one grid's points on the other's.
 */
import { t } from "$lib/shared/i18n/i18n.svelte.js";
import type { ContextMenuItem } from "$lib/shared/components/context-menu/context-menu-types";
import type { GridJoin } from "@tka/tka-types";
import {
  GRID_JOIN_DIRECTIONS,
  alignGridJoin,
  isBoxGrid,
} from "@tka/render-core";
import type { GridJoinController } from "./grid-join-controller";

type JoinDirection = GridJoin["toward"];

/** Where red's grid sits from blue's, in the order the menu lists them. */
const DIRECTIONS: readonly {
  toward: JoinDirection;
  /** Clockwise degrees from a right-pointing arrow. */
  rotate: number;
  label: () => string;
}[] = [
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
const DEFAULT_STEPS: GridJoin["steps"] = 1;

/** The submenu's children, all radio-style and keeping the menu open. */
export function buildGridJoinChildren(
  controller: GridJoinController
): ContextMenuItem[] {
  const gridMode = controller.gridMode();
  const stored = controller.current();
  // A join stored off this grid's lines draws aligned, so it reads aligned.
  const current = stored ? alignGridJoin(stored, gridMode) : null;
  const { toward, steps } =
    current ??
    alignGridJoin(
      { toward: DEFAULT_DIRECTION, steps: DEFAULT_STEPS },
      gridMode
    );
  const offered = GRID_JOIN_DIRECTIONS[
    isBoxGrid(gridMode ?? undefined) ? "box" : "diamond"
  ] as readonly JoinDirection[];

  const distance = (
    id: string,
    label: string,
    value: GridJoin["steps"]
  ): ContextMenuItem => ({
    id,
    label,
    icon: "fa-left-right",
    checked: current !== null && current.steps === value,
    keepOpen: true,
    action: () => controller.set({ toward, steps: value }),
  });

  return [
    {
      id: "grid-join-none",
      label: t("animation_menu_grid_join_one"),
      icon: "fa-border-none",
      checked: current === null,
      keepOpen: true,
      action: () => controller.set(null),
    },
    distance("grid-join-steps-1", t("animation_menu_grid_join_one_point"), 1),
    distance("grid-join-steps-2", t("animation_menu_grid_join_two_points"), 2),
    ...DIRECTIONS.filter((direction) => offered.includes(direction.toward)).map(
      (direction): ContextMenuItem => ({
        id: `grid-join-${direction.toward}`,
        label: direction.label(),
        icon: "fa-arrow-right",
        iconRotate: direction.rotate || undefined,
        checked: current !== null && current.toward === direction.toward,
        keepOpen: true,
        action: () => controller.set({ toward: direction.toward, steps }),
      })
    ),
  ];
}

/** The top-level "Grid join" submenu entry for a controller. */
export function buildGridJoinMenuItem(
  controller: GridJoinController
): ContextMenuItem {
  return {
    id: "grid-join-submenu",
    label: t("animation_menu_grid_join"),
    icon: "fa-table-columns",
    children: buildGridJoinChildren(controller),
  };
}
