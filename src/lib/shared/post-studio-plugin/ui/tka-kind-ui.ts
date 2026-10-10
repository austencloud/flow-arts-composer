import type { ItemKindUi } from "@austencloud/video-editor";
import {
  faHeading,
  faPersonRunning,
  faShapes,
  faSun,
  faTableCells,
} from "@austencloud/video-editor/icons";
import TkaKindTools from "./TkaKindTools.svelte";

/**
 * The icons and names the editor shows for tka's kinds, as post-editor-labels.ts
 * gave them (`ITEM_KIND_ICON`, `MANDALA_ICON`, `itemKindLabel`), and the item
 * tool's panels for the animation, moves and titles kinds.
 */
export const TKA_KIND_UI: Record<
  "animation" | "moves" | "carousel" | "titles",
  ItemKindUi
> = {
  animation: {
    icon: faPersonRunning,
    label: (t) => t("post_editor_kind_animation"),
    toolPanel: TkaKindTools,
  },
  moves: {
    icon: faShapes,
    iconFor: (item) =>
      item.kind === "moves" && item.mode === "mandala" ? faSun : faShapes,
    label: (t, item) =>
      item?.kind === "moves" && item.mode === "mandala"
        ? t("post_editor_kind_mandala")
        : t("post_editor_kind_moves"),
    toolPanel: TkaKindTools,
  },
  carousel: {
    icon: faTableCells,
    label: (t) => t("post_editor_kind_carousel"),
  },
  titles: {
    icon: faHeading,
    label: (t) => t("post_editor_kind_titles"),
    toolPanel: TkaKindTools,
  },
};
