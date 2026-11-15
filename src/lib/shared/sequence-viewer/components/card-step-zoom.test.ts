import { describe, expect, it } from "vitest";
import {
  boxOnScreen,
  liftTransform,
  neighborStep,
  swipeStep,
  zoomStepOrder,
  type ZoomBox,
} from "./card-step-zoom";

describe("zoomStepOrder", () => {
  it("walks the start position first only when the card shows it", () => {
    expect(zoomStepOrder([2, -1, 0, 1], true)).toEqual([-1, 0, 1, 2]);
    expect(zoomStepOrder([2, -1, 0, 1], false)).toEqual([0, 1, 2]);
  });
});

describe("neighborStep", () => {
  const order = [-1, 0, 1];

  it("stops at both ends instead of wrapping", () => {
    expect(neighborStep(order, -1, -1)).toBeNull();
    expect(neighborStep(order, 1, 1)).toBeNull();
    expect(neighborStep(order, 0, -1)).toBe(-1);
    expect(neighborStep(order, 0, 1)).toBe(1);
  });

  it("has no neighbour for a step the card no longer shows", () => {
    expect(neighborStep(order, 7, 1)).toBeNull();
  });
});

describe("swipeStep", () => {
  const width = 360;

  it("moves on after a drag past a third of the picture", () => {
    expect(swipeStep(-130, 0, width)).toBe(1);
    expect(swipeStep(130, 0, width)).toBe(-1);
  });

  it("settles back after a slow short drag", () => {
    expect(swipeStep(-80, 0.05, width)).toBe(0);
  });

  it("moves on after a quick flick in the drag's direction", () => {
    expect(swipeStep(-40, -0.8, width)).toBe(1);
  });

  it("ignores a flick back against the drag and a tap-sized wobble", () => {
    expect(swipeStep(-80, 0.8, width)).toBe(0);
    expect(swipeStep(-6, -2, width)).toBe(0);
  });
});

describe("liftTransform", () => {
  // Applying `translate(dx, dy) scale(sx, sy)` with origin 0 0 to the
  // destination box must land exactly on the source cell.
  function apply(transform: string, box: ZoomBox): ZoomBox {
    const [dx, dy, sx, sy] = (transform.match(/-?\d+(\.\d+)?/g) ?? []).map(
      Number
    ) as [number, number, number, number];
    return {
      left: box.left + dx,
      top: box.top + dy,
      width: box.width * sx,
      height: box.height * sy,
    };
  }

  it("lays the enlarged picture over the cell it grows from", () => {
    const cell = { left: 197, top: 344, width: 96, height: 96 };
    const enlarged = { left: 16, top: 140, width: 360, height: 360 };
    const landed = apply(liftTransform(cell, enlarged), enlarged);
    expect(landed.left).toBeCloseTo(cell.left, 1);
    expect(landed.top).toBeCloseTo(cell.top, 1);
    expect(landed.width).toBeCloseTo(cell.width, 1);
    expect(landed.height).toBeCloseTo(cell.height, 1);
  });

  it("does not divide by an unmeasured picture", () => {
    expect(
      liftTransform(
        { left: 0, top: 0, width: 50, height: 50 },
        { left: 0, top: 0, width: 0, height: 0 }
      )
    ).toBe("none");
  });
});

describe("boxOnScreen", () => {
  it("treats a cell scrolled out of the card's view as gone", () => {
    expect(
      boxOnScreen({ left: 10, top: -120, width: 96, height: 96 }, 392, 735)
    ).toBe(false);
    expect(
      boxOnScreen({ left: 10, top: 700, width: 96, height: 96 }, 392, 735)
    ).toBe(true);
  });
});
