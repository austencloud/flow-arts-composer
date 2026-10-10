import { describe, expect, it } from "vitest";
import {
  resolveBloomAfterglowRetention,
  resolveBloomHistoryDeposit,
} from "#lib/shared/effects/domain/bloom-optics.js";

describe("Bloom afterglow energy", () => {
  it("fully disables persistence at zero", () => {
    expect(resolveBloomAfterglowRetention(0)).toBe(0);
    expect(resolveBloomHistoryDeposit(0)).toBe(0);
  });

  it("keeps steady accumulated scatter bounded as persistence rises", () => {
    for (const afterglow of [0.1, 0.5, 0.9, 1]) {
      const retention = resolveBloomAfterglowRetention(afterglow);
      const deposit = resolveBloomHistoryDeposit(afterglow);
      const steadyEnergy = deposit / (1 - retention);

      expect(retention).toBeGreaterThan(0);
      expect(retention).toBeLessThan(1);
      expect(steadyEnergy).toBeCloseTo(0.18 + afterglow * 0.82, 8);
      expect(steadyEnergy).toBeLessThanOrEqual(1);
    }
  });
});
