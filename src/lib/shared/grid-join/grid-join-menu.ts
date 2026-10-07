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
import type { GridJoinController } from "./grid-join-controller";
import {
  gridJoinSelection,
  offeredGridJoinDirections,
} from "./grid-join-choices";

/** The submenu's children, all radio-style and keeping the menu open. */
export function buildGridJoinChildren(
  controller: GridJoinController
): ContextMenuItem[] {
  const gridMode = controller.gridMode();
  const { current, toward, steps } = gridJoinSelection(
    controller.current(),
    gridMode
  );

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
    ...offeredGridJoinDirections(gridMode).map(
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
