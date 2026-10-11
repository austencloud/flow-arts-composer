import { describe, it, expect } from "vitest";
import { detectPlaneSplit } from "#lib/features/lab/tabs/spatial-lab/services/plane-split-detector.js";

describe("detectPlaneSplit", () => {
  const bodyY = 330;
  const threshold = 30;

  it("no split when both props in front", () => {
    expect(detectPlaneSplit(180, 180, bodyY, threshold)).toBe(false);
  });

  it("splits when left prop behind body", () => {
    expect(detectPlaneSplit(480, 180, bodyY, threshold)).toBe(true);
  });

  it("splits when right prop behind body", () => {
    expect(detectPlaneSplit(180, 480, bodyY, threshold)).toBe(true);
  });

  it("splits when both behind", () => {
    expect(detectPlaneSplit(480, 480, bodyY, threshold)).toBe(true);
  });

  it("no split at threshold boundary", () => {
    expect(detectPlaneSplit(360, 180, bodyY, threshold)).toBe(false);
  });

  it("splits just past threshold", () => {
    expect(detectPlaneSplit(361, 180, bodyY, threshold)).toBe(true);
  });
});
