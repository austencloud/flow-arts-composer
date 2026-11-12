const INTERACTIVE_SELECTOR =
  "a[href], button, input, select, textarea, label, summary, " +
  '[role="button"], [role="link"], [role="tab"], [role="menuitem"], ' +
  '[role="switch"], [role="checkbox"], [role="radio"], [role="option"], ' +
  '[contenteditable=""], [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

const CONTENT_TAGS = new Set([
  "CANVAS",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "IFRAME",
  "IMG",
  "P",
  "PICTURE",
  "SVG",
  "VIDEO",
]);

function colorHasVisibleAlpha(color: string): boolean {
  const normalized = color.toLowerCase().replace(/\s+/g, "");
  if (!normalized || normalized === "transparent") return false;

  const slashAlpha = normalized.match(/\/([\d.]+)(%)?\)$/);
  if (slashAlpha) {
    const alpha = Number(slashAlpha[1]);
    return slashAlpha[2] ? alpha > 0 : alpha > 0;
  }

  const commaAlpha = normalized.match(/^rgba\([^)]*,([\d.]+)\)$/);
  return commaAlpha ? Number(commaAlpha[1]) > 0 : true;
}

function hasVisibleBorder(style: CSSStyleDeclaration): boolean {
  const sides = ["Top", "Right", "Bottom", "Left"] as const;
  return sides.some((side) => {
    const width = Number.parseFloat(style[`border${side}Width`]);
    const borderStyle = style[`border${side}Style`];
    const color = style[`border${side}Color`];
    return width > 0 && borderStyle !== "none" && colorHasVisibleAlpha(color);
  });
}

function paintsForeground(element: Element): boolean {
  const style = getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (Number.parseFloat(style.opacity) === 0) return false;

  return (
    colorHasVisibleAlpha(style.backgroundColor) ||
    (Boolean(style.backgroundImage) && style.backgroundImage !== "none") ||
    (Boolean(style.boxShadow) && style.boxShadow !== "none") ||
    (Boolean(style.backdropFilter) && style.backdropFilter !== "none") ||
    hasVisibleBorder(style)
  );
}

function hasOwnVisibleText(element: Element): boolean {
  return Array.from(element.childNodes).some(
    (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
  );
}

/**
 * The ocean canvas cannot receive pointer events itself, so its interaction
 * bridge listens on window. Only transparent structural wrappers are allowed
 * to pass a pointer through to the scene. Visible content, controls, and panel
 * surfaces own the click instead.
 */
export function isBackgroundInteractionBlocked(
  target: EventTarget | null
): boolean {
  if (!(target instanceof Element)) return true;

  const chain: Element[] = [];
  for (
    let element: Element | null = target;
    element &&
    element !== document.body &&
    element !== document.documentElement;
    element = element.parentElement
  )
    chain.push(element);

  // Any one element on the chain blocks, so the order of the checks does not
  // change the answer. The structural checks run over the whole chain first:
  // a tap on a button's icon is settled by the button without asking for a
  // computed style. Inside a size container (the Create workspace) a computed
  // style forces a layout, which on a slowed phone cost Play's tap 30 ms.
  for (const element of chain) {
    if (element.getAttribute("data-background-interaction") === "block")
      return true;
    if (element.matches(INTERACTIVE_SELECTOR)) return true;
    if (CONTENT_TAGS.has(element.tagName) || element.closest("svg") === element)
      return true;
    if (hasOwnVisibleText(element)) return true;
  }
  return chain.some(paintsForeground);
}

/** Map viewport input to the backing canvas's logical coordinate system. */
export function toBackgroundCoordinates(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  canvas: Pick<HTMLCanvasElement, "width" | "height">
): { x: number; y: number } {
  const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
  const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}
