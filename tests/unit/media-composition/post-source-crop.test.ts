import { describe, expect, it } from "vitest";
import type { PostSourceGeometry } from "$lib/shared/media-composition/domain/post-project";
import {
  dragSourceCrop,
  setSourceCropEdge,
  sourceCropAtRatio,
} from "$lib/shared/share/components/post-studio/editor/post-source-crop";

const geometry: PostSourceGeometry = {
  x: -0.2,
  y: 0.1,
  width: 1.3,
  height: 0.8,
  rotation: 17,
  crop: { left: 0.2, top: 0.1, right: 0.9, bottom: 0.8 },
};

describe("source crop geometry", () => {
  it("changes a source edge without flattening placement or rotation", () => {
    const changed = setSourceCropEdge(geometry, "left", 0.35);
    expect(changed).toEqual({
      ...geometry,
      crop: { ...geometry.crop, left: 0.35 },
    });
    expect(geometry.crop.left).toBe(0.2);
  });

  it("keeps a nonzero crop and respects the opposite edge", () => {
    expect(setSourceCropEdge(geometry, "left", 1).crop.left).toBeLessThan(
      geometry.crop.right
    );
    expect(setSourceCropEdge(geometry, "right", -1).crop.right).toBeGreaterThan(
      geometry.crop.left
    );
  });

  it("moves the crop inside the source without changing its span", () => {
    const moved = dragSourceCrop(geometry, "move", 1, -1);
    expect(moved.crop.left).toBeCloseTo(0.3);
    expect(moved.crop.right).toBe(1);
    expect(moved.crop.top).toBe(0);
    expect(moved.crop.bottom).toBeCloseTo(0.7);
    expect(moved.width).toBe(geometry.width);
    expect(moved.rotation).toBe(geometry.rotation);
  });

  it("sets a preset ratio without changing the imported turn or crop center", () => {
    const changed = sourceCropAtRatio(
      geometry,
      { width: 1920, height: 1080 },
      { width: 1080, height: 1920 },
      1
    );
    expect(changed.rotation).toBe(17);
    expect((changed.crop.left + changed.crop.right) / 2).toBeCloseTo(0.55);
    expect((changed.crop.top + changed.crop.bottom) / 2).toBeCloseTo(0.45);
    expect((changed.crop.right - changed.crop.left) * 1920 /
      ((changed.crop.bottom - changed.crop.top) * 1080)).toBeCloseTo(1);
    expect(changed.width * 1080 / (changed.height * 1920)).toBeCloseTo(1);
  });

  it("restores full source bounds for Original", () => {
    const changed = sourceCropAtRatio(
      geometry,
      { width: 1920, height: 1080 },
      { width: 1080, height: 1920 },
      1920 / 1080,
      true
    );
    expect(changed.crop).toEqual({ left: 0, top: 0, right: 1, bottom: 1 });
  });
});
