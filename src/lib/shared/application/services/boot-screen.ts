/**
 * The boot screen in app.html (`#app-loading`) covers app routes until the
 * first view is whole. Landing routes hide it with display: none, and some
 * test routes remove it. If the shell never hands over, app.html's 15 s
 * safety net adds `loaded`.
 *
 * Two jobs live here, both about that one screen:
 * - `runAfterBootScreen` waits for it to start leaving, so motion such as
 *   the Create previews' turns plays on a visible page.
 * - `holdBootScreen` keeps it up until a part of the first view is ready to
 *   be seen. app.html dismisses once `ready` has arrived and every hold is
 *   released (the `composed` milestone), and stops waiting 4 s after
 *   `ready` (8 s at most), or after a hold's own longer `waitMs`. Spec: docs/superpowers/specs/2026-10-15-boot-composed-reveal.md
 */

declare global {
  interface Window {
    /** app.html's hold registry; returns an idempotent release. */
    __tkaBootHold?: (name: string, waitMs?: number) => () => void;
  }
}

const BOOT_SCREEN_ID = "app-loading";

function covers(screen: HTMLElement): boolean {
  return (
    screen.isConnected &&
    !screen.classList.contains("loaded") &&
    screen.style.display !== "none"
  );
}

/** Whether the boot screen is up and not yet leaving. */
export function bootScreenCovers(): boolean {
  if (typeof document === "undefined") return false;
  const screen = document.getElementById(BOOT_SCREEN_ID);
  return Boolean(screen && covers(screen));
}

/**
 * Runs `go` at once when no boot screen covers the page, and otherwise once
 * the screen starts to leave. The returned cancel stops a pending `go`.
 */
export function runAfterBootScreen(go: () => void): () => void {
  const screen = document.getElementById(BOOT_SCREEN_ID);
  if (!screen || !covers(screen)) {
    go();
    return () => {};
  }

  // Watch the screen's own class and style, and its parent's children for
  // removal. Nothing wider: the page body changes constantly while it boots.
  const observer = new MutationObserver(() => {
    if (covers(screen)) return;
    observer.disconnect();
    go();
  });
  observer.observe(screen, {
    attributes: true,
    attributeFilter: ["class", "style"],
  });
  observer.observe(screen.parentNode!, { childList: true });

  return () => observer.disconnect();
}

/**
 * How long after `ready` the first view's holds may keep the screen up. The
 * module and, in Create, its panel and beat grid arrive behind the screen as
 * one finished view, so a slow boot waits for them rather than handing over
 * to loading bars (Austen, 2026-10-31: "wait up to 15 s").
 */
export const FIRST_VIEW_WAIT_MS = 15_000;

const noRelease = (): void => {};
const openHolds = new Map<string, () => void>();

/**
 * Keeps the boot screen up until the returned release runs (or
 * `releaseBootHold(name)`, from another component). Holds nothing when the
 * screen is not covering the page. One open hold per name: asking again
 * returns the same release. Releasing twice is harmless. `waitMs` lets this
 * hold outlast the usual limits, up to that long after `ready`.
 */
export function holdBootScreen(name: string, waitMs?: number): () => void {
  const open = openHolds.get(name);
  if (open) return open;
  if (typeof window === "undefined" || !bootScreenCovers()) return noRelease;
  const registry = window.__tkaBootHold;
  if (typeof registry !== "function") return noRelease;
  let release: () => void;
  try {
    release = waitMs === undefined ? registry(name) : registry(name, waitMs);
  } catch {
    return noRelease;
  }
  const once = (): void => {
    if (openHolds.get(name) !== once) return;
    openHolds.delete(name);
    try {
      release();
    } catch {
      // A broken registry still has its 4 s cap.
    }
  };
  openHolds.set(name, once);
  return once;
}

/** Releases the open hold of that name, if any. */
export function releaseBootHold(name: string): void {
  openHolds.get(name)?.();
}

/**
 * Lets the boot screen go. The app shell normally reports that boot
 * finished; routes that never mount it (phone sign-in, the sequence viewer)
 * call this, or the screen waits for its 15 s safety net.
 */
export function finishBootScreen(): void {
  (
    window as unknown as {
      __tkaLoadProgress?: (percent: number, message: string) => void;
    }
  ).__tkaLoadProgress?.(100, "Ready");
}
