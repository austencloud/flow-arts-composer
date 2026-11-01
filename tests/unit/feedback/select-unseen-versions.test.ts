import { describe, it, expect } from "vitest";
import {
  selectUnseenVersions,
  type AppVersion,
} from "#lib/shared/versioning/domain/models/version-models.js";

const release = (version: string, entries = 1): AppVersion => ({
  version,
  releasedAt: new Date(),
  feedbackCount: 0,
  feedbackSummary: { bugs: 0, features: 0, general: 0 },
  changelogEntries: Array.from({ length: entries }, (_, i) => ({
    category: "fixed" as const,
    text: `Note ${i}`,
  })),
});

// Firestore order is by release date; the rollup must not depend on it.
const published = [
  release("0.47.0"),
  release("0.50.0"),
  release("0.48.0"),
  release("0.49.0"),
  release("0.49.1", 0),
  release("0.51.0"),
];

describe("selectUnseenVersions", () => {
  it("rolls up every release after the last seen one, newest first", () => {
    expect(
      selectUnseenVersions(published, "0.47.0", "0.50.0").map((v) => v.version)
    ).toEqual(["0.50.0", "0.49.0", "0.48.0"]);
  });

  it("skips a release with nothing to show and ones newer than the running build", () => {
    const picked = selectUnseenVersions(published, "0.48.0", "0.50.0").map(
      (v) => v.version
    );
    expect(picked).not.toContain("0.49.1");
    expect(picked).not.toContain("0.51.0");
    expect(picked).toEqual(["0.50.0", "0.49.0"]);
  });

  it("is empty with no baseline, and when the reader is caught up", () => {
    expect(selectUnseenVersions(published, null, "0.50.0")).toEqual([]);
    expect(selectUnseenVersions(published, "0.50.0", "0.50.0")).toEqual([]);
    // A stale build behind the seen mark has nothing new either.
    expect(selectUnseenVersions(published, "0.50.0", "0.49.0")).toEqual([]);
  });

  it("compares numerically, so 0.9 is older than 0.10", () => {
    expect(
      selectUnseenVersions(
        [release("0.9.0"), release("0.10.0")],
        "0.9.0",
        "0.10.0"
      ).map((v) => v.version)
    ).toEqual(["0.10.0"]);
  });
});
