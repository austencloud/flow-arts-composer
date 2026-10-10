import { describe, it, expect } from "vitest";
import { SCENE_FEATURES } from "#lib/shared/3d/scene-features/domain/scene-feature-registry.js";

describe("SCENE_FEATURES", () => {
  it("does not include a 'grid' entry", () => {
    expect(SCENE_FEATURES.find((f) => f.key === "grid")).toBeUndefined();
  });

  it("contains the 5 canonical scene features", () => {
    const keys = SCENE_FEATURES.map((f) => f.key).sort();
    expect(keys).toEqual(["audience", "campfire", "environment", "stage", "tent"]);
  });
});
