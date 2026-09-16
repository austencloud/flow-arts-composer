import { untrack } from "svelte";

export type TransitionMode = "crossfade" | "swap";

export function createCrossfaderState(getInitialDarkMode: () => boolean) {
  let crossfadeActive = $state(false);
  let transitionMode = $state<TransitionMode>("crossfade");
  let crossfadeTimer: ReturnType<typeof setTimeout> | null = null;
  // Initialize to the prop value so the first render has the correct dark mode class.
  // Do NOT initialize to false - that causes a one-frame flash where backgrounds
  // render in light mode even though the images are rendered for dark mode.
  let activeDarkMode = $state(untrack(getInitialDarkMode));
  let lastContentKey = "";
  let lastImageKey = "";
  // Tracks the portion of the render key that drives GRID STRUCTURE (cell
  // count, columns, durations, start-placement row). Crossfade-swaps are
  // only safe when this is unchanged - otherwise cells might shift
  // between old/new rows mid-transition and read as visual glitches.
  let lastGridStableKey = "";

  /**
   * Begin cross-fade transition. Call before swapping cell images.
   * Returns cleanup function to call after CSS transition completes.
   */
  function beginCrossfade(newDarkMode: boolean, mode: TransitionMode = "crossfade"): void {
    transitionMode = mode;
    activeDarkMode = newDarkMode;
    crossfadeActive = true;
  }

  /**
   * Schedule end of cross-fade after CSS transition completes.
   * Returns a function to clear the fadeOutUrl from cells.
   */
  function scheduleCrossfadeEnd(
    onCleanup: () => void,
    duration: number = 400,
  ): void {
    if (crossfadeTimer) clearTimeout(crossfadeTimer);
    crossfadeTimer = setTimeout(() => {
      crossfadeActive = false;
      onCleanup();
      crossfadeTimer = null;
    }, duration);
  }

  /**
   * Flush any pending cleanup timer from a previous cross-fade.
   * Must be called before reading the cache during a new cross-fade to
   * prevent a rapid toggle from serving URLs that are about to be revoked.
   */
  function flushPendingCrossfade(clearFadeOutUrls: () => void): void {
    if (crossfadeTimer) {
      clearTimeout(crossfadeTimer);
      crossfadeTimer = null;
      crossfadeActive = false;
      clearFadeOutUrls();
    }
  }

  /**
   * Abort cross-fade and clean up. Used when a full re-render preempts
   * the cross-fade.
   */
  function abortCrossfade(clearFadeOutUrls: () => void): void {
    crossfadeActive = false;
    if (crossfadeTimer) {
      clearTimeout(crossfadeTimer);
      crossfadeTimer = null;
    }
    clearFadeOutUrls();
  }

  /** Set activeDarkMode directly (for non-crossfade transitions) */
  function setActiveDarkMode(value: boolean): void {
    activeDarkMode = value;
  }

  /** Update tracking keys for change detection */
  function updateKeys(keys: {
    contentKey: string;
    imageKey: string;
    gridStableKey: string;
  }): void {
    lastContentKey = keys.contentKey;
    lastImageKey = keys.imageKey;
    lastGridStableKey = keys.gridStableKey;
  }

  /**
   * Check what kind of change occurred.
   *
   * `darkModeChanged` is load-bearing: neither contentKey nor imageKey encode
   * dark mode, so a darkMode flip that lands in the SAME reactive flush as a
   * layout change (e.g. the export panel opening swaps darkMode + columnCount
   * together) would otherwise classify as "layout-only" — which only
   * repositions cells and never re-renders the baked PNGs for the new theme,
   * leaving dark-baked images under a light DOM. Excluding darkModeChanged from
   * the layout-only fast path forces a full re-render in that case.
   */
  function classifyChange(
    contentKey: string,
    imageKey: string,
    gridStableKey: string,
    cellsLoaded: boolean,
    hasDurations: boolean,
    darkModeChanged: boolean,
  ): "dark-mode-only" | "layout-only" | "grid-stable-image" | "full" {
    const contentChanged = contentKey !== lastContentKey;
    const imageChanged = imageKey !== lastImageKey;
    const isDarkModeOnly = !contentChanged && cellsLoaded;
    const isLayoutOnly = !imageChanged && contentChanged && !darkModeChanged && cellsLoaded && !hasDurations;
    const gridStable = gridStableKey === lastGridStableKey && cellsLoaded;

    if (isDarkModeOnly) return "dark-mode-only";
    if (isLayoutOnly) return "layout-only";
    if (gridStable && imageChanged) return "grid-stable-image";
    return "full";
  }

  /** Destroy: clean up timer */
  function destroy(): void {
    if (crossfadeTimer) {
      clearTimeout(crossfadeTimer);
      crossfadeTimer = null;
    }
  }

  return {
    get crossfadeActive() { return crossfadeActive; },
    get transitionMode() { return transitionMode; },
    get activeDarkMode() { return activeDarkMode; },
    get lastContentKey() { return lastContentKey; },
    get lastImageKey() { return lastImageKey; },
    get lastGridStableKey() { return lastGridStableKey; },
    beginCrossfade,
    scheduleCrossfadeEnd,
    flushPendingCrossfade,
    abortCrossfade,
    setActiveDarkMode,
    updateKeys,
    classifyChange,
    destroy,
  };
}
