export interface MeasuredSvgBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Measure an SVG element's bounding box, or return null when the renderer
 * cannot lay SVG out. Headless and crawler renderers lack `getBBox`, and
 * Firefox throws for elements inside a `display: none` subtree. Neither is
 * a defect worth an error event, so callers skip or fall back instead.
 */
export function measureSvgBox(element: Element | null): MeasuredSvgBox | null {
  const graphics = element as Partial<SVGGraphicsElement> | null;
  if (!graphics || typeof graphics.getBBox !== "function") return null;
  try {
    const box = graphics.getBBox();
    if (!box) return null;
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  } catch {
    return null;
  }
}
