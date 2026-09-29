import { describe, expect, it } from "vitest";
import type { PostSourceGeometry } from "$lib/shared/media-composition/domain/post-project";
import {
  dragSourceCrop,
  setSourceCropEdge,
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
});
