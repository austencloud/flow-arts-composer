/**
 * The moment a PanelGroup's flex tracks are sliding between allocations.
 *
 * Anything that measures a panel every time it resizes (overlay anchors, root
 * layout variables) would otherwise re-measure on every frame of the slide and
 * force extra layout passes while the browser animates. Such work checks
 * `isInMovingPanelGroup` and measures once on `PANEL_SETTLE_EVENT` instead.
 */

/** Set on a PanelGroup root while its panels' flex tracks are moving. */
export const PANEL_MOTION_ATTRIBUTE = "data-panel-motion";

/** Fired (bubbling) from a PanelGroup root when its panels come to rest. */
export const PANEL_SETTLE_EVENT = "panelsettle";

/** True while the PanelGroup containing `element` is mid-slide. */
export function isInMovingPanelGroup(element: Element): boolean {
  return element.closest(`[${PANEL_MOTION_ATTRIBUTE}]`) !== null;
}

/**
 * Watch `element` for size changes without following a panel slide frame by
 * frame: resize entries that arrive while the element's PanelGroup is moving
 * are held, and `measure` runs once when that group settles. Closing the
 * Create player slid the tool panel back under three option-picker measurers
 * and the step grid's overflow check, each re-laying its content out on every
 * frame, which turned the 280ms slide into a 40ms jump. Returns the cleanup.
 */
export function observeSettledResize(
  element: Element,
  measure: () => void
): () => void {
  let pending = false;
  const observer = new ResizeObserver(() => {
    if (isInMovingPanelGroup(element)) {
      pending = true;
      return;
    }
    measure();
  });
  const onSettle = (event: Event) => {
    if (!pending) return;
    if (!(event.target instanceof Node) || !event.target.contains(element))
      return;
    pending = false;
    measure();
  };
  observer.observe(element);
  document.addEventListener(PANEL_SETTLE_EVENT, onSettle);
  return () => {
    observer.disconnect();
    document.removeEventListener(PANEL_SETTLE_EVENT, onSettle);
  };
}
