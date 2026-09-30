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
  if (
    target instanceof Element &&
    target.closest("input, textarea, select, [contenteditable]")
  ) {
    return false;
  }

  const key = event.key.toLowerCase();
  const handled = key === "c" ? copy() : key === "v" ? paste() : false;
  if (handled) event.preventDefault();
  return handled;
}
