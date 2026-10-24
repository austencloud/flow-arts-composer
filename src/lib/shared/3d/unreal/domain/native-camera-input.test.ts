import { describe, expect, it } from "vitest";
import {
  nativeDragDelta,
  nativeDollyDragDelta,
  nativePinchZoomDelta,
  nativeProjectionFov,
  nativeWheelZoomDelta,
} from "./native-camera-input";

describe("Unreal camera input matches Web orbit controls", () => {
  it("uses the viewport height for both drag axes", () => {
    expect(nativeDragDelta(120, -60, 600)).toEqual({
      deltaX: 0.2,
      deltaY: -0.1,
    });
  });

  it("uses the Web wheel direction and distance scale", () => {
    const zoomOut = nativeWheelZoomDelta(120, 0, false);
    expect(Math.exp(zoomOut)).toBeCloseTo(Math.pow(0.95, -4));
    expect(nativeWheelZoomDelta(-120, 0, false)).toBeCloseTo(-zoomOut);
    expect(nativeWheelZoomDelta(3, 1, false)).toBeCloseTo(
      nativeWheelZoomDelta(30, 0, false)
    );
  });

  it("pinching fingers apart moves toward the scene", () => {
    expect(Math.exp(nativePinchZoomDelta(80, 96))).toBeCloseTo(
      Math.pow(0.95, 1)
    );
  });

  it("keeps mouse dolly distance independent of the two-finger midpoint", () => {
    expect(Math.exp(nativeDollyDragDelta(16))).toBeCloseTo(Math.pow(0.95, 2));
    expect(nativeDollyDragDelta(16)).toBeCloseTo(2 * nativePinchZoomDelta(80, 96));
  });

  it("Ctrl+wheel changes projection without dollying and uses pixel scaling for line events", () => {
    const delta = nativeWheelZoomDelta(3, 1, false, true);
    expect(delta).toBeCloseTo(nativeWheelZoomDelta(3, 0, false, true));
    const fov = nativeProjectionFov(50, delta);
    expect(Math.tan((fov * Math.PI) / 360)).toBeCloseTo(
      Math.tan((50 * Math.PI) / 360) * Math.pow(0.95, -0.1)
    );
    expect(nativeProjectionFov(fov, -delta)).toBeCloseTo(50);
  });
});
