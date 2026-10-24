import { describe, expect, it } from "vitest";
import { DEFAULT_SCENE_DIMENSIONS } from "@austencloud/scene-3d";
import { CANONICAL_PERFORMER_ANCHOR_Y } from "../../environments/domain/stage-coordinate-frame";
import {
  frameNativeCamera,
  toNativeCameraPose,
  toWebCameraPose,
} from "./native-camera-framing";

describe("native camera origin", () => {
  const webFeetY =
    CANONICAL_PERFORMER_ANCHOR_Y + DEFAULT_SCENE_DIMENSIONS.groundY;

  it("maps the current Web performer's feet to native floor zero without changing orbit direction", () => {
    const position = { x: 0.5, y: 0.4, z: 3.8 };
    const target = { x: 0, y: 0, z: 0.3 };
    const native = toNativeCameraPose(position, target, webFeetY);
    expect(webFeetY).toBeCloseTo(-1.0121);
    expect(native.target.y).toBeCloseTo(-webFeetY);
    expect(
      toNativeCameraPose({ x: 0, y: webFeetY, z: 0 }, target, webFeetY).position
        .y
    ).toBeCloseTo(0);
    expect(native.position.y - native.target.y).toBeCloseTo(
      position.y - target.y
    );
    const restored = toWebCameraPose(native.position, native.target, webFeetY);
    expect(restored.position.x).toBe(position.x);
    expect(restored.position.y).toBeCloseTo(position.y);
    expect(restored.position.z).toBe(position.z);
    expect(restored.target).toEqual(target);
  });

  it("uses the same origin for later framed shots and round-trips a raised target", () => {
    const position = { x: 1, y: 2, z: 5 };
    const target = { x: 0, y: 0.6, z: 0 };
    const framed = frameNativeCamera(position, target, 1, 1, 50, webFeetY);
    expect(framed.target.y).toBeCloseTo(target.y - webFeetY);
    const restored = toWebCameraPose(framed.position, framed.target, webFeetY);
    expect(restored.target.x).toBe(target.x);
    expect(restored.target.y).toBeCloseTo(target.y);
    expect(restored.target.z).toBe(target.z);
  });

  it("uses a changed proportion offset in both directions", () => {
    const feetY = -0.7;
    const position = { x: 2, y: 1, z: 4 };
    const target = { x: 0, y: 0.55, z: 0 };
    const native = toNativeCameraPose(position, target, feetY);
    expect(native.target.y).toBeCloseTo(1.25);
    expect(toWebCameraPose(native.position, native.target, feetY)).toEqual({
      position,
      target,
    });
  });
});
