import { isSmallPictographArt } from "../domain/utils/pictograph-art-scale";

/**
 * One ResizeObserver for every live pictograph. Lists show hundreds of them,
 * so the small/regular switch is written straight onto the element as
 * `data-art-scale="small"` and never goes through component state: nothing
 * re-renders and no pictograph data is prepared again.
 */
const ATTRIBUTE = "data-art-scale";

let observer: ResizeObserver | null = null;

function widthOf(entry: ResizeObserverEntry): number {
  return entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;
}

function sharedObserver(): ResizeObserver {
  observer ??= new ResizeObserver((entries) => {
    for (const entry of entries) {
      const element = entry.target;
      const wasSmall = element.getAttribute(ATTRIBUTE) === "small";
      const small = isSmallPictographArt(widthOf(entry), wasSmall);
      if (small === wasSmall) continue;
      if (small) element.setAttribute(ATTRIBUTE, "small");
      else element.removeAttribute(ATTRIBUTE);
    }
  });
  return observer;
}

/** Start switching this pictograph's art by its width; returns the stop. */
export function observePictographArtScale(element: Element): () => void {
  if (typeof ResizeObserver === "undefined") return () => {};
  const shared = sharedObserver();
  shared.observe(element);
  return () => {
    shared.unobserve(element);
    element.removeAttribute(ATTRIBUTE);
  };
}
