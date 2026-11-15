import { describe, expect, it } from "vitest";
import { returnTransforms, type ReturnRect } from "./playback-return";

/** Where `translate(x, y) scale(s)` about `element`'s centre puts `point`. */
function apply(
  transform: string,
  element: ReturnRect,
  point: { x: number; y: number }
): { x: number; y: number; scale: number } {
  const match =
    /translate\((-?[\d.e-]+)px, (-?[\d.e-]+)px\) scale\(([\d.e-]+)\)/.exec(
      transform
    )!;
  const [x, y, scale] = match.slice(1).map(Number) as [number, number, number];
  const ox = element.left + element.width / 2;
  const oy = element.top + element.height / 2;
  return {
    x: ox + x + scale * (point.x - ox),
    y: oy + y + scale * (point.y - oy),
    scale,
  };
}

// Measured live at Stop on an unfolded Fold (707 by 772), viewport numbers.
const source: ReturnRect = { left: 1, top: 0, width: 705, height: 579 };
const canvas: ReturnRect = {
  left: 128.7,
  top: 81,
  width: 449.6,
  height: 449.6,
};
const grid: ReturnRect = { left: 76, top: 97.5, width: 555, height: 222 };

describe("returnTransforms", () => {
  const result = returnTransforms({
    canvas,
    grid,
    playerSource: source,
    gridSource: source,
  })!;

  it("shrinks the canvas square to the grid's tighter side", () => {
    expect(result.scale).toBeCloseTo(222 / 449.6, 6);
  });

  it("lands the canvas centre on the grid centre, scaled by k", () => {
    const end = apply(result.player, source, { x: 353.5, y: 305.8 });
    expect(end.x).toBeCloseTo(353.5, 6);
    expect(end.y).toBeCloseTo(208.5, 6);
    expect(end.scale).toBeCloseTo(result.scale, 6);
  });

  it("starts the grid centre on the canvas centre, grown by 1/k", () => {
    const start = apply(result.grid, source, { x: 353.5, y: 208.5 });
    expect(start.x).toBeCloseTo(353.5, 6);
    expect(start.y).toBeCloseTo(305.8, 6);
    expect(start.scale).toBeCloseTo(1 / result.scale, 6);
  });

  it("works against each source's own centre", () => {
    const shifted: ReturnRect = { left: 40, top: 30, width: 600, height: 500 };
    const moved = returnTransforms({
      canvas,
      grid,
      playerSource: shifted,
      gridSource: source,
    })!;
    const end = apply(moved.player, shifted, { x: 353.5, y: 305.8 });
    expect(end.x).toBeCloseTo(353.5, 6);
    expect(end.y).toBeCloseTo(208.5, 6);
  });

  it("does not run with no size or out of range", () => {
    const empty = { ...canvas, width: 0, height: 0 };
    expect(
      returnTransforms({
        canvas: empty,
        grid,
        playerSource: source,
        gridSource: source,
      })
    ).toBeNull();
    expect(
      returnTransforms({
        canvas: { ...canvas, width: 100, height: 100 },
        grid,
        playerSource: source,
        gridSource: source,
      })
    ).toBeNull();
  });
});
