import type { EditorMode } from "@austencloud/video-editor";
import { tkaEditorOf } from "./tka-editor-context";
import TkaTimingDock from "./TkaTimingDock.svelte";
import TkaTimingPanel from "./TkaTimingPanel.svelte";
import TkaTimingStage from "./TkaTimingStage.svelte";
import TkaTimingTimeline from "./TkaTimingTimeline.svelte";
import TkaTimingToolbar from "./TkaTimingToolbar.svelte";

/**
 * Text entry, where letters are typed. A slider is not typing. A copy of the
 * workspace's own check, which its Space handler applies before this mode's.
 */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const field = target.closest("input, textarea");
  return (
    field !== null &&
    !(
      field instanceof HTMLInputElement &&
      ["range", "checkbox", "radio", "button", "submit", "reset"].includes(
        field.type
      )
    )
  );
}

/**
 * Beat tapping: the take being mapped takes the screen, and its own keys
 * answer (T taps, Space plays the take).
 */
export const TKA_TIMING_MODE: EditorMode = {
  id: "timing",
  toolbar: TkaTimingToolbar,
  dock: TkaTimingDock,
  panel: TkaTimingPanel,
  stage: TkaTimingStage,
  timeline: TkaTimingTimeline,
  keydown(event, editor) {
    const timing = tkaEditorOf(editor)?.timing;
    if (!timing) return false;
    // The workspace's playback key hands over a plain Space; the session
    // answers every other key itself, and ignores what it does not own.
    if (
      event.key === " " &&
      !(
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isTyping(event.target)
      )
    ) {
      if (!event.repeat) timing.togglePlay();
      return true;
    }
    timing.handleKey(event);
    return true;
  },
};
