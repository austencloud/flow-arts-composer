// The boot screen in app.html covers every route until the shell takes over
// (the `loaded` class starts its fade). The previews wait for it so a first
// visit does not spend round 1 behind it. The screen always leaves, by fade,
// by display: none on landing routes, or by removal, so waiting cannot strand
// the turns.

const BOOT_SCREEN_ID = "app-loading";

function bootScreenCovers(): boolean {
  const screen = document.getElementById(BOOT_SCREEN_ID);
  return (
    screen !== null &&
    !screen.classList.contains("loaded") &&
    screen.style.display !== "none"
  );
}

/**
 * Runs `go` at once when no boot screen covers the page, and otherwise once
 * the screen starts to leave. The returned cancel guarantees `go` never runs.
 */
export function runAfterBootScreen(go: () => void): () => void {
  const screen = document.getElementById(BOOT_SCREEN_ID);
  if (!screen || !bootScreenCovers()) {
    go();
    return () => {};
  }

  // Watch the screen's own class and style, and its parent's children for
  // removal. Nothing wider: the page body changes constantly while it boots.
  const observer = new MutationObserver(() => {
    if (bootScreenCovers()) return;
    observer.disconnect();
    go();
  });
  observer.observe(screen, {
    attributes: true,
    attributeFilter: ["class", "style"],
  });
  if (screen.parentNode)
    observer.observe(screen.parentNode, { childList: true });

  return () => observer.disconnect();
}
