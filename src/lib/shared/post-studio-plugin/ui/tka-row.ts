import { findItem, type PostItem } from "@austencloud/video-editor/core";
import type { VideoEditorState } from "@austencloud/video-editor";
import { tkaEditorOf } from "./tka-editor-context";

/** What tka's rows depend on, worked out by the workspace before 2B (PostEditorWorkspace.svelte 1142-1164). */
export interface TkaRowFacts {
  isQrImage: boolean;
  isTunnel: boolean;
  isTunnelHook: boolean;
  hasBackdrop: boolean;
  hasLayout: boolean;
}

export const NO_FACTS: TkaRowFacts = {
  isQrImage: false,
  isTunnel: false,
  isTunnelHook: false,
  hasBackdrop: false,
  hasLayout: false,
};

export function tkaRowFacts(
  item: PostItem,
  editor: VideoEditorState
): TkaRowFacts {
  const tka = tkaEditorOf(editor);
  // A tunnel folded into its animation has its own block, which carries its
  // speed and framing; only a hook saved as a whole item keeps them here.
  const tunnel = editor.selectedPart === "tunnel";
  const wholeHook =
    item.kind === "animation" && item.tunnelHook?.seconds === undefined;
  return {
    isQrImage: item.kind === "image" && (tka?.isQrImage(item.imageId) ?? false),
    isTunnel: tunnel,
    isTunnelHook:
      item.kind === "animation" && !!item.tunnelHook && (tunnel || wholeHook),
    hasBackdrop:
      item.kind === "animation" &&
      !!item.tunnelHook?.backdrop &&
      (tunnel || wholeHook),
    hasLayout:
      item.kind === "video" &&
      findItem(editor.project, item.id)?.trackIndex === 0,
  };
}

const TAIL = ["position", "fade", "rename", "duplicate", "delete"];

function insertAfter(
  row: readonly string[],
  anchor: string,
  ids: readonly string[]
): string[] {
  const at = row.indexOf(anchor) + 1;
  return [...row.slice(0, at), ...ids, ...row.slice(at)];
}

/** tka's rows, built from the core row so the core keeps its own order. */
export function tkaRow(
  item: PostItem | null,
  core: readonly string[],
  facts: TkaRowFacts
): readonly string[] {
  if (item === null) return core[0] === "videos" ? [...core, "look"] : core;
  switch (item.kind) {
    case "video":
      return insertAfter(
        insertAfter(core, "volume", facts.hasLayout ? ["layout"] : []),
        "effects",
        ["beats"]
      );
    case "image":
      return facts.isQrImage
        ? insertAfter(core, "split", ["appearance"])
        : core;
    case "card":
      return insertAfter(core, "split", ["appearance", "sequence"]);
    case "animation":
      if (facts.isTunnel)
        return [
          "back",
          "appearance",
          "speed",
          ...(facts.hasBackdrop ? ["crop"] : []),
          "delete",
        ];
      return [
        "back",
        "split",
        "appearance",
        "sequence",
        ...(facts.isTunnelHook ? ["speed"] : []),
        ...(facts.hasBackdrop ? ["crop"] : []),
        "timing",
        ...TAIL,
      ];
    case "moves":
      return [
        "back",
        "split",
        "appearance",
        "shows",
        "sequence",
        "timing",
        ...TAIL,
      ];
    case "titles":
      return ["back", "titles", "timing", ...TAIL];
    default:
      return core;
  }
}
