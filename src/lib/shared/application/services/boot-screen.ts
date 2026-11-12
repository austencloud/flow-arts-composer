/**
 * The boot screen in app.html (`#app-loading`) covers app routes until the
 * first view is whole. Landing routes hide it with display: none, and some
 * test routes remove it. It never leaves on a timer: with no `ready` 15 s
 * after the page started it shows the long wait (a plain message and a
 * Reload button) and stays. Pages outside the app shell let it go through
 * `finishBootScreen`, most of them from the root layout.
 *
 * Two jobs live here, both about that one screen:
 * - `runAfterBootScreen` waits for it to start leaving, so motion such as
 *   the Create previews' turns plays on a visible page.
 * - `holdBootScreen` keeps it up until a part of the first view is ready to
 *   be seen. app.html dismisses once `ready` has arrived and every hold is
 *   released (the `composed` milestone), and stops waiting 4 s after
 *   `ready` (8 s at most), or after a hold's own longer `waitMs`. A hold
 *   taken with `UNTIL_RELEASED` has no time limit: the screen waits for it
 *   however long it takes, and past `ready` + 15 s says so and offers a
 *   Reload button. Spec: docs/superpowers/specs/2026-10-15-boot-composed-reveal.md
 */

declare global {
  interface Window {
    /** app.html's hold registry; returns an idempotent release. */
    __tkaBootHold?: (
      name: string,
      waitMs?: number | typeof UNTIL_RELEASED
    ) => () => void;
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
 * How long after `ready` Create's own first-view holds may keep the screen
 * up. Its panel and beat grid arrive behind the screen as one finished view,
 * so a slow boot waits for them rather than handing over to loading bars
 * (Austen, 2026-10-31: "wait up to 15 s"). The module itself waits with
 * `UNTIL_RELEASED` instead.
 */
export const FIRST_VIEW_WAIT_MS = 15_000;

/**
 * A hold with no time limit. app.html never times it out: the screen leaves
 * only once it is released, and from `ready` + 15 s shows the long wait (a
 * plain message and a Reload button). For `module-view` alone: without the
 * module there is nothing on the page to hand over to (Austen, 2026-11-11:
 * "it still puts me in a place where there's nothing on the screen").
 */
export const UNTIL_RELEASED = "until-released" as const;

const noRelease = (): void => {};
const openHolds = new Map<string, () => void>();

/**
 * Keeps the boot screen up until the returned release runs (or
 * `releaseBootHold(name)`, from another component). Holds nothing when the
 * screen is not covering the page. One open hold per name: asking again
 * returns the same release. Releasing twice is harmless. `waitMs` lets this
 * hold outlast the usual limits, up to that long after `ready`;
 * `UNTIL_RELEASED` lifts the limit altogether.
 */
export function holdBootScreen(
  name: string,
  waitMs?: number | typeof UNTIL_RELEASED
): () => void {
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
      // A broken registry still lets ready dismiss the screen.
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
 * finished; pages that never mount it call this once they are drawn: the
 * root layout for every page outside the shell (and for a startup error),
 * the shell's own error screens, phone sign-in and the sequence viewer.
 * Without it the screen stays up, in the long wait from 15 s.
 */
export function finishBootScreen(): void {
  (
    window as unknown as {
      __tkaLoadProgress?: (percent: number, message: string) => void;
    }
  ).__tkaLoadProgress?.(100, "Ready");
}
