import { describe, expect, it } from "vitest";
import type { PostFraming } from "$lib/shared/media-composition/domain/post-project";
import {
  clampToCoverage,
  clampToPanRange,
  cornerFrame,
  cornerPoint,
  cornerScaleAt,
  cornerScaleRange,
  coverZoom,
  cropLimitFor,
  cropPoseOf,
  cropWindowScale,
  fillPose,
  framingOfPose,
  isCovered,
  joinRotation,
  movePose,
  overflowOf,
  overshootOf,
  pinchPose,
  quarterLeft,
  releaseCorner,
  rubberBand,
  sameFraming,
  settleTransform,
  splitRotation,
  turnPose,
  withFit,
  zoomPoseAbout,
  type CropFit,
  type CropPoint,
  type CropPose,
  type CropSize,
} from "$lib/shared/share/components/post-studio/editor/post-crop-geometry";

// The DCKΨ- take (720x1280) in the top-half slot of a 1080x1920 post. Fill
// draws it 1080x1920, twice the slot's height; Show all draws it 540x960.
const WINDOW: CropSize = { width: 1080, height: 960 };
const SOURCE: CropSize = { width: 720, height: 1280 };

const IDENTITY: PostFraming = { zoom: 1, panX: 0, panY: 0, rotation: 0 };

function poseOf(framing: Partial<PostFraming> = {}, fit: CropFit = "cover"): CropPose {
  return cropPoseOf({
    framing: { ...IDENTITY, ...framing },
    fit,
    window: WINDOW,
    source: SOURCE,
  })!;
}

/** A pose placed directly, with the offset in output pixels. */
function placed(zoom: number, rotation: number, offset: CropPoint, fit: CropFit = "cover") {
  return { ...poseOf({ rotation }, fit), zoom, rotation, offset };
}

// The tests' own trigonometry, kept apart from the module's.
function rotate(point: CropPoint, degrees: number): CropPoint {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: Math.cos(radians) * point.x - Math.sin(radians) * point.y,
    y: Math.sin(radians) * point.x + Math.cos(radians) * point.y,
  };
}

function pictureToStage(pose: CropPose, point: CropPoint): CropPoint {
  const turned = rotate({ x: point.x * pose.zoom, y: point.y * pose.zoom }, pose.rotation);
  return { x: pose.offset.x + turned.x, y: pose.offset.y + turned.y };
}

function stageToPicture(pose: CropPose, point: CropPoint): CropPoint {
  const back = rotate(
    { x: point.x - pose.offset.x, y: point.y - pose.offset.y },
    -pose.rotation
  );
  return { x: back.x / pose.zoom, y: back.y / pose.zoom };
}

function windowCorners(window: CropSize): CropPoint[] {
  const x = window.width / 2;
  const y = window.height / 2;
  return [
    { x: -x, y: -y },
    { x, y: -y },
    { x, y },
    { x: -x, y },
  ];
}

/** Every window corner lands on the picture. */
function coversWindow(pose: CropPose, tolerance = 1e-6): boolean {
  return windowCorners(pose.window).every((corner) => {
    const point = stageToPicture(pose, corner);
    return (
      Math.abs(point.x) <= pose.draw.width / 2 + tolerance &&
      Math.abs(point.y) <= pose.draw.height / 2 + tolerance
    );
  });
}

function expectPoint(actual: CropPoint, expected: CropPoint, digits = 6) {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
}

describe("cropPoseOf and framingOfPose", () => {
  it("has no pose until both sizes are known", () => {
    expect(
      cropPoseOf({ framing: IDENTITY, fit: "cover", window: WINDOW, source: null })
    ).toBeNull();
    expect(
      cropPoseOf({
        framing: IDENTITY,
        fit: "cover",
        window: WINDOW,
        source: { width: 0, height: 1280 },
      })
    ).toBeNull();
  });

  it("draws Fill at the size that covers the slot and Show all at the size that fits it", () => {
    expect(poseOf().draw).toEqual({ width: 1080, height: 1920 });
    expect(poseOf({}, "contain").draw).toEqual({ width: 540, height: 960 });
  });

  it("reads the stored pan as a share of the overflow and stores it back", () => {
    const framing = { zoom: 1.25, panX: 0.2, panY: -0.3, rotation: 12 };
    const stored = framingOfPose(poseOf(framing));
    expect(stored.zoom).toBeCloseTo(1.25, 12);
    expect(stored.panX).toBeCloseTo(0.2, 12);
    expect(stored.panY).toBeCloseTo(-0.3, 12);
    expect(stored.rotation).toBeCloseTo(12, 12);
  });

  it("stores no pan on an axis the picture does not overflow", () => {
    // Unturned Fill overflows only downward; a sideways offset is noise.
    const stored = framingOfPose(placed(1, 0, { x: 30, y: 240 }));
    expect(stored.panX).toBe(0);
    expect(stored.panY).toBeCloseTo(0.25, 12);
  });

  it("tells a real change from float noise", () => {
    const framing = { zoom: 1.3, panX: 0.1, panY: -0.2, rotation: 180 };
    expect(sameFraming(framing, { ...framing, rotation: -180 })).toBe(true);
    expect(sameFraming(framing, { ...framing, panX: 0.1 + 1e-12 })).toBe(true);
    expect(sameFraming(framing, { ...framing, zoom: 1.31 })).toBe(false);
  });
});

describe("overflowOf", () => {
  it("measures the turned picture past the window", () => {
    expect(overflowOf(poseOf())).toEqual({ width: 0, height: 960 });
    // Turned a quarter, the 1080x1920 picture spans 1920 across and 1080 down.
    expect(overflowOf(poseOf({ rotation: 90 }))).toEqual({ width: 840, height: 120 });
  });
});

describe("coverZoom", () => {
  it("is 1 for unturned Fill and 2 for unturned Show all", () => {
    expect(coverZoom(poseOf())).toBe(1);
    expect(coverZoom(poseOf({}, "contain"))).toBe(2);
  });

  it.each([7, 30, 45, 90, -120])("is the least zoom that covers the window at %i degrees", (degrees) => {
    const cover = coverZoom(poseOf(), degrees);
    expect(coversWindow(placed(cover, degrees, { x: 0, y: 0 }))).toBe(true);
    expect(coversWindow(placed(cover * 0.99, degrees, { x: 0, y: 0 }))).toBe(false);
  });
});

describe("coverage", () => {
  it("agrees with the window's corners", () => {
    const cover = coverZoom(poseOf(), 12);
    for (const offset of [
      { x: 0, y: 0 },
      { x: 60, y: -300 },
      { x: -400, y: 500 },
    ]) {
      const pose = placed(cover * 1.3, 12, offset);
      expect(isCovered(pose)).toBe(coversWindow(pose));
    }
  });

  it("leaves a covered picture where it is", () => {
    const pose = placed(coverZoom(poseOf(), 12) * 1.3, 12, { x: 20, y: -80 });
    expect(coversWindow(pose)).toBe(true);
    expectPoint(clampToCoverage(pose).offset, pose.offset, 9);
  });

  it("pulls a picture back to the nearest place that covers the window", () => {
    const raw = placed(coverZoom(poseOf(), 12) * 1.3, 12, { x: 400, y: -900 });
    expect(coversWindow(raw)).toBe(false);
    const clamped = clampToCoverage(raw);
    expect(coversWindow(clamped)).toBe(true);
    // It sits on the edge: any further the way it was pulled opens a gap.
    const away = { x: raw.offset.x - clamped.offset.x, y: raw.offset.y - clamped.offset.y };
    const length = Math.hypot(away.x, away.y);
    const beyond = movePose(clamped, { x: away.x / length, y: away.y / length });
    expect(coversWindow(beyond)).toBe(false);
  });

  it.each([0, 12, -30, 45, 90, 171])(
    "can store every covering place as a pan at %i degrees",
    (degrees) => {
      const zoom = coverZoom(poseOf(), degrees) * 1.4;
      for (const pull of [
        { x: 5000, y: 0 },
        { x: 0, y: -5000 },
        { x: 3000, y: 4000 },
        { x: -4000, y: -2500 },
      ]) {
        const edge = clampToCoverage(placed(zoom, degrees, pull));
        const stored = framingOfPose(edge);
        expect(Math.abs(stored.panX)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(stored.panY)).toBeLessThanOrEqual(0.5);
        expectPoint(
          cropPoseOf({ framing: stored, fit: "cover", window: WINDOW, source: SOURCE })!.offset,
          edge.offset,
          6
        );
      }
    }
  );

  it("keeps the pan's own reach for a window that is not filled", () => {
    expectPoint(clampToPanRange(placed(1, 0, { x: 50, y: 700 })).offset, { x: 0, y: 480 });
    // Show all at zoom 1 fits inside the window and cannot move at all.
    expectPoint(
      clampToPanRange(placed(1, 0, { x: 50, y: 70 }, "contain")).offset,
      { x: 0, y: 0 }
    );
  });

  it("keeps a filled window filled, and otherwise the pan's reach", () => {
    expect(cropLimitFor(poseOf())).toBe("cover");
    expect(cropLimitFor(poseOf({}, "contain"))).toBe("range");
    expect(cropLimitFor(poseOf({ zoom: 0.8 }))).toBe("range");
    // Turned with no zoom to make up for it, Fill shows gaps.
    expect(cropLimitFor(poseOf({ rotation: 10 }))).toBe("range");
    const zoomedOut = { ...poseOf(), zoom: 0.8 };
    expect(cropLimitFor(poseOf(), zoomedOut)).toBe("range");
  });
});

describe("zoomPoseAbout", () => {
  it("keeps the picture point under the anchor there", () => {
    const pose = placed(1.4, 20, { x: 30, y: -60 });
    const anchor = { x: 200, y: 150 };
    const under = stageToPicture(pose, anchor);
    const zoomed = zoomPoseAbout(pose, 2.1, anchor);
    expect(zoomed.zoom).toBe(2.1);
    expectPoint(pictureToStage(zoomed, under), anchor, 9);
  });

  it("stops at the zoom limits and at a floor", () => {
    expect(zoomPoseAbout(poseOf(), 10).zoom).toBe(4);
    expect(zoomPoseAbout(poseOf(), 0.1).zoom).toBe(0.5);
    expect(zoomPoseAbout(poseOf(), 0.9, undefined, 1.2).zoom).toBe(1.2);
  });
});

describe("pinchPose", () => {
  const start = placed(1.5, 10, { x: 40, y: -120 });

  it("moves with the fingers when they do not spread", () => {
    const moved = pinchPose(start, {
      startMidpoint: { x: 10, y: 20 },
      midpoint: { x: 50, y: -5 },
      spread: 1,
    });
    expect(moved.zoom).toBe(1.5);
    expectPoint(moved.offset, { x: 80, y: -145 }, 12);
  });

  it("scales about where the pinch began", () => {
    const midpoint = { x: -150, y: 90 };
    const under = stageToPicture(start, midpoint);
    const spread = pinchPose(start, { startMidpoint: midpoint, midpoint, spread: 2 });
    expect(spread.zoom).toBe(3);
    expectPoint(pictureToStage(spread, under), midpoint, 9);
  });

  it("stops at a floor", () => {
    const pinched = pinchPose(start, {
      startMidpoint: { x: 0, y: 0 },
      midpoint: { x: 0, y: 0 },
      spread: 0.2,
      floor: 1.1,
    });
    expect(pinched.zoom).toBe(1.1);
  });
});

describe("turnPose", () => {
  it("keeps what is at the window's centre there", () => {
    const pose = placed(1.3, 5, { x: 40, y: 210 });
    const centre = stageToPicture(pose, { x: 0, y: 0 });
    const turned = turnPose(pose, -27);
    expectPoint(pictureToStage(turned, centre), { x: 0, y: 0 }, 9);
  });

  it("turns back to exactly where it started", () => {
    const pose = placed(1.3, 5, { x: 40, y: 210 });
    const back = turnPose(turnPose(pose, 38), 5);
    expect(back.zoom).toBeCloseTo(pose.zoom, 12);
    expect(back.rotation).toBeCloseTo(5, 12);
    expectPoint(back.offset, pose.offset, 9);
  });

  it.each([10, -33, 45, 90, 180])(
    "keeps a centred Fill picture covering the window at %i degrees",
    (degrees) => {
      const turned = turnPose(poseOf(), degrees);
      expect(turned.zoom).toBeCloseTo(coverZoom(poseOf(), degrees), 12);
      expect(coversWindow(turned)).toBe(true);
    }
  );

  it("re-fits a quarter turn of Fill to the turned window", () => {
    // On its side the picture is 1920 across and 1080 down, so it covers the
    // 960-high window at 960/1080 of the size.
    const turned = turnPose(poseOf(), 90);
    expect(turned.zoom).toBeCloseTo(960 / 1080, 12);
    expect(turnPose(turnPose(turnPose(turned, 180), 270), 0).zoom).toBeCloseTo(1, 12);
  });

  it("covers the window again once the move is clamped", () => {
    const pose = placed(1.2, 0, { x: 0, y: 470 });
    expect(coversWindow(pose)).toBe(true);
    const turned = clampToCoverage(turnPose(pose, 25));
    expect(coversWindow(turned)).toBe(true);
  });

  it("leaves Show all at its zoom", () => {
    const turned = turnPose(poseOf({ zoom: 1.7 }, "contain"), 30);
    expect(turned.zoom).toBe(1.7);
  });

  it("wraps the stored turn", () => {
    expect(turnPose(poseOf({ rotation: 170 }), 190).rotation).toBe(-170);
  });
});

describe("Fill and Show all", () => {
  it("keeps the stored pan share when the fit changes", () => {
    const pose = poseOf({ zoom: 2.5, panX: 0.3, panY: -0.2, rotation: 0 });
    const shown = framingOfPose(withFit(pose, "contain"));
    expect(shown.panX).toBeCloseTo(0.3, 12);
    expect(shown.panY).toBeCloseTo(-0.2, 12);
  });

  it("zooms Fill up to cover a turned window and moves it to cover", () => {
    const filled = fillPose(poseOf({ zoom: 0.7, rotation: 10, panY: 0.4 }, "contain"));
    expect(filled.fit).toBe("cover");
    expect(filled.zoom).toBeCloseTo(coverZoom(filled), 12);
    expect(coversWindow(filled)).toBe(true);
  });
});

describe("splitRotation", () => {
  it.each([
    [0, 0, 0],
    [30, 0, 30],
    [45, 0, 45],
    [46, 1, -44],
    [-45, 0, -45],
    [-46, -1, 44],
    [135, 1, 45],
    [136, 2, -44],
    [180, 2, 0],
    [-180, -2, 0],
    [-170, -2, 10],
  ])("reads %i degrees as %i quarter turns and %i", (rotation, quarter, straighten) => {
    const parts = splitRotation(rotation);
    expect(parts.quarter).toBe(quarter);
    expect(parts.straighten).toBeCloseTo(straighten, 12);
    expect(joinRotation(parts.quarter, parts.straighten)).toBeCloseTo(rotation, 12);
  });

  it("keeps the quarter the controls show when the straighten reaches its end", () => {
    expect(splitRotation(45, 1)).toEqual({ quarter: 1, straighten: -45 });
    expect(splitRotation(45, 0)).toEqual({ quarter: 0, straighten: 45 });
    expect(splitRotation(-135, -2)).toEqual({ quarter: -2, straighten: 45 });
    // A hint the turn has left behind is ignored.
    expect(splitRotation(100, 0)).toEqual({ quarter: 1, straighten: 10 });
  });

  it("steps quarter turns anticlockwise round to the start", () => {
    const steps = [0];
    for (let index = 0; index < 4; index++) steps.push(quarterLeft(steps.at(-1)!));
    expect(steps).toEqual([0, -1, -2, 1, 0]);
    expect(steps.map((quarter) => joinRotation(quarter, 0))).toEqual([0, -90, -180, 90, 0]);
  });
});

describe("rubberBand and overshootOf", () => {
  it("gives less and less the further it is pulled, never the whole range", () => {
    expect(rubberBand(0, 100)).toBe(0);
    expect(rubberBand(1, 100)).toBeCloseTo(0.55, 2);
    expect(rubberBand(-40, 100)).toBeCloseTo(-rubberBand(40, 100), 12);
    expect(rubberBand(1e9, 100)).toBeLessThan(100);
    expect(rubberBand(1e9, 100)).toBeGreaterThan(99);
    expect(rubberBand(50, 0)).toBe(0);
  });

  it("bands the pan's reach along the window's axes", () => {
    const limited = placed(1, 0, { x: 0, y: 480 });
    const raw = movePose(limited, { x: 30, y: 200 });
    expectPoint(overshootOf(raw, limited, "range", 300), {
      x: rubberBand(30, 300),
      y: rubberBand(200, 300),
    });
  });

  it("bands coverage along the picture's axes", () => {
    const limited = clampToCoverage(placed(1.5, 30, { x: 5000, y: 0 }));
    const along = rotate({ x: 80, y: 0 }, 30);
    const raw = movePose(limited, along);
    const shown = overshootOf(raw, limited, "cover", 300);
    expectPoint(shown, rotate({ x: rubberBand(80, 300), y: 0 }, 30), 9);
  });
});

describe("cropWindowScale", () => {
  it("is the largest window the stage holds when no pose is known", () => {
    expect(cropWindowScale({ stage: { width: 900, height: 600 }, window: WINDOW })).toBe(
      552 / 960
    );
  });

  it("stays largest when the whole picture fits around it", () => {
    const scale = cropWindowScale({
      stage: { width: 900, height: 2000 },
      window: WINDOW,
      pose: poseOf(),
    });
    // 852 of room across for 1080; the 1920-high picture fits in 1952.
    expect(scale).toBe(852 / 1080);
  });

  it("shrinks to show the whole picture, but not below the floor", () => {
    const stage = { width: 900, height: 1200 };
    // The picture needs 1920 of height in 1152 of room: 0.6, and the largest
    // window is min(852/1080, 1152/960) = 0.789.
    expect(cropWindowScale({ stage, window: WINDOW, pose: poseOf() })).toBe(1152 / 1920);
    const short = { width: 900, height: 600 };
    expect(cropWindowScale({ stage: short, window: WINDOW, pose: poseOf() })).toBeCloseTo(
      0.6 * (552 / 960),
      12
    );
  });
});

describe("corner handles", () => {
  it("keeps the opposite corner still", () => {
    const frame = cornerFrame(WINDOW, "se", 0.5);
    expect(frame.width).toBe(540);
    expect(frame.height).toBe(480);
    expectPoint(frame.center, { x: -270, y: -240 });
    expectPoint(cornerPoint(WINDOW, "se", 0.5), { x: 0, y: 0 });
    expectPoint(cornerPoint(WINDOW, "ne", 1), { x: 540, y: -480 });
  });

  it("reads the scale from the pointer's place along the diagonal", () => {
    expect(cornerScaleAt(WINDOW, "ne", cornerPoint(WINDOW, "ne", 0.7))).toBeCloseTo(0.7, 12);
    // Off the diagonal, the pointer counts by its projection onto it.
    const onDiagonal = cornerPoint(WINDOW, "sw", 0.8);
    const across = { x: 480, y: 540 }; // at right angles to (-1080, 960)
    const off = { x: onDiagonal.x + across.x * 0.1, y: onDiagonal.y + across.y * 0.1 };
    expect(cornerScaleAt(WINDOW, "sw", off)).toBeCloseTo(0.8, 12);
  });

  it("fills the window with what the frame held when released", () => {
    const before = placed(1.5, 15, { x: 40, y: 90 });
    const frame = cornerFrame(WINDOW, "sw", 0.6);
    const after = releaseCorner(before, "sw", 0.6);
    expect(after.zoom).toBeCloseTo(2.5, 12);
    for (const corner of windowCorners(WINDOW)) {
      const inFrame = {
        x: frame.center.x + corner.x * 0.6,
        y: frame.center.y + corner.y * 0.6,
      };
      const under = stageToPicture(before, inFrame);
      expectPoint(pictureToStage(after, under), corner, 9);
    }
  });

  it("settles the released picture from where the dragged one was", () => {
    const before = placed(1.5, 15, { x: 40, y: 90 });
    const after = releaseCorner(before, "ne", 0.75);
    const settle = settleTransform(before, after);
    const frame = cornerFrame(WINDOW, "ne", 0.75);
    expect(settle.scale).toBeCloseTo(0.75, 12);
    expectPoint(settle, frame.center, 9);
    const point = { x: 123, y: -45 };
    const drawnAfter = pictureToStage(after, point);
    expectPoint(
      {
        x: settle.x + settle.scale * drawnAfter.x,
        y: settle.y + settle.scale * drawnAfter.y,
      },
      pictureToStage(before, point),
      9
    );
  });

  const HUGE_STAGE = { width: 1e6, height: 1e6 };

  it("stops at the zoom limits", () => {
    const range = cornerScaleRange({
      pose: placed(2, 0, { x: 0, y: 0 }),
      corner: "nw",
      limit: "range",
      displayScale: 1,
      stage: HUGE_STAGE,
    });
    expect(range).toEqual({ min: 0.5, max: 4 });
  });

  it("stops widening at the picture's edge in Fill", () => {
    const pose = placed(coverZoom(poseOf(), 8) * 1.25, 8, { x: 30, y: -60 });
    expect(coversWindow(pose)).toBe(true);
    const range = cornerScaleRange({
      pose,
      corner: "ne",
      limit: "cover",
      displayScale: 1,
      stage: HUGE_STAGE,
    });
    expect(range.max).toBeGreaterThan(1);
    expect(range.max).toBeLessThan(pose.zoom / 0.5);
    expect(coversWindow(releaseCorner(pose, "ne", range.max))).toBe(true);
    expect(coversWindow(releaseCorner(pose, "ne", range.max * 1.01))).toBe(false);
  });

  it("keeps the frame on the stage and big enough to judge", () => {
    const pose = placed(1, 0, { x: 0, y: 0 });
    // The window shows 540x480; a 640-wide stage leaves 50 on each side.
    const range = cornerScaleRange({
      pose,
      corner: "se",
      limit: "range",
      displayScale: 0.5,
      stage: { width: 640, height: 2000 },
    });
    expect(range.max).toBeCloseTo((640 / 540 + 1) / 2, 12);
    // A quarter of the window is 4x zoom, the most there is.
    expect(range.min).toBeCloseTo(0.25, 12);
    // Shown 96px high, the frame stops at 48px: half the window.
    const small = cornerScaleRange({
      pose,
      corner: "se",
      limit: "range",
      displayScale: 0.1,
      stage: HUGE_STAGE,
    });
    expect(small.min).toBeCloseTo(0.5, 12);
    const tiny = cornerScaleRange({
      pose,
      corner: "se",
      limit: "range",
      displayScale: 0.04,
      stage: HUGE_STAGE,
    });
    expect(tiny.min).toBe(1);
  });
});
