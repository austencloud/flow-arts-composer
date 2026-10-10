import { describe, it, expect } from "vitest";
import { detectCrossing } from "#lib/features/lab/tabs/spatial-lab/services/crossing-detector.js";

describe("detectCrossing", () => {
  it("detects X-shaped crossing", () => {
    const result = detectCrossing(
      { x: 100, y: 100 }, { x: 400, y: 400 },
      { x: 400, y: 100 }, { x: 100, y: 400 },
    );
    expect(result).not.toBeNull();
    expect(result!.x).toBeCloseTo(250, 0);
    expect(result!.y).toBeCloseTo(250, 0);
  });

  it("returns null for parallel lines", () => {
    const result = detectCrossing(
      { x: 100, y: 100 }, { x: 100, y: 400 },
      { x: 200, y: 100 }, { x: 200, y: 400 },
    );
    expect(result).toBeNull();
  });

  it("returns null when lines diverge (no segment intersection)", () => {
    const result = detectCrossing(
      { x: 100, y: 100 }, { x: 200, y: 100 },
      { x: 100, y: 200 }, { x: 200, y: 200 },
    );
    expect(result).toBeNull();
  });

  it("ignores intersections near endpoints", () => {
    const result = detectCrossing(
      { x: 100, y: 100 }, { x: 200, y: 200 },
      { x: 200, y: 200 }, { x: 300, y: 100 },
    );
    expect(result).toBeNull();
  });
});
