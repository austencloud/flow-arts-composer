/**
 * Lets the system Back action close a dialog opened with `show()`.
 *
 * `showModal()` gives a dialog a close watcher for free: Escape, and on
 * Android the back gesture or button, cancel the dialog. A dialog opened with
 * `show()` gets none, so on Android Back walks the page history instead. From
 * a sign-in box opened over Settings that went back to Create, and from one
 * opened on the first page of the app it left the app entirely (a visitor
 * report). The CloseWatcher API restores Back for those dialogs. Browsers
 * without it (Safari, Firefox) have no system Back gesture to catch, and
 * Escape still reaches the dialog's own keydown handling.
 *
 * Returns a function that drops the watcher. Dropping it does not call
 * `onBack`.
 */

interface CloseWatcherLike {
  addEventListener(type: "close", listener: () => void): void;
  destroy(): void;
}

type CloseWatcherConstructor = new () => CloseWatcherLike;

export function watchBackToClose(
  onBack: () => void,
  scope: { CloseWatcher?: unknown } = globalThis as { CloseWatcher?: unknown }
): () => void {
  const Watcher = scope.CloseWatcher as CloseWatcherConstructor | undefined;
  if (typeof Watcher !== "function") return () => {};

  let watcher: CloseWatcherLike;
  try {
    watcher = new Watcher();
  } catch {
    // Chrome refuses a watcher only for a detached or inactive document.
    return () => {};
  }

  let active = true;
  watcher.addEventListener("close", () => {
    if (!active) return;
    active = false;
    onBack();
  });

  return () => {
    if (!active) return;
    active = false;
    watcher.destroy();
  };
}

const ESCAPE_KEY_WINDOW_MS = 300;

/**
 * `watchBackToClose` for a surface whose Escape key already has its own path.
 * Chrome routes an Escape keydown nobody cancelled through close watchers
 * too, so a plain watcher closed the surface on an Escape that a focused text
 * field inside it was meant to get first. A watcher fired by an Escape key
 * only re-arms here; the surface's keydown handling decides what Escape does.
 * The Drawer wrapper does the same inline.
 *
 * Returns a function that drops the watcher. Dropping it does not call
 * `onBack`.
 */
export function watchBackOnlyToClose(
  onBack: () => void,
  scope: { CloseWatcher?: unknown } = globalThis as { CloseWatcher?: unknown },
  keys: EventTarget = globalThis
): () => void {
  if (typeof scope.CloseWatcher !== "function") return () => {};
  let escapeKeyAt = -Infinity;
  let dropped = false;
  const noteEscape = (event: Event) => {
    if ((event as KeyboardEvent).key === "Escape")
      escapeKeyAt = performance.now();
  };
  keys.addEventListener("keydown", noteEscape, true);

  let drop: () => void = () => {};
  const arm = () => {
    if (dropped) return;
    drop = watchBackToClose(() => {
      if (performance.now() - escapeKeyAt < ESCAPE_KEY_WINDOW_MS) {
        queueMicrotask(arm);
        return;
      }
      onBack();
    }, scope);
  };
  arm();

  return () => {
    if (dropped) return;
    dropped = true;
    keys.removeEventListener("keydown", noteEscape, true);
    drop();
  };
}
