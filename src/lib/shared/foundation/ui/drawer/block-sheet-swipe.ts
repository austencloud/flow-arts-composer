/**
 * Keeps a press that starts inside `node` from starting the sheet's
 * swipe-to-close.
 *
 * The sheet (`@austencloud/drawer`) begins a dismiss drag on any `touchstart`
 * or `mousedown` that bubbles up to its dialog, and it does not read
 * `data-swipe-block`. A region whose own gestures run vertically, such as the
 * 3D view where a drag orbits the camera, uses this so those two events stop
 * at its root. Pointer events, which the region's own input listens to, pass
 * through untouched, and so do the same two events for listeners attached
 * inside the region.
 *
 * Svelte delegates `onmousedown` and `ontouchstart` attributes to the
 * document, so one written on an element inside the region would no longer
 * fire. Use `onpointerdown` there, or `addEventListener`.
 */
export function blockSheetSwipe(node: HTMLElement) {
  const stop = (event: Event) => event.stopPropagation();
  node.addEventListener("touchstart", stop, { passive: true });
  node.addEventListener("mousedown", stop);
  return {
    destroy() {
      node.removeEventListener("touchstart", stop);
      node.removeEventListener("mousedown", stop);
    },
  };
}
