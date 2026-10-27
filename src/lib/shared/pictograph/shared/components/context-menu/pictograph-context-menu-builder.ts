/**
 * Pictograph Context Menu Builder
 *
 * Inline visibility toggles for pictograph right-click menu.
 * Submenus for Grid & Points, Grid join (opt-in), Glyphs. Direct toggle for Step Numbers.
 * Optional arrow adjustment items (admin only).
 *
 * This is the one list of pictograph switches. Settings → Display renders the
 * same entries as picture tiles (MenuItemTileGrid), so a row added here shows
 * up in both places and a label translated here reads the same in both. Every
 * switch carries an icon: the tile draws it as its picture.
 */

import type {
  ContextMenuEntry,
  ContextMenuItem,
} from "#lib/shared/components/context-menu/context-menu-types.js";
import type { VisibilityStateManager } from "../../state/visibility-state.svelte";
import { HandSide } from "../../domain/enums/pictograph-enums";
import type { GridJoinController } from "#lib/shared/grid-join/grid-join-controller.js";
import { buildGridJoinMenuItem } from "#lib/shared/grid-join/grid-join-menu.js";
import { t } from "#lib/shared/i18n/i18n.svelte.js";

interface PictographContextMenuDeps {
  visibilityManager: VisibilityStateManager;
  onAdjustArrow?: (hand: HandSide) => void;
  /** True if the user is admin and the pictograph has motions (not a blank/start beat) */
  showArrowAdjustment?: boolean;
  /**
   * Card surfaces pass false: their step-number overlay reads
   * ImageCompositionStateManager.addStepNumbers, NOT the visibility manager's
   * stepNumbers — showing this toggle there would be a lying control.
   */
  includeStepNumbers?: boolean;
  /**
   * Surfaces that can change the sequence's join pass its controller; the
   * "Grid join" submenu (the one the animation menu offers) follows Grid &
   * Points. Without one, no join choice is shown.
   */
  gridJoin?: GridJoinController | null;
}

function buildGridChildren(vm: VisibilityStateManager): ContextMenuItem[] {
  return [
    {
      id: "toggle-grid",
      label: t("playback_audit_visual_grid"),
      icon: "fa-table-cells",
      checked: vm.getGridVisibility(),
      keepOpen: true,
      action: () => vm.setGridVisibility(!vm.getGridVisibility()),
    },
    {
      id: "toggle-hand-points",
      label: t("learn_ui_hand_points"),
      icon: "fa-circle-dot",
      checked: vm.getHandPointVisibility() !== "none",
      keepOpen: true,
      action: () =>
        vm.setHandPointVisibility(
          vm.getHandPointVisibility() === "none" ? "all" : "none"
        ),
    },
    {
      id: "toggle-non-radial",
      label: t("viewer_ui_non_radial"),
      icon: "fa-ellipsis",
      checked: vm.getNonRadialVisibility(),
      keepOpen: true,
      action: () => vm.setNonRadialVisibility(!vm.getNonRadialVisibility()),
    },
  ];
}

function buildGlyphChildren(vm: VisibilityStateManager): ContextMenuItem[] {
  return [
    {
      id: "toggle-tka-glyph",
      label: t("pictograph_menu_tka"),
      icon: "fa-font",
      checked: vm.getRawGlyphVisibility("tkaGlyph"),
      keepOpen: true,
      action: () =>
        vm.setGlyphVisibility(
          "tkaGlyph",
          !vm.getRawGlyphVisibility("tkaGlyph")
        ),
    },
    // Two timing-and-direction glyphs, one per relationship. The HAND pair is
    // the letter-based TnD mark plus its element (bottom-right); they move
    // together, as the card's "TnD" chip already does. The PROP pair is its
    // own key in the top-right corner.
    {
      id: "toggle-hand-tnd-glyph",
      label: t("animation_menu_hand_tnd"),
      icon: "fa-hand",
      checked: vm.getRawGlyphVisibility("tndGlyph"),
      keepOpen: true,
      action: () => {
        const next = !vm.getRawGlyphVisibility("tndGlyph");
        vm.setGlyphVisibility("tndGlyph", next);
        vm.setGlyphVisibility("elementalGlyph", next);
      },
    },
    {
      id: "toggle-prop-tnd-glyph",
      label: t("viewer_detail_prop_tnd"),
      icon: "fa-wand-magic-sparkles",
      checked: vm.getRawGlyphVisibility("propTndGlyph"),
      keepOpen: true,
      action: () =>
        vm.setGlyphVisibility(
          "propTndGlyph",
          !vm.getRawGlyphVisibility("propTndGlyph")
        ),
    },
    {
      id: "toggle-positions-glyph",
      label: t("browse_chip_placements"),
      icon: "fa-location-dot",
      checked: vm.getRawGlyphVisibility("placementsGlyph"),
      keepOpen: true,
      action: () =>
        vm.setGlyphVisibility(
          "placementsGlyph",
          !vm.getRawGlyphVisibility("placementsGlyph")
        ),
    },
    // The two marks the card export panel offered and this menu did not, so
    // every pictograph switch is reachable from a pictograph itself.
    {
      id: "toggle-reversals",
      label: t("share_overlay_reversals"),
      icon: "fa-rotate-left",
      checked: vm.getRawGlyphVisibility("reversalIndicators"),
      keepOpen: true,
      action: () =>
        vm.setGlyphVisibility(
          "reversalIndicators",
          !vm.getRawGlyphVisibility("reversalIndicators")
        ),
    },
    {
      id: "toggle-hand-color-key",
      label: t("viewer_ui_hand_key"),
      icon: "fa-palette",
      checked: vm.getRawGlyphVisibility("handColorKey"),
      keepOpen: true,
      action: () =>
        vm.setGlyphVisibility(
          "handColorKey",
          !vm.getRawGlyphVisibility("handColorKey")
        ),
    },
  ];
}

export function buildPictographContextMenuItems(
  deps: PictographContextMenuDeps
): ContextMenuEntry[] {
  const vm = deps.visibilityManager;

  const items: ContextMenuEntry[] = [
    {
      id: "grid-submenu",
      label: t("pictograph_menu_grid_points"),
      icon: "fa-border-all",
      children: buildGridChildren(vm),
    },
    ...(deps.gridJoin ? [buildGridJoinMenuItem(deps.gridJoin)] : []),
    {
      id: "glyphs-submenu",
      label: t("viewer_ui_glyphs"),
      icon: "fa-font",
      children: buildGlyphChildren(vm),
    },
  ];

  if (deps.includeStepNumbers !== false) {
    items.push({ type: "separator" });
    items.push({
      id: "toggle-step-numbers",
      label: t("animation_menu_step_numbers"),
      icon: "fa-list-ol",
      checked: vm.getStepNumbersVisibility(),
      keepOpen: true,
      action: () => vm.setStepNumbersVisibility(!vm.getStepNumbersVisibility()),
    });
  }

  if (deps.showArrowAdjustment && deps.onAdjustArrow) {
    items.push({ type: "separator" });
    items.push({
      id: "adjust-left-arrow",
      label: t("pictograph_menu_adjust_left_arrow"),
      icon: "fa-arrows-alt",
      iconColor: "#2563eb",
      action: () => deps.onAdjustArrow!(HandSide.LEFT),
    });
    items.push({
      id: "adjust-right-arrow",
      label: t("pictograph_menu_adjust_right_arrow"),
      icon: "fa-arrows-alt",
      iconColor: "#dc2626",
      action: () => deps.onAdjustArrow!(HandSide.RIGHT),
    });
  }

  return items;
}
