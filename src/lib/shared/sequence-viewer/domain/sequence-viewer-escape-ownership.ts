import {
  activateEscapeShortcutTarget,
  shouldDeferEscapeShortcut,
} from "$lib/shared/keyboard/domain/escape-shortcut-target";

const MODAL_LAYER_SELECTOR = 'dialog[open], [role="dialog"][aria-modal="true"]';
const VIEWER_SHELL_SELECTOR = "[data-sequence-viewer-shell]";

/**
 * Returns true when a temporary surface above the viewer owns this Escape
 * press. The host Drawer contains the shell marker and represents the viewer
 * itself; nested share, delete, and sign-in surfaces do not.
 */
export function shouldSequenceViewerDeferEscape(
  event: KeyboardEvent,
  document: Document = globalThis.document
): boolean {
  if (shouldDeferEscapeShortcut(document)) return true;

  const eventTarget = event.target;
  const target =
    eventTarget && typeof (eventTarget as Element).closest === "function"
      ? (eventTarget as Element)
      : document.activeElement;
  const modalLayer = target?.closest<HTMLElement>(MODAL_LAYER_SELECTOR);

  return Boolean(
    modalLayer && !modalLayer.querySelector(VIEWER_SHELL_SELECTOR)
  );
}

export interface SequenceViewerEscapeFallbackActions {
  isFullscreen: () => boolean;
  exitFullscreen: () => void;
  close: () => void;
}

/**
 * Runs when no layer claimed Escape. The keyboard manager leaves a single-key
 * Escape alone while a button has focus, so after Share is pressed nothing
 * else answers it. A visible Escape target, such as the share panel's close
 * or Practice's exit, is what Escape means there; the viewer's own Back and
 * Close are targets too, so with nothing open this still leaves the viewer.
 */
export function runSequenceViewerEscapeFallback(
  actions: SequenceViewerEscapeFallbackActions,
  document: Document = globalThis.document
): void {
  if (actions.isFullscreen()) {
    actions.exitFullscreen();
    return;
  }
  if (activateEscapeShortcutTarget(document)) return;
  actions.close();
}
