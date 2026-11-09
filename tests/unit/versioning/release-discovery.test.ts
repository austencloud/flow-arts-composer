import { describe, it, expect } from "vitest";
import {
  planReleaseDiscovery,
  releaseInUpdate,
  selectUnseenReleases,
  shouldToastRelease,
} from "#lib/shared/versioning/domain/utils/release-discovery.js";
import type { AppVersion } from "#lib/shared/versioning/domain/models/version-models.js";

const release = (version: string, notes = 1): AppVersion => ({
  version,
  releasedAt: new Date(0),
  feedbackCount: 0,
  feedbackSummary: { bugs: 0, features: 0, general: 0 },
  changelogEntries: Array.from({ length: notes }, (_, i) => ({
    category: "added" as const,
    text: `${version} note ${i}`,
  })),
});

const versions = [
  release("0.48.0"),
  release("0.49.0", 0),
  release("0.10.0"),
  release("0.50.0", 2),
  release("0.51.0"),
  release("0.9.0"),
];

describe("selectUnseenReleases", () => {
  it("rolls up every release after the last read, up to the running build, newest first", () => {
    expect(
      selectUnseenReleases(versions, "0.10.0", "0.50.0").map((v) => v.version)
    ).toEqual(["0.50.0", "0.48.0"]);
  });

  it("leaves out releases with no notes and releases ahead of the build", () => {
    const picked = selectUnseenReleases(versions, "0.47.0", "0.50.0");
    expect(picked.map((v) => v.version)).not.toContain("0.49.0");
    expect(picked.map((v) => v.version)).not.toContain("0.51.0");
  });

  it("is empty once the running build's notes are read", () => {
    expect(selectUnseenReleases(versions, "0.50.0", "0.50.0")).toEqual([]);
  });
});

describe("planReleaseDiscovery", () => {
  it("baselines a first visit without greeting it", () => {
    expect(
      planReleaseDiscovery({
        versions,
        lastSeen: null,
        lastToasted: null,
        running: "0.50.0",
      })
    ).toEqual({ kind: "baseline" });
  });

  it("toasts the newest unread release once, and keeps it unread", () => {
    const first = planReleaseDiscovery({
      versions,
      lastSeen: "0.47.0",
      lastToasted: null,
      running: "0.50.0",
    });
    expect(first.kind).toBe("unread");
    if (first.kind !== "unread") return;
    expect(first.toast).toBe("0.50.0");

    // The toast fired but nothing was opened: still unread, no second toast.
    const next = planReleaseDiscovery({
      versions,
      lastSeen: "0.47.0",
      lastToasted: "0.50.0",
      running: "0.50.0",
    });
    expect(next.kind).toBe("unread");
    if (next.kind !== "unread") return;
    expect(next.toast).toBeNull();
    expect(next.unseen.map((v) => v.version)).toEqual(["0.50.0", "0.48.0"]);
  });

  it("has nothing to say once the notes were opened", () => {
    expect(
      planReleaseDiscovery({
        versions,
        lastSeen: "0.50.0",
        lastToasted: "0.50.0",
        running: "0.50.0",
      })
    ).toEqual({ kind: "none" });
  });
});

describe("shouldToastRelease", () => {
  it("compares versions numerically", () => {
    expect(shouldToastRelease("0.10.0", "0.9.0")).toBe(true);
    expect(shouldToastRelease("0.9.0", "0.10.0")).toBe(false);
    expect(shouldToastRelease(null, null)).toBe(false);
  });
});

describe("releaseInUpdate", () => {
  it("names the release only when the published notes are ahead of the build", () => {
    expect(releaseInUpdate("0.51.0", "0.50.0")).toBe("0.51.0");
    expect(releaseInUpdate("0.50.0", "0.50.0")).toBeNull();
    expect(releaseInUpdate(null, "0.50.0")).toBeNull();
  });
});
