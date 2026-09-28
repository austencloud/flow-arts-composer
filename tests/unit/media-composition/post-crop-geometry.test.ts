import { describe, expect, it } from "vitest";
import {
  POST_SHAPE_RATIO_MIN,
  type PostFraming,
} from "$lib/shared/media-composition/domain/post-project";
import {
  cameraDisplayScale,
  cameraWindowCenter,
  clampToCoverage,
  clampToPanRange,
  framePose,
  handleFrame,
  handlePoint,
  handlePose,
  handleScaleAt,
  handleScaleRange,
  coverZoom,
  cropCamera,
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
  quarterLeft,
  reshapePose,
  rubberBand,
  sameFraming,
  splitRotation,
  turnPose,
  withFit,
  zoomPoseAbout,
  type CropCamera,
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

describe("framePose", () => {
  const start = placed(1.5, 10, { x: 40, y: -120 });

  it("fills the window with what the frame holds", () => {
    const center = { x: -150, y: 90 };
    const framed = framePose(start, center, 0.5);
    expect(framed.zoom).toBe(3);
    for (const corner of windowCorners(WINDOW)) {
      const inFrame = { x: center.x + corner.x * 0.5, y: center.y + corner.y * 0.5 };
      expectPoint(pictureToStage(framed, stageToPicture(start, inFrame)), corner, 9);
    }
  });

  it("moves the picture the other way when only the frame moves", () => {
    const moved = framePose(start, { x: 30, y: -20 }, 1);
    expect(moved.zoom).toBe(1.5);
    expectPoint(moved.offset, { x: 10, y: -100 }, 12);
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
  it("is the largest window the stage holds", () => {
    expect(cropWindowScale({ stage: { width: 900, height: 600 }, window: WINDOW })).toBe(
      552 / 960
    );
  });
});

describe("cropCamera", () => {
  const STAGE = { width: 900, height: 1200 };
  const MARGIN = 24;

  /** A picture point on the stage, in screen pixels. */
  function onScreen(pose: CropPose, camera: CropCamera, point: CropPoint): CropPoint {
    const at = pictureToStage(pose, point);
    const center = cameraWindowCenter(pose, camera);
    const scale = cameraDisplayScale(pose, camera);
    return { x: center.x + at.x * scale, y: center.y + at.y * scale };
  }

  /** The picture's and the window's corners on the stage. */
  function shownCorners(pose: CropPose, camera: CropCamera): CropPoint[] {
    const halfWidth = pose.draw.width / 2;
    const halfHeight = pose.draw.height / 2;
    const picture = [
      { x: -halfWidth, y: -halfHeight },
      { x: halfWidth, y: -halfHeight },
      { x: halfWidth, y: halfHeight },
      { x: -halfWidth, y: halfHeight },
    ].map((corner) => onScreen(pose, camera, corner));
    const center = cameraWindowCenter(pose, camera);
    const scale = cameraDisplayScale(pose, camera);
    const window = windowCorners(pose.window).map((corner) => ({
      x: center.x + corner.x * scale,
      y: center.y + corner.y * scale,
    }));
    return [...picture, ...window];
  }

  it("shows the whole picture, centred, when the window lies on it", () => {
    const pose = poseOf();
    const camera = cropCamera({ stage: STAGE, pose });
    // The 720x1280 footage in 852x1152 of room.
    expect(camera.scale).toBeCloseTo(1152 / 1280, 12);
    expectPoint(camera.center, { x: 450, y: 600 }, 9);
    // Fill draws a footage pixel 1.5 output pixels across.
    expect(cameraDisplayScale(pose, camera)).toBeCloseTo(0.6, 12);
    expectPoint(cameraWindowCenter(pose, camera), { x: 450, y: 600 }, 9);
    expectPoint(onScreen(pose, camera, { x: 0, y: 0 }), camera.center, 9);
  });

  it("fits the picture and the window together, as large as the stage allows", () => {
    for (const pose of [
      placed(1.2, 20, { x: 100, y: -200 }),
      placed(0.6, 0, { x: 300, y: 0 }, "contain"),
      placed(0.8, -35, { x: -250, y: 400 }),
    ]) {
      const corners = shownCorners(pose, cropCamera({ stage: STAGE, pose }));
      const xs = corners.map((corner) => corner.x);
      const ys = corners.map((corner) => corner.y);
      const [left, right] = [Math.min(...xs), Math.max(...xs)];
      const [top, bottom] = [Math.min(...ys), Math.max(...ys)];
      expect(left).toBeGreaterThanOrEqual(MARGIN - 1e-6);
      expect(right).toBeLessThanOrEqual(STAGE.width - MARGIN + 1e-6);
      expect(top).toBeGreaterThanOrEqual(MARGIN - 1e-6);
      expect(bottom).toBeLessThanOrEqual(STAGE.height - MARGIN + 1e-6);
      const fillsAcross = Math.abs(right - left - (STAGE.width - 2 * MARGIN)) < 1e-6;
      const fillsDown = Math.abs(bottom - top - (STAGE.height - 2 * MARGIN)) < 1e-6;
      expect(fillsAcross || fillsDown).toBe(true);
    }
  });

  it("holds the picture still while a gesture moves and sizes the frame", () => {
    const start = placed(1.5, 10, { x: 40, y: -120 });
    const camera = cropCamera({ stage: STAGE, pose: start });
    const scale = cameraDisplayScale(start, camera);
    const origin = cameraWindowCenter(start, camera);
    const center = { x: -150, y: 90 };
    const framed = framePose(start, center, 0.5);
    // The window lands where the gesture drew the frame...
    expect(cameraDisplayScale(framed, camera)).toBeCloseTo(scale * 0.5, 12);
    expectPoint(
      cameraWindowCenter(framed, camera),
      { x: origin.x + center.x * scale, y: origin.y + center.y * scale },
      9
    );
    // ...and the picture has not moved under it.
    const point = { x: 123, y: -45 };
    expectPoint(onScreen(framed, camera, point), onScreen(start, camera, point), 9);
  });
});

describe("frame handles", () => {
  it("keeps the opposite corner still", () => {
    const frame = handleFrame(WINDOW, "se", 0.5);
    expect(frame.width).toBe(540);
    expect(frame.height).toBe(480);
    expectPoint(frame.center, { x: -270, y: -240 });
    expectPoint(handlePoint(WINDOW, "se", 0.5), { x: 0, y: 0 });
    expectPoint(handlePoint(WINDOW, "ne", 1), { x: 540, y: -480 });
  });

  it("keeps the opposite side still and the frame's shape", () => {
    const frame = handleFrame(WINDOW, "e", 0.5);
    expect(frame.width).toBe(540);
    expect(frame.height).toBe(480);
    // The left side stays put and the frame shrinks evenly top and bottom.
    expectPoint(frame.center, { x: -270, y: 0 });
    expect(frame.center.x - frame.width / 2).toBeCloseTo(-540, 12);
    expectPoint(handlePoint(WINDOW, "e", 0.5), { x: 0, y: 0 });
    expectPoint(handlePoint(WINDOW, "n", 1), { x: 0, y: -480 });
    const top = handleFrame(WINDOW, "n", 0.75);
    expectPoint(top.center, { x: 0, y: 480 - 720 / 2 });
    expect(top.center.y + top.height / 2).toBeCloseTo(480, 12);
  });

  it("reads a side's scale from how far out the pointer is", () => {
    expect(handleScaleAt(WINDOW, "w", handlePoint(WINDOW, "w", 0.6))).toBeCloseTo(0.6, 12);
    // Along the side, the pointer changes nothing.
    const along = { x: handlePoint(WINDOW, "s", 0.8).x + 300, y: handlePoint(WINDOW, "s", 0.8).y };
    expect(handleScaleAt(WINDOW, "s", along)).toBeCloseTo(0.8, 12);
  });

  it("fills the window with what a side's frame holds", () => {
    const before = placed(1.5, 15, { x: 40, y: 90 });
    const frame = handleFrame(WINDOW, "w", 0.7);
    const after = handlePose(before, "w", 0.7);
    for (const corner of windowCorners(WINDOW)) {
      const inFrame = {
        x: frame.center.x + corner.x * 0.7,
        y: frame.center.y + corner.y * 0.7,
      };
      expectPoint(pictureToStage(after, stageToPicture(before, inFrame)), corner, 9);
    }
  });

  it("stops a side at the picture's edge in Fill", () => {
    const pose = placed(coverZoom(poseOf(), 8) * 1.25, 8, { x: 30, y: -60 });
    const range = handleScaleRange({
      pose,
      handle: "s",
      limit: "cover",
      displayScale: 1,
      stage: { width: 1e6, height: 1e6 },
    });
    expect(range.max).toBeGreaterThan(1);
    expect(coversWindow(handlePose(pose, "s", range.max))).toBe(true);
    expect(coversWindow(handlePose(pose, "s", range.max * 1.01))).toBe(false);
  });

  it("keeps a side's frame on the stage, growing both ways along it", () => {
    const range = handleScaleRange({
      pose: placed(1, 0, { x: 0, y: 0 }),
      handle: "e",
      limit: "range",
      displayScale: 0.5,
      // 50 spare each side across, 20 spare above and below.
      stage: { width: 640, height: 520 },
    });
    expect(range.max).toBeCloseTo(Math.min((640 / 540 + 1) / 2, 520 / 480), 12);
  });

  it("measures the stage's room from where the window sits on it", () => {
    const range = handleScaleRange({
      pose: placed(1, 0, { x: 0, y: 0 }),
      handle: "e",
      limit: "range",
      displayScale: 0.5,
      stage: { width: 640, height: 2000 },
      // The window's 540 across starts 20 from the stage's left edge.
      center: { x: 290, y: 1000 },
    });
    // The right side may run to the stage's edge: 620 of 540.
    expect(range.max).toBeCloseTo(620 / 540, 12);
  });

  it("reshapes the frame when a free side moves only its own edge", () => {
    const frame = handleFrame(WINDOW, "e", 0.5, true);
    expect(frame.width).toBe(540);
    expect(frame.height).toBe(960);
    expectPoint(frame.center, { x: -270, y: 0 });
    // A plain side keeps the frame's shape.
    expect(handleFrame(WINDOW, "e", 0.5).height).toBe(480);
  });

  it("fills a reshaped window with what the free frame holds", () => {
    const before = placed(1.5, 15, { x: 40, y: 90 });
    const frame = handleFrame(WINDOW, "e", 0.5, true);
    // The clip's box holds the frame's shape at 810x1440.
    const window = { width: 810, height: 1440 };
    const after = reshapePose(before, "e", 0.5, window);
    const grow = window.width / frame.width;
    // The same footage point, in each pose's own picture units.
    const units = after.draw.width / before.draw.width;
    for (const corner of windowCorners(window)) {
      const inFrame = {
        x: frame.center.x + corner.x / grow,
        y: frame.center.y + corner.y / grow,
      };
      const under = stageToPicture(before, inFrame);
      expectPoint(pictureToStage(after, { x: under.x * units, y: under.y * units }), corner, 9);
    }
  });

  it("keeps a free side within the shapes a clip takes, and on the picture in Fill", () => {
    const range = handleScaleRange({
      pose: poseOf(),
      handle: "e",
      limit: "cover",
      displayScale: 1,
      stage: { width: 1e6, height: 1e6 },
      free: true,
    });
    // Narrowest: a quarter as wide as it is high.
    expect(range.min).toBeCloseTo((POST_SHAPE_RATIO_MIN * 960) / 1080, 12);
    // Fill already spans the picture's width, so the side cannot widen.
    expect(range.max).toBe(1);
  });

  it("reads the scale from the pointer's place along the diagonal", () => {
    expect(handleScaleAt(WINDOW, "ne", handlePoint(WINDOW, "ne", 0.7))).toBeCloseTo(0.7, 12);
    // Off the diagonal, the pointer counts by its projection onto it.
    const onDiagonal = handlePoint(WINDOW, "sw", 0.8);
    const across = { x: 480, y: 540 }; // at right angles to (-1080, 960)
    const off = { x: onDiagonal.x + across.x * 0.1, y: onDiagonal.y + across.y * 0.1 };
    expect(handleScaleAt(WINDOW, "sw", off)).toBeCloseTo(0.8, 12);
  });

  it("fills the window with what the frame holds", () => {
    const before = placed(1.5, 15, { x: 40, y: 90 });
    const frame = handleFrame(WINDOW, "sw", 0.6);
    const after = handlePose(before, "sw", 0.6);
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

  const HUGE_STAGE = { width: 1e6, height: 1e6 };

  it("stops at the zoom limits", () => {
    const range = handleScaleRange({
      pose: placed(2, 0, { x: 0, y: 0 }),
      handle: "nw",
      limit: "range",
      displayScale: 1,
      stage: HUGE_STAGE,
    });
    expect(range).toEqual({ min: 0.5, max: 4 });
  });

  it("stops widening at the picture's edge in Fill", () => {
    const pose = placed(coverZoom(poseOf(), 8) * 1.25, 8, { x: 30, y: -60 });
    expect(coversWindow(pose)).toBe(true);
    const range = handleScaleRange({
      pose,
      handle: "ne",
      limit: "cover",
      displayScale: 1,
      stage: HUGE_STAGE,
    });
    expect(range.max).toBeGreaterThan(1);
    expect(range.max).toBeLessThan(pose.zoom / 0.5);
    expect(coversWindow(handlePose(pose, "ne", range.max))).toBe(true);
    expect(coversWindow(handlePose(pose, "ne", range.max * 1.01))).toBe(false);
  });

  it("keeps the frame on the stage and big enough to judge", () => {
    const pose = placed(1, 0, { x: 0, y: 0 });
    // The window shows 540x480; a 640-wide stage leaves 50 on each side.
    const range = handleScaleRange({
      pose,
      handle: "se",
      limit: "range",
      displayScale: 0.5,
      stage: { width: 640, height: 2000 },
    });
    expect(range.max).toBeCloseTo((640 / 540 + 1) / 2, 12);
    // A quarter of the window is 4x zoom, the most there is.
    expect(range.min).toBeCloseTo(0.25, 12);
    // Shown 96px high, the frame stops at 48px: half the window.
    const small = handleScaleRange({
      pose,
      handle: "se",
      limit: "range",
      displayScale: 0.1,
      stage: HUGE_STAGE,
    });
    expect(small.min).toBeCloseTo(0.5, 12);
    const tiny = handleScaleRange({
      pose,
      handle: "se",
      limit: "range",
      displayScale: 0.04,
      stage: HUGE_STAGE,
    });
    expect(tiny.min).toBe(1);
  });
});
