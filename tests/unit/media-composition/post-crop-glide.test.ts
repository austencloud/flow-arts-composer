import { describe, expect, it } from "vitest";
import {
  cameraDisplayScale,
  cameraWindowCenter,
  cropCamera,
  cropPoseOf,
  joinRotation,
  type CropCamera,
  type CropPoint,
  type CropPose,
} from "#lib/shared/share/components/post-studio/editor/post-crop-geometry.js";
import {
  boxPicture,
  frameGlideStart,
  glideStart,
  stagePicture,
  transformOfStyle,
  transformPicture,
  type StagePicture,
} from "#lib/shared/share/components/post-studio/editor/post-crop-glide.js";

// The DCKΨ- take (720x1280) in a 1080x1920 slot, on a 1400x900 stage.
const STAGE = { width: 1400, height: 900 };
const SOURCE = { width: 720, height: 1280 };
const PORTRAIT = { width: 1080, height: 1920 };
const LANDSCAPE = { width: 1920, height: 1080 };

function poseOf(
  rotation: number,
  window = PORTRAIT,
  pan: CropPoint = { x: 0, y: 0 },
  zoom = 1
): CropPose {
  return cropPoseOf({
    framing: { zoom, panX: pan.x, panY: pan.y, rotation },
    fit: "cover",
    window,
    source: SOURCE,
  })!;
}

function cameraOf(pose: CropPose): CropCamera {
  return cropCamera({ stage: STAGE, pose });
}

// The tests' own trigonometry, kept apart from the module's.
function place(picture: StagePicture, point: CropPoint): CropPoint {
  const x = picture.mirror ? -point.x : point.x;
  const radians = (picture.rotation * Math.PI) / 180;
  return {
    x:
      picture.center.x +
      picture.scale * (Math.cos(radians) * x - Math.sin(radians) * point.y),
    y:
      picture.center.y +
      picture.scale * (Math.sin(radians) * x + Math.cos(radians) * point.y),
  };
}

/** Footage points spread over the picture, corners and all. */
const SAMPLES: CropPoint[] = [
  { x: 0, y: 0 },
  { x: -360, y: -640 },
  { x: 360, y: -640 },
  { x: 360, y: 640 },
  { x: -120, y: 300 },
];

function expectSamePlaces(a: StagePicture, b: StagePicture): void {
  for (const point of SAMPLES) {
    const pa = place(a, point);
    const pb = place(b, point);
    expect(pa.x).toBeCloseTo(pb.x, 6);
    expect(pa.y).toBeCloseTo(pb.y, 6);
  }
}

describe("boxPicture", () => {
  it("draws the picture where the camera does, from the window's box", () => {
    const pose = poseOf(joinRotation(1, 12), PORTRAIT, { x: 0.3, y: -0.2 }, 1.6);
    const camera = cameraOf(pose);
    const scale = cameraDisplayScale(pose, camera);
    const box = {
      center: cameraWindowCenter(pose, camera),
      width: pose.window.width * scale,
    };
    expectSamePlaces(boxPicture(pose, box, true), stagePicture(pose, camera, true));
  });
});

describe("glideStart", () => {
  function glideCase(from: StagePicture, to: StagePicture, turning = 0) {
    const origin = { x: 640, y: 410 };
    const start = glideStart(from, to, origin, turning);
    return { start, shown: transformPicture(to, start, origin) };
  }

  it("shows the new framing where the old one was", () => {
    const before = poseOf(joinRotation(0, 8), PORTRAIT, { x: 0.2, y: 0 }, 1.3);
    const after = poseOf(joinRotation(-1, 8), LANDSCAPE);
    const from = stagePicture(before, cameraOf(before), false);
    const { shown } = glideCase(from, stagePicture(after, cameraOf(after), false));
    expectSamePlaces(shown, from);
  });

  it("starts a quarter turn anticlockwise a quarter turn back", () => {
    const before = poseOf(0);
    const after = poseOf(joinRotation(-1, 0), LANDSCAPE);
    const { start } = glideCase(
      stagePicture(before, cameraOf(before), false),
      stagePicture(after, cameraOf(after), false)
    );
    expect(start.rotation).toBeCloseTo(90, 9);
    expect(start.mirror).toBe(false);
  });

  it("turns the short way across the half turn", () => {
    // Quarter -2 to quarter 1 turns anticlockwise, not three quarters back.
    const before = poseOf(joinRotation(-2, 0));
    const after = poseOf(joinRotation(1, 0));
    const { start } = glideCase(
      stagePicture(before, cameraOf(before), false),
      stagePicture(after, cameraOf(after), false)
    );
    expect(start.rotation).toBeCloseTo(90, 9);
  });

  it("keeps turning the way a glide in flight turns", () => {
    const before = poseOf(0);
    const after = poseOf(joinRotation(-1, 0), LANDSCAPE);
    const at = stagePicture(before, cameraOf(before), false);
    // A glide 150 degrees from its end, then another quarter anticlockwise.
    const inFlight = { ...at, rotation: at.rotation + 150 };
    const { start, shown } = glideCase(
      inFlight,
      stagePicture(after, cameraOf(after), false),
      150
    );
    expect(start.rotation).toBeCloseTo(240, 9);
    expectSamePlaces(shown, inFlight);
  });

  it("flips across when Reset clears a mirror", () => {
    const before = poseOf(joinRotation(1, 20), PORTRAIT, { x: -0.4, y: 0.1 }, 2);
    const after = poseOf(0);
    const from = stagePicture(before, cameraOf(before), true);
    const { start, shown } = glideCase(from, stagePicture(after, cameraOf(after), false));
    expect(start.mirror).toBe(true);
    expectSamePlaces(shown, from);
  });
});

describe("transformPicture", () => {
  it("carries on from a transform a computed style holds", () => {
    const pose = poseOf(joinRotation(0, -10), PORTRAIT, { x: 0.1, y: 0.3 }, 1.2);
    const at = stagePicture(pose, cameraOf(pose), false);
    const origin = { x: 500, y: 400 };
    const flight = transformOfStyle({
      translate: "12px -30px",
      rotate: "33deg",
      scale: "1.25",
    });
    const shown = transformPicture(at, flight, origin);
    // The picture's centre: moved, then turned and scaled about the origin.
    const radians = (33 * Math.PI) / 180;
    const dx = at.center.x - origin.x;
    const dy = at.center.y - origin.y;
    expect(shown.center.x).toBeCloseTo(
      origin.x + 12 + 1.25 * (Math.cos(radians) * dx - Math.sin(radians) * dy),
      9
    );
    expect(shown.center.y).toBeCloseTo(
      origin.y - 30 + 1.25 * (Math.sin(radians) * dx + Math.cos(radians) * dy),
      9
    );
    expect(shown.rotation).toBeCloseTo(33 - 10, 9);
    expect(shown.scale).toBeCloseTo(1.25 * at.scale, 9);
  });
});

describe("transformOfStyle", () => {
  it("reads none as no transform", () => {
    expect(
      transformOfStyle({ translate: "none", rotate: "none", scale: "none" })
    ).toEqual({ x: 0, y: 0, rotation: 0, scale: 1, mirror: false });
  });

  it("reads a mirrored scale and a lone translate", () => {
    expect(
      transformOfStyle({ translate: "8px", rotate: "-45deg", scale: "-0.5 2" })
    ).toEqual({ x: 8, y: 0, rotation: -45, scale: 2, mirror: true });
  });
});

describe("frameGlideStart", () => {
  const upright = { center: { x: 700, y: 450 }, width: 450, height: 800, rotation: 0 };

  it("turns a window that turned with the picture", () => {
    expect(frameGlideStart(upright, { width: 600, height: 337.5 }, 90)).toEqual({
      center: upright.center,
      width: 800,
      height: 450,
      rotation: 90,
    });
  });

  it("keeps a window the picture turned inside upright", () => {
    expect(frameGlideStart(upright, { width: 450, height: 800 }, 90)).toBe(upright);
  });

  it("keeps a new shape upright when the picture does not turn", () => {
    expect(frameGlideStart(upright, { width: 800, height: 450 }, 0)).toBe(upright);
  });

  it("goes on turning a frame caught mid-turn", () => {
    const midTurn = { ...upright, width: 700, height: 420, rotation: 45 };
    expect(frameGlideStart(midTurn, { width: 450, height: 800 }, 135)).toEqual({
      center: upright.center,
      width: 420,
      height: 700,
      rotation: 135,
    });
  });
});
