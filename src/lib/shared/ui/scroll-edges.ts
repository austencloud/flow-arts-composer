/**
 * Which ends of a scroller hide content, so a row can fade, and offer an
 * arrow, only toward what is out of view. Sideways by default; a grid that
 * scrolls down passes `axis: "y"`.
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

export type ScrollAxis = "x" | "y";

export function measureScrollEdges(
  node: HTMLElement,
  axis: ScrollAxis = "x"
): ScrollEdges {
  const max =
    axis === "x"
      ? node.scrollWidth - node.clientWidth
      : node.scrollHeight - node.clientHeight;
  const at = axis === "x" ? node.scrollLeft : node.scrollTop;
  return { start: at > SLACK, end: at < max - SLACK };
}

/**
 * Svelte action: reports the scroller's edges now, as it scrolls, and as it or
 * its content resizes or changes.
 */
export function scrollEdges(
  node: HTMLElement,
  onChange:
    | ((edges: ScrollEdges) => void)
    | { onChange: (edges: ScrollEdges) => void; axis: ScrollAxis }
) {
  const read = (next: typeof onChange) =>
    typeof next === "function" ? { onChange: next, axis: "x" as const } : next;
  let { onChange: report, axis } = read(onChange);
  const measure = () => report(measureScrollEdges(node, axis));
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
    update(next: typeof onChange) {
      ({ onChange: report, axis } = read(next));
      measure();
    },
    destroy() {
      resize.disconnect();
      children.disconnect();
      node.removeEventListener("scroll", measure);
    },
  };
}
