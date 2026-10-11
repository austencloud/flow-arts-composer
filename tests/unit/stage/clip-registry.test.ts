import { describe, it, expect } from "vitest";
import {
  computeBlendWeights,
  computeTimeScale,
} from "#lib/features/stage/locomotion/clip-registry.js";

describe("clip-registry", () => {
  describe("computeBlendWeights", () => {
    it("returns full idle at speed 0", () => {
      const w = computeBlendWeights(0);
      expect(w.idle).toBe(1);
      expect(w.walk).toBe(0);
      expect(w.run).toBe(0);
    });

    it("returns full walk at walk speed", () => {
      const w = computeBlendWeights(1.4);
      expect(w.idle).toBe(0);
      expect(w.walk).toBe(1);
      expect(w.run).toBe(0);
    });

    it("blends idle and walk at half walk speed", () => {
      const w = computeBlendWeights(0.7);
      expect(w.idle).toBeCloseTo(0.5);
      expect(w.walk).toBeCloseTo(0.5);
      expect(w.run).toBe(0);
    });

    it("returns full run at run speed", () => {
      const w = computeBlendWeights(4.0);
      expect(w.idle).toBe(0);
      expect(w.walk).toBe(0);
      expect(w.run).toBe(1);
    });

    it("blends walk and run at midpoint", () => {
      const w = computeBlendWeights(2.7); // midpoint between 1.4 and 4.0
      expect(w.idle).toBe(0);
      expect(w.walk).toBeCloseTo(0.5);
      expect(w.run).toBeCloseTo(0.5);
    });
  });

  describe("computeTimeScale", () => {
    it("returns 1 when speed matches clip speed", () => {
      expect(computeTimeScale(1.4, 1.4)).toBeCloseTo(1);
    });

    it("returns > 1 when moving faster than clip", () => {
      expect(computeTimeScale(2.0, 1.4)).toBeGreaterThan(1);
    });

    it("clamps to minimum 0.5", () => {
      expect(computeTimeScale(0.1, 1.4)).toBe(0.5);
    });

    it("clamps to maximum 2.0", () => {
      expect(computeTimeScale(10, 1.4)).toBe(2.0);
    });
  });
});
