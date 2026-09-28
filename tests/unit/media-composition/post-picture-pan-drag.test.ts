import { describe, expect, it } from "vitest";
import { calculateMediaFit } from "$lib/shared/media-composition/services/media-fit";
import {
  PICTURE_NUDGE,
  dragPicturePan,
  nudgePicturePan,
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

// A 720x1280 take in the full-frame box the editor preview really measured:
// the same 9:16 shape, so a cover fit fills it exactly, except that the fit's
// float math leaves the drawn width about 3e-14px wider than the box.
const SAME_SHAPE = {
  sourceWidth: 720,
  sourceHeight: 1280,
  regionWidthPx: 238.9479217529297,
  regionHeightPx: (238.9479217529297 * 1920) / 1080,
};

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

  it("counts a same-shape fit's float remainder as no overscan", () => {
    // The raw fit really does overflow by a hair here, or this proves nothing.
    const { drawRect } = calculateMediaFit({
      sourceWidth: SAME_SHAPE.sourceWidth,
      sourceHeight: SAME_SHAPE.sourceHeight,
      regionWidth: SAME_SHAPE.regionWidthPx,
      regionHeight: SAME_SHAPE.regionHeightPx,
      fit: "cover",
    });
    expect(drawRect.width).toBeGreaterThan(SAME_SHAPE.regionWidthPx);
    expect(overscanPixels({ ...SAME_SHAPE, fit: "cover", zoom: 1 })).toEqual({ x: 0, y: 0 });
  });

  it("measures a turned picture by its turned outline", () => {
    // A quarter turn stands the 1600x900 cover fit on end: 900 across and
    // 1600 down, so it now overflows the 800x900 box both ways.
    const quarter = overscanPixels({
      ...SOURCE,
      ...REGION,
      fit: "cover",
      zoom: 1,
      rotation: 90,
    });
    close(quarter.x, 100);
    close(quarter.y, 700);
    // Turned 30 degrees, the 800x450 contain fit spans about 918 across and
    // 790 down: past the box's width, still inside its height.
    const tilted = overscanPixels({
      ...SOURCE,
      ...REGION,
      fit: "contain",
      zoom: 1,
      rotation: 30,
    });
    expect(tilted.x).toBeCloseTo(117.82, 2);
    close(tilted.y, 0);
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

  it("leaves the pan alone when the picture fits its box exactly", () => {
    // Dividing this drag by the fit's 3e-14px remainder used to pin the pan
    // at -0.5 while nothing on screen moved.
    const result = dragPicturePan({
      ...SAME_SHAPE,
      fit: "cover",
      zoom: 1,
      startPanX: 0,
      startPanY: 0,
      deltaXPx: -40,
      deltaYPx: 30,
    });
    expect(result).toEqual({ panX: 0, panY: 0 });
  });

  it("pans a turned picture against its turned overflow", () => {
    // Stood on end, the picture hides only 100px across, so a 50px drag is
    // half its pan range; before the turn it was a sixteenth.
    const result = dragPicturePan({
      ...SOURCE,
      ...REGION,
      fit: "cover",
      zoom: 1,
      rotation: 90,
      startPanX: 0,
      startPanY: 0,
      deltaXPx: 50,
      deltaYPx: -70,
    });
    close(result.panX, 0.5);
    close(result.panY, -0.1);
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

describe("nudgePicturePan", () => {
  const cover = { ...SOURCE, ...REGION, fit: "cover" as const, zoom: 1 };

  it("pans one step the way the key points, as a drag that way would", () => {
    const right = nudgePicturePan({
      ...cover,
      panX: 0,
      panY: 0,
      directionX: 1,
      directionY: 0,
      step: PICTURE_NUDGE.step,
    });
    close(right.panX, PICTURE_NUDGE.step);
    // A drag to the right moves the pan the same way.
    expect(
      dragPicturePan({ ...cover, startPanX: 0, startPanY: 0, deltaXPx: 10, deltaYPx: 0 })
        .panX
    ).toBeGreaterThan(0);
  });

  it("leaves an axis the picture does not overflow where it is", () => {
    // Cover at zoom 1 fills the height exactly: nothing to pan vertically.
    const down = nudgePicturePan({
      ...cover,
      panX: 0.2,
      panY: 0,
      directionX: 0,
      directionY: 1,
      step: PICTURE_NUDGE.large,
    });
    expect(down).toEqual({ panX: 0.2, panY: 0 });
  });

  it("stops at the edge of the pan range", () => {
    const left = nudgePicturePan({
      ...cover,
      panX: -0.45,
      panY: 0,
      directionX: -1,
      directionY: 0,
      step: PICTURE_NUDGE.large,
    });
    close(left.panX, -0.5);
  });
});
