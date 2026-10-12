import type { VideoEditorState } from "@austencloud/video-editor";
import { mainItemAt, type PostVideoItem } from "@austencloud/video-editor/core";

/** The clip Beats opens: the selected video, else the one under the playhead. */
export function beatsClipOf(editor: VideoEditorState): PostVideoItem | null {
  const selected = editor.selectedItem;
  if (selected?.kind === "video") return selected;
  const under = mainItemAt(editor.project, editor.previewSeconds);
  return under?.kind === "video" ? under : null;
}

/** Beats needs a clip whose footage is loaded. */
export function canTapBeats(editor: VideoEditorState): boolean {
  const beatsClip = beatsClipOf(editor);
  return beatsClip !== null && Boolean(editor.mediaUrl(beatsClip.takeId));
}
