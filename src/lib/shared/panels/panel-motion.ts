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
