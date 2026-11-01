import { beforeEach, describe, expect, it, vi } from "vitest";

// The state only needs the persister for cloud sync; with none it keeps its
// marks in localStorage, which is what these tests read.
vi.mock("#lib/shared/onboarding/get-onboarding-persister.js", () => ({
  getOnboardingPersister: () => {
    throw new Error("no persister in this test");
  },
}));
vi.mock("#lib/shared/feedback/services/version-service.js", () => ({
  getVersions: vi.fn(async () => []),
}));

import { whatsNewState } from "./whats-new-state.svelte";
import type { AppVersion } from "#lib/shared/versioning/domain/models/version-models.js";

const release = (version: string): AppVersion => ({
  version,
  releasedAt: new Date(),
  feedbackCount: 0,
  feedbackSummary: { bugs: 0, features: 0, general: 0 },
  changelogEntries: [{ category: "fixed", text: "A note." }],
});

const published = [release("0.48.0"), release("0.49.0"), release("0.50.0")];

describe("whatsNewState seen and toasted marks", () => {
  beforeEach(() => {
    localStorage.clear();
    whatsNewState.reset();
    whatsNewState.markVersionAsSeen("0.48.0");
  });

  it("leaves unread releases unread when only the toast fires", () => {
    whatsNewState.setPublishedVersions(published, "0.50.0");
    expect(whatsNewState.unseenVersions.map((v) => v.version)).toEqual([
      "0.50.0",
      "0.49.0",
    ]);

    whatsNewState.markVersionAsToasted("0.50.0");

    expect(whatsNewState.hasToastedVersion("0.50.0")).toBe(true);
    expect(whatsNewState.hasSeenVersion("0.50.0")).toBe(false);
    expect(whatsNewState.hasUnseen).toBe(true);
  });

  it("marks everything up to the newest shown as seen when the sheet opens", () => {
    whatsNewState.setPublishedVersions(published, "0.50.0");

    whatsNewState.openRollup();

    expect(whatsNewState.isOpen).toBe(true);
    expect(whatsNewState.versions.map((v) => v.version)).toEqual([
      "0.50.0",
      "0.49.0",
    ]);
    expect(whatsNewState.hasSeenVersion("0.49.0")).toBe(true);
    expect(whatsNewState.hasSeenVersion("0.50.0")).toBe(true);
    expect(whatsNewState.hasUnseen).toBe(false);
  });

  it("opens the newest release alone when nothing is unread", () => {
    whatsNewState.markVersionAsSeen("0.50.0");
    whatsNewState.setPublishedVersions(published, "0.50.0");
    expect(whatsNewState.hasUnseen).toBe(false);

    whatsNewState.openRollup(published[2]!);

    expect(whatsNewState.versions.map((v) => v.version)).toEqual(["0.50.0"]);
  });

  it("clears the dot when the Release Notes page opens, and never lowers the mark", () => {
    whatsNewState.setPublishedVersions(published, "0.50.0");
    whatsNewState.noteReleaseNotesOpened("0.50.0");
    expect(whatsNewState.hasUnseen).toBe(false);

    whatsNewState.markVersionAsSeen("0.49.0");
    expect(whatsNewState.hasSeenVersion("0.50.0")).toBe(true);
  });

  it("keeps the toasted mark separate from the seen mark", () => {
    whatsNewState.markVersionAsToasted("0.50.0");
    expect(localStorage.getItem("tka-last-toasted-version")).toBe("0.50.0");
    expect(localStorage.getItem("tka-last-seen-version")).toBe("0.48.0");
  });
});
