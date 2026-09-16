import { describe, expect, it } from "vitest";
import { computeFireVisualCacheKey } from "../web-gl-fire-renderer";
import { DEFAULT_FIRE_CONFIG } from "../../../domain/types/fire-types";

const baseInput = {
  playbackSpeed: 1,
  sequenceContentHash: "seq-a",
  propColors: undefined,
  canvasWidth: 950,
  canvasHeight: 950,
  propGeometryKey: "fan__fire_bare|fan__fire_bare|sig",
};

/**
 * The frame cache replays a recorded loop while the key is unchanged. The key
 * used to ignore what the props looked like, so switching a fan build, a look,
 * or a tip override replayed flames recorded for different artwork, and a
 * canvas resize replayed a loop recorded for another size.
 */
describe("computeFireVisualCacheKey", () => {
  it("changes when the prop geometry key changes", () => {
    const a = computeFireVisualCacheKey(DEFAULT_FIRE_CONFIG, baseInput);
    const b = computeFireVisualCacheKey(DEFAULT_FIRE_CONFIG, {
      ...baseInput,
      propGeometryKey: "fan__lotus|fan__fire_bare|sig2",
    });
    expect(a).not.toBe(b);
  });

  it("changes when the canvas size changes", () => {
    const a = computeFireVisualCacheKey(DEFAULT_FIRE_CONFIG, baseInput);
    const b = computeFireVisualCacheKey(DEFAULT_FIRE_CONFIG, {
      ...baseInput,
      canvasWidth: 1200,
      canvasHeight: 1200,
    });
    expect(a).not.toBe(b);
  });

  it("is stable for identical inputs", () => {
    expect(computeFireVisualCacheKey(DEFAULT_FIRE_CONFIG, baseInput)).toBe(
      computeFireVisualCacheKey(DEFAULT_FIRE_CONFIG, { ...baseInput })
    );
  });
});
