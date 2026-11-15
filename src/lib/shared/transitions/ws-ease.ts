/**
 * ws-ease — JS twins of the sequence-viewer "workstation" choreography tokens.
 *
 * The practice enter/exit motion runs the rail collapse, bottom-bar reserve and
 * canvas glide as CSS transitions on these tokens:
 *
 *   --ws-dur:  300ms;
 *   --ws-ease: cubic-bezier(0.2, 0, 0, 1);   // Material 3 "emphasized decelerate"
 *
 * Svelte JS transitions (the deck slide, the setup-pane bloom) can't read those
 * CSS variables, so they historically defaulted to `cubicOut` — a DIFFERENT
 * curve, which kept the structure and the content from moving as one body. These
 * exports are the exact JS twins so every motion rides the identical clock and
 * curve. Keep them in lockstep with the CSS above if either changes.
 */

export const WS_DUR = 300;

/**
 * Build an easing function equivalent to CSS `cubic-bezier(p1x,p1y,p2x,p2y)`.
 * Inverts x(t) with Newton-Raphson, bisection fallback — the WebKit/Chromium
 * UnitBezier method, so the JS curve matches the browser's CSS curve exactly.
 */
export function cssCubicBezier(
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number
): (t: number) => number {
  const ax = 3 * p1x - 3 * p2x + 1;
  const bx = 3 * p2x - 6 * p1x;
  const cx = 3 * p1x;
  const ay = 3 * p1y - 3 * p2y + 1;
  const by = 3 * p2y - 6 * p1y;
  const cy = 3 * p1y;
  const xOf = (t: number) => ((ax * t + bx) * t + cx) * t;
  const yOf = (t: number) => ((ay * t + by) * t + cy) * t;
  const dxOf = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // Newton-Raphson: fast, converges in a few iterations for typical curves.
    let t = x;
    for (let i = 0; i < 8; i++) {
      const dx = xOf(t) - x;
      if (Math.abs(dx) < 1e-5) return yOf(t);
      const slope = dxOf(t);
      if (Math.abs(slope) < 1e-6) break;
      t -= dx / slope;
    }
    // Bisection fallback for the rare non-convergent case.
    let lo = 0;
    let hi = 1;
    t = x;
    while (lo < hi) {
      const xe = xOf(t);
      if (Math.abs(xe - x) < 1e-5) break;
      if (x > xe) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return yOf(t);
  };
}

/**
 * The app's standard `--ease-in-out` curve (app.css) as a JS easing. motion.ts
 * re-exports it as `standardEasing`; it lives here, with no Svelte import, so
 * pure timing code (a Post Studio clip's lifted panel) can sample it too.
 */
export const standardEasing = cssCubicBezier(0.4, 0, 0.2, 1);

/** The shared `--ws-ease` curve as a JS easing (Material 3 emphasized decelerate). */
export const wsEase = cssCubicBezier(0.2, 0, 0, 1);
