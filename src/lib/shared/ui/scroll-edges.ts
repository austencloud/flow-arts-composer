/**
 * Which ends of a sideways scroller hide content, so a row can fade, and offer
 * an arrow, only toward what is out of view.
 */
export interface ScrollEdges {
  /** Content is scrolled out past the start. */
  start: boolean;
  /** Content runs on past the end. */
  end: boolean;
}

/** A pixel of slack keeps fractional scroll positions from flickering an
 *  edge on and off at the ends. */
const SLACK = 1;

export function measureScrollEdges(node: HTMLElement): ScrollEdges {
  const max = node.scrollWidth - node.clientWidth;
  return {
    start: node.scrollLeft > SLACK,
    end: node.scrollLeft < max - SLACK,
  };
}

/**
 * Svelte action: reports the scroller's edges now, as it scrolls, and as it or
 * its content resizes or changes.
 */
export function scrollEdges(
  node: HTMLElement,
  onChange: (edges: ScrollEdges) => void
) {
  let report = onChange;
  const measure = () => report(measureScrollEdges(node));
  const resize = new ResizeObserver(measure);
  const observeChildren = () => {
    resize.disconnect();
    resize.observe(node);
    for (const child of node.children) resize.observe(child);
  };
  // Items added or removed change what overflows without resizing the
  // scroller itself.
  const children = new MutationObserver(() => {
    observeChildren();
    measure();
  });
  observeChildren();
  children.observe(node, { childList: true });
  node.addEventListener("scroll", measure, { passive: true });
  measure();
  return {
    update(next: (edges: ScrollEdges) => void) {
      report = next;
      measure();
    },
    destroy() {
      resize.disconnect();
      children.disconnect();
      node.removeEventListener("scroll", measure);
    },
  };
}
