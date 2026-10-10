import type { ItemKindUi } from "@austencloud/video-editor";
import {
  faHeading,
  faPersonRunning,
  faShapes,
  faSun,
  faTableCells,
} from "@austencloud/video-editor/icons";

/**
 * The icons and names the editor shows for tka's kinds, as post-editor-labels.ts
 * gave them (`ITEM_KIND_ICON`, `MANDALA_ICON`, `itemKindLabel`).
 */
export const TKA_KIND_UI: Record<
  "animation" | "moves" | "carousel" | "titles",
  ItemKindUi
> = {
  animation: {
    icon: faPersonRunning,
    label: (t) => t("post_editor_kind_animation"),
  },
  moves: {
    icon: faShapes,
    iconFor: (item) =>
      item.kind === "moves" && item.mode === "mandala" ? faSun : faShapes,
    label: (t, item) =>
      item?.kind === "moves" && item.mode === "mandala"
        ? t("post_editor_kind_mandala")
        : t("post_editor_kind_moves"),
  },
  carousel: {
    icon: faTableCells,
    label: (t) => t("post_editor_kind_carousel"),
  },
  titles: {
    icon: faHeading,
    label: (t) => t("post_editor_kind_titles"),
  },
};
