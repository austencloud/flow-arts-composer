import { describe, expect, it } from "vitest";
import { measureEditor } from "$lib/features/browse/gallery-home/pane-height-budget";

/** jsdom has no layout: the box and the overflow are set per element. */
function box(
  element: HTMLElement,
  geometry: { top: number; height: number; scrollHeight: number }
): void {
  element.getBoundingClientRect = () =>
    ({
      top: geometry.top,
      bottom: geometry.top + geometry.height,
      height: geometry.height,
      width: 404,
      left: 0,
      right: 404,
      x: 0,
      y: geometry.top,
      toJSON: () => ({}),
    }) as DOMRect;
  Object.defineProperty(element, "scrollHeight", {
    configurable: true,
    get: () => geometry.scrollHeight,
  });
}

/**
 * The project's vitest setup replaces `document.createElement` with plain
 * mocks, so the tree is parsed from markup instead. Inline styles carry the
 * two declarations the measurer reads: the screen's row gap and the list's
 * `grid-auto-rows` track.
 */
function editorScreen(listHeight: number) {
  document.body.innerHTML = `
    <div class="drill-editor-stage">
      <div class="drill-screen" style="display:flex;row-gap:7.2px">
        <header></header>
        <div class="value-list" style="display:grid;grid-auto-rows:minmax(min-content, 164px);row-gap:7.2px">
          <button></button><button></button><button></button>
        </div>
      </div>
    </div>`;
  const stage = document.querySelector<HTMLElement>(".drill-editor-stage")!;
  const screen = stage.querySelector<HTMLElement>(".drill-screen")!;
  const header = screen.querySelector<HTMLElement>("header")!;
  const list = screen.querySelector<HTMLElement>(".value-list")!;

  box(screen, { top: 0, height: 72, scrollHeight: 736 });
  box(header, { top: 0, height: 68, scrollHeight: 68 });
  box(list, { top: 75, height: listHeight, scrollHeight: 657 });
  [...list.children].forEach((card, index) => {
    box(card as HTMLElement, {
      top: 75 + index * 222,
      height: 212,
      scrollHeight: 212,
    });
  });

  return { screen, stage };
}

describe("split-pane editor measurement", () => {
  it("still counts the option rows when the list has been squeezed to 0px", () => {
    // The observed lock-in: a 98px editor leaves the flex list no height, so
    // its box reads 0 while its three 212px rows sit below the fold.
    const { screen, stage } = editorScreen(0);

    const measurement = measureEditor(screen, stage);

    expect(measurement.rowCount).toBe(3);
    expect(measurement.rowMinimum).toBe(212);
    expect(measurement.rowMaximum).toBe(212);
    expect(measurement.rowBlock).not.toBeNull();
    // Header plus the one gap between two present children; the row block
    // contributes rows, not fixed height.
    expect(measurement.fixed).toBeCloseTo(68 + 7.2, 5);
  });

  it("measures a laid-out list the same way", () => {
    const { screen, stage } = editorScreen(657);

    const measurement = measureEditor(screen, stage);

    expect(measurement.rowCount).toBe(3);
    expect(measurement.fixed).toBeCloseTo(68 + 7.2, 5);
  });
});
