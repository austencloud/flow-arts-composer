/**
 * How the export reaches a 3D animation clip's live stage. Each mounted 3D
 * clip registers its frame source on its own element; the export surface
 * finds the element inside the layer it is drawing and asks the source for
 * the frame at the post time the export just seeked to.
 *
 * This module must never import the plugin index by value: surfaces.ts
 * imports it, and the index re-exports surfaces.ts.
 */
export interface Stage3DFrameSource {
  /** The stage has its scene, its whole cast and its renderer. */
  ready(): boolean;
  /**
   * Draw the stage at the current post time into a canvas of this size and
   * return it. The first call pauses the stage's own render loop; `finish`
   * gives it back.
   */
  render(width: number, height: number): Promise<HTMLCanvasElement>;
  /** Restore the live preview after an export. Safe to call more than once. */
  finish(): void;
}

export const STAGE_3D_ELEMENT_SELECTOR = "[data-stage-3d]";

const sources = new WeakMap<Element, Stage3DFrameSource>();

export function registerStage3DFrameSource(
  element: Element,
  source: Stage3DFrameSource
): () => void {
  sources.set(element, source);
  return () => {
    if (sources.get(element) === source) sources.delete(element);
  };
}

/** The frame source of the 3D clip drawn inside a layer element, if mounted. */
export function stage3DFrameSourceIn(
  layerElement: Element
): Stage3DFrameSource | null {
  const element = layerElement.matches(STAGE_3D_ELEMENT_SELECTOR)
    ? layerElement
    : layerElement.querySelector(STAGE_3D_ELEMENT_SELECTOR);
  return element ? (sources.get(element) ?? null) : null;
}
