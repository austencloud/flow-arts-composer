import { describe, it, expect } from "vitest";
import {
  allocateTurns,
  getDefaultMaxTurnIntensity,
} from "../../../src/generation/turns/TurnAllocator.js";

describe("TurnAllocator", () => {
  describe("allocateTurns", () => {
    it.each([1, 2, 8])("keeps Level 2 from randomly producing a turn-free %i-step seed", (count) => {
      const result = allocateTurns(count, 2, 1, { random: () => 0 });
      const turns = [...result.left, ...result.right];
      expect(turns.some((turn) => turn === 1)).toBe(true);
      expect(turns.every((turn) => turn === 0 || turn === 1)).toBe(true);
    });

    it("preserves an explicitly required zero-turn figure", () => {
      expect(allocateTurns(2, 2, 1, { requiredTurns: 0, random: () => 0 })).toEqual({
        left: [0, 0], right: [0, 0],
      });
    });

    it("uses injected entropy for deterministic allocation", () => {
      const values = [0.99, 0, 0.49, 0.75];
      const random = () => values.shift() ?? 0;

      expect(allocateTurns(2, 2, 1, { random })).toEqual({
        left: [1, 0],
        right: [0, 1],
      });
    });

    it("level 1 produces only 0 turns", () => {
      const result = allocateTurns(10, 1);

      expect(result.left).toHaveLength(10);
      expect(result.right).toHaveLength(10);

      for (const t of result.left) {
        expect(t).toBe(0);
      }
      for (const t of result.right) {
        expect(t).toBe(0);
      }
    });

    it("level 2 produces values from {0, 1, 2, 3}", () => {
      // Run enough times to get coverage of the pool
      const allLeft = new Set<number | "fl">();
      const allRight = new Set<number | "fl">();

      for (let i = 0; i < 100; i++) {
        const result = allocateTurns(5, 2);
        for (const t of result.left) allLeft.add(t);
        for (const t of result.right) allRight.add(t);
      }

      const validValues = new Set([0, 1, 2, 3]);
      for (const v of allLeft) {
        expect(validValues.has(v as number)).toBe(true);
      }
      for (const v of allRight) {
        expect(validValues.has(v as number)).toBe(true);
      }
    });

    it("level 3 can include half turns and float", () => {
      const allValues = new Set<number | "fl">();

      for (let i = 0; i < 200; i++) {
        const result = allocateTurns(5, 3);
        for (const t of result.left) allValues.add(t);
        for (const t of result.right) allValues.add(t);
      }

      // With 200 iterations of 5 steps each (2000 values per hand),
      // we should see half turns and "fl" in the output
      const validValues = new Set<number | "fl">([
        0,
        0.5,
        1,
        1.5,
        2,
        2.5,
        3,
        "fl",
      ]);
      for (const v of allValues) {
        expect(validValues.has(v)).toBe(true);
      }

      // Should include at least some half turns (statistically near certain)
      expect(allValues.has(0.5)).toBe(true);
      expect(allValues.has("fl")).toBe(true);
    });

    it("maxTurnIntensity caps the numeric values", () => {
      const result = allocateTurns(50, 2, 1);

      for (const t of result.left) {
        expect(typeof t === "number" && t <= 1).toBe(true);
      }
      for (const t of result.right) {
        expect(typeof t === "number" && t <= 1).toBe(true);
      }
    });

    it("maxTurnIntensity 0 at level 2 produces only 0 turns", () => {
      const result = allocateTurns(20, 2, 0);

      for (const t of result.left) {
        expect(t).toBe(0);
      }
      for (const t of result.right) {
        expect(t).toBe(0);
      }
    });

    it("output has correct length matching stepCount", () => {
      for (const count of [0, 1, 5, 20]) {
        const result = allocateTurns(count, 2);
        expect(result.left).toHaveLength(count);
        expect(result.right).toHaveLength(count);
      }
    });

    it("float passes through maxTurnIntensity filter at level 3", () => {
      // At level 3 with maxTurnIntensity=0, the pool should be [0, "fl"]
      const allValues = new Set<number | "fl">();

      for (let i = 0; i < 100; i++) {
        const result = allocateTurns(5, 3, 0);
        for (const t of result.left) allValues.add(t);
        for (const t of result.right) allValues.add(t);
      }

      // Only 0 and "fl" should be present
      for (const v of allValues) {
        expect(v === 0 || v === "fl").toBe(true);
      }
    });
  });

  describe("getDefaultMaxTurnIntensity", () => {
    it("returns 0 for level 1", () => {
      expect(getDefaultMaxTurnIntensity(1)).toBe(0);
    });

    it("returns 3 for level 2", () => {
      expect(getDefaultMaxTurnIntensity(2)).toBe(3);
    });

    it("returns 3 for level 3", () => {
      expect(getDefaultMaxTurnIntensity(3)).toBe(3);
    });

    it("returns 0 for unknown levels", () => {
      expect(getDefaultMaxTurnIntensity(0)).toBe(0);
      expect(getDefaultMaxTurnIntensity(99)).toBe(0);
    });
  });
});
