import type {
  PostItemKind,
  PostKeyframeChannel,
} from "$lib/shared/media-composition/domain/post-project";

/**
 * Which tools the editor's one row offers, and which tool's panel is on
 * screen. The row changes with the selection; one panel shows at a time. On a
 * phone a panel opens only when asked for and takes the row's place; on a
 * wide screen the side panel always shows one, falling back to the
 * selection's first panel tool.
 */

/** Tools that open a panel. */
export type PostPanelToolId =
  | "videos"
  | "add"
  | "canvas"
  | "look"
  | "export"
  | "trim"
  | "timing"
  | "crop"
  | "speed"
  | "volume"
  | "layout"
  | "position"
  | "border"
  | "fade"
  | "effects"
  | "labels"
  | "shows"
  | "text"
  | "rename";

/** Tools that act at once. */
export type PostActionToolId =
  | "back"
  | "split"
  | "tutorial"
  | "beats"
  | "duplicate"
  | "delete";

export type PostToolId = PostPanelToolId | PostActionToolId;

/** What the row is for: the post itself, or one selected item. */
export interface PostToolSelection {
  /** `null` when nothing is selected. */
  kind: PostItemKind | null;
  /** A main-track clip whose layout (dual, breakdown, video only) applies. */
  hasLayout: boolean;
}

const ACTION_TOOLS = new Set<PostToolId>([
  "back",
  "split",
  "tutorial",
  "beats",
  "duplicate",
  "delete",
]);

export function isPanelTool(id: PostToolId): id is PostPanelToolId {
  return !ACTION_TOOLS.has(id);
}

const ITEM_TAIL: readonly PostToolId[] = [
  "position",
  "fade",
  "rename",
  "duplicate",
  "delete",
];

/** The row's tools, in order, for a selection. */
export function toolRow(selection: PostToolSelection): PostToolId[] {
  switch (selection.kind) {
    case null:
      return ["videos", "add", "canvas", "split", "tutorial", "look"];
    case "video":
      return [
        "back",
        "split",
        "trim",
        "crop",
        "speed",
        "volume",
        ...(selection.hasLayout ? (["layout"] as const) : []),
        "position",
        "border",
        "fade",
        "effects",
        "beats",
        "rename",
        "duplicate",
        "delete",
      ];
    case "animation":
      return ["back", "split", "labels", "timing", ...ITEM_TAIL];
    case "moves":
      return ["back", "split", "shows", "timing", ...ITEM_TAIL];
    case "text":
      return ["back", "split", "text", "timing", ...ITEM_TAIL];
    case "carousel":
    case "image":
    case "card":
      return ["back", "split", "timing", ...ITEM_TAIL];
  }
}

/** Panels the selection can show: its row's, plus Export for the post. */
export function availablePanels(
  selection: PostToolSelection
): PostPanelToolId[] {
  const panels = toolRow(selection).filter(isPanelTool);
  return selection.kind === null ? [...panels, "export"] : panels;
}

/** The first panel tool in the row, which a wide screen shows by default. */
export function defaultPanel(
  selection: PostToolSelection
): PostPanelToolId | null {
  return toolRow(selection).find(isPanelTool) ?? null;
}

/**
 * The panel on screen: the one asked for while the selection has it;
 * otherwise, on a wide screen, the selection's default, and on a phone none
 * (the row shows instead).
 */
export function shownPanel(
  active: PostPanelToolId | null,
  selection: PostToolSelection,
  wide: boolean
): PostPanelToolId | null {
  if (active && availablePanels(selection).includes(active)) return active;
  return wide ? defaultPanel(selection) : null;
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
