import type { PluginTool, VideoEditorPlugin } from "@austencloud/video-editor";
import type { StringKey, Translate } from "@austencloud/video-editor/strings";
import type {
  PostFraming,
  PostItem,
  PostItemKind,
  PostKeyframeChannel,
  PostProject,
  PostChannelValue,
  PostEasingPresetId,
} from "@austencloud/video-editor/core";
import {
  faArrowsLeftRightToLine,
  faBorderTopLeft,
  faCircleHalfStroke,
  faClock,
  faClone,
  faCropSimple,
  faFileExport,
  faFilm,
  faFont,
  faGaugeHigh,
  faIdCard,
  faImage,
  faMusic,
  faPen,
  faPhotoFilm,
  faPlus,
  faRightLeft,
  faRulerCombined,
  faScissors,
  faTrashCan,
  faUpDownLeftRight,
  faVolumeHigh,
  faWandSparkles,
  faXmark,
  type IconDefinition,
} from "@austencloud/video-editor/icons";
import type { PostMovesMode } from "$lib/shared/post-studio-plugin";
import type {
  CoreActionToolId,
  CorePanelToolId,
  PostToolId,
} from "./post-editor-tools";

/**
 * The names and icons every part of the editor shows for an item kind. The
 * core kinds hold their icons here; a plugin kind draws its own (`ui.icon`).
 */

export const ITEM_KIND_ICON: Pick<
  Record<PostItemKind, IconDefinition>,
  "video" | "image" | "card" | "text"
> = {
  video: faFilm,
  image: faImage,
  card: faIdCard,
  text: faFont,
};

/** `t` with a plain string key, the shape a plugin's `label(t)` takes. */
export function translateKey(t: Translate): (key: string) => string {
  return (key) => t(key as StringKey);
}

export function itemKindLabel(
  t: Translate,
  kind: PostItemKind,
  mode?: PostMovesMode,
  plugin: VideoEditorPlugin | null = null,
  item: PostItem | null = null
): string {
  switch (kind) {
    case "video":
      return t("post_editor_kind_video");
    case "image":
      return "Image";
    case "card":
      return t("post_editor_kind_card");
    case "text":
      return t("post_editor_kind_text");
    default:
      return (
        plugin?.itemKinds
          .find((d) => d.kind === kind)
          ?.ui?.label?.(translateKey(t), item) ??
        plugin?.itemKinds.find((d) => d.kind === kind)?.label ??
        kind
      );
  }
}

/** An item's icon: its core kind's, else the one its plugin gives the kind. */
export function itemIcon(
  item: PostItem,
  plugin: VideoEditorPlugin | null = null
): IconDefinition | null {
  const core: Partial<Record<PostItemKind, IconDefinition>> = ITEM_KIND_ICON;
  if (core[item.kind]) return core[item.kind]!;
  const ui = plugin?.itemKinds.find((d) => d.kind === item.kind)?.ui;
  return ui?.iconFor?.(item) ?? ui?.icon ?? null;
}

/** The tool row's icons for the core tools; a plugin tool brings its own. */
export const TOOL_ICON: Record<
  CorePanelToolId | CoreActionToolId,
  IconDefinition
> = {
  videos: faPhotoFilm,
  add: faPlus,
  canvas: faRulerCombined,
  export: faFileExport,
  trim: faArrowsLeftRightToLine,
  timing: faClock,
  crop: faCropSimple,
  speed: faGaugeHigh,
  volume: faVolumeHigh,
  position: faUpDownLeftRight,
  border: faBorderTopLeft,
  fade: faCircleHalfStroke,
  transition: faRightLeft,
  effects: faWandSparkles,
  text: faFont,
  rename: faPen,
  music: faMusic,
  back: faXmark,
  split: faScissors,
  duplicate: faClone,
  delete: faTrashCan,
};

/** A tool's icon: a core tool's, else the one the plugin's tool of that id gives it. */
export function toolIcon(
  id: PostToolId,
  pluginTools: readonly PluginTool[] = []
): IconDefinition | null {
  const core: Partial<Record<string, IconDefinition>> = TOOL_ICON;
  return core[id] ?? pluginTools.find((tool) => tool.id === id)?.icon ?? null;
}

/** The short name under a tool's icon, also its panel's title. */
export function toolLabel(
  t: Translate,
  id: PostToolId,
  plugin: VideoEditorPlugin | null = null
): string {
  switch (id) {
    case "transition":
      return t("post_editor_transition");
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
    case "titles":
      return t("post_editor_tool_titles");
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
    case "music":
      return "Music";
    case "back":
      return t("post_editor_tool_back");
    case "split":
      return t("post_editor_split");
    case "beats":
      return t("post_editor_beats");
    case "duplicate":
      return t("post_editor_duplicate");
    case "delete":
      return t("post_editor_delete");
    default:
      return (
        plugin?.ui?.tools
          ?.find((tool) => tool.id === id)
          ?.label(translateKey(t)) ?? id
      );
  }
}

/**
 * What a block or a heading calls an item: Austen's own name for it, the
 * words of a text, the take a clip is cut from, or its kind.
 */
export function itemDisplayLabel(
  t: Translate,
  item: PostItem,
  project: PostProject,
  plugin: VideoEditorPlugin | null = null
): string {
  if (item.label) return item.label;
  if (item.kind === "text" && item.text.trim()) return item.text.trim();
  if (item.kind === "video") {
    const take = project.takes.find((entry) => entry.id === item.takeId);
    if (take) return take.label;
  }
  return itemKindLabel(
    t,
    item.kind,
    item.kind === "moves" ? item.mode : undefined,
    plugin,
    item
  );
}

/** The tool whose panel edits a channel, so a keyframe row shares its name and icon. */
const CHANNEL_TOOL: Record<PostKeyframeChannel, CorePanelToolId> = {
  framing: "crop",
  sourceGeometry: "position",
  box: "position",
  opacity: "fade",
};

export function channelLabel(
  t: Translate,
  channel: PostKeyframeChannel
): string {
  return toolLabel(t, CHANNEL_TOOL[channel]);
}

export function channelIcon(channel: PostKeyframeChannel): IconDefinition {
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

export function easingPresetLabel(
  t: Translate,
  id: PostEasingPresetId
): string {
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
