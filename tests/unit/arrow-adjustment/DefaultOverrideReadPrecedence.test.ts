import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  ArrowPlacer,
  setDefaultOverrideResolver,
} from "#lib/shared/pictograph/arrow/positioning/placement/services/arrow-placer.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { MotionType } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

// Minimal SimpleJsonCache stand-in: returns a fixed canonical/pro map.
const requestedPaths: string[] = [];
const fakeCache = {
  async get(path: string) {
    requestedPaths.push(path);
    if (path.endsWith("default_pro_placements.json")) {
      return { pro_to_layer1_alpha: { "1.5": [-35, 145] } };
    }
    return {};
  },
} as unknown as import("#lib/shared/pictograph/shared/services/simple-json-cache.js").SimpleJsonCache;

beforeEach(() => requestedPaths.splice(0));
afterEach(() => setDefaultOverrideResolver(null));

describe("default override read precedence", () => {
  it("returns the static JSON value when no resolver is registered", async () => {
    const placer = new ArrowPlacer(fakeCache);
    const result = await placer.getDefaultAdjustment(
      "pro" as MotionType,
      "pro_to_layer1_alpha",
      "1.5",
      GridMode.BOX
    );
    expect(result).toEqual({ x: -35, y: 145 });
    expect(requestedPaths).toContain(
      "/data/arrow_placement/default/default_pro_placements.json"
    );
    expect(requestedPaths.every((path) => !path.includes("/box/"))).toBe(true);
  });

  it("prefers the resolver value over the static JSON value", async () => {
    const placer = new ArrowPlacer(fakeCache);
    setDefaultOverrideResolver((grid, motion, key, turns, prop) =>
      grid === "canonical" &&
      motion === "pro" &&
      key === "pro_to_layer1_alpha" &&
      turns === "1.5" &&
      prop === "staff"
        ? [7, 9]
        : null
    );
    const result = await placer.getDefaultAdjustment(
      "pro" as MotionType,
      "pro_to_layer1_alpha",
      "1.5",
      GridMode.BOX
    );
    expect(result).toEqual({ x: 7, y: 9 });
  });

  it("falls through to JSON when the resolver returns null", async () => {
    const placer = new ArrowPlacer(fakeCache);
    setDefaultOverrideResolver(() => null);
    const result = await placer.getDefaultAdjustment(
      "pro" as MotionType,
      "pro_to_layer1_alpha",
      "1.5",
      GridMode.BOX
    );
    expect(result).toEqual({ x: -35, y: 145 });
  });
});
