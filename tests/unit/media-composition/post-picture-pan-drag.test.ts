import { describe, expect, it } from "vitest";
import {
  dragPicturePan,
  overscanPixels,
  stepPicturePinch,
  zoomFromWheelDelta,
} from "$lib/shared/share/components/post-studio/editor/post-picture-pan-drag";

function close(actual: number, expected: number) {
  expect(actual).toBeCloseTo(expected, 9);
}

// A 16:9 source in a region exactly as tall as the source (900px) and half as
// wide (800px). Cover fits the height exactly at zoom 1 - no vertical
// overscan yet, but any zoom beyond that overflows it too - while contain
// fits the width exactly and letterboxes top and bottom.
const SOURCE = { sourceWidth: 1600, sourceHeight: 900 };
const REGION = { regionWidthPx: 800, regionHeightPx: 900 };

describe("overscanPixels", () => {
  it("is zero when the mounted size is not known yet", () => {
    expect(
      overscanPixels({ ...SOURCE, ...REGION, fit: "cover", zoom: 1, sourceWidth: 0 })
    ).toEqual({ x: 0, y: 0 });
  });

  it("overflows only the width for a cover fit at zoom 1", () => {
    const overscan = overscanPixels({ ...SOURCE, ...REGION, fit: "cover", zoom: 1 });
    close(overscan.x, 800);
    close(overscan.y, 0);
  });

  it("has no overscan for a contain fit at zoom 1, and only what the zoom adds", () => {
    const atOne = overscanPixels({ ...SOURCE, ...REGION, fit: "contain", zoom: 1 });
    close(atOne.x, 0);
    close(atOne.y, 0);
    const atThree = overscanPixels({ ...SOURCE, ...REGION, fit: "contain", zoom: 3 });
    close(atThree.x, 1600);
    close(atThree.y, 450);
  });
});

describe("dragPicturePan", () => {
  it("moves an overscanning axis by the pixel delta over the overscan", () => {
    const result = dragPicturePan({
      ...SOURCE,
      ...REGION,
      fit: "cover",
      zoom: 1,
      startPanX: 0,
      startPanY: 0,
      deltaXPx: 160, // 20% of the 800px overscan
      deltaYPx: 100,
    });
    close(result.panX, 0.2);
    // Y has no overscan at this fit and zoom, so it does not move at all.
    close(result.panY, 0);
  });

  it("clamps pan to the picture's edge", () => {
    const result = dragPicturePan({
      ...SOURCE,
      ...REGION,
      fit: "cover",
      zoom: 1,
      startPanX: 0.4,
      startPanY: 0,
      deltaXPx: 800, // the full overscan, plus the existing 0.4 pan
      deltaYPx: 0,
    });
    close(result.panX, 0.5);
  });
});

describe("zoomFromWheelDelta", () => {
  it("zooms in on a negative delta (pinch out / scroll up) and out on a positive one", () => {
    expect(zoomFromWheelDelta(1, -100, 0.5, 4)).toBeGreaterThan(1);
    expect(zoomFromWheelDelta(1, 100, 0.5, 4)).toBeLessThan(1);
  });

  it("leaves the zoom alone for a zero or non-finite delta", () => {
    expect(zoomFromWheelDelta(1.5, 0, 0.5, 4)).toBe(1.5);
    expect(zoomFromWheelDelta(1.5, Number.NaN, 0.5, 4)).toBe(1.5);
  });

  it("clamps to the zoom bounds", () => {
    expect(zoomFromWheelDelta(3.9, -1000, 0.5, 4)).toBe(4);
    expect(zoomFromWheelDelta(0.6, 1000, 0.5, 4)).toBe(0.5);
  });
});

describe("stepPicturePinch", () => {
  it("zooms by the finger-distance ratio and pans by the midpoint move, at the new zoom's overscan", () => {
    const result = stepPicturePinch({
      ...SOURCE,
      ...REGION,
      fit: "cover",
      zoom: 1,
      panX: 0,
      panY: 0,
      distanceRatio: 1.5,
      midpointDeltaXPx: 160, // 10% of the 1600px overscan at zoom 1.5
      midpointDeltaYPx: 45, // 10% of the 450px overscan at zoom 1.5
      minZoom: 0.5,
      maxZoom: 4,
    });
    close(result.zoom, 1.5);
    // At zoom 1 this fit had no vertical overscan, but zooming to 1.5 makes
    // the picture overflow vertically too, so the pinch's midpoint move now
    // pans that axis as well.
    close(result.panX, 0.1);
    close(result.panY, 0.1);
  });

  it("still pans when the ratio itself is not usable", () => {
    const result = stepPicturePinch({
      ...SOURCE,
      ...REGION,
      fit: "cover",
      zoom: 1,
      panX: 0.1,
      panY: 0,
      distanceRatio: Number.NaN,
      midpointDeltaXPx: 0,
      midpointDeltaYPx: 500,
      minZoom: 0.5,
      maxZoom: 4,
    });
    close(result.zoom, 1);
    close(result.panX, 0.1);
    close(result.panY, 0);
  });

  it("clamps the zoomed-by-ratio result to the zoom bounds", () => {
    const result = stepPicturePinch({
      ...SOURCE,
      ...REGION,
      fit: "cover",
      zoom: 3,
      panX: 0,
      panY: 0,
      distanceRatio: 3,
      midpointDeltaXPx: 0,
      midpointDeltaYPx: 0,
      minZoom: 0.5,
      maxZoom: 4,
    });
    close(result.zoom, 4);
  });
});
