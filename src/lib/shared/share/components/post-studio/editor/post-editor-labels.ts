import { t } from "$lib/shared/i18n/i18n.svelte.js";
import type {
  PostFraming,
  PostItem,
  PostItemKind,
  PostKeyframeChannel,
  PostMovesMode,
  PostProject,
} from "$lib/shared/media-composition/domain/post-project";
import type {
  PostChannelValue,
  PostEasingPresetId,
} from "$lib/shared/media-composition/domain/post-project-keyframes";
import type { PostToolId } from "./post-editor-tools";

/** The names and icons every part of the editor shows for an item kind. */

export const ITEM_KIND_ICON: Record<PostItemKind, string> = {
  video: "fa-film",
  image: "fa-image",
  card: "fa-id-card",
  animation: "fa-person-running",
  moves: "fa-shapes",
  carousel: "fa-table-cells",
  text: "fa-font",
};

export const MANDALA_ICON = "fa-sun";

export function itemKindLabel(
  kind: PostItemKind,
  mode?: PostMovesMode
): string {
  switch (kind) {
    case "video":
      return t("post_editor_kind_video");
    case "image":
      return "Image";
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
  canvas: "fa-ruler-combined",
  look: "fa-palette",
  export: "fa-file-export",
  trim: "fa-arrows-left-right-to-line",
  timing: "fa-clock",
  crop: "fa-crop-simple",
  speed: "fa-gauge-high",
  volume: "fa-volume-high",
  layout: "fa-table-cells-large",
  position: "fa-up-down-left-right",
  border: "fa-border-top-left",
  fade: "fa-circle-half-stroke",
  effects: "fa-wand-sparkles",
  labels: "fa-hashtag",
  appearance: "fa-sliders",
  shows: "fa-shapes",
  sequence: "fa-shuffle",
  text: "fa-font",
  rename: "fa-pen",
  back: "fa-arrow-left",
  split: "fa-scissors",
  tutorial: "fa-wand-magic-sparkles",
  template: "fa-copy",
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
    case "canvas":
      return t("post_editor_tool_canvas");
    case "look":
      return "Animation defaults";
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
    case "border":
      return t("post_editor_tool_border");
    case "fade":
      return t("post_editor_tool_fade");
    case "effects":
      return t("post_editor_tool_effects");
    case "labels":
      return t("post_editor_tool_labels");
    case "appearance":
      return "Appearance";
    case "shows":
      return t("post_editor_moves_show");
    case "sequence":
      return "Sequence";
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
    case "template":
      return t("post_editor_use_omega_template");
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
  return itemKindLabel(
    item.kind,
    item.kind === "moves" ? item.mode : undefined
  );
}

/** The tool whose panel edits a channel, so a keyframe row shares its name and icon. */
const CHANNEL_TOOL: Record<PostKeyframeChannel, PostToolId> = {
  framing: "crop",
  sourceGeometry: "position",
  box: "position",
  opacity: "fade",
};

export function channelLabel(channel: PostKeyframeChannel): string {
  return toolLabel(CHANNEL_TOOL[channel]);
}

export function channelIcon(channel: PostKeyframeChannel): string {
  return TOOL_ICON[CHANNEL_TOOL[channel]];
}

/** The one number a channel's value reads as: zoom for Crop, opacity for Fade. */
export function channelValueMeasure<Ch extends PostKeyframeChannel>(
  channel: Ch,
  value: PostChannelValue[Ch]
): number | null {
  if (channel === "framing") return (value as PostFraming).zoom;
  if (channel === "opacity") return value as number;
  return null;
}

/**
 * A channel's value as one short reading: the zoom for Crop and the opacity
 * for Fade. Position has no single number worth showing, so it has none.
 */
export function channelValueText<Ch extends PostKeyframeChannel>(
  channel: Ch,
  value: PostChannelValue[Ch]
): string | null {
  const measure = channelValueMeasure(channel, value);
  return measure === null ? null : `${Math.round(measure * 100)}%`;
}

export function easingPresetLabel(id: PostEasingPresetId): string {
  switch (id) {
    case "linear":
      return t("post_curve_preset_linear");
    case "ease-in":
      return t("post_curve_preset_ease_in");
    case "ease-out":
      return t("post_curve_preset_ease_out");
    case "ease-in-out":
      return t("post_curve_preset_ease_in_out");
    case "smooth":
      return t("post_curve_preset_smooth");
    case "overshoot":
      return t("post_curve_preset_overshoot");
    case "hold":
      return t("post_curve_preset_hold");
  }
}
