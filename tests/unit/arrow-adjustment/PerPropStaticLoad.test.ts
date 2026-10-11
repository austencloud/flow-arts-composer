import { describe, it, expect, afterEach } from "vitest";
import {
  ArrowPlacer,
  setDefaultOverrideResolver,
} from "#lib/shared/pictograph/arrow/positioning/placement/services/arrow-placer.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { MotionType } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

// Cache returns a different value for the fan/ subfolder than for the staff root.
const fakeCache = {
  async get(path: string) {
    if (path.includes("/fan/") && path.includes("pro")) {
      return { pro_to_layer1_alpha: { "0": [10, 20] } };
    }
    if (path.includes("default_pro")) {
      return { pro_to_layer1_alpha: { "0": [1, 2] } };
    }
    return {};
  },
} as unknown as import("#lib/shared/pictograph/shared/services/simple-json-cache.js").SimpleJsonCache;

afterEach(() => setDefaultOverrideResolver(null));

describe("per-prop static default load", () => {
  it("reads the prop's own subfolder dataset when seeded", async () => {
    const placer = new ArrowPlacer(fakeCache);
    const result = await placer.getDefaultAdjustment(
      "pro" as MotionType,
      "pro_to_layer1_alpha",
      "0",
      GridMode.DIAMOND,
      "fan"
    );
    expect(result).toEqual({ x: 10, y: 20 });
  });

  it("falls back to staff root for an unseeded prop", async () => {
    const placer = new ArrowPlacer(fakeCache);
    const result = await placer.getDefaultAdjustment(
      "pro" as MotionType,
      "pro_to_layer1_alpha",
      "0",
      GridMode.DIAMOND,
      "sword"
    );
    expect(result).toEqual({ x: 1, y: 2 });
  });

  it("staff prop reads the root dataset (back-compat)", async () => {
    const placer = new ArrowPlacer(fakeCache);
    const result = await placer.getDefaultAdjustment(
      "pro" as MotionType,
      "pro_to_layer1_alpha",
      "0",
      GridMode.DIAMOND,
      "staff"
    );
    expect(result).toEqual({ x: 1, y: 2 });
  });
});
