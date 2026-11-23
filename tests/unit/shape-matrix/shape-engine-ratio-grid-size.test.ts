import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The Ratios stage draws its hands on a canvas and its pictograph grid as a
// separate svg square. They agree only if that square keeps the size its
// formula gives it, so a stray cap shows up nowhere but on screen: the hands
// travel a wider circle than the hand points mark.
const stage = readFileSync(
  "packages/shape-engine/src/app/components/ShapeMatrixLiveRatioStage.svelte",
  "utf8"
);

function ruleBody(selector: string): string {
  const start = stage.indexOf(`${selector} {`);
  expect(start, `${selector} rule`).toBeGreaterThan(-1);
  return stage.slice(start, stage.indexOf("}", start));
}

describe("Ratios stage grid size", () => {
  it("lets the grid square grow past its box, which the site svg reset would cap", () => {
    const grid = ruleBody(".tka-grid");
    expect(grid).toContain("width: calc(min(100cqw, 100cqh) * var(--grid-span));");
    expect(grid).toMatch(/max-width:\s*none;/);
  });

  it("cuts the square's empty margin instead of letting it widen the page", () => {
    expect(ruleBody(".live-frame")).toMatch(/overflow:\s*hidden;/);
  });

  it("puts a grid hand point exactly one hand radius from the centre", () => {
    // GRID_SPAN = 950 / ENGINE_GRID_RADIUS / (VIEW * 2); the canvas maps the
    // shorter side onto VIEW * 2 hand radii. Both must stay these formulas.
    expect(stage).toContain(
      "const GRID_SPAN = GRID_VIEWBOX / ENGINE_GRID_RADIUS / (VIEW * 2);"
    );
    expect(stage).toContain(
      "const scale = Math.min(cssWidth, cssHeight) / (VIEW * 2);"
    );
  });
});
