import { mount, unmount } from "svelte";
import type {
  EditorShortcuts,
  VideoEditorHost,
} from "@austencloud/video-editor";
import EditHistoryShortcutBridge from "$lib/shared/keyboard/components/EditHistoryShortcutBridge.svelte";
import { getEscapeLayerManager } from "$lib/shared/keyboard/get-escape-layer-manager";
import { getKeyboardShortcutManager } from "$lib/shared/keyboard/get-keyboard-shortcut-manager";
import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
import { showToast } from "$lib/shared/toast/state/toast-state.svelte";
import type { SequenceVideosStore } from "$lib/shared/video-collaboration/state/sequence-videos-store.svelte";
import { createTkaMediaLibrary } from "./tka-media-library.svelte";

/**
 * tka's undo keys press hidden buttons the keyboard manager finds in the page, so the edit
 * history registration mounts the same bridge tka's screens render. It goes inside `scope`
 * (the editor's section): the manager keeps only targets inside the focused
 * `[data-edit-history-shortcut-scope]` (`shortcut-target-resolution.ts:200-242`).
 */
const shortcuts: EditorShortcuts = {
  editHistory(handlers, scope) {
    const bridge = mount(EditHistoryShortcutBridge, {
      target: scope,
      props: {
        onUndo: handlers.undo,
        onRedo: handlers.redo,
        get canUndo() {
          return handlers.canUndo();
        },
        get canRedo() {
          return handlers.canRedo();
        },
      },
    });
    return () => void unmount(bridge);
  },
  escapeLayer: (id, close) =>
    getEscapeLayerManager().register({
      id,
      dismiss: close,
      canDismiss: () => true,
    }),
  suppress: (test) => getKeyboardShortcutManager().addInputSuppressor(test),
};

/**
 * The services tka hands the editor: its toasts, its shortcut managers, its haptics and, when
 * the post has a sequence, that sequence's saved videos as the media library.
 */
export function tkaEditorServices(
  library: SequenceVideosStore | null
): Pick<VideoEditorHost, "notify" | "shortcuts" | "haptics" | "mediaLibrary"> {
  return {
    notify: {
      success: (message) => void showToast({ message, type: "success" }),
      error: (message) => void showToast({ message, type: "error" }),
      info: (message) => void showToast({ message, type: "info" }),
    },
    shortcuts,
    haptics: (kind) => getHapticFeedback().trigger(kind),
    ...(library ? { mediaLibrary: createTkaMediaLibrary(library) } : {}),
  };
}
