/**
 * The display's own frame interval, for audits that grade frames against it.
 *
 * Extracted from `audit-frame-budget.mjs` when `audit-create-entry.mjs` became
 * its second consumer. The budget is never hardcoded to 60 Hz: a 120 Hz panel
 * demands 8.3 ms frames and a 60 Hz one 16.7 ms, from the same command.
 */

/**
 * Snap a measured interval to the nearest real refresh rate, so scheduling
 * noise cannot invent an impossible budget.
 *
 * Deriving this from the loaded page's own frames was wrong: on a janky or
 * CPU-throttled page the recorder's frames bunch unpredictably, and a single
 * short delta once produced a "155Hz" display and a 6.4ms budget. The interval
 * is measured on a blank page instead (see `measureDisplayInterval`), where an
 * empty rAF loop runs at exactly vsync.
 */
export function snapToRefreshRate(measuredMs) {
  const known = [
    1000 / 240,
    1000 / 165,
    1000 / 144,
    1000 / 120,
    1000 / 90,
    1000 / 60,
    1000 / 50,
    1000 / 30,
  ];
  let best = 1000 / 60;
  let bestErr = Infinity;
  for (const k of known) {
    const err = Math.abs(measuredMs - k);
    if (err < bestErr) {
      bestErr = err;
      best = k;
    }
  }
  return best;
}

/**
 * An empty rAF loop on about:blank runs at exactly the display's refresh rate.
 * Call it on a blank, foregrounded tab before any page or CPU throttle loads;
 * that is the only moment the reading is clean.
 *
 * `evaluate(source)` runs an async arrow's source in the page and returns its
 * value, so each audit keeps its own CDP client.
 */
export async function measureDisplayInterval(evaluate) {
  const median = await evaluate(
    `async () => {
      const f = [];
      let last = performance.now();
      let h = 0;
      let stop = false;
      const tick = () => { const n = performance.now(); f.push(n - last); last = n; if (!stop) h = requestAnimationFrame(tick); };
      h = requestAnimationFrame(tick);
      await new Promise((r) => setTimeout(r, 1000));
      stop = true;
      cancelAnimationFrame(h);
      const s = f.slice(2).sort((a, b) => a - b);
      return s.length ? s[Math.floor(s.length / 2)] : 16.7;
    }`
  );
  return snapToRefreshRate(median);
}
