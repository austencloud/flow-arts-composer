import { describe, it, expect } from "vitest";
import {
  compareVersions,
  pickReleaseNotesVersion,
  type AppVersion,
} from "#lib/shared/versioning/domain/models/version-models.js";

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

describe("pickReleaseNotesVersion", () => {
  const v = (version: string): AppVersion => ({
    version,
    releasedAt: new Date("2026-10-15T00:00:00Z"),
    feedbackCount: 0,
    feedbackSummary: { bugs: 0, features: 0, general: 0 },
  }) as unknown as AppVersion;

  // Firestore returns newest first by releasedAt; the pick must not rely on it.
  const published = [v("0.47.0"), v("0.48.0"), v("0.46.0")];

  it("opens the running version's notes when they exist", () => {
    expect(pickReleaseNotesVersion(published, "0.47.0")?.version).toBe("0.47.0");
  });

  it("falls back to the newest published notes when the build is ahead of them", () => {
    // Live 2026-10-28: the app ran 0.49.0 while only 0.48.0 was published, and
    // the What's New button opened nothing.
    expect(pickReleaseNotesVersion(published, "0.49.0")?.version).toBe("0.48.0");
  });

  it("never offers notes newer than the running build when older ones exist", () => {
    expect(pickReleaseNotesVersion(published, "0.47.5")?.version).toBe("0.47.0");
  });

  it("uses the newest notes when every published version is ahead", () => {
    expect(pickReleaseNotesVersion(published, "0.1.0")?.version).toBe("0.48.0");
  });

  it("returns null when nothing is published", () => {
    expect(pickReleaseNotesVersion([], "0.49.0")).toBeNull();
  });
});
