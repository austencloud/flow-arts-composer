import { observeComposerStopVisibility } from "./observe-composer-stop-visibility";

/**
 * Calls `hold` once, the first time the stop around `node` is no longer the
 * one being read: scrolled past on the plain page, or no longer the stage's
 * current stop (the stage takes its pointer events). A deep link or a
 * restored scroll arrives already past the stop, so the first measured
 * report holds too. Only the synchronous report made before observation
 * starts is ignored, and once held there is nothing left to watch, so the
 * observers are released.
 */
export function holdWhenStopLeaves(node: HTMLElement, hold: () => void) {
  let observing = false;
  let release = () => {};
  const handle = observeComposerStopVisibility(node, (visible) => {
    if (!observing || visible) return;
    observing = false;
    hold();
    release();
  });
  release = () => handle.destroy();
  observing = true;
  return handle;
}
