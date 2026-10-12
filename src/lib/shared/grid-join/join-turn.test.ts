/**
 * The join turn: a rotate of a joined sequence turns the joined grids 45°
 * about the cell center, so the new layout must be the old one turned (or
 * the picture would slide rather than spin), and the outer dots morph
 * between filled and ring on the way, as a single grid's do.
 */
import { describe, expect, it } from "vitest";
import { getGridJoinLayout, type GridJoinSpec } from "@tka/render-core";
import { rotateGridJoin } from "#lib/shared/create/services/grid-join-transforms.js";
import { flipsDiamondBox } from "./join-slide.svelte";
import { turningGridMarkup } from "#lib/shared/pictograph/grid/services/joined-grid-markup.js";

const SCENE_CENTER = 475;

/** A point turned `degrees` clockwise about the scene center (SVG sense). */
function turned(point: { x: number; y: number }, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  const dx = point.x - SCENE_CENTER;
  const dy = point.y - SCENE_CENTER;
  return {
    x: SCENE_CENTER + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: SCENE_CENTER + dx * Math.sin(radians) + dy * Math.cos(radians),
  };
}

const MARKUP_OPTIONS = {
  darkMode: true,
  grids: { left: "diamond", right: "diamond" },
  handColors: { left: "#2e3192", right: "#ed1c24" },
} as const;

describe("join turn", () => {
  it.each([
    [{ toward: "e", steps: 1 }, 1],
    [{ toward: "e", steps: 1 }, -1],
    [{ toward: "n", steps: 2 }, 1],
    [{ toward: "w", steps: 2 }, -1],
  ] as const)(
    "the layout after rotating %j by %d step is the old layout turned 45°",
    (join: GridJoinSpec, direction: 1 | -1) => {
      const before = getGridJoinLayout(join, "diamond");
      const after = getGridJoinLayout(rotateGridJoin(join, direction), "box");
      expect(after.points.length).toBe(before.points.length);
      for (const point of before.points) {
        const expected = turned(point, 45 * direction);
        const match = after.points.find(
          (candidate) =>
            candidate.kind === point.kind &&
            Math.hypot(candidate.x - expected.x, candidate.y - expected.y) < 0.5
        );
        expect(match, `${point.kind} at ${point.x},${point.y}`).toBeDefined();
      }
    }
  );

  it("only a diamond <-> box flip turns", () => {
    expect(flipsDiamondBox("diamond", "box")).toBe(true);
    expect(flipsDiamondBox("box", "diamond")).toBe(true);
    expect(flipsDiamondBox("diamond", "diamond")).toBe(false);
    expect(flipsDiamondBox("box", "box")).toBe(false);
    expect(flipsDiamondBox("diamond", "skewed")).toBe(false);
    expect(flipsDiamondBox("skewed", "box")).toBe(false);
    expect(flipsDiamondBox(undefined, "box")).toBe(true);
    // Each hand on its own grid: a whole-picture flip turns, a one-hand
    // turn (diamond beside box) never does.
    const both = { left: "box", right: "box" } as const;
    const mixed = { left: "box", right: "diamond" } as const;
    expect(flipsDiamondBox("diamond", both)).toBe(true);
    expect(flipsDiamondBox(both, { left: "diamond", right: "diamond" })).toBe(
      true
    );
    expect(flipsDiamondBox("diamond", mixed)).toBe(false);
    expect(flipsDiamondBox(mixed, "box")).toBe(false);
    expect(flipsDiamondBox(mixed, both)).toBe(false);
  });

  it("outer dots cross from filled to ring with the turn", () => {
    const layout = getGridJoinLayout({ toward: "e", steps: 1 }, "diamond");
    const outerCount = layout.points.filter((p) => p.kind === "outer").length;
    expect(outerCount).toBeGreaterThan(0);

    const filled = turningGridMarkup(layout, 0, MARKUP_OPTIONS);
    const midway = turningGridMarkup(layout, 0.5, MARKUP_OPTIONS);
    const ring = turningGridMarkup(layout, 1, MARKUP_OPTIONS);

    const count = (markup: string, needle: string) =>
      markup.split(needle).length - 1;
    expect(count(filled, 'fill-opacity="1.000"')).toBe(outerCount);
    expect(count(filled, 'stroke-opacity="0.000"')).toBe(outerCount);
    expect(count(midway, 'fill-opacity="0.500"')).toBe(outerCount);
    expect(count(midway, 'stroke-opacity="0.500"')).toBe(outerCount);
    expect(count(ring, 'fill-opacity="0.000"')).toBe(outerCount);
    expect(count(ring, 'stroke-opacity="1.000"')).toBe(outerCount);
    // The other dots are drawn as at rest: plain filled circles.
    expect(count(ring, "<circle")).toBe(layout.points.length);
  });
});
