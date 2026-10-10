import { describe, expect, it } from "vitest";
import type { PostSourceGeometry } from "#lib/shared/media-composition/domain/post-project.js";
import {
  dragSourceGeometry,
  scaleSourceGeometry,
} from "#lib/shared/share/components/post-studio/editor/post-source-geometry.js";

const start: PostSourceGeometry = {
  x: -0.1,
  y: 0.2,
  width: 0.8,
  height: 0.4,
  rotation: 0,
  crop: { left: 0.1, top: 0, right: 0.9, bottom: 1 },
};

describe("source geometry gestures", () => {
  it("moves beyond the canvas without changing the source crop", () => {
    const moved = dragSourceGeometry(start, "move", -200, 96, 1000, 800);
    expect(moved.x).toBeCloseTo(-0.3);
    expect(moved.y).toBeCloseTo(0.32);
    expect(moved.width).toBe(start.width);
    expect(moved.height).toBe(start.height);
    expect(moved.crop).toEqual(start.crop);
  });

  it("resizes a turned media rectangle along its local axis", () => {
    const turned = { ...start, rotation: 90 };
    const resized = dragSourceGeometry(turned, "e", 0, 80, 1000, 800);
    expect(resized.width).toBeCloseTo(0.88);
    expect(resized.height).toBeCloseTo(0.4);
    expect(resized.x).toBeCloseTo(-0.14);
    expect(resized.y).toBeCloseTo(0.25);
  });

  it("scales about the centre and translates with a pinch", () => {
    const scaled = scaleSourceGeometry(start, 1.5, 100, -80, 1000, 800);
    expect(scaled.x).toBeCloseTo(-0.2);
    expect(scaled.y).toBeCloseTo(0);
    expect(scaled.width).toBeCloseTo(1.2);
    expect(scaled.height).toBeCloseTo(0.6);
    expect(scaled.crop).toEqual(start.crop);
  });
});
