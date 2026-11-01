// Arriving on a release highlight: find the element its note named and
// bring the reader's eye to it. The target tab may still be mounting when
// navigation lands, so the lookup watches the document for a while instead of
// checking once.

import {
  attentionPulse,
  reducedMotion,
} from "#lib/shared/transitions/motion.js";

/**
 * How long an arrival waits for its anchor to mount. A cold module load on a
 * phone can take several seconds; past this the anchor is treated as gone and
 * the arrival falls back to its callout. The same order of patience as the
 * DeepLinker's sequence handoff.
 */
export const ANCHOR_WAIT_MS = 8_000;

export function releaseAnchorSelector(anchor: string): string {
  return `[data-release-anchor="${CSS.escape(anchor)}"]`;
}

/**
 * The element carrying `data-release-anchor={anchor}`, now or once it mounts
 * within `waitMs`. Null when it never shows up.
 */
export function findReleaseAnchor(
  anchor: string,
  {
    waitMs = ANCHOR_WAIT_MS,
    root = document,
  }: { waitMs?: number; root?: Document | HTMLElement } = {}
): Promise<HTMLElement | null> {
  const selector = releaseAnchorSelector(anchor);
  const now = root.querySelector<HTMLElement>(selector);
  if (now) return Promise.resolve(now);

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const found = root.querySelector<HTMLElement>(selector);
      if (!found) return;
      settle(found);
    });
    const timer = setTimeout(() => settle(null), waitMs);
    const settle = (result: HTMLElement | null) => {
      clearTimeout(timer);
      observer.disconnect();
      resolve(result);
    };
    observer.observe(root === document ? document.documentElement : root, {
      childList: true,
      subtree: true,
    });
  });
}

/**
 * Scroll the anchor into the middle of its scroller, give it focus so a
 * keyboard or screen-reader user lands there too, and pulse it. Smooth under
 * normal motion; an instant jump and a static outline under reduced motion.
 * Returns a cancel for the pulse.
 */
export function arriveAtReleaseAnchor(element: HTMLElement): () => void {
  element.scrollIntoView({
    block: "center",
    inline: "nearest",
    behavior: reducedMotion() ? "auto" : "smooth",
  });
  if (!element.hasAttribute("tabindex") && element.tabIndex < 0) {
    // Programmatic focus only: -1 keeps it out of the Tab order.
    element.setAttribute("tabindex", "-1");
  }
  element.focus({ preventScroll: true });
  return attentionPulse(element);
}
