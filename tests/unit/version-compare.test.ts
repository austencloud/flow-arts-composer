import { describe, it, expect } from "vitest";
import { compareVersions } from "#lib/shared/versioning/domain/models/version-models.js";

describe("compareVersions", () => {
  it("orders by major.minor.patch numerically", () => {
    expect(compareVersions("0.24.0", "0.25.0")).toBe(-1);
    expect(compareVersions("0.25.0", "0.24.0")).toBe(1);
    expect(compareVersions("1.0.0", "0.99.99")).toBe(1);
  });

  it("is numeric, not lexicographic (the 0.9 vs 0.10 trap)", () => {
    // String compare would call "0.9.0" > "0.10.0" — wrong. Numeric is correct.
    expect(compareVersions("0.9.0", "0.10.0")).toBe(-1);
    expect(compareVersions("0.10.0", "0.9.0")).toBe(1);
  });

  it("treats equal versions as 0", () => {
    expect(compareVersions("0.24.0", "0.24.0")).toBe(0);
  });

  it("tolerates missing patch segments", () => {
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("1.2", "1.2.1")).toBe(-1);
  });

  it("ranks a release above a pre-release of the same core", () => {
    expect(compareVersions("0.24.0", "0.24.0-beta")).toBe(1);
    expect(compareVersions("0.24.0-beta", "0.24.0")).toBe(-1);
  });
});

describe("high-water-mark gate (lastSeen >= current suppresses)", () => {
  const hasSeen = (lastSeen: string | null, current: string) =>
    !!lastSeen && compareVersions(lastSeen, current) >= 0;

  it("suppresses when a stale build lags the seen version", () => {
    // Saw 0.25.0 on prod; a dev server still baked at 0.24.0 must NOT re-show.
    expect(hasSeen("0.25.0", "0.24.0")).toBe(true);
  });

  it("shows once for a genuinely newer release", () => {
    expect(hasSeen("0.24.0", "0.25.0")).toBe(false);
  });

  it("shows when nothing has been seen yet", () => {
    expect(hasSeen(null, "0.25.0")).toBe(false);
  });
});
