/**
 * The placeholders must stand exactly where BrowseGrid's flat grid will put
 * the cards, or the page jumps at the swap. Asserted against flatGridRows, the
 * one packing both draw from, never against copied numbers. Without step
 * counts the skeleton keeps its even grid.
 */
import { render } from "vitest-browser-svelte";
import { describe, expect, it } from "vitest";
import { flushSync, tick } from "svelte";
import { getImageCompositionManager } from "#lib/shared/share/state/image-composition-state.svelte.js";
import {
  FLAT_GRID_GAP,
  flatGridRows,
  justifiedCardWidth,
} from "./justified-rows";
import Harness from "./__tests__/SkeletonWidthHarness.svelte";

// 392 px phone less BrowsePanel's narrow 8 px padding each side.
const WIDTH = 376;
const COLUMNS = 2;

async function settle() {
  flushSync();
  await tick();
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  flushSync();
}

function cardRects(host: Element) {
  const origin = host.getBoundingClientRect();
  return [...host.querySelectorAll(".skeleton-card")].map((el) => {
    const r = el.getBoundingClientRect();
    return {
      x: r.left - origin.left,
      y: r.top - origin.top,
      w: r.width,
      h: r.height,
    };
  });
}

function expectedRects(stepCounts: number[], count: number) {
  const manager = getImageCompositionManager();
  const { rows, aspects } = flatGridRows(stepCounts, WIDTH, COLUMNS, (s) =>
    manager.getStartPlacementLayoutForStepCount(s)
  );
  const out: { x: number; y: number; w: number; h: number }[] = [];
  let y = 0;
  for (const row of rows) {
    if (row.start >= count) break;
    const shown = Math.min(row.count, count - row.start);
    const widths = Array.from({ length: shown }, (_, i) =>
      justifiedCardWidth(aspects[row.start + i]!, row.height)
    );
    // A filled row spans the width exactly; the browser rounds within a pixel.
    let x = 0;
    for (const w of widths) {
      out.push({ x, y, w, h: row.height });
      x += w + FLAT_GRID_GAP;
    }
    y += row.height + FLAT_GRID_GAP;
  }
  return out;
}

describe("BrowseThumbnailSkeleton", () => {
  it("draws the grid's justified rows when the step counts are known", async () => {
    // Two 20-step cards (each fills a row at this width) then a mixed tail.
    const steps = [20, 20, 8, 4, 4, 16, 12, 8];
    const screen = render(Harness, {
      width: WIDTH,
      count: 12,
      columns: COLUMNS,
      stepCounts: steps,
    });
    await settle();
    const host = screen.container.querySelector('[data-testid="host"]')!;
    const actual = cardRects(host);
    const expected = expectedRects(steps, 12);
    expect(actual).toHaveLength(expected.length);
    expected.forEach((e, i) => {
      const a = actual[i]!;
      expect(Math.abs(a.x - e.x), `card ${i} x`).toBeLessThanOrEqual(1);
      expect(Math.abs(a.y - e.y), `card ${i} y`).toBeLessThanOrEqual(1);
      expect(Math.abs(a.w - e.w), `card ${i} width`).toBeLessThanOrEqual(1);
      expect(Math.abs(a.h - e.h), `card ${i} height`).toBeLessThanOrEqual(1);
    });
  });

  it("still caps at the placeholder count", async () => {
    const steps = Array.from({ length: 20 }, () => 4);
    const screen = render(Harness, {
      width: WIDTH,
      count: 12,
      columns: COLUMNS,
      stepCounts: steps,
    });
    await settle();
    expect(screen.container.querySelectorAll(".skeleton-card")).toHaveLength(
      12
    );
  });

  it("keeps the even grid without step counts", async () => {
    const screen = render(Harness, {
      width: WIDTH,
      count: 6,
      columns: COLUMNS,
    });
    await settle();
    const grid = screen.container.querySelector(
      ".skeleton-grid"
    ) as HTMLElement;
    expect(grid).not.toBeNull();
    expect(screen.container.querySelector(".skeleton-rows")).toBeNull();
    expect(grid.style.gridTemplateColumns).toBe("repeat(2, 1fr)");
    const rects = cardRects(
      screen.container.querySelector('[data-testid="host"]')!
    );
    expect(rects).toHaveLength(6);
    // One even shape: every card the same size.
    for (const r of rects) {
      expect(Math.abs(r.w - rects[0]!.w)).toBeLessThan(0.5);
      expect(Math.abs(r.h - rects[0]!.h)).toBeLessThan(0.5);
    }
  });
});
