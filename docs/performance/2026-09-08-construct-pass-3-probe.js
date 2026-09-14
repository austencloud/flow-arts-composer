// Run this async function in the dedicated browser on a warmed Construct page.
// It changes only the local draft: start from alpha with no added steps.
// Return values are timing evidence, not a claim of compositor-level paint.
async () => {
  const results = [];
  for (let i = 0; i < 3; i++) {
    const undo = [...document.querySelectorAll("button")].find((x) =>
      (x.getAttribute("aria-label") || "").startsWith(
        "Undo Select start position"
      )
    );
    if (undo) undo.click();
    const until = async (test, limit = 5000) => {
      const s = performance.now();
      while (!test()) {
        if (performance.now() - s > limit) throw Error("Timed out");
        await new Promise(requestAnimationFrame);
      }
    };
    await until(() =>
      document.querySelector('[data-ghost-kind="start-position"]')
    );
    await new Promise((r) => setTimeout(r, 650));
    sessionStorage.setItem("tka-option-picker-panel", "0");
    const start = performance.now();
    let firstDom = null;
    let firstPaintable = null;
    document.querySelector('[data-ghost-kind="start-position"]').click();
    await until(() => {
      const cards = [
        ...document.querySelectorAll('[data-ghost-kind="option"]'),
      ];
      if (cards.length && firstDom === null)
        firstDom = { duration: performance.now() - start, count: cards.length };
      const el = cards.find((x) => !x.closest("[inert]"));
      if (!el || !el.querySelector("svg")) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return false;
      for (let p = el; p; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (
          s.display === "none" ||
          s.visibility === "hidden" ||
          +s.opacity < 0.95
        )
          return false;
      }
      if (
        !el.contains(
          document.elementFromPoint(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2
          )
        )
      )
        return false;
      firstPaintable = {
        duration: performance.now() - start,
        count: cards.length,
      };
      return true;
    });
    results.push({ firstDom, firstPaintable });
    await new Promise((r) => setTimeout(r, 500));
  }
  return results;
};
