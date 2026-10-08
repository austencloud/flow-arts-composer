/**
 * The boot screen in app.html covers app routes until the shell takes over
 * (the `loaded` class starts its fade). The previews wait for it so a first
 * visit does not spend round 1 behind it. Landing routes hide it with
 * display: none, and some test routes remove it. If the shell never hands
 * over, app.html's 15 s safety net adds `loaded`, so waiting cannot strand
 * the turns.
 */

const BOOT_SCREEN_ID = "app-loading";

function covers(screen: HTMLElement): boolean {
  return (
    screen.isConnected &&
    !screen.classList.contains("loaded") &&
    screen.style.display !== "none"
  );
}

/**
 * Runs `go` at once when no boot screen covers the page, and otherwise once
 * the screen starts to leave. The returned cancel stops a pending `go`.
 */
export function runAfterBootScreen(go: () => void): () => void {
  const screen = document.getElementById(BOOT_SCREEN_ID);
  if (!screen || !covers(screen)) {
    go();
    return () => {};
  }

  // Watch the screen's own class and style, and its parent's children for
  // removal. Nothing wider: the page body changes constantly while it boots.
  const observer = new MutationObserver(() => {
    if (covers(screen)) return;
    observer.disconnect();
    go();
  });
  observer.observe(screen, {
    attributes: true,
    attributeFilter: ["class", "style"],
  });
  observer.observe(screen.parentNode!, { childList: true });

  return () => observer.disconnect();
}
