import { describe, expect, it } from "vitest";
import {
  calculatePictographArrivalTransform,
  hasUsableArrivalRect,
} from "#lib/features/create/shared/workspace-panel/sequence-display/domain/pictograph-arrival-geometry.js";

describe("pictograph arrival geometry", () => {
  it("maps the live stage card exactly onto the reserved grid cell", () => {
    expect(
      calculatePictographArrivalTransform(
        { left: 400, top: 180, width: 480, height: 480 },
        { left: 112, top: 632, width: 96, height: 96 }
      )
    ).toEqual({
      translateX: -288,
      translateY: 452,
      scaleX: 0.2,
      scaleY: 0.2,
    });
  });

  it("rejects missing and non-finite layout measurements", () => {
    expect(
      hasUsableArrivalRect({ left: 0, top: 0, width: 0, height: 100 })
    ).toBe(false);
    expect(
      calculatePictographArrivalTransform(
        { left: 0, top: 0, width: 100, height: 100 },
        { left: Number.NaN, top: 20, width: 50, height: 50 }
      )
    ).toBeNull();
  });
});
