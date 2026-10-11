import { mount, unmount } from "svelte";
import {
  createLocalFootageVault,
  type EditorConfirmations,
  type EditorConfirmKey,
  type EditorShortcuts,
  type EditorSync,
  type VideoEditorHost,
} from "@austencloud/video-editor";
import { t } from "#lib/shared/i18n/i18n.svelte.js";
import EditHistoryShortcutBridge from "#lib/shared/keyboard/components/EditHistoryShortcutBridge.svelte";
import { getEscapeLayerManager } from "#lib/shared/keyboard/get-escape-layer-manager.js";
import { getKeyboardShortcutManager } from "#lib/shared/keyboard/get-keyboard-shortcut-manager.js";
import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
import {
  shouldConfirm,
  stopAsking,
  type SkippableConfirmation,
} from "#lib/shared/settings/confirmations.js";
import {
  removeToast,
  showToast,
} from "#lib/shared/toast/state/toast-state.svelte.js";
import type { FeatureVideoSync } from "#lib/shared/media-composition/services/feature-video-client.js";
import type { SequenceVideosStore } from "#lib/shared/video-collaboration/state/sequence-videos-store.svelte.js";
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
 * A feature video's folder on this computer keeps its post: disk's newer copy
 * replaces the post as one undo step, renders land in its exports/, and only
 * videos in its folder play.
 */
function featureSync(featureVideo: FeatureVideoSync): EditorSync {
  return {
    connect: (editor, onReplaced) =>
      featureVideo.connect(editor, () => {
        onReplaced();
        const loaded = editor.project;
        showToast({
          message: "Loaded the newer copy from disk.",
          type: "info",
          duration: 8000,
          action: {
            label: t("post_editor_undo"),
            onClick: () => {
              if (editor.project === loaded) editor.undo();
            },
          },
        });
      }),
    keepExport: (blob, name, signal) =>
      featureVideo.saveExport(blob, name, signal),
    devicePickBlocked: `${featureVideo.slug} plays only videos in its folder. Add one with: node scripts/post-project.mjs add-take <file> --feature ${featureVideo.slug}`,
    // Disk keeps every tab current, and no tab of the sequence's ordinary
    // post may reach a feature video: the tab sync is keyed by sequence alone.
    tabSync: false,
  };
}

/** The editor's skippable confirmations, kept in tka's settings. */
const CONFIRMATION_SETTING: Record<EditorConfirmKey, SkippableConfirmation> = {
  "clear-post-keyframes": "skipClearPostKeyframesConfirmation",
};

const confirmations: EditorConfirmations = {
  shouldAsk: (key) => shouldConfirm(CONFIRMATION_SETTING[key]),
  stopAsking: (key) => stopAsking(CONFIRMATION_SETTING[key]),
};

/**
 * The services tka hands the editor: its toasts, its shortcut managers, its haptics, when
 * the post has a sequence, that sequence's saved videos as the media library and, for a
 * feature video, its folder's sync. Device videos are kept on this device
 * for the account signed in (the Post page opens a new editor when it
 * changes), so a reload brings them back without picking them again.
 */
export function tkaEditorServices(
  library: SequenceVideosStore | null,
  featureVideo: FeatureVideoSync | null = null
): Pick<
  VideoEditorHost,
  | "notify"
  | "shortcuts"
  | "haptics"
  | "mediaLibrary"
  | "sync"
  | "footage"
  | "confirmations"
> {
  const user = authState.user;
  return {
    notify: {
      success: (message) => void showToast({ message, type: "success" }),
      error: (message) => void showToast({ message, type: "error" }),
      info: (message) => void showToast({ message, type: "info" }),
      undoable: (message, action) => {
        const id = showToast({
          message,
          type: "success",
          action: { label: action.label, onClick: action.run },
        });
        return () => removeToast(id);
      },
    },
    shortcuts,
    haptics: (kind) => getHapticFeedback().trigger(kind),
    ...(library ? { mediaLibrary: createTkaMediaLibrary(library) } : {}),
    ...(featureVideo ? { sync: featureSync(featureVideo) } : {}),
    footage: createLocalFootageVault(
      user && !user.isAnonymous ? `account:${user.uid}` : "guest"
    ),
    confirmations,
  };
}
