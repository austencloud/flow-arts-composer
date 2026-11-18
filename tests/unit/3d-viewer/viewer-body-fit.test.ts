import { describe, expect, it } from "vitest";

import {
  BODY_HEIGHT_FILL,
  bodyFrameBox,
  castFrameBox,
  castFrameCenter,
  fitBodiesShot,
  fitCastDistance,
  projectedBoxFill,
} from "#lib/shared/3d/camera/viewer-camera-framing.js";

const FLOOR = -1.3;
const FOV = 50;
// The stage beside the Character panel at a 1536 x 1200 window.
const DOCKED_STAGE = 732 / 1146;
// The elevated overview the dock refit keeps: in front, looking a little down.
const OVERVIEW = { x: 0, y: 0.32, z: 1 };

function eyeAt(
  target: { x: number; y: number; z: number },
  distance: number
): { x: number; y: number; z: number } {
  const length = Math.hypot(OVERVIEW.x, OVERVIEW.y, OVERVIEW.z);
  return {
    x: target.x + (OVERVIEW.x / length) * distance,
    y: target.y + (OVERVIEW.y / length) * distance,
    z: target.z + (OVERVIEW.z / length) * distance,
  };
}

function unit(v: { x: number; y: number; z: number }) {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

/** Where the box's top and bottom land on screen: 0 is the top edge, 1 the bottom. */
function verticalSpan(
  eye: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number },
  box: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  }
): { top: number; bottom: number } {
  const forward = unit({
    x: target.x - eye.x,
    y: target.y - eye.y,
    z: target.z - eye.z,
  });
  const right = unit({ x: -forward.z, y: 0, z: forward.x });
  const up = {
    x: right.y * forward.z - right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y - right.y * forward.x,
  };
  const halfTan = Math.tan((FOV * Math.PI) / 360);
  let top = Infinity;
  let bottom = -Infinity;
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        const v = { x: x - eye.x, y: y - eye.y, z: z - eye.z };
        const depth = v.x * forward.x + v.y * forward.y + v.z * forward.z;
        const height = v.x * up.x + v.y * up.y + v.z * up.z;
        const screen = 0.5 - height / (depth * halfTan) / 2;
        top = Math.min(top, screen);
        bottom = Math.max(bottom, screen);
      }
    }
  }
  return { top, bottom };
}

describe("framing the bodies for the Character tool", () => {
  it("draws one performer at least a third larger than the cast overview does", () => {
    const spot = { x: 0, z: 0 };
    // The overview fits the body plus a staff's swing: about 1.35 m of reach.
    const castBox = castFrameBox([{ position: spot, reach: 1.35 }], FLOOR)!;
    const castTarget = castFrameCenter(castBox);
    const castDistance = fitCastDistance(castTarget, OVERVIEW, castBox, {
      fovDeg: FOV,
      aspect: DOCKED_STAGE,
    });

    const shot = fitBodiesShot([spot], FLOOR, OVERVIEW, {
      fovDeg: FOV,
      aspect: DOCKED_STAGE,
    })!;

    expect(shot.distance).toBeLessThan(castDistance / 1.35);
    const fill = projectedBoxFill(
      eyeAt(shot.target, shot.distance),
      shot.target,
      bodyFrameBox([spot], FLOOR)!,
      FOV,
      DOCKED_STAGE
    );
    expect(fill.inFront).toBe(true);
    expect(fill.height).toBeCloseTo(BODY_HEIGHT_FILL, 2);
    expect(fill.width).toBeLessThan(1);
  });

  it("aims at the middle of the body, not at the feet", () => {
    const shot = fitBodiesShot([{ x: 2, z: -1 }], FLOOR, OVERVIEW, {
      fovDeg: FOV,
      aspect: DOCKED_STAGE,
    })!;
    expect(shot.target.x).toBeCloseTo(2);
    // The aim slides a few centimetres along the screen's up so the body is
    // centred as drawn, which a look-down view does not give at the box centre.
    expect(shot.target.z).toBeCloseTo(-1, 1);
    expect(shot.target.y).toBeCloseTo(FLOOR + 0.9, 1);
  });

  it("keeps a whole line of performers inside the stage", () => {
    const spots = [-3.2, -1.6, 0, 1.6, 3.2].map((x) => ({ x, z: 0 }));
    const shot = fitBodiesShot(spots, FLOOR, OVERVIEW, {
      fovDeg: FOV,
      aspect: DOCKED_STAGE,
    })!;
    const fill = projectedBoxFill(
      eyeAt(shot.target, shot.distance),
      shot.target,
      bodyFrameBox(spots, FLOOR)!,
      FOV,
      DOCKED_STAGE
    );
    expect(fill.width).toBeLessThanOrEqual(0.95);
    expect(fill.height).toBeLessThan(BODY_HEIGHT_FILL);
  });

  it("keeps the bodies clear of the bars drawn over the top and bottom of the stage", () => {
    const spot = { x: 0, z: 0 };
    // A laptop stage: the performer bar and its hint cover the top 15 percent,
    // the transport the bottom 12.
    const bars = { top: 0.15, bottom: 0.12 };
    const shot = fitBodiesShot([spot], FLOOR, OVERVIEW, {
      fovDeg: FOV,
      aspect: 480 / 746,
      topInset: bars.top,
      bottomInset: bars.bottom,
    })!;
    const span = verticalSpan(
      eyeAt(shot.target, shot.distance),
      shot.target,
      bodyFrameBox([spot], FLOOR)!
    );

    expect(span.top).toBeGreaterThanOrEqual(bars.top);
    expect(span.bottom).toBeLessThanOrEqual(1 - bars.bottom);
    // The clear band is used, not wasted, and the bodies sit in its middle.
    const band = 1 - bars.top - bars.bottom;
    expect(span.bottom - span.top).toBeCloseTo(BODY_HEIGHT_FILL * band, 2);
    expect((span.top + span.bottom) / 2).toBeCloseTo(bars.top + band / 2, 1);
  });

  it("has nothing to frame without performers", () => {
    expect(bodyFrameBox([], FLOOR)).toBeNull();
    expect(
      fitBodiesShot([], FLOOR, OVERVIEW, { fovDeg: FOV, aspect: 1 })
    ).toBeNull();
  });
});
