import type {
  PluginAddItem,
  VideoEditorState,
} from "@austencloud/video-editor";
import {
  faCircleNodes,
  faHeading,
  faPersonRunning,
  faShapes,
  faSun,
  faTableCells,
  faXmark,
} from "@austencloud/video-editor/icons";
import {
  newItemStart,
  overlayAt,
} from "$lib/shared/share/components/post-studio/editor/post-editor-add";
import { tkaEditorOf } from "./tka-editor-context";
import { TKA_KIND_UI } from "./tka-kind-ui";

function overlay(
  editor: VideoEditorState,
  spec: Parameters<typeof overlayAt>[1]
): string | null {
  const at = newItemStart(editor.durationSeconds, editor.previewSeconds);
  return editor.addOverlay(overlayAt(editor.project, spec, at, true))
    ? spec.kind
    : null;
}

const always = () => true;

export const TKA_ADD_ITEMS: Readonly<Record<string, PluginAddItem>> = {
  animation: {
    id: "animation",
    icon: faPersonRunning,
    label: (t) => TKA_KIND_UI.animation.label!(t, null),
    available: always,
    add: (e) => overlay(e, { kind: "animation", overlay: true }),
  },
  moves: {
    id: "moves",
    icon: faShapes,
    label: (t) => t("post_editor_kind_moves"),
    available: always,
    add: (e) => overlay(e, { kind: "moves", mode: "arrows" }),
  },
  mandala: {
    id: "mandala",
    icon: faSun,
    label: (t) => t("post_editor_kind_mandala"),
    available: always,
    add: (e) => overlay(e, { kind: "moves", mode: "mandala" }),
  },
  carousel: {
    id: "carousel",
    icon: faTableCells,
    label: (t) => TKA_KIND_UI.carousel.label!(t, null),
    available: always,
    add: (e) => overlay(e, { kind: "carousel" }),
  },
  titles: {
    id: "titles",
    icon: faHeading,
    label: (t) => TKA_KIND_UI.titles.label!(t, null),
    available: always,
    add: (e) =>
      tkaEditorOf(e)?.wrapper.addTitles(
        newItemStart(e.durationSeconds, e.previewSeconds)
      )
        ? "titles"
        : null,
  },
  hookAdd: {
    id: "tunnel-hook",
    icon: faCircleNodes,
    label: (t) => t("post_editor_add_tunnel_hook"),
    available: (e) => !tkaEditorOf(e)?.wrapper.tunnelHook,
    add: (e) => (tkaEditorOf(e)?.wrapper.addTunnelHook() ? "animation" : null),
  },
  hookRemove: {
    id: "tunnel-hook",
    icon: faXmark,
    label: (t) => t("post_editor_remove_tunnel_hook"),
    available: (e) => !!tkaEditorOf(e)?.wrapper.tunnelHook,
    add: (e) => {
      tkaEditorOf(e)?.wrapper.removeTunnelHook();
      return null;
    },
  },
};

/** Today's order around the core entries (`text`, `card`). */
export function tkaAddItems(
  core: readonly string[]
): readonly (string | PluginAddItem)[] {
  const has = (id: string) => (core.includes(id) ? [id] : []);
  const a = TKA_ADD_ITEMS;
  return [
    a.animation!,
    a.moves!,
    a.mandala!,
    a.carousel!,
    ...has("text"),
    a.titles!,
    ...has("card"),
    a.hookAdd!,
    a.hookRemove!,
  ];
}

/** The ids in order, for the pinning test (both hook entries share one id and one slot). */
export function tkaAddOrder(core: readonly string[]): string[] {
  return [
    ...new Set(
      tkaAddItems(core).map((entry) =>
        typeof entry === "string" ? entry : entry.id
      )
    ),
  ];
}
