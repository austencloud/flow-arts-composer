/** Glide parks adjacent stops inside the viewport, then disables their pointer
 * events until arrival. A preview is visible only when both checks agree. */
export function observeComposerStopVisibility(
  node: HTMLElement,
  onVisibilityChange: (visible: boolean) => void
) {
  const section = node.closest("section");
  let intersects = typeof IntersectionObserver === "undefined";

  const updateVisibility = () => {
    onVisibilityChange(intersects && section?.style.pointerEvents !== "none");
  };
  updateVisibility();

  const intersectionObserver =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver((entries) => {
          intersects = entries.some((entry) => entry.isIntersecting);
          updateVisibility();
        });
  intersectionObserver?.observe(node);

  const stageObserver = new MutationObserver(updateVisibility);
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
