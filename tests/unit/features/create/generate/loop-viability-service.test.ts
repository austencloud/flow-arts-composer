import { describe, it, expect } from "vitest";
import { checkLoopViability } from "#lib/features/create/generate/shared/services/loop-viability-service.js";
import { LOOPType } from "#lib/shared/foundation/domain/models/generation/circular-models.js";


describe("LoopViabilityService", () => {
  describe("period 2 — always viable", () => {
    const allTypes = Object.values(LOOPType);
    for (const loopType of allTypes) {
      it(`${loopType} + period 2 is viable`, () => {
        expect(checkLoopViability({ loopType, period: 2 }).viable).toBe(true);
      });
    }
  });

  describe("period 4 — rotated types are always viable", () => {
    const rotatedTypes = [
      LOOPType.ROTATED,
      LOOPType.ROTATED_INVERTED,
      LOOPType.ROTATED_SWAPPED,
      LOOPType.MIRRORED_ROTATED,
      LOOPType.MIRRORED_INVERTED_ROTATED,
      LOOPType.MIRRORED_ROTATED_INVERTED_SWAPPED,
    ];
    for (const loopType of rotatedTypes) {
      it(`${loopType} + period 4 at L1 is viable`, () => {
        expect(checkLoopViability({ loopType, period: 4, level: 1 }).viable).toBe(true);
      });
      it(`${loopType} + period 4 at L3 is viable`, () => {
        expect(checkLoopViability({ loopType, period: 4, level: 3 }).viable).toBe(true);
      });
    }
  });

  describe("period 4 — non-rotated types require L3+", () => {
    const halfTurnTypes = [
      LOOPType.MIRRORED,
      LOOPType.FLIPPED,
      LOOPType.SWAPPED,
      LOOPType.INVERTED,
      LOOPType.MIRRORED_INVERTED,
      LOOPType.MIRRORED_SWAPPED,
      LOOPType.SWAPPED_INVERTED,
    ];

    for (const loopType of halfTurnTypes) {
      it(`${loopType} + period 4 at L1 is INFEASIBLE (requires L3)`, () => {
        const result = checkLoopViability({ loopType, period: 4, level: 1 });
        expect(result.viable).toBe(false);
        expect(result.reason).toContain("Level 3");
      });

      it(`${loopType} + period 4 at L2 is INFEASIBLE (requires L3)`, () => {
        const result = checkLoopViability({ loopType, period: 4, level: 2 });
        expect(result.viable).toBe(false);
        expect(result.reason).toContain("Level 3");
      });

      it(`${loopType} + period 4 at L3 is viable`, () => {
        const result = checkLoopViability({ loopType, period: 4, level: 3 });
        expect(result.viable).toBe(true);
      });

      it(`${loopType} + period 4 at L5 is viable`, () => {
        const result = checkLoopViability({ loopType, period: 4, level: 5 });
        expect(result.viable).toBe(true);
      });
    }
  });

  describe("period 4 rewound is always infeasible", () => {
    it("at L3 is infeasible (temporal reversal, order 2)", () => {
      const result = checkLoopViability({
        loopType: LOOPType.STRICT_REWOUND,
        period: 4,
        level: 3,
      });
      expect(result.viable).toBe(false);
      expect(result.reason).toContain("rewound");
    });

    it("at L5 is still infeasible", () => {
      const result = checkLoopViability({
        loopType: LOOPType.STRICT_REWOUND,
        period: 4,
        level: 5,
      });
      expect(result.viable).toBe(false);
    });
  });

  describe("period 4 without level specified defaults to permissive for non-rotated", () => {
    it("mirrored + period 4, no level: viable (trusts upstream gate)", () => {
      const result = checkLoopViability({ loopType: LOOPType.MIRRORED, period: 4 });
      expect(result.viable).toBe(true);
    });
  });

  describe("invalid periods", () => {
    it("period 1 is rejected", () => {
      const r = checkLoopViability({ loopType: LOOPType.ROTATED, period: 1 });
      expect(r.viable).toBe(false);
      expect(r.reason).toContain("not a LOOP");
    });

    it("period 8 is reserved for L7+", () => {
      const r = checkLoopViability({ loopType: LOOPType.ROTATED, period: 8 });
      expect(r.viable).toBe(false);
      expect(r.reason).toContain("Level 7");
    });

    it("period 3 (arbitrary odd) is rejected", () => {
      const r = checkLoopViability({ loopType: LOOPType.ROTATED, period: 3 });
      expect(r.viable).toBe(false);
      expect(r.reason).toContain("not supported");
    });

    it("period 5 is rejected", () => {
      const r = checkLoopViability({ loopType: LOOPType.MIRRORED, period: 5 });
      expect(r.viable).toBe(false);
    });
  });

  describe("suggestion copy", () => {
    it("mirrored + period 4 at L1 suggests raising level", () => {
      const r = checkLoopViability({ loopType: LOOPType.MIRRORED, period: 4, level: 1 });
      expect(r.suggestion).toContain("level");
    });
  });
});
