/**
 * Waits for the person to stop, so a card does not rise over what they are
 * doing. Each `pointerdown` or `keydown` on the window restarts the wait; once
 * `quietMs` pass with neither, `attempt` runs. When it returns true the wait is
 * over and the listeners are gone. When it returns false (something is on
 * screen that the card must not cover) the wait starts again for the next
 * quiet window.
 *
 * Returns a cancel function. Listeners are passive and are removed on
 * completion or cancel.
 */

export const IDLE_QUIET_MS = 4000;

export function waitForIdle(
  attempt: () => boolean,
  quietMs: number = IDLE_QUIET_MS
): () => void {
  if (typeof window === "undefined") return () => {};

  let timer: ReturnType<typeof setTimeout> | null = null;
  let finished = false;

  function clearTimer(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function stop(): void {
    finished = true;
    clearTimer();
    window.removeEventListener("pointerdown", restart);
    window.removeEventListener("keydown", restart);
  }

  function start(): void {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      if (finished) return;
      if (attempt()) stop();
      else start();
    }, quietMs);
  }

  function restart(): void {
    if (!finished) start();
  }

  window.addEventListener("pointerdown", restart, { passive: true });
  window.addEventListener("keydown", restart, { passive: true });
  start();
  return stop;
}

/** True when a modal dialog or the auth sheet is on screen. */
export function isModalOnScreen(authSheetOpen: boolean): boolean {
  if (authSheetOpen) return true;
  if (typeof document === "undefined") return false;
  // Drawers stay mounted while closed and say so with data-state.
  return (
    document.querySelector('[aria-modal="true"]:not([data-state="closed"])') !==
    null
  );
}
