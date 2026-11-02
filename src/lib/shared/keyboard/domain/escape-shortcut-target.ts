import {
  isShortcutTargetEnabled,
  resolveShortcutTarget,
} from "./shortcut-target-resolution";

const ESCAPE_TARGET_SELECTOR = "button[data-escape-shortcut]";
const LOCAL_ESCAPE_OWNER_SELECTOR = [
  "input",
  "textarea",
  "select",
  "[contenteditable]:not([contenteditable='false'])",
  "[data-escape-shortcut-local]",
  "[aria-expanded='true']",
  // Bits UI popover content has no role; its own escape layer closes it.
  "[data-popover-content]",
  "[role='combobox']",
  "[role='menu']",
  "[role='listbox']",
  "[role='tree']",
  "[role='dialog']:not([aria-modal='true'])",
].join(", ");

/**
 * Focused controls get the first chance to cancel their own temporary state.
 * Browser fullscreen also owns the first Escape press.
 */
export function shouldDeferEscapeShortcut(
  document: Document = globalThis.document
): boolean {
  if (document.fullscreenElement) return true;
  const activeElement = document.activeElement;
  if (!activeElement || typeof activeElement.closest !== "function") {
    return false;
  }
  return Boolean(activeElement.closest(LOCAL_ESCAPE_OWNER_SELECTOR));
}

export function resolveEscapeShortcutTarget(
  document: Document = globalThis.document
): HTMLButtonElement | null {
  if (shouldDeferEscapeShortcut(document)) return null;

  return resolveShortcutTarget<HTMLButtonElement>(document, {
    targetSelector: ESCAPE_TARGET_SELECTOR,
    scopeSelector: "[data-escape-shortcut-scope]",
    ignoreEditableFocus: true,
  });
}

export function hasEscapeShortcutTarget(
  document: Document = globalThis.document
): boolean {
  return resolveEscapeShortcutTarget(document) !== null;
}

export function activateEscapeShortcutTarget(
  document: Document = globalThis.document
): boolean {
  const target = resolveEscapeShortcutTarget(document);
  if (!target) return false;

  if (isShortcutTargetEnabled(target)) target.click();
  return true;
}
