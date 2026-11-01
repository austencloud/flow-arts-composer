/**
 * Settings → Display: the switch lists each section shows, and the one-line
 * summaries its drill-down box prints on phones and short screens. Both read
 * the same owners, so a box never names a switch its screen does not show.
 */

import { t } from "#lib/shared/i18n/i18n.svelte.js";
import { buildPictographContextMenuItems } from "#lib/shared/pictograph/shared/components/context-menu/pictograph-context-menu-builder.js";
import {
  isMenuItem,
  type ContextMenuItem,
} from "#lib/shared/components/context-menu/context-menu-types.js";
import type { VisibilityStateManager } from "#lib/shared/pictograph/shared/state/visibility-state.svelte.js";
import type { AnimationVisibilityStateManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
import {
  buildCardContentToggles,
  type CardContentComposition,
} from "#lib/shared/share/domain/card-content-toggles.js";

/** The long-press menu's submenus flattened into one row, in the order a
 *  reader scans the pictograph: grid and points, then its marks. */
const PICTOGRAPH_ORDER = [
  "toggle-grid",
  "toggle-hand-points",
  "toggle-non-radial",
  "toggle-step-numbers",
  "toggle-tka-glyph",
  "toggle-hand-tnd-glyph",
  "toggle-prop-tnd-glyph",
  "toggle-positions-glyph",
];

export function pictographSwitches(
  vm: VisibilityStateManager
): ContextMenuItem[] {
  const flat = buildPictographContextMenuItems({ visibilityManager: vm })
    .filter(isMenuItem)
    .flatMap((entry) => entry.children ?? [entry]);
  const byId = new Map(flat.map((item) => [item.id, item]));
  return PICTOGRAPH_ORDER.flatMap((id) => byId.get(id) ?? []);
}

/** The names of the switches that are on, or "None". */
function onList(labels: string[]): string {
  return labels.length > 0 ? labels.join(", ") : t("viewer_ui_none");
}

export function pictographSummary(vm: VisibilityStateManager): string {
  return onList(
    pictographSwitches(vm)
      .filter((item) => item.checked)
      .map((item) => item.label)
  );
}

/** The animation panel's display switches, in its tile order (DisplayPanel
 *  keeps its own labelled chips; these are the same keys and labels). */
export function animationSummary(vm: AnimationVisibilityStateManager): string {
  const on: [boolean, string][] = [
    [vm.getVisibility("props"), t("viewer_ui_props")],
    [vm.isGridVisible(), t("playback_audit_visual_grid")],
    [
      vm.getVisibility("leftPathLines") || vm.getVisibility("rightPathLines"),
      t("animation_display_hand_paths"),
    ],
    [vm.getVisibility("mandala"), t("share_mandala")],
    [vm.getVisibility("tkaGlyph"), t("animation_menu_tka_glyph")],
    [vm.getVisibility("elementalGlyph"), t("animation_menu_hand_tnd")],
    [vm.getVisibility("propElementalGlyph"), t("viewer_detail_prop_tnd")],
    [vm.getVisibility("stepNumbers"), t("animation_display_step_number")],
    [vm.getVisibility("wordHeader"), t("viewer_ui_word")],
    [vm.getVisibility("progressBar"), t("animation_menu_progress_bar")],
  ];
  return onList(on.filter(([active]) => active).map(([, label]) => label));
}

/** The card's theme first, then the marks that are on. */
export function cardSummary(
  composition: CardContentComposition,
  visibility: Parameters<typeof buildCardContentToggles>[1]["visibility"],
  darkMode: boolean
): string {
  const groups = buildCardContentToggles(composition, { visibility });
  const on = [...groups.header, ...groups.steps, ...groups.start]
    .filter((item) => item.active)
    .map((item) => item.label);
  const theme = darkMode ? t("viewer_detail_dark") : t("viewer_detail_light");
  return [theme, ...on].join(", ");
}
