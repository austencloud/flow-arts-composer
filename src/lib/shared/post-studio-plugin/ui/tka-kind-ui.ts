import type { ItemKindUi } from "@austencloud/video-editor";
import {
  faArrowsUpDownLeftRight,
  faHeading,
  faImages,
  faWandMagicSparkles,
} from "@austencloud/video-editor/icons";
import { TUNNEL_PART } from "./tka-parts";
import TkaKindTools from "./TkaKindTools.svelte";

/**
 * The icons and names the editor shows for tka's kinds, and the item tool's
 * panels for the animation, moves and titles kinds. The icons are the glyphs
 * the timeline's blocks drew for these kinds. An animation's opening tunnel
 * is its part.
 */
export const TKA_KIND_UI: Record<
  "animation" | "moves" | "carousel" | "titles",
  ItemKindUi
> = {
  animation: {
    icon: faWandMagicSparkles,
    label: (t) => t("post_editor_kind_animation"),
    toolPanel: TkaKindTools,
    parts: [TUNNEL_PART],
  },
  moves: {
    icon: faArrowsUpDownLeftRight,
    label: (t, item) =>
      item?.kind === "moves" && item.mode === "mandala"
        ? t("post_editor_kind_mandala")
        : t("post_editor_kind_moves"),
    toolPanel: TkaKindTools,
  },
  carousel: {
    icon: faImages,
    label: (t) => t("post_editor_kind_carousel"),
  },
  titles: {
    icon: faHeading,
    label: (t) => t("post_editor_kind_titles"),
    toolPanel: TkaKindTools,
  },
};
