import type { PluginTool } from "@austencloud/video-editor";
import {
  faDrum,
  faHashtag,
  faHeading,
  faPalette,
  faShapes,
  faShuffle,
  faSliders,
  faTableCellsLarge,
} from "@austencloud/video-editor/icons";
import { canTapBeats } from "./tka-beats";
import { tkaEditorOf } from "./tka-editor-context";

/**
 * tka's own tools on the row, with the names and icons the row shows today
 * (the package's ui/editor/post-editor-labels.ts, `toolLabel` and
 * `TOOL_ICON`). Beats acts at once; the rest open a panel.
 */
export const TKA_TOOLS: readonly PluginTool[] = [
  {
    id: "look",
    type: "panel",
    label: () => "Animation defaults",
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
];
