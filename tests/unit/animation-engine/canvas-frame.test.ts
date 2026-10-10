import { describe, expect, it } from "vitest";
import {
  frameOffset,
  measureFrame,
  sameFrame,
  squareFrame,
  staleRasterScale,
} from "#lib/shared/animation-engine/domain/types/canvas-frame.js";

describe("canvas frame", () => {
  it("centres the engine square inside a wide or tall frame", () => {
    expect(frameOffset(measureFrame(1200, 800))).toEqual({ x: 200, y: 0 });
    expect(frameOffset(measureFrame(400, 700))).toEqual({ x: 0, y: 150 });
  });

  it("has no offset on a square, so export contexts see no shift", () => {
    expect(frameOffset(squareFrame(1080))).toEqual({ x: 0, y: 0 });
    expect(measureFrame(500, 500)).toEqual(squareFrame(500));
  });

  it("treats a sideways-only change as a different frame", () => {
    expect(sameFrame(measureFrame(1200, 800), measureFrame(1500, 800))).toBe(
      false
    );
    expect(
      sameFrame(measureFrame(1200, 800), {
        size: 800,
        width: 1200,
        height: 800,
      })
    ).toBe(true);
  });

  it("keeps a stale raster's square the size of the box's square", () => {
    // The opening tunnel's mandala layer, still allocated for the full
    // portrait frame, inside the short box it is easing into. Contain alone
    // would draw its 594px square at 197px of a 349px box square.
    const scale = staleRasterScale(396, 349, 594, 1050);
    const contain = Math.min(396 / 594, 349 / 1050);
    expect(594 * contain).toBeCloseTo(197.4, 1);
    expect(594 * contain * scale).toBeCloseTo(349, 6);
  });

  it("leaves rasters that match the box's shape, and every square, alone", () => {
    expect(staleRasterScale(396, 349, 594, 523.5)).toBeCloseTo(1, 6);
    expect(staleRasterScale(396, 349, 594, 594)).toBe(1);
    expect(staleRasterScale(396, 700, 523, 523)).toBe(1);
    expect(staleRasterScale(0, 349, 594, 1050)).toBe(1);
  });
});
