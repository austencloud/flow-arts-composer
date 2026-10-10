import { isLayerOwnedKeyboardTarget } from "#lib/shared/keyboard/domain/shortcut-target-resolution.js";

export function handlePerformerCopyShortcut(
  event: KeyboardEvent,
  copy: () => boolean,
  paste: () => boolean
): boolean {
  if (
    event.defaultPrevented ||
    event.repeat ||
    !(event.ctrlKey || event.metaKey) ||
    event.altKey ||
    event.shiftKey
  )
    return false;

  const target = event.target;
  if (target instanceof Element) {
    if (target.closest("input, textarea, select, [contenteditable]"))
      return false;
    if (isLayerOwnedKeyboardTarget(target)) {
      const layer = target.closest(
        'dialog[open], [role="dialog"], [role="alertdialog"]'
      );
      const viewerShell = target.closest("[data-sequence-viewer-shell]");
      if (!viewerShell || !layer?.contains(viewerShell)) return false;
    }
  }

  const key = event.key.toLowerCase();
  const handled = key === "c" ? copy() : key === "v" ? paste() : false;
  if (handled) event.preventDefault();
  return handled;
}
