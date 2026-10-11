import { describe, it, expect } from "vitest";
import { DefaultPlacer } from "#lib/shared/pictograph/arrow/positioning/placement/services/default-placer.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { MotionType } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

// Returns a different dataset for the fan/ subfolder than for the staff root.
const fakeCache = {
  async get(path: string) {
    if (path.includes("/fan/") && path.includes("pro"))
      return { pro_to_layer1_alpha: { "0": [10, 20] } };
    if (path.includes("default_pro"))
      return { pro_to_layer1_alpha: { "0": [1, 2] } };
    return {};
  },
} as unknown as import("#lib/shared/pictograph/shared/services/simple-json-cache.js").SimpleJsonCache;

describe("DefaultPlacer forwards propType", () => {
  it("routes propType to the per-prop dataset", async () => {
    const placer = new DefaultPlacer(fakeCache);
    expect(
      await placer.getDefaultAdjustment(
        "pro_to_layer1_alpha",
        "0",
        "pro" as MotionType,
        GridMode.DIAMOND,
        "fan"
      )
    ).toEqual({ x: 10, y: 20 });
    expect(
      await placer.getDefaultAdjustment(
        "pro_to_layer1_alpha",
        "0",
        "pro" as MotionType,
        GridMode.DIAMOND,
        "staff"
      )
    ).toEqual({ x: 1, y: 2 });
  });

  it("defaults to staff when propType omitted", async () => {
    const placer = new DefaultPlacer(fakeCache);
    expect(
      await placer.getDefaultAdjustment(
        "pro_to_layer1_alpha",
        "0",
        "pro" as MotionType,
        GridMode.DIAMOND
      )
    ).toEqual({ x: 1, y: 2 });
  });
});
