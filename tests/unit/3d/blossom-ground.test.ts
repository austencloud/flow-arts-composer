import { describe, expect, it } from "vitest";
import {
  getBlossomGroundLifeTier,
  getBlossomGroundMaskBounds,
  getBlossomPlannedGrassClumps,
  getBlossomStageContact,
  isBlossomGroundLifeTierVisible,
} from "#lib/shared/3d/environments/scenes/cherry-blossom/blossom-ground.js";

describe("Blossom ground contract", () => {
  it("maps the authored habitat mask across the entire garden", () => {
    expect(getBlossomGroundMaskBounds()).toEqual({
      min: [-72, -72],
      size: [144, 144],
    });
  });

  it("keeps the stage contact transition feathered instead of adding a disc", () => {
    expect(getBlossomStageContact()).toEqual({
      edgeInset: 0.4,
      feather: 1.8,
      noise: 0.18,
      strength: 0.72,
    });
  });

  it("does not add procedural clumps to the baked garden", () => {
    expect(getBlossomPlannedGrassClumps()).toBe(0);
  });

  it("recovers quality tiers from authored extras or optimized mesh names", () => {
    expect(getBlossomGroundLifeTier("ignored", "high")).toBe("high");
    expect(
      getBlossomGroundLifeTier(
        "Blossom Grass Medium Damp Bank Prototype 2 Mesh"
      )
    ).toBe("medium");
    expect(getBlossomGroundLifeTier("Garden Ground")).toBeNull();
  });

  it("adds grass detail monotonically across quality tiers", () => {
    expect(isBlossomGroundLifeTierVisible("base", "base")).toBe(true);
    expect(isBlossomGroundLifeTierVisible("medium", "base")).toBe(false);
    expect(isBlossomGroundLifeTierVisible("medium", "medium")).toBe(true);
    expect(isBlossomGroundLifeTierVisible("high", "medium")).toBe(false);
    expect(isBlossomGroundLifeTierVisible("high", "high")).toBe(true);
  });
});
