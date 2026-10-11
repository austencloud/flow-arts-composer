import type { PluginTool } from "@austencloud/video-editor";
import {
  faDrum,
  faEraser,
  faHashtag,
  faHeading,
  faLayerGroup,
  faPalette,
  faPenToSquare,
  faPersonRunning,
  faShapes,
  faShuffle,
  faSliders,
  faStopwatch,
  faTableCellsLarge,
} from "@austencloud/video-editor/icons";
import { canTapBeats } from "./tka-beats";
import { tkaEditorOf } from "./tka-editor-context";

/**
 * tka's own tools on the row, with the names and icons the row shows today
 * (the package's ui/editor/post-editor-labels.ts, `toolLabel` and
 * `TOOL_ICON`). Beats and Clear act at once; the rest open a panel. Grid and
 * Edit arrangement are an arrangement's; Layers, Offset, Effort and Clear
 * belong to its cell in hand. Look is an arrangement's own look there, else
 * the post's animation defaults.
 */
export const TKA_TOOLS: readonly PluginTool[] = [
  {
    id: "look",
    type: "panel",
    label: (_t, kind) => (kind === "arrangement" ? "Look" : "Animation defaults"),
    icon: faPalette,
  },
  {
    id: "layout",
    type: "panel",
    label: (t) => t("post_editor_look"),
    icon: faTableCellsLarge,
  },
  {
    id: "titles",
    type: "panel",
    label: (t) => t("post_editor_tool_titles"),
    icon: faHeading,
  },
  {
    id: "labels",
    type: "panel",
    label: (t) => t("post_editor_tool_labels"),
    icon: faHashtag,
  },
  {
    id: "appearance",
    type: "panel",
    label: () => "Appearance",
    icon: faSliders,
  },
  {
    id: "shows",
    type: "panel",
    label: (t) => t("post_editor_moves_show"),
    icon: faShapes,
  },
  {
    id: "sequence",
    type: "panel",
    label: () => "Sequence",
    icon: faShuffle,
  },
  {
    id: "beats",
    type: "action",
    label: (t) => t("post_editor_beats"),
    icon: faDrum,
    enabled: (editor) => canTapBeats(editor),
    run: (editor, context) => tkaEditorOf(editor)?.openBeats?.(context?.takeId),
  },
  {
    id: "arrangement",
    type: "panel",
    label: () => "Edit arrangement",
    icon: faPenToSquare,
  },
  {
    id: "grid",
    type: "panel",
    label: () => "Grid",
    icon: faTableCellsLarge,
  },
  {
    id: "layers",
    type: "panel",
    label: () => "Layers",
    icon: faLayerGroup,
  },
  {
    id: "offset",
    type: "panel",
    label: () => "Offset",
    icon: faStopwatch,
  },
  {
    id: "effort",
    type: "panel",
    label: () => "Effort",
    icon: faPersonRunning,
  },
  {
    id: "clear",
    type: "action",
    label: () => "Clear",
    icon: faEraser,
    enabled: (editor) => {
      const cell = tkaEditorOf(editor)?.wrapper.selectedCell;
      return (
        editor.selectionEditable &&
        !!cell &&
        (cell.layers.length > 0 || (cell.beatOffset ?? 0) !== 0)
      );
    },
    run: (editor) => void tkaEditorOf(editor)?.wrapper.clearSelectedCell(),
  },
];
