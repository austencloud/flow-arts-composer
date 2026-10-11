import { describe, it, expect } from "vitest";
import {
  STRIP_SAMPLE_CAP,
  stripColumns,
  sampleCount,
} from "#lib/features/creators/components/profile/stage/doorway-policy.js";

describe("stripColumns", () => {
  it("caps a strip at six however wide the band gets", () => {
    expect(STRIP_SAMPLE_CAP).toBe(6);
    expect(stripColumns(8)).toBe(6);
    expect(stripColumns(10)).toBe(6);
  });

  it("yields to the band when the band is narrower than the cap", () => {
    expect(stripColumns(4)).toBe(4);
    expect(stripColumns(2)).toBe(2);
  });

  it("never returns a column count below one", () => {
    expect(stripColumns(0)).toBe(1);
    expect(stripColumns(-3)).toBe(1);
  });
});

describe("sampleCount", () => {
  it("never exceeds the column cap, so the sample stays one row", () => {
    expect(sampleCount(505, 8)).toBe(8);
    expect(sampleCount(505, 4)).toBe(4);
  });

  it("shows everything when there is less than a row", () => {
    expect(sampleCount(3, 8)).toBe(3);
  });

  it("returns zero for an empty band", () => {
    expect(sampleCount(0, 8)).toBe(0);
  });
});
