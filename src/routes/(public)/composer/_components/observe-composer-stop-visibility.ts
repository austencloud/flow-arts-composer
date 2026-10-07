/** Glide parks adjacent stops inside the viewport, then disables their pointer
 * events until arrival. A preview is visible only when both checks agree. */
export function observeComposerStopVisibility(
  node: HTMLElement,
  onVisibilityChange: (visible: boolean) => void
) {
  const section = node.closest("section");
  const measures = typeof IntersectionObserver !== "undefined";
  let intersects = !measures;
  // Glide poses every stop when it takes over, before the first intersection
  // entry can arrive. A style report made then could only say "not visible"
  // and would be guesswork, so style changes wait for the first measurement.
  let measured = !measures;

  const updateVisibility = () => {
    onVisibilityChange(intersects && section?.style.pointerEvents !== "none");
  };
  updateVisibility();

  const intersectionObserver = measures
    ? new IntersectionObserver((entries) => {
        measured = true;
        intersects = entries.some((entry) => entry.isIntersecting);
        updateVisibility();
      })
    : null;
  intersectionObserver?.observe(node);

  const stageObserver = new MutationObserver(() => {
    if (measured) updateVisibility();
  });
  if (section) {
    stageObserver.observe(section, {
      attributes: true,
      attributeFilter: ["style"],
    });
  }
  return {
    destroy() {
      intersectionObserver?.disconnect();
      stageObserver.disconnect();
    },
  };
}
