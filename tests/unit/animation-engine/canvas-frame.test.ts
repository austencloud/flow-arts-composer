import { describe, expect, it } from "vitest";
import {
  frameOffset,
  measureFrame,
  sameFrame,
  squareFrame,
} from "$lib/shared/animation-engine/domain/types/canvas-frame";

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
    expect(sameFrame(measureFrame(1200, 800), { size: 800, width: 1200, height: 800 })).toBe(true);
  });
});
