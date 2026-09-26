import { t } from "$lib/shared/i18n/i18n.svelte.js";
import type {
  PostItem,
  PostItemKind,
  PostMovesMode,
  PostProject,
} from "$lib/shared/media-composition/domain/post-project";
import type { PostToolId } from "./post-editor-tools";

/** The names and icons every part of the editor shows for an item kind. */

export const ITEM_KIND_ICON: Record<PostItemKind, string> = {
  video: "fa-film",
  card: "fa-id-card",
  animation: "fa-person-running",
  moves: "fa-shapes",
  carousel: "fa-table-cells",
  text: "fa-font",
};

export const MANDALA_ICON = "fa-sun";

export function itemKindLabel(kind: PostItemKind, mode?: PostMovesMode): string {
  switch (kind) {
    case "video":
      return t("post_editor_kind_video");
    case "card":
      return t("post_editor_kind_card");
    case "animation":
      return t("post_editor_kind_animation");
    case "moves":
      return mode === "mandala"
        ? t("post_editor_kind_mandala")
        : t("post_editor_kind_moves");
    case "carousel":
      return t("post_editor_kind_carousel");
    case "text":
      return t("post_editor_kind_text");
  }
}

export function itemIcon(item: PostItem): string {
  return item.kind === "moves" && item.mode === "mandala"
    ? MANDALA_ICON
    : ITEM_KIND_ICON[item.kind];
}

/** The tool row's icons, one per tool. */
export const TOOL_ICON: Record<PostToolId, string> = {
  videos: "fa-photo-film",
  add: "fa-plus",
  look: "fa-palette",
  export: "fa-file-export",
  trim: "fa-arrows-left-right-to-line",
  timing: "fa-clock",
  crop: "fa-crop-simple",
  speed: "fa-gauge-high",
  volume: "fa-volume-high",
  layout: "fa-table-cells-large",
  position: "fa-up-down-left-right",
  fade: "fa-circle-half-stroke",
  labels: "fa-hashtag",
  shows: "fa-shapes",
  text: "fa-font",
  rename: "fa-pen",
  back: "fa-arrow-left",
  split: "fa-scissors",
  tutorial: "fa-wand-magic-sparkles",
  beats: "fa-drum",
  duplicate: "fa-clone",
  delete: "fa-trash-can",
};

/** The short name under a tool's icon, also its panel's title. */
export function toolLabel(id: PostToolId): string {
  switch (id) {
    case "videos":
      return t("post_editor_videos");
    case "add":
      return t("post_editor_add");
    case "look":
      return t("post_editor_tool_look");
    case "export":
      return t("post_editor_export");
    case "trim":
      return t("post_editor_tool_trim");
    case "timing":
      return t("post_editor_tool_timing");
    case "crop":
      return t("post_editor_tool_crop");
    case "speed":
      return t("post_editor_speed");
    case "volume":
      return t("post_editor_volume");
    case "layout":
      return t("post_editor_look");
    case "position":
      return t("post_editor_tool_position");
    case "fade":
      return t("post_editor_tool_fade");
    case "labels":
      return t("post_editor_tool_labels");
    case "shows":
      return t("post_editor_moves_show");
    case "text":
      return t("post_editor_kind_text");
    case "rename":
      return t("post_editor_tool_rename");
    case "back":
      return t("post_editor_tool_back");
    case "split":
      return t("post_editor_split");
    case "tutorial":
      return t("post_editor_tutorial");
    case "beats":
      return t("post_editor_beats");
    case "duplicate":
      return t("post_editor_duplicate");
    case "delete":
      return t("post_editor_delete");
  }
}

/**
 * What a block or a heading calls an item: Austen's own name for it, the
 * words of a text, the take a clip is cut from, or its kind.
 */
export function itemDisplayLabel(item: PostItem, project: PostProject): string {
  if (item.label) return item.label;
  if (item.kind === "text" && item.text.trim()) return item.text.trim();
  if (item.kind === "video") {
    const take = project.takes.find((entry) => entry.id === item.takeId);
    if (take) return take.label;
  }
  return itemKindLabel(item.kind, item.kind === "moves" ? item.mode : undefined);
}
