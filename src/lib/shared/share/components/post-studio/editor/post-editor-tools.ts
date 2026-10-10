import type {
  PluginTool,
  VideoEditorPlugin,
  VideoEditorState,
} from "@austencloud/video-editor";
import type {
  PostItem,
  PostItemKind,
  PostKeyframeChannel,
} from "@austencloud/video-editor/core";

/**
 * Which tools the editor's one row offers, and which tool's panel is on
 * screen. The row changes with the selection; one panel shows at a time. On a
 * phone a panel opens only when asked for and takes the row's place; on a
 * wide screen the side panel always shows one, falling back to the
 * selection's first panel tool.
 */

/** The core tools that open a panel. */
export type CorePanelToolId =
  | "videos"
  | "add"
  | "canvas"
  | "export"
  | "trim"
  | "timing"
  | "crop"
  | "speed"
  | "volume"
  | "position"
  | "border"
  | "fade"
  | "transition"
  | "effects"
  | "text"
  | "rename"
  | "music";

/** The core tools that act at once. */
export type CoreActionToolId = "back" | "split" | "duplicate" | "delete";

/** A tool that opens a panel: a core one or a plugin's. */
export type PostPanelToolId = string;

/** A tool that acts at once: a core one or a plugin's. */
export type PostActionToolId = string;

/** A core or plugin tool id. */
export type PostToolId = string;

/** What the row is for: the post itself, or one selected item. */
export interface PostToolSelection {
  /** `null` when nothing is selected. */
  kind: PostItemKind | null;
  /** The music under the post is selected; it is no item, so `kind` is null. */
  music?: boolean;
}

const ACTION_TOOLS = new Set<string>(["back", "split", "duplicate", "delete"]);

export function isPanelTool(
  id: string,
  tools: readonly PluginTool[] = []
): boolean {
  if (ACTION_TOOLS.has(id)) return false;
  return tools.find((tool) => tool.id === id)?.type !== "action";
}

const ITEM_TAIL: readonly PostToolId[] = [
  "position",
  "fade",
  "rename",
  "duplicate",
  "delete",
];

/** The core row for a selection; a plugin arranges it through `ui.toolRow`. */
export function coreToolRow(selection: PostToolSelection): string[] {
  if (selection.music) return ["back", "music", "delete"];
  switch (selection.kind) {
    case null:
      return ["videos", "add", "canvas", "split"];
    case "video":
      return [
        "back",
        "split",
        "trim",
        "crop",
        "speed",
        "volume",
        "position",
        "border",
        "fade",
        "effects",
        "rename",
        "duplicate",
        "delete",
      ];
    case "text":
      return ["back", "split", "text", "timing", ...ITEM_TAIL];
    default:
      return ["back", "split", "timing", ...ITEM_TAIL];
  }
}

/** The row's tools, in order, for a selection: the core row as the plugin arranges it. */
export function toolRow(
  selection: PostToolSelection,
  item: PostItem | null,
  plugin: VideoEditorPlugin | null,
  editor: VideoEditorState
): string[] {
  const core = coreToolRow(selection);
  return [...(plugin?.ui?.toolRow?.(item, core, editor) ?? core)];
}

/** Panels the selection can show: its row's, plus Export for the post. */
export function availablePanels(
  selection: PostToolSelection,
  row: readonly string[],
  tools: readonly PluginTool[] = []
): PostPanelToolId[] {
  const panels = row.filter((id) => isPanelTool(id, tools));
  if (selection.music) return panels;
  if (selection.kind === null) return [...panels, "export"];
  return ["video", "image", "card", "animation", "moves", "carousel"].includes(
    selection.kind
  )
    ? [...panels, "transition"]
    : panels;
}

/** The first panel tool in the row, which a wide screen shows by default. */
export function defaultPanel(
  row: readonly string[],
  tools: readonly PluginTool[] = []
): PostPanelToolId | null {
  return row.find((id) => isPanelTool(id, tools)) ?? null;
}

/**
 * The panel on screen: the one asked for while the selection has it;
 * otherwise, on a wide screen, the selection's default, and on a phone none
 * (the row shows instead).
 */
export function shownPanel(
  active: PostPanelToolId | null,
  selection: PostToolSelection,
  row: readonly string[],
  wide: boolean,
  tools: readonly PluginTool[] = []
): PostPanelToolId | null {
  if (active && availablePanels(selection, row, tools).includes(active))
    return active;
  return wide ? defaultPanel(row, tools) : null;
}

/** The panel's keyframe channel, if it edits an animatable value. */
export function panelChannel(
  panel: PostPanelToolId | null
): PostKeyframeChannel | null {
  switch (panel) {
    case "crop":
      return "framing";
    case "position":
      return "box";
    case "fade":
      return "opacity";
    default:
      return null;
  }
}

/**
 * The channel the K key keys: the one on screen, else framing for a video
 * and the box for anything else.
 */
export function keyframeChannelFor(
  panel: PostPanelToolId | null,
  kind: PostItemKind
): PostKeyframeChannel {
  const shown = panelChannel(panel);
  if (shown === "framing" && kind !== "video") return "box";
  return shown ?? (kind === "video" ? "framing" : "box");
}
